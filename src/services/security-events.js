import crypto from "node:crypto";
import { config } from "../config.js";
import { db, id, nowIso } from "../db.js";

function secret() {
  return config.FREE_ENTRY_HASH_SECRET || config.ADMIN_SESSION_SECRET || "mff-security-events";
}

export function hashSecurityValue(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return null;
  return crypto.createHmac("sha256", secret()).update(clean).digest("hex");
}

export function clientIp(req) {
  const forwarded = String(req?.get?.("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || req?.ip || req?.socket?.remoteAddress || "unknown";
}

export function recordSecurityEvent({ eventType, req = null, email = "", message = "", metadata = {} }) {
  db.prepare(`
    INSERT INTO security_events (id, event_type, ip_hash, email_hash, path, message, metadata, created_at)
    VALUES (@id, @event_type, @ip_hash, @email_hash, @path, @message, @metadata, @created_at)
  `).run({
    id: id(),
    event_type: eventType,
    ip_hash: req ? hashSecurityValue(clientIp(req)) : null,
    email_hash: hashSecurityValue(email),
    path: req?.originalUrl || req?.path || "",
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: nowIso()
  });
}

export function recentSecurityEvents(limit = 20) {
  return db.prepare(`
    SELECT *
    FROM security_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit || 20))));
}

export function securityEventSummary() {
  const lastDay = db.prepare(`
    SELECT event_type, COUNT(*) AS count
    FROM security_events
    WHERE datetime(created_at) >= datetime('now', '-24 hours')
    GROUP BY event_type
    ORDER BY count DESC
  `).all();
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT ip_hash) AS unique_ips,
      MAX(created_at) AS last_seen
    FROM security_events
  `).get();
  return {
    total: Number(totals?.total || 0),
    uniqueIps: Number(totals?.unique_ips || 0),
    lastSeen: totals?.last_seen || null,
    lastDay
  };
}
