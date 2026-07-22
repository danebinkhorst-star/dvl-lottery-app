import { db, id, nowIso } from "../db.js";
import { clientIp, hashSecurityValue } from "./security-events.js";

const allowedActions = new Set([
  "view",
  "cta_click",
  "product_open",
  "product_add_attempt",
  "product_add_success",
  "product_add_error",
  "free_entry_submit",
  "free_entry_success",
  "free_entry_error",
  "cart_threshold_reached"
]);

function clean(value, max = 180) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .trim()
    .slice(0, max);
}

function cleanUrl(value) {
  const raw = clean(value, 520);
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://meatforfree.nl");
    url.search = "";
    url.hash = "";
    return url.href.slice(0, 520);
  } catch {
    return raw.split("?")[0].split("#")[0].slice(0, 520);
  }
}

export function recordAnalyticsEvent(req, payload) {
  const widget = clean(payload.widget, 40) || "unknown";
  const requestedAction = clean(payload.action, 80) || "view";
  const action = allowedActions.has(requestedAction) ? requestedAction : "cta_click";
  const eventType = clean(payload.eventType, 64) || "widget_event";
  const metadata = payload.metadata && typeof payload.metadata === "object"
    ? JSON.stringify(Object.fromEntries(Object.entries(payload.metadata).slice(0, 12).map(([key, value]) => [clean(key, 40), clean(value, 180)])))
    : null;

  db.prepare(`
    INSERT INTO analytics_events (
      id, event_type, widget, action, target, value, page_url, referrer, shop_origin,
      ip_hash, user_agent_hash, metadata, created_at
    )
    VALUES (
      @id, @event_type, @widget, @action, @target, @value, @page_url, @referrer, @shop_origin,
      @ip_hash, @user_agent_hash, @metadata, @created_at
    )
  `).run({
    id: id(),
    event_type: eventType,
    widget,
    action,
    target: clean(payload.target, 180),
    value: clean(payload.value, 240),
    page_url: cleanUrl(payload.pageUrl),
    referrer: cleanUrl(payload.referrer),
    shop_origin: cleanUrl(payload.shopOrigin),
    ip_hash: hashSecurityValue(clientIp(req)),
    user_agent_hash: hashSecurityValue(req.get("user-agent") || ""),
    metadata,
    created_at: nowIso()
  });
}

export function analyticsSummary({ days = 14 } = {}) {
  const safeDays = Math.max(1, Math.min(90, Number(days || 14)));
  const sinceModifier = `-${safeDays} days`;
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_events,
      COUNT(DISTINCT ip_hash) AS unique_visitors,
      SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN action IN ('cta_click', 'product_open') THEN 1 ELSE 0 END) AS clicks,
      SUM(CASE WHEN action = 'product_add_attempt' THEN 1 ELSE 0 END) AS add_attempts,
      SUM(CASE WHEN action = 'product_add_success' THEN 1 ELSE 0 END) AS add_successes,
      SUM(CASE WHEN action = 'free_entry_submit' THEN 1 ELSE 0 END) AS free_entry_submits,
      SUM(CASE WHEN action = 'free_entry_success' THEN 1 ELSE 0 END) AS free_entry_successes,
      MAX(created_at) AS last_seen
    FROM analytics_events
    WHERE datetime(created_at) >= datetime('now', ?)
  `).get(sinceModifier);
  const widgets = db.prepare(`
    SELECT
      widget,
      COUNT(*) AS total_events,
      SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN action IN ('cta_click', 'product_open') THEN 1 ELSE 0 END) AS clicks,
      SUM(CASE WHEN action = 'product_add_success' THEN 1 ELSE 0 END) AS add_successes,
      SUM(CASE WHEN action = 'free_entry_success' THEN 1 ELSE 0 END) AS free_entry_successes,
      MAX(created_at) AS last_seen
    FROM analytics_events
    WHERE datetime(created_at) >= datetime('now', ?)
    GROUP BY widget
    ORDER BY total_events DESC, last_seen DESC
  `).all(sinceModifier);
  const actions = db.prepare(`
    SELECT widget, action, COUNT(*) AS count, MAX(created_at) AS last_seen
    FROM analytics_events
    WHERE datetime(created_at) >= datetime('now', ?)
    GROUP BY widget, action
    ORDER BY count DESC, last_seen DESC
    LIMIT 40
  `).all(sinceModifier);
  const pages = db.prepare(`
    SELECT page_url, COUNT(*) AS count, MAX(created_at) AS last_seen
    FROM analytics_events
    WHERE datetime(created_at) >= datetime('now', ?)
      AND page_url IS NOT NULL
      AND page_url != ''
    GROUP BY page_url
    ORDER BY count DESC, last_seen DESC
    LIMIT 12
  `).all(sinceModifier);
  return {
    days: safeDays,
    totals: {
      totalEvents: Number(totals.total_events || 0),
      uniqueVisitors: Number(totals.unique_visitors || 0),
      views: Number(totals.views || 0),
      clicks: Number(totals.clicks || 0),
      addAttempts: Number(totals.add_attempts || 0),
      addSuccesses: Number(totals.add_successes || 0),
      freeEntrySubmits: Number(totals.free_entry_submits || 0),
      freeEntrySuccesses: Number(totals.free_entry_successes || 0),
      lastSeen: totals.last_seen || null
    },
    widgets,
    actions,
    pages
  };
}

export function analyticsActionItems(summary) {
  const totals = summary.totals || {};
  const views = Number(totals.views || 0);
  const clicks = Number(totals.clicks || 0);
  const addAttempts = Number(totals.addAttempts || 0);
  const addSuccesses = Number(totals.addSuccesses || 0);
  const freeSubmits = Number(totals.freeEntrySubmits || 0);
  const freeSuccesses = Number(totals.freeEntrySuccesses || 0);
  const items = [];
  if (!views) {
    items.push(["Activity", "Nog geen widgetmetingen", "Controleer of het live Shopify script op de juiste pagina's staat.", "Actie", "/admin/embed"]);
  }
  if (views && clicks / views < 0.04) {
    items.push(["MousePointerClick", "Lage klikratio", "Hero, productkaarten of membership CTA boven de vouw aanscherpen.", "Test", "/admin/widgets"]);
  }
  if (addAttempts && addSuccesses / addAttempts < 0.8) {
    items.push(["ShoppingCart", "Add-to-cart verliest aanvragen", "Controleer variant IDs, beschikbaarheid en Shopify cart endpoint.", "Actie", "/admin/producten"]);
  }
  if (freeSubmits && freeSuccesses / freeSubmits < 0.75) {
    items.push(["ShieldAlert", "Gratis deelname faalt vaak", "Bekijk IP-limieten, dubbele claims en formuliercopy.", "Controle", "/admin/compliance"]);
  }
  if (!items.length) {
    items.push(["BadgeCheck", "Tracking ziet er bruikbaar uit", "Blijf productkaarten, winnaars en gratis deelname wekelijks vergelijken.", "Goed", "/admin/groei"]);
  }
  return items;
}
