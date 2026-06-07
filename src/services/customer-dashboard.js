import { config } from "../config.js";
import { db, nowIso } from "../db.js";
import { shopifyRest } from "../shopify/admin-api.js";

const NAMESPACE = "dvl_lottery";
const DASHBOARD_KEYS = new Set(["summary", "entries"]);

function isTestRun() {
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

function shouldSync() {
  return config.SHOPIFY_SYNC_CUSTOMER_METAFIELDS && !isTestRun();
}

function normalizeShopifyCustomerId(value) {
  const raw = String(value || "");
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function customerByLocalId(customerId) {
  if (!customerId) return null;
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
}

function publicEntry(entry) {
  return {
    entryNumber: entry.entry_number,
    status: entry.status,
    source: entry.source,
    createdAt: entry.created_at,
    drawTitle: entry.draw_title,
    drawStatus: entry.draw_status,
    prizeName: entry.prize_name,
    prizeValue: entry.prize_value,
    orderName: entry.order_name || null
  };
}

export function buildCustomerDashboardPayload(customer) {
  const liveDraw = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM lottery_entries e WHERE e.draw_id = d.id AND e.status = 'ACTIVE') AS entry_count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
    ORDER BY d.starts_at DESC
    LIMIT 1
  `).get();

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_entries,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_entries,
      SUM(CASE WHEN status = 'WINNER' THEN 1 ELSE 0 END) AS winning_entries,
      SUM(CASE WHEN source = 'FREE_ENTRY' THEN 1 ELSE 0 END) AS free_entries,
      SUM(CASE WHEN source = 'ORDER_THRESHOLD' THEN 1 ELSE 0 END) AS order_entries
    FROM lottery_entries
    WHERE customer_id = ?
  `).get(customer.id);

  const entries = db.prepare(`
    SELECT e.*, d.title AS draw_title, d.prize_name, d.prize_value, d.status AS draw_status, o.order_name
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.customer_id = ?
    ORDER BY e.created_at DESC
    LIMIT 30
  `).all(customer.id);

  const latestOrder = db.prepare(`
    SELECT order_name, total_cents, created_at
    FROM orders
    WHERE customer_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(customer.id);

  return {
    summary: {
      customerEmail: customer.email || "",
      totalEntries: Number(stats.total_entries || 0),
      activeEntries: Number(stats.active_entries || 0),
      winningEntries: Number(stats.winning_entries || 0),
      freeEntries: Number(stats.free_entries || 0),
      orderEntries: Number(stats.order_entries || 0),
      ruleLabel: "1 lot bij elke bestelling vanaf EUR 70",
      liveDrawTitle: liveDraw?.title || "",
      liveDrawPrizeName: liveDraw?.prize_name || "",
      liveDrawPrizeValue: liveDraw?.prize_value || "",
      liveDrawEntryCount: Number(liveDraw?.entry_count || 0),
      latestOrderName: latestOrder?.order_name || "",
      latestOrderAt: latestOrder?.created_at || "",
      updatedAt: nowIso()
    },
    entries: entries.map(publicEntry)
  };
}

async function upsertCustomerMetafield(shopifyCustomerId, existing, key, value) {
  const body = {
    metafield: {
      namespace: NAMESPACE,
      key,
      type: "json",
      value: JSON.stringify(value)
    }
  };
  const match = existing.find((metafield) => metafield.namespace === NAMESPACE && metafield.key === key);
  if (match) {
    return shopifyRest(`/metafields/${match.id}.json`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }
  return shopifyRest(`/customers/${shopifyCustomerId}/metafields.json`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function syncCustomerDashboardMetafields(customerOrId) {
  const customer = typeof customerOrId === "string" ? customerByLocalId(customerOrId) : customerOrId;
  if (!customer?.shopify_customer_id) {
    return { skipped: "missing_shopify_customer_id" };
  }
  if (!shouldSync()) {
    return { skipped: "sync_disabled" };
  }

  const shopifyCustomerId = normalizeShopifyCustomerId(customer.shopify_customer_id);
  try {
    const payload = buildCustomerDashboardPayload(customer);
    const existingResponse = await shopifyRest(`/customers/${shopifyCustomerId}/metafields.json?namespace=${NAMESPACE}`);
    const existing = (existingResponse.metafields || []).filter((metafield) => DASHBOARD_KEYS.has(metafield.key));

    await upsertCustomerMetafield(shopifyCustomerId, existing, "summary", payload.summary);
    await upsertCustomerMetafield(shopifyCustomerId, existing, "entries", payload.entries);
    return { ok: true, shopifyCustomerId, totalEntries: payload.summary.totalEntries };
  } catch (error) {
    console.warn(`Customer dashboard sync failed for ${shopifyCustomerId}: ${error.message}`);
    return { error: error.message, shopifyCustomerId };
  }
}

export async function syncAllCustomerDashboardMetafields() {
  const customers = db.prepare("SELECT * FROM customers WHERE shopify_customer_id IS NOT NULL ORDER BY updated_at DESC").all();
  const results = [];
  for (const customer of customers) {
    results.push(await syncCustomerDashboardMetafields(customer));
  }
  return { count: customers.length, results };
}
