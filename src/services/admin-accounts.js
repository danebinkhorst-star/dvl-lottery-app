import crypto from "node:crypto";
import { config } from "../config.js";
import { db, id, nowIso } from "../db.js";
import { safeEqual } from "../auth.js";

const sessionMaxAgeMs = 60 * 60 * 12 * 1000;
const lockAfterFailures = 8;
const lockMinutes = 15;
const roles = new Set(["OWNER", "ADMIN", "VIEWER"]);
const statuses = new Set(["ACTIVE", "SUSPENDED"]);

function adminSecret() {
  return config.ADMIN_SESSION_SECRET || "mff-dev-admin-session";
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  }).toString("base64url");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, n, r, p, salt, hash] = String(storedHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = crypto.scryptSync(String(password), salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  }).toString("base64url");
  return safeEqual(derived, hash);
}

function tokenHash(secret) {
  return crypto.createHmac("sha256", adminSecret()).update(String(secret)).digest("base64url");
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || "",
    name: row.name || "",
    role: row.role,
    status: row.status,
    forcePasswordChange: Number(row.force_password_change || 0) === 1,
    failedLoginCount: Number(row.failed_login_count || 0),
    lockedUntil: row.locked_until || "",
    lastLoginAt: row.last_login_at || "",
    passwordUpdatedAt: row.password_updated_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function activeUserWhereClause() {
  return "status = 'ACTIVE' AND (locked_until IS NULL OR locked_until <= @now)";
}

export function validateAdminPassword(password) {
  const value = String(password || "");
  if (value.length < 10) return "Gebruik minimaal 10 tekens.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return "Gebruik letters en cijfers.";
  return "";
}

export function ensureBootstrapAdminAccount() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM admin_users").get();
  if (Number(existing.count || 0) > 0 || !config.ADMIN_PASSWORD) return null;
  return createAdminUser({
    username: config.ADMIN_USERNAME || "dvl",
    email: "",
    name: "Eigenaar",
    password: config.ADMIN_PASSWORD,
    role: "OWNER",
    forcePasswordChange: false,
    enforceStrength: false
  });
}

