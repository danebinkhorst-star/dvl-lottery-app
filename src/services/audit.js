import { db, id, nowIso } from "../db.js";

export function writeAuditLog({ actor = "admin", action, targetType, targetId = null, message = "", metadata = null }) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, target_type, target_id, message, metadata, created_at)
    VALUES (@id, @actor, @action, @target_type, @target_id, @message, @metadata, @created_at)
  `).run({
    id: id(),
    actor,
    action,
    target_type: targetType,
    target_id: targetId,
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: nowIso()
  });
}
