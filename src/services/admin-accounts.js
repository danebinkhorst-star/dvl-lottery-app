import crypto from "node:crypto";
import { config } from "../config.js";
import { db, id, nowIso } from "../db.js";
import { safeEqual } from "../auth.js";

const sessionMaxAgeMs = 60 * 60 * 12 * 1000;
const lockAfterFailures = 8;
const lockMinutes = 15;
const defaultTeamId = "team_mff_primary";
const roles = new Set(["OWNER", "ADMIN", "VIEWER"]);
const statuses = new Set(["ACTIVE", "SUSPENDED"]);
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const adminPermissionDefinitions = [
  ["view_dashboard", "Dashboard bekijken", "Overzicht en globale KPI's."],
  ["view_analytics", "Analyse bekijken", "Funnel, groei en events lezen."],
  ["view_draws", "Winacties bekijken", "Acties en details lezen."],
  ["manage_draws", "Winacties beheren", "Acties aanmaken, bewerken en status wijzigen."],
  ["view_winners", "Winnaars bekijken", "Winnaars en publicatiestatus lezen."],
  ["manage_winners", "Winnaars beheren", "Publicatie, consent en statements wijzigen."],
  ["view_entries", "Loten bekijken", "Loten en deelnamebronnen lezen."],
  ["manage_entries", "Loten beheren", "Handmatige correcties en lotstatus wijzigen."],
  ["view_orders", "Orders bekijken", "Orderwaarde en lottoekenning lezen."],
  ["view_products", "Producten bekijken", "Productkaarten en syncstatus lezen."],
  ["manage_products", "Producten beheren", "Product syncs en commerciële tags wijzigen."],
  ["view_participants", "Deelnemers bekijken", "Klant- en deelnemersoverzicht lezen."],
  ["view_compliance", "Compliance bekijken", "Security events en IP-hashes lezen."],
  ["manage_rules", "Lotregels beheren", "Drempels en gratis deelname wijzigen."],
  ["manage_site", "Site structuur beheren", "Navigatie en informatieve pagina's wijzigen."],
  ["manage_widgets", "Widgets beheren", "Embed copy, beelden en instellingen wijzigen."],
  ["manage_sync", "Synchronisatie beheren", "Shopify/customer syncs starten."],
  ["manage_uploads", "Uploads beheren", "Afbeeldingen uploaden."],
  ["view_audit", "Audit bekijken", "Beheerlog en security historie lezen."],
  ["manage_accounts", "Accounts beheren", "Teamleden, rechten, resets en sessies beheren."]
];

const allPermissionCodes = adminPermissionDefinitions.map(([code]) => code);
const rolePermissionTemplates = {
  OWNER: allPermissionCodes,
  ADMIN: [
    "view_dashboard", "view_analytics", "view_draws", "manage_draws", "view_winners", "manage_winners",
    "view_entries", "manage_entries", "view_orders", "view_products", "manage_products", "view_participants",
    "view_compliance", "manage_rules", "manage_site", "manage_widgets", "manage_sync", "manage_uploads", "view_audit"
  ],
  VIEWER: [
    "view_dashboard", "view_analytics", "view_draws", "view_winners", "view_entries", "view_orders",
    "view_products", "view_participants", "view_compliance", "view_audit"
  ]
};