export function ensureRecoveryAdminAccount() {
  if (!config.ADMIN_PASSWORD) return null;
  const username = normalizeUsername(config.ADMIN_USERNAME || "dvl");
  const existing = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
  if (existing) {
    const now = nowIso();
    db.prepare(`
      UPDATE admin_users
      SET password_hash = ?, role = 'OWNER', status = 'ACTIVE', force_password_change = 1,
        failed_login_count = 0, locked_until = NULL, password_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash(config.ADMIN_PASSWORD), now, now, existing.id);
    return getAdminUser(existing.id);
  }
  return createAdminUser({
    username,
    email: "",
    name: "Recovery admin",
    password: config.ADMIN_PASSWORD,
    role: "OWNER",
    forcePasswordChange: true,
    enforceStrength: false
  });
}

export function createAdminUser({ username, email = "", name = "", password, role = "ADMIN", forcePasswordChange = true, enforceStrength = true }) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || cleanUsername.length < 3) throw new Error("Gebruikersnaam moet minimaal 3 tekens hebben.");
  const cleanEmail = cleanText(email, 220).toLowerCase();
  if (cleanEmail && !cleanEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");
  const cleanRole = roles.has(role) ? role : "ADMIN";
  const passwordError = enforceStrength ? validateAdminPassword(password) : "";
  if (passwordError) throw new Error(passwordError);

  const now = nowIso();
  const row = {
    id: id("admin"),
    username: cleanUsername,
    email: cleanEmail || null,
    name: cleanText(name, 120),
    password_hash: passwordHash(password),
    role: cleanRole,
    status: "ACTIVE",
    force_password_change: forcePasswordChange ? 1 : 0,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    password_updated_at: now,
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO admin_users (
      id, username, email, name, password_hash, role, status, force_password_change,
      failed_login_count, locked_until, last_login_at, password_updated_at, created_at, updated_at
    )
    VALUES (
      @id, @username, @email, @name, @password_hash, @role, @status, @force_password_change,
      @failed_login_count, @locked_until, @last_login_at, @password_updated_at, @created_at, @updated_at
    )
  `).run(row);
  return publicUser(row);
}

export function listAdminUsers() {
  return db.prepare("SELECT * FROM admin_users ORDER BY role = 'OWNER' DESC, username ASC").all().map(publicUser);
}

export function getAdminUser(userId) {
  return publicUser(db.prepare("SELECT * FROM admin_users WHERE id = ?").get(userId));
}

export function findAdminUser(identifier) {
  const login = normalizeUsername(identifier);
  if (!login) return null;
  return publicUser(db.prepare("SELECT * FROM admin_users WHERE username = ? OR lower(email) = ?").get(login, login));
}

export function authenticateAdminUser({ username, password }) {
  const login = normalizeUsername(username);
  const row = db.prepare("SELECT * FROM admin_users WHERE username = ? OR lower(email) = ?").get(login, login);
  const now = nowIso();
  if (!row) return { ok: false, reason: "invalid" };
  if (row.status !== "ACTIVE") return { ok: false, reason: "suspended", user: publicUser(row) };
  if (row.locked_until && row.locked_until > now) return { ok: false, reason: "locked", user: publicUser(row) };

  if (!verifyPassword(password, row.password_hash)) {
    const failures = Number(row.failed_login_count || 0) + 1;
    const lockedUntil = failures >= lockAfterFailures ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : null;
    db.prepare("UPDATE admin_users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .run(failures, lockedUntil, now, row.id);
    return { ok: false, reason: lockedUntil ? "locked" : "invalid", user: publicUser({ ...row, failed_login_count: failures, locked_until: lockedUntil }) };
  }

  db.prepare("UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, row.id);
  return { ok: true, user: publicUser({ ...row, failed_login_count: 0, locked_until: null, last_login_at: now, updated_at: now }) };
}

export function createAdminSession({ userId, ip = "", userAgent = "" }) {
  const secret = crypto.randomBytes(32).toString("base64url");
  const session = {
    id: id("as"),
    user_id: userId,
    token_hash: tokenHash(secret),
    ip: cleanText(ip, 120),
    user_agent: cleanText(userAgent, 420),
    expires_at: new Date(Date.now() + sessionMaxAgeMs).toISOString(),
    revoked_at: null,
    created_at: nowIso(),
    last_seen_at: nowIso()
  };
  db.prepare(`
    INSERT INTO admin_sessions (id, user_id, token_hash, ip, user_agent, expires_at, revoked_at, created_at, last_seen_at)
    VALUES (@id, @user_id, @token_hash, @ip, @user_agent, @expires_at, @revoked_at, @created_at, @last_seen_at)
  `).run(session);
  return `${session.id}.${secret}`;
}

export function validateAdminSessionToken(token) {
  const [sessionId, secret] = String(token || "").split(".");
  if (!sessionId || !secret) return null;
  const row = db.prepare(`
    SELECT s.*, u.username, u.email, u.name, u.role, u.status, u.force_password_change, u.failed_login_count,
      u.locked_until, u.last_login_at, u.password_updated_at, u.created_at AS user_created_at, u.updated_at AS user_updated_at
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(sessionId);
  if (!row || row.revoked_at || row.expires_at <= nowIso() || row.status !== "ACTIVE") return null;
  if (!safeEqual(row.token_hash, tokenHash(secret))) return null;
  db.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.id);
  return {
    session: {
      id: row.id,
      userId: row.user_id,
      ip: row.ip || "",
      userAgent: row.user_agent || "",
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at
    },
    user: publicUser({
      id: row.user_id,
      username: row.username,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      force_password_change: row.force_password_change,
      failed_login_count: row.failed_login_count,
      locked_until: row.locked_until,
      last_login_at: row.last_login_at,
      password_updated_at: row.password_updated_at,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at
    })
  };
}

export function revokeAdminSession(sessionId) {
  db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(nowIso(), sessionId);
}

export function revokeAdminUserSessions(userId, exceptSessionId = "") {
  db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL")
    .run(nowIso(), userId, exceptSessionId || "");
}

export function listAdminSessions() {
  return db.prepare(`
    SELECT s.*, u.username, u.name, u.role
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.expires_at > ?
    ORDER BY s.revoked_at IS NULL DESC, s.last_seen_at DESC
    LIMIT 80
  `).all(nowIso()).map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    name: row.name || "",
    role: row.role,
    ip: row.ip || "",
    userAgent: row.user_agent || "",
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || "",
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  }));
}

function assertOwnerSafety(userId, patch) {
  const target = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(userId);
  if (!target) throw new Error("Admin gebruiker niet gevonden.");
  const nextRole = patch.role || target.role;
  const nextStatus = patch.status || target.status;
  const activeOwners = Number(db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'OWNER' AND status = 'ACTIVE'").get().count || 0);
  if (target.role === "OWNER" && target.status === "ACTIVE" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE") && activeOwners <= 1) {
    throw new Error("Er moet minimaal één actieve eigenaar blijven.");
  }
  return target;
}

export function updateAdminUser(userId, { email, name, role, status, forcePasswordChange }) {
  const cleanRole = roles.has(role) ? role : "ADMIN";
  const cleanStatus = statuses.has(status) ? status : "ACTIVE";
  assertOwnerSafety(userId, { role: cleanRole, status: cleanStatus });
  const cleanEmail = cleanText(email, 220).toLowerCase();
  if (cleanEmail && !cleanEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");
  db.prepare(`
    UPDATE admin_users
    SET email = ?, name = ?, role = ?, status = ?, force_password_change = ?, updated_at = ?
    WHERE id = ?
  `).run(cleanEmail || null, cleanText(name, 120), cleanRole, cleanStatus, forcePasswordChange ? 1 : 0, nowIso(), userId);
  if (cleanStatus !== "ACTIVE") revokeAdminUserSessions(userId);
  return getAdminUser(userId);
}

export function setAdminUserPassword(userId, password, { forcePasswordChange = false, revokeSessions = true, exceptSessionId = "" } = {}) {
  const passwordError = validateAdminPassword(password);
  if (passwordError) throw new Error(passwordError);
  const now = nowIso();
  db.prepare(`
    UPDATE admin_users
    SET password_hash = ?, force_password_change = ?, failed_login_count = 0, locked_until = NULL, password_updated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(passwordHash(password), forcePasswordChange ? 1 : 0, now, now, userId);
  if (revokeSessions) revokeAdminUserSessions(userId, exceptSessionId);
  return getAdminUser(userId);
}

export function changeOwnAdminPassword(userId, currentPassword, nextPassword, sessionId = "") {
  const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(userId);
  if (!row) throw new Error("Admin gebruiker niet gevonden.");
  if (!verifyPassword(currentPassword, row.password_hash)) throw new Error("Huidig wachtwoord klopt niet.");
  return setAdminUserPassword(userId, nextPassword, {
    forcePasswordChange: false,
    revokeSessions: true,
    exceptSessionId: sessionId
  });
}
