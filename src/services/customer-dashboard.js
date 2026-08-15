import { config } from "../config.js";
import { db, id, nowIso } from "../db.js";
import { shopifyRest } from "../shopify/admin-api.js";
import { getLotteryRule } from "./settings.js";
import { formatEuro } from "../utils.js";
import { ensureCustomerAuctionToken } from "../auth.js";

const NAMESPACE = "dvl_lottery";
const DASHBOARD_KEYS = new Set(["summary", "entries", "orders", "active_draw", "auction_token"]);

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

function upsertLocalShopifyCustomer(shopifyCustomer) {
  const shopifyCustomerId = normalizeShopifyCustomerId(shopifyCustomer.id);
  const email = String(shopifyCustomer.email || "").trim().toLowerCase();
  const firstName = String(shopifyCustomer.first_name || "").trim();
  const lastName = String(shopifyCustomer.last_name || "").trim();
  const timestamp = nowIso();
  let customer = db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ?").get(shopifyCustomerId);
  if (!customer && email) {
    customer = db.prepare("SELECT * FROM customers WHERE lower(email) = ?").get(email);
  }

  if (customer) {
    db.prepare(`
      UPDATE customers
      SET shopify_customer_id = COALESCE(shopify_customer_id, ?),
          email = COALESCE(NULLIF(email, ''), ?),
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          updated_at = ?
      WHERE id = ?
    `).run(shopifyCustomerId, email || null, firstName || null, lastName || null, timestamp, customer.id);
    return db.prepare("SELECT * FROM customers WHERE id = ?").get(customer.id);
  }

  const customerId = id();
  db.prepare(`
    INSERT INTO customers (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(customerId, shopifyCustomerId, email || null, firstName || null, lastName || null, timestamp, timestamp);
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
}

function sourceLabel(source) {
  const labels = {
    ORDER_THRESHOLD: "Bestelling",
    FREE_ENTRY: "Gratis deelname",
    SUBSCRIPTION: "Abonnement",
    ADMIN: "Handmatig",
    MANUAL: "Handmatig"
  };
  return labels[source] || "Loterij";
}

function publicEntry(entry) {
  return {
    entryNumber: entry.entry_number,
    status: entry.status,
    source: entry.source,
    sourceLabel: sourceLabel(entry.source),
    createdAt: entry.created_at,
    drawTitle: entry.draw_title,
    drawStatus: entry.draw_status,
    prizeName: entry.prize_name,
    prizeValue: entry.prize_value,
    orderName: entry.order_name || null,
    reason: entry.reason || ""
  };
}

function publicOrder(order) {
  const rule = getLotteryRule();
  const totalCents = Number(order.total_cents || 0);
  const entryCount = Number(order.entry_count || 0);
  const threshold = rule.LOT_RULE_MODE === "PER_AMOUNT" ? rule.LOT_PER_CENTS : rule.LOT_ORDER_MINIMUM_CENTS;
  const remainingCents = rule.LOT_RULE_MODE === "PER_AMOUNT"
    ? Math.max(0, threshold - (totalCents % threshold || threshold))
    : Math.max(0, threshold - totalCents);
  const progress = Math.max(0, Math.min(100, Math.round((totalCents / threshold) * 100)));

  return {
    orderName: order.order_name || "",
    totalCents,
    totalLabel: formatEuro(totalCents),
    entryCount,
    status: order.financial_status || "",
    createdAt: order.created_at,
    qualifies: entryCount > 0,
    nextLotRemainingCents: remainingCents,
    nextLotRemainingLabel: formatEuro(remainingCents),
    nextLotProgress: progress
  };
}

export function buildCustomerDashboardPayload(customer) {
  const rule = getLotteryRule();
  const ruleText = rule.LOT_RULE_MODE === "PER_AMOUNT"
    ? `1 lot per ${formatEuro(rule.LOT_PER_CENTS)}`
    : `1 lot bij elke bestelling vanaf ${formatEuro(rule.LOT_ORDER_MINIMUM_CENTS)}`;
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
      SUM(CASE WHEN source = 'ORDER_THRESHOLD' THEN 1 ELSE 0 END) AS order_entries,
      SUM(CASE WHEN source = 'SUBSCRIPTION' THEN 1 ELSE 0 END) AS subscription_entries
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
    SELECT o.order_name, o.total_cents, o.financial_status, o.created_at, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    WHERE o.customer_id = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 1
  `).get(customer.id);

  const latestOrders = db.prepare(`
    SELECT o.order_name, o.total_cents, o.financial_status, o.created_at, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    WHERE o.customer_id = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 6
  `).all(customer.id);

  const activeDrawEntries = liveDraw ? db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries
    WHERE draw_id = ? AND customer_id = ? AND status = 'ACTIVE'
  `).get(liveDraw.id, customer.id) : { count: 0 };

  const latestOrderPublic = latestOrder ? publicOrder(latestOrder) : null;
  const activeEntries = entries.filter((entry) => entry.status === "ACTIVE");
  const winningEntries = entries.filter((entry) => entry.status === "WINNER");
  const nextAction = latestOrderPublic?.nextLotRemainingCents
    ? {
        type: "cart_progress",
        label: `Nog ${latestOrderPublic.nextLotRemainingLabel} tot je volgende lot`,
        progress: latestOrderPublic.nextLotProgress
      }
    : {
        type: "ready",
        label: activeEntries.length ? "Je speelt mee met de actieve trekking" : "Plaats een bestelling vanaf de lotgrens",
        progress: activeEntries.length ? 100 : 0
      };
  const activeDraw = liveDraw ? {
    id: liveDraw.id,
    title: liveDraw.title,
    description: liveDraw.description || "",
    prizeName: liveDraw.prize_name,
    prizeValue: liveDraw.prize_value || "",
    startsAt: liveDraw.starts_at,
    endsAt: liveDraw.ends_at,
    drawAt: liveDraw.draw_at,
    entryCount: Number(liveDraw.entry_count || 0),
    customerEntryCount: Number(activeDrawEntries?.count || 0)
  } : null;

  return {
    summary: {
      customerEmail: customer.email || "",
      customerName: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
      totalEntries: Number(stats.total_entries || 0),
      activeEntries: Number(stats.active_entries || 0),
      winningEntries: Number(stats.winning_entries || 0),
      freeEntries: Number(stats.free_entries || 0),
      orderEntries: Number(stats.order_entries || 0),
      subscriptionEntries: Number(stats.subscription_entries || 0),
      liveDrawEntries: Number(activeDrawEntries?.count || 0),
      ruleLabel: ruleText,
      liveDrawTitle: liveDraw?.title || "",
      liveDrawPrizeName: liveDraw?.prize_name || "",
      liveDrawPrizeValue: liveDraw?.prize_value || "",
      liveDrawDescription: liveDraw?.description || "",
      liveDrawEndsAt: liveDraw?.ends_at || "",
      liveDrawAt: liveDraw?.draw_at || "",
      liveDrawEntryCount: Number(liveDraw?.entry_count || 0),
      latestOrderName: latestOrderPublic?.orderName || "",
      latestOrderAt: latestOrderPublic?.createdAt || "",
      latestOrderTotalLabel: latestOrderPublic?.totalLabel || "",
      nextLotRemainingLabel: latestOrderPublic?.nextLotRemainingLabel || formatEuro(rule.LOT_ORDER_MINIMUM_CENTS),
      nextLotProgress: latestOrderPublic?.nextLotProgress || 0,
      nextActionLabel: nextAction.label,
      nextActionProgress: nextAction.progress,
      updatedAt: nowIso()
    },
    activeDraw,
    ticketWallet: activeEntries.slice(0, 12).map(publicEntry),
    winnerHistory: winningEntries.slice(0, 8).map(publicEntry),
    nextAction,
    orders: latestOrders.map(publicOrder),
    entries: entries.map(publicEntry)
  };
}

async function upsertCustomerMetafield(shopifyCustomerId, existing, key, value) {
  const body = {
    metafield: {
      namespace: NAMESPACE,
      key,
      type: key === "auction_token" ? "single_line_text_field" : "json",
      value: key === "auction_token" ? String(value || "") : JSON.stringify(value)
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
    await upsertCustomerMetafield(shopifyCustomerId, existing, "orders", payload.orders);
    await upsertCustomerMetafield(shopifyCustomerId, existing, "active_draw", payload.activeDraw);
    await upsertCustomerMetafield(shopifyCustomerId, existing, "auction_token", ensureCustomerAuctionToken(customer.shopify_customer_id));
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

export async function syncAllShopifyCustomerAuctionTokens({ limit = 250, maxPages = 25 } = {}) {
  if (isTestRun()) {
    return { skipped: "test_run" };
  }

  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 250));
  const safeMaxPages = Math.max(1, Math.min(100, Number(maxPages) || 25));
  const results = [];
  let sinceId = "0";
  let pages = 0;
  let synced = 0;
  let failed = 0;

  while (pages < safeMaxPages) {
    pages += 1;
    const response = await shopifyRest(`/customers.json?limit=${safeLimit}&fields=id,email,first_name,last_name&since_id=${sinceId}`);
    const customers = response.customers || [];
    if (!customers.length) break;

    for (const shopifyCustomer of customers) {
      const shopifyCustomerId = normalizeShopifyCustomerId(shopifyCustomer.id);
      try {
        const localCustomer = upsertLocalShopifyCustomer(shopifyCustomer);
        const token = ensureCustomerAuctionToken(localCustomer.shopify_customer_id || shopifyCustomerId);
        const existingResponse = await shopifyRest(`/customers/${shopifyCustomerId}/metafields.json?namespace=${NAMESPACE}`);
        const existing = (existingResponse.metafields || []).filter((metafield) => metafield.key === "auction_token");
        await upsertCustomerMetafield(shopifyCustomerId, existing, "auction_token", token);
        synced += 1;
        results.push({ ok: true, shopifyCustomerId, email: shopifyCustomer.email || "" });
      } catch (error) {
        failed += 1;
        results.push({ error: error.message, shopifyCustomerId, email: shopifyCustomer.email || "" });
      }
    }

    sinceId = String(customers.at(-1)?.id || sinceId);
    if (customers.length < safeLimit) break;
  }

  return { ok: failed === 0, synced, failed, pages, limit: safeLimit, results };
}