function adminSecret() {
  return config.ADMIN_SESSION_SECRET || "mff-dev-admin-session";
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return cleanText(value, 220).toLowerCase();
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

function encryptionKey() {
  return crypto.createHash("sha256").update(adminSecret()).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return `enc:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  const [scheme, iv, tag, encrypted] = String(value || "").split(":");
  if (scheme !== "enc" || !iv || !tag || !encrypted) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function normalizePermissions(values, role = "ADMIN") {
  const supplied = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const allowed = new Set(allPermissionCodes);
  const clean = supplied.map((value) => String(value || "").trim()).filter((value) => allowed.has(value));
  if (clean.length) return [...new Set(clean)];
  return rolePermissionTemplates[role] || rolePermissionTemplates.ADMIN;
}

function permissionsForUser(userId, role) {
  if (role === "OWNER") return [...allPermissionCodes];
  const rows = db.prepare("SELECT permission FROM admin_user_permissions WHERE user_id = ? ORDER BY permission ASC").all(userId);
  if (!rows.length) return [...(rolePermissionTemplates[role] || rolePermissionTemplates.ADMIN)];
  return rows.map((row) => row.permission);
}

function grantUserPermissions(userId, permissions, role = "ADMIN") {
  const clean = normalizePermissions(permissions, role);
  db.prepare("DELETE FROM admin_user_permissions WHERE user_id = ?").run(userId);
  const insert = db.prepare("INSERT INTO admin_user_permissions (user_id, permission, granted_at) VALUES (?, ?, ?)");
  const at = nowIso();
  clean.forEach((permission) => insert.run(userId, permission, at));
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id || defaultTeamId,
    teamName: row.team_name || "Meat For Free",
    username: row.username,
    email: row.email || "",
    name: row.name || "",
    title: row.title || "",
    role: row.role,
    status: row.status,
    permissions: permissionsForUser(row.id, row.role),
    forcePasswordChange: Number(row.force_password_change || 0) === 1,
    failedLoginCount: Number(row.failed_login_count || 0),
    lockedUntil: row.locked_until || "",
    lastLoginAt: row.last_login_at || "",
    passwordUpdatedAt: row.password_updated_at || "",
    totpEnabled: Number(row.totp_enabled || 0) === 1,
    totpPending: Boolean(row.totp_secret) && Number(row.totp_enabled || 0) !== 1,
    totpConfirmedAt: row.totp_confirmed_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function userSelect() {
  return `
    SELECT u.*, t.name AS team_name
    FROM admin_users u
    LEFT JOIN admin_teams t ON t.id = u.team_id
  `;
}

function cleanRole(value) {
  return roles.has(value) ? value : "ADMIN";
}

function cleanStatus(value) {
  return statuses.has(value) ? value : "ACTIVE";
}

function invitePublic(row, token = "") {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id || defaultTeamId,
    teamName: row.team_name || "Meat For Free",
    email: row.email,
    name: row.name || "",
    role: row.role,
    permissions: JSON.parse(row.permissions_json || "[]"),
    invitedBy: row.invited_by_username || row.invited_by || "",
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at || "",
    revokedAt: row.revoked_at || "",
    createdAt: row.created_at,
    setupPath: token ? `/admin/setup/${token}` : ""
  };
}

function resetPublic(row, token = "") {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username || "",
    email: row.email || "",
    requestedBy: row.requested_by_username || row.requested_by || "",
    expiresAt: row.expires_at,
    usedAt: row.used_at || "",
    revokedAt: row.revoked_at || "",
    createdAt: row.created_at,
    resetPath: token ? `/admin/reset/${token}` : ""
  };
}

function randomBase32(length = 32) {
  let output = "";
  const bytes = crypto.randomBytes(length);
  for (const byte of bytes) output += base32Alphabet[byte % base32Alphabet.length];
  return output;
}

function normalizeTotpSecret(secret) {
  return String(secret || "").replace(/[\s-]/g, "").toUpperCase();
}

function base32ToBuffer(value) {
  let bits = "";
  for (const char of normalizeTotpSecret(value).replace(/=+$/g, "")) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) return null;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, counter) {
  const key = base32ToBuffer(secret);
  if (!key || !key.length) return "";
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpToken(secret, token, now = Date.now()) {
  const cleanSecret = normalizeTotpSecret(secret);
  const supplied = String(token || "").replace(/\D/g, "");
  if (!cleanSecret) return true;
  if (!/^\d{6}$/.test(supplied)) return false;
  const counter = Math.floor(now / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (safeEqual(supplied, totpCode(cleanSecret, counter + drift))) return true;
  }
  return false;
}

export function validateAdminPassword(password) {
  const value = String(password || "");
  if (value.length < 10) return "Gebruik minimaal 10 tekens.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return "Gebruik letters en cijfers.";
  return "";
}

export function ensureAdminAccessSystem() {
  const now = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO admin_teams (id, name, slug, shop_domain, status, created_at, updated_at)
    VALUES (?, 'Meat For Free', 'meat-for-free', 'de-vlees-loterij.myshopify.com', 'ACTIVE', ?, ?)
  `).run(defaultTeamId, now, now);
  db.prepare("UPDATE admin_users SET team_id = ? WHERE team_id IS NULL").run(defaultTeamId);
  db.prepare("SELECT id, role FROM admin_users").all().forEach((user) => {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM admin_user_permissions WHERE user_id = ?").get(user.id).count || 0);
    if (!count) grantUserPermissions(user.id, rolePermissionTemplates[user.role] || rolePermissionTemplates.ADMIN, user.role);
  });
}

export function ensureBootstrapAdminAccount() {
  ensureAdminAccessSystem();
  const existing = db.prepare("SELECT COUNT(*) AS count FROM admin_users").get();
  if (Number(existing.count || 0) > 0 || !config.ADMIN_PASSWORD) return null;
  return createAdminUser({
    username: config.ADMIN_USERNAME || "dvl",
    email: "",
    name: "Eigenaar",
    title: "Owner",
    password: config.ADMIN_PASSWORD,
    role: "OWNER",
    forcePasswordChange: false,
    enforceStrength: false
  });
}

