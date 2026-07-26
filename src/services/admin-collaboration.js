import { db, id, nowIso } from "../db.js";

const kpiKeys = new Set(["overview", "entries", "orders", "conversion", "winners", "products", "compliance", "sync"]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statuses = new Set(["OPEN", "WATCHING", "RESOLVED"]);

function cleanText(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

function cleanBody(value) {
  return String(value || "").trim().slice(0, 1800);
}

function cleanKpiKey(value) {
  const key = cleanText(value, 40).toLowerCase();
  return kpiKeys.has(key) ? key : "overview";
}

function cleanPriority(value) {
  const priority = cleanText(value, 20).toUpperCase();
  return priorities.has(priority) ? priority : "NORMAL";
}

function cleanStatus(value) {
  const status = cleanText(value, 20).toUpperCase();
  return statuses.has(status) ? status : "OPEN";
}

function cleanAssignee(userId) {
  const nextId = cleanText(userId, 80);
  if (!nextId) return null;
  const user = db.prepare("SELECT id FROM admin_users WHERE id = ? AND status = 'ACTIVE'").get(nextId);
  return user ? user.id : null;
}

export const kpiThreadDefinitions = [
  ["overview", "Overzicht", "Algemene dagsturing en prioriteiten."],
  ["entries", "Loten", "Aantal loten, bronnen en opvallende deelname."],
  ["orders", "Orders", "Orderdekking, waarde en ontbrekende loten."],
  ["conversion", "Conversie", "Widgetklikken, cart-progress en deelnameflow."],
  ["winners", "Winnaars", "Consent, statements en publicatiekwaliteit."],
  ["products", "Producten", "Productdata, tags, voorraad en sync."],
  ["compliance", "Compliance", "IP-hashes, security events en bewijs."],
  ["sync", "Synchronisatie", "Reconcile, customer dashboards en product-sync."]
];

export function createKpiThread({ title, kpiKey = "overview", priority = "NORMAL", body = "", createdBy = "", assignedTo = "" }) {
  const nextTitle = cleanText(title, 140);
  const nextBody = cleanBody(body);
  if (nextTitle.length < 3) throw new Error("Geef de KPI-discussie een duidelijke titel.");
  if (nextBody.length < 2) throw new Error("Schrijf kort wat besproken moet worden.");
  const now = nowIso();
  const row = {
    id: id("kpi"),
    title: nextTitle,
    kpi_key: cleanKpiKey(kpiKey),
    priority: cleanPriority(priority),
    status: "OPEN",
    created_by: createdBy || null,
    assigned_to: cleanAssignee(assignedTo),
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  db.prepare(`
    INSERT INTO admin_kpi_threads (id, title, kpi_key, priority, status, created_by, assigned_to, created_at, updated_at, resolved_at)
    VALUES (@id, @title, @kpi_key, @priority, @status, @created_by, @assigned_to, @created_at, @updated_at, @resolved_at)
  `).run(row);
  createKpiMessage({ threadId: row.id, userId: createdBy, body: nextBody, touchThread: false });
  return getKpiThread(row.id);
}

export function createKpiMessage({ threadId, userId = "", body, touchThread = true }) {
  const thread = db.prepare("SELECT id FROM admin_kpi_threads WHERE id = ?").get(threadId);
  if (!thread) throw new Error("KPI-discussie niet gevonden.");
  const nextBody = cleanBody(body);
  if (nextBody.length < 2) throw new Error("Bericht is te kort.");
  const now = nowIso();
  const row = {
    id: id("msg"),
    thread_id: thread.id,
    user_id: userId || null,
    body: nextBody,
    created_at: now
  };
  db.prepare(`
    INSERT INTO admin_kpi_messages (id, thread_id, user_id, body, created_at)
    VALUES (@id, @thread_id, @user_id, @body, @created_at)
  `).run(row);
  if (touchThread) {
    db.prepare("UPDATE admin_kpi_threads SET updated_at = ? WHERE id = ?").run(now, thread.id);
  }
  return row;
}

export function updateKpiThread({ threadId, status, priority, assignedTo = undefined }) {
  const thread = db.prepare("SELECT * FROM admin_kpi_threads WHERE id = ?").get(threadId);
  if (!thread) throw new Error("KPI-discussie niet gevonden.");
  const nextStatus = cleanStatus(status || thread.status);
  const nextPriority = cleanPriority(priority || thread.priority);
  const nextAssignee = assignedTo === undefined ? thread.assigned_to : cleanAssignee(assignedTo);
  const resolvedAt = nextStatus === "RESOLVED" ? (thread.resolved_at || nowIso()) : null;
  db.prepare(`
    UPDATE admin_kpi_threads
    SET status = ?, priority = ?, assigned_to = ?, resolved_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nextStatus, nextPriority, nextAssignee, resolvedAt, nowIso(), thread.id);
  return getKpiThread(thread.id);
}

export function listKpiThreads({ status = "", kpiKey = "", limit = 40 } = {}) {
  const filters = [];
  const params = { limit: Math.max(1, Math.min(120, Number(limit || 40))) };
  if (status) {
    filters.push("t.status = @status");
    params.status = cleanStatus(status);
  }
  if (kpiKey) {
    filters.push("t.kpi_key = @kpiKey");
    params.kpiKey = cleanKpiKey(kpiKey);
  }
  return db.prepare(`
    SELECT
      t.*,
      creator.username AS creator_username,
      creator.name AS creator_name,
      creator.avatar_url AS creator_avatar_url,
      assignee.username AS assignee_username,
      assignee.name AS assignee_name,
      COUNT(m.id) AS message_count,
      MAX(m.created_at) AS last_message_at
    FROM admin_kpi_threads t
    LEFT JOIN admin_users creator ON creator.id = t.created_by
    LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
    LEFT JOIN admin_kpi_messages m ON m.thread_id = t.id
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    GROUP BY t.id
    ORDER BY t.status = 'OPEN' DESC, t.priority = 'URGENT' DESC, t.priority = 'HIGH' DESC, COALESCE(MAX(m.created_at), t.updated_at) DESC
    LIMIT @limit
  `).all(params);
}

export function getKpiThread(threadId) {
  return db.prepare(`
    SELECT
      t.*,
      creator.username AS creator_username,
      creator.name AS creator_name,
      creator.avatar_url AS creator_avatar_url,
      assignee.username AS assignee_username,
      assignee.name AS assignee_name
    FROM admin_kpi_threads t
    LEFT JOIN admin_users creator ON creator.id = t.created_by
    LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
    WHERE t.id = ?
  `).get(threadId);
}

export function listKpiMessages(threadId) {
  return db.prepare(`
    SELECT
      m.*,
      u.username,
      u.name,
      u.title,
      u.avatar_url
    FROM admin_kpi_messages m
    LEFT JOIN admin_users u ON u.id = m.user_id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC
  `).all(threadId);
}

export function kpiDiscussionSummary() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'WATCHING' THEN 1 ELSE 0 END) AS watching_count,
      SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved_count,
      SUM(CASE WHEN priority IN ('HIGH', 'URGENT') AND status != 'RESOLVED' THEN 1 ELSE 0 END) AS hot_count
    FROM admin_kpi_threads
  `).get();
  return {
    total: Number(totals.total || 0),
    openCount: Number(totals.open_count || 0),
    watchingCount: Number(totals.watching_count || 0),
    resolvedCount: Number(totals.resolved_count || 0),
    hotCount: Number(totals.hot_count || 0)
  };
}