export function ensureRecoveryAdminAccount() {
  ensureAdminAccessSystem();
  if (!config.ADMIN_PASSWORD) return null;
  const username = normalizeUsername(config.ADMIN_USERNAME || "dvl");
  const existing = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
  if (existing) {
    const now = nowIso();
    db.prepare(`
      UPDATE admin_users
      SET team_id = ?, password_hash = ?, role = 'OWNER', status = 'ACTIVE', force_password_change = 1,
        failed_login_count = 0, locked_until = NULL, password_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(defaultTeamId, passwordHash(config.ADMIN_PASSWORD), now, now, existing.id);
    grantUserPermissions(existing.id, allPermissionCodes, "OWNER");
    return getAdminUser(existing.id);
  }
  return createAdminUser({
    username,
    email: "",
    name: "Recovery admin",
    title: "Owner recovery",
    password: config.ADMIN_PASSWORD,
    role: "OWNER",
    forcePasswordChange: true,
    enforceStrength: false
  });
}

export function createAdminUser({ username, email = "", name = "", title = "", password, role = "ADMIN", teamId = defaultTeamId, permissions = [], forcePasswordChange = true, enforceStrength = true }) {
  ensureAdminAccessSystem();
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || cleanUsername.length < 3) throw new Error("Gebruikersnaam moet minimaal 3 tekens hebben.");
  const nextEmail = cleanEmail(email);
  if (nextEmail && !nextEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");
  const nextRole = cleanRole(role);
  const passwordError = enforceStrength ? validateAdminPassword(password) : "";
  if (passwordError) throw new Error(passwordError);

  const now = nowIso();
  const row = {
    id: id("admin"),
    team_id: teamId || defaultTeamId,
    username: cleanUsername,
    email: nextEmail || null,
    name: cleanText(name, 120),
    title: cleanText(title, 120),
    password_hash: passwordHash(password),
    role: nextRole,
    status: "ACTIVE",
    force_password_change: forcePasswordChange ? 1 : 0,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    password_updated_at: now,
    totp_secret: null,
    totp_enabled: 0,
    totp_confirmed_at: null,
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO admin_users (
      id, team_id, username, email, name, title, password_hash, role, status, force_password_change,
      failed_login_count, locked_until, last_login_at, password_updated_at, totp_secret, totp_enabled,
      totp_confirmed_at, created_at, updated_at
    )
    VALUES (
      @id, @team_id, @username, @email, @name, @title, @password_hash, @role, @status, @force_password_change,
      @failed_login_count, @locked_until, @last_login_at, @password_updated_at, @totp_secret, @totp_enabled,
      @totp_confirmed_at, @created_at, @updated_at
    )
  `).run(row);
  grantUserPermissions(row.id, permissions, nextRole);
  return getAdminUser(row.id);
}

export function listAdminUsers() {
  ensureAdminAccessSystem();
  return db.prepare(`${userSelect()} ORDER BY u.role = 'OWNER' DESC, u.username ASC`).all().map(publicUser);
}

export function getAdminUser(userId) {
  ensureAdminAccessSystem();
  return publicUser(db.prepare(`${userSelect()} WHERE u.id = ?`).get(userId));
}

export function findAdminUser(identifier) {
  ensureAdminAccessSystem();
  const login = normalizeUsername(identifier);
  if (!login) return null;
  return publicUser(db.prepare(`${userSelect()} WHERE u.username = ? OR lower(u.email) = ?`).get(login, login));
}

export function hasAdminPermission(user, permission) {
  if (!user) return false;
  if (user.role === "OWNER" || user.id === "legacy" || user.id === "dev") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function authenticateAdminUser({ username, password }) {
  ensureAdminAccessSystem();
  const login = normalizeUsername(username);
  const row = db.prepare(`${userSelect()} WHERE u.username = ? OR lower(u.email) = ?`).get(login, login);
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

export function getAdminUserTotpSecret(userId) {
  const row = db.prepare("SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ?").get(userId);
  if (!row || Number(row.totp_enabled || 0) !== 1) return "";
  return decryptSecret(row.totp_secret);
}

export function startAdminTotpSetup(userId) {
  const secret = randomBase32(32);
  db.prepare("UPDATE admin_users SET totp_secret = ?, totp_enabled = 0, totp_confirmed_at = NULL, updated_at = ? WHERE id = ?")
    .run(encryptSecret(secret), nowIso(), userId);
  return getAdminTotpSetup(userId);
}

export function getAdminTotpSetup(userId) {
  const user = getAdminUser(userId);
  const row = db.prepare("SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ?").get(userId);
  if (!user || !row || !row.totp_secret || Number(row.totp_enabled || 0) === 1) return null;
  const secret = decryptSecret(row.totp_secret);
  return {
    secret,
    otpauthUrl: `otpauth://totp/Meat%20For%20Free:${encodeURIComponent(user.username)}?secret=${encodeURIComponent(secret)}&issuer=Meat%20For%20Free`
  };
}

export function confirmAdminTotpSetup(userId, token) {
  const setup = getAdminTotpSetup(userId);
  if (!setup) throw new Error("Start eerst 2FA setup.");
  if (!verifyTotpToken(setup.secret, token)) throw new Error("2FA-code klopt niet.");
  const now = nowIso();
  db.prepare("UPDATE admin_users SET totp_enabled = 1, totp_confirmed_at = ?, updated_at = ? WHERE id = ?").run(now, now, userId);
  return getAdminUser(userId);
}

export function disableAdminTotp(userId) {
  db.prepare("UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0, totp_confirmed_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), userId);
  return getAdminUser(userId);
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
  ensureAdminAccessSystem();
  const [sessionId, secret] = String(token || "").split(".");
  if (!sessionId || !secret) return null;
  const row = db.prepare(`
    SELECT s.*, u.username, u.email, u.name, u.title, u.team_id, u.role, u.status, u.force_password_change, u.failed_login_count,
      u.locked_until, u.last_login_at, u.password_updated_at, u.totp_enabled, u.totp_confirmed_at,
      u.created_at AS user_created_at, u.updated_at AS user_updated_at, t.name AS team_name
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    LEFT JOIN admin_teams t ON t.id = u.team_id
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
      team_id: row.team_id,
      team_name: row.team_name,
      username: row.username,
      email: row.email,
      name: row.name,
      title: row.title,
      role: row.role,
      status: row.status,
      force_password_change: row.force_password_change,
      failed_login_count: row.failed_login_count,
      locked_until: row.locked_until,
      last_login_at: row.last_login_at,
      password_updated_at: row.password_updated_at,
      totp_enabled: row.totp_enabled,
      totp_confirmed_at: row.totp_confirmed_at,
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
  ensureAdminAccessSystem();
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

export function updateAdminUser(userId, { email, name, title = "", role, status, permissions = [], forcePasswordChange }) {
  ensureAdminAccessSystem();
  const nextRole = cleanRole(role);
  const nextStatus = cleanStatus(status);
  assertOwnerSafety(userId, { role: nextRole, status: nextStatus });
  const nextEmail = cleanEmail(email);
  if (nextEmail && !nextEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");
  db.prepare(`
    UPDATE admin_users
    SET email = ?, name = ?, title = ?, role = ?, status = ?, force_password_change = ?, updated_at = ?
    WHERE id = ?
  `).run(nextEmail || null, cleanText(name, 120), cleanText(title, 120), nextRole, nextStatus, forcePasswordChange ? 1 : 0, nowIso(), userId);
  grantUserPermissions(userId, permissions, nextRole);
  if (nextStatus !== "ACTIVE") revokeAdminUserSessions(userId);
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

export function createAdminInvite({ email, name = "", role = "ADMIN", permissions = [], invitedBy = "", teamId = defaultTeamId, expiresInHours = 72 }) {
  ensureAdminAccessSystem();
  const nextEmail = cleanEmail(email);
  if (!nextEmail || !nextEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");
  const existing = db.prepare("SELECT id FROM admin_users WHERE lower(email) = ?").get(nextEmail);
  if (existing) throw new Error("Er bestaat al een account met dit e-mailadres.");
  const token = crypto.randomBytes(32).toString("base64url");
  const nextRole = cleanRole(role);
  const now = nowIso();
  const row = {
    id: id("invite"),
    team_id: teamId || defaultTeamId,
    email: nextEmail,
    name: cleanText(name, 120),
    role: nextRole,
    permissions_json: JSON.stringify(normalizePermissions(permissions, nextRole)),
    token_hash: tokenHash(token),
    invited_by: invitedBy || null,
    expires_at: new Date(Date.now() + Number(expiresInHours || 72) * 60 * 60 * 1000).toISOString(),
    accepted_at: null,
    revoked_at: null,
    created_at: now
  };
  db.prepare(`
    INSERT INTO admin_invites (id, team_id, email, name, role, permissions_json, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at)
    VALUES (@id, @team_id, @email, @name, @role, @permissions_json, @token_hash, @invited_by, @expires_at, @accepted_at, @revoked_at, @created_at)
  `).run(row);
  return invitePublic(row, token);
}

export function listAdminInvites() {
  ensureAdminAccessSystem();
  return db.prepare(`
    SELECT i.*, t.name AS team_name, u.username AS invited_by_username
    FROM admin_invites i
    LEFT JOIN admin_teams t ON t.id = i.team_id
    LEFT JOIN admin_users u ON u.id = i.invited_by
    ORDER BY i.accepted_at IS NULL DESC, i.revoked_at IS NULL DESC, i.created_at DESC
    LIMIT 40
  `).all().map((row) => invitePublic(row));
}

export function revokeAdminInvite(inviteId) {
  db.prepare("UPDATE admin_invites SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL").run(nowIso(), inviteId);
}

export function getAdminInviteByToken(token) {
  ensureAdminAccessSystem();
  return invitePublic(db.prepare(`
    SELECT i.*, t.name AS team_name, u.username AS invited_by_username
    FROM admin_invites i
    LEFT JOIN admin_teams t ON t.id = i.team_id
    LEFT JOIN admin_users u ON u.id = i.invited_by
    WHERE i.token_hash = ?
  `).get(tokenHash(token)));
}

export function acceptAdminInvite(token, { username, name = "", title = "", password }) {
  ensureAdminAccessSystem();
  const row = db.prepare("SELECT * FROM admin_invites WHERE token_hash = ?").get(tokenHash(token));
  if (!row || row.revoked_at || row.accepted_at || row.expires_at <= nowIso()) throw new Error("Uitnodiging is ongeldig of verlopen.");
  const user = createAdminUser({
    username,
    email: row.email,
    name: name || row.name,
    title,
    password,
    role: row.role,
    teamId: row.team_id || defaultTeamId,
    permissions: JSON.parse(row.permissions_json || "[]"),
    forcePasswordChange: false
  });
  db.prepare("UPDATE admin_invites SET accepted_at = ? WHERE id = ?").run(nowIso(), row.id);
  return user;
}

export function createAdminPasswordReset(userId, requestedBy = "", expiresInHours = 2) {
  ensureAdminAccessSystem();
  const user = getAdminUser(userId);
  if (!user) throw new Error("Admin gebruiker niet gevonden.");
  const token = crypto.randomBytes(32).toString("base64url");
  const now = nowIso();
  const row = {
    id: id("reset"),
    user_id: userId,
    token_hash: tokenHash(token),
    requested_by: requestedBy || null,
    expires_at: new Date(Date.now() + Number(expiresInHours || 2) * 60 * 60 * 1000).toISOString(),
    used_at: null,
    revoked_at: null,
    created_at: now
  };
  db.prepare(`
    INSERT INTO admin_password_resets (id, user_id, token_hash, requested_by, expires_at, used_at, revoked_at, created_at)
    VALUES (@id, @user_id, @token_hash, @requested_by, @expires_at, @used_at, @revoked_at, @created_at)
  `).run(row);
  return resetPublic({ ...row, username: user.username, email: user.email || "" }, token);
}

export function listAdminPasswordResets() {
  ensureAdminAccessSystem();
  return db.prepare(`
    SELECT r.*, u.username, u.email, requester.username AS requested_by_username
    FROM admin_password_resets r
    JOIN admin_users u ON u.id = r.user_id
    LEFT JOIN admin_users requester ON requester.id = r.requested_by
    WHERE r.expires_at > ?
    ORDER BY r.used_at IS NULL DESC, r.revoked_at IS NULL DESC, r.created_at DESC
    LIMIT 30
  `).all(nowIso()).map((row) => resetPublic(row));
}

export function getAdminPasswordResetByToken(token) {
  ensureAdminAccessSystem();
  return resetPublic(db.prepare(`
    SELECT r.*, u.username, u.email, requester.username AS requested_by_username
    FROM admin_password_resets r
    JOIN admin_users u ON u.id = r.user_id
    LEFT JOIN admin_users requester ON requester.id = r.requested_by
    WHERE r.token_hash = ?
  `).get(tokenHash(token)));
}

export function consumeAdminPasswordReset(token, password) {
  ensureAdminAccessSystem();
  const row = db.prepare("SELECT * FROM admin_password_resets WHERE token_hash = ?").get(tokenHash(token));
  if (!row || row.used_at || row.revoked_at || row.expires_at <= nowIso()) throw new Error("Resetlink is ongeldig of verlopen.");
  setAdminUserPassword(row.user_id, password, { forcePasswordChange: false, revokeSessions: true });
  db.prepare("UPDATE admin_password_resets SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return getAdminUser(row.user_id);
}
