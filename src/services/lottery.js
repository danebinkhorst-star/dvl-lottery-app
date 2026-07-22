import { db, id, nowIso } from "../db.js";
import { config } from "../config.js";
import { syncCustomerDashboardMetafields } from "./customer-dashboard.js";
import { getLotteryRule } from "./settings.js";
import { shopifyRest } from "../shopify/admin-api.js";
import { centsFromMoney, makeEntryNumber, slugify } from "../utils.js";
import crypto from "node:crypto";

export function calculateEntryCount(totalCents, rule = config) {
  if (rule.LOT_RULE_MODE === "PER_AMOUNT") {
    return Math.floor(totalCents / rule.LOT_PER_CENTS);
  }
  return totalCents >= rule.LOT_ORDER_MINIMUM_CENTS ? 1 : 0;
}

function hashIp(ipAddress) {
  const cleanIp = String(ipAddress || "unknown").trim().toLowerCase();
  const secret = config.FREE_ENTRY_HASH_SECRET || "dvl-free-entry-ip";
  return crypto.createHmac("sha256", secret).update(cleanIp).digest("hex");
}

export async function getOrCreateLiveDraw() {
  const live = db.prepare("SELECT * FROM lottery_draws WHERE status = 'LIVE' ORDER BY starts_at DESC LIMIT 1").get();
  if (live) return live;

  const draw = {
    id: id(),
    title: "Actieve maandtrekking",
    slug: `actieve-maandtrekking-${Date.now()}`,
    description: "Automatische trekking voor geldige bestellingen en abonnementen.",
    prize_name: "Premium vleespakket",
    prize_value: "Maandprijs",
    starts_at: nowIso(),
    ends_at: null,
    draw_at: null,
    status: "LIVE",
    winner_entry_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  db.prepare(`INSERT INTO lottery_draws
    (id, title, slug, description, prize_name, prize_value, starts_at, ends_at, draw_at, status, winner_entry_id, created_at, updated_at)
    VALUES (@id, @title, @slug, @description, @prize_name, @prize_value, @starts_at, @ends_at, @draw_at, @status, @winner_entry_id, @created_at, @updated_at)`).run(draw);
  return draw;
}

export async function createDraw(input) {
  const slug = input.slug || `${slugify(input.title)}-${Date.now()}`;
  const draw = {
    id: id(),
    title: input.title,
    slug,
    description: input.description || "",
    prize_name: input.prizeName,
    prize_value: input.prizeValue || "",
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : nowIso(),
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    draw_at: input.drawAt ? new Date(input.drawAt).toISOString() : null,
    status: input.status || "DRAFT",
    winner_entry_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  db.prepare(`INSERT INTO lottery_draws
    (id, title, slug, description, prize_name, prize_value, starts_at, ends_at, draw_at, status, winner_entry_id, created_at, updated_at)
    VALUES (@id, @title, @slug, @description, @prize_name, @prize_value, @starts_at, @ends_at, @draw_at, @status, @winner_entry_id, @created_at, @updated_at)`).run(draw);
  return draw;
}

export async function getOrCreateCustomer({ shopifyCustomerId = null, email = null, firstName = null, lastName = null }) {
  let customer = null;
  if (shopifyCustomerId || email) {
    if (shopifyCustomerId && email) {
      customer = db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ? OR email = ?").get(shopifyCustomerId, email);
    } else if (shopifyCustomerId) {
      customer = db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ?").get(shopifyCustomerId);
    } else {
      customer = db.prepare("SELECT * FROM customers WHERE email = ?").get(email);
    }
  }

  if (!customer) {
    customer = {
      id: id(),
      shopify_customer_id: shopifyCustomerId,
      email,
      first_name: firstName,
      last_name: lastName,
      total_entries: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    db.prepare(`INSERT INTO customers
      (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
      VALUES (@id, @shopify_customer_id, @email, @first_name, @last_name, @total_entries, @created_at, @updated_at)`).run(customer);
    return customer;
  }

  db.prepare("UPDATE customers SET shopify_customer_id = COALESCE(?, shopify_customer_id), email = COALESCE(?, email), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = ? WHERE id = ?")
    .run(shopifyCustomerId, email, firstName, lastName, nowIso(), customer.id);
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(customer.id);
}

function lineItemId(lineItem, index) {
  return String(lineItem?.id || lineItem?.admin_graphql_api_id || `${lineItem?.product_id || "product"}-${lineItem?.variant_id || "variant"}-${index}`);
}

export function persistOrderLineItems(order, orderPayload) {
  const items = Array.isArray(orderPayload?.line_items) ? orderPayload.line_items : [];
  const statement = db.prepare(`
    INSERT INTO order_items (
      id, order_id, shopify_line_item_id, shopify_product_id, shopify_variant_id, title, variant_title,
      sku, quantity, price_cents, total_cents, created_at
    )
    VALUES (
      @id, @order_id, @shopify_line_item_id, @shopify_product_id, @shopify_variant_id, @title, @variant_title,
      @sku, @quantity, @price_cents, @total_cents, @created_at
    )
    ON CONFLICT(order_id, shopify_line_item_id) DO UPDATE SET
      shopify_product_id = excluded.shopify_product_id,
      shopify_variant_id = excluded.shopify_variant_id,
      title = excluded.title,
      variant_title = excluded.variant_title,
      sku = excluded.sku,
      quantity = excluded.quantity,
      price_cents = excluded.price_cents,
      total_cents = excluded.total_cents
  `);
  const now = nowIso();
  let saved = 0;
  for (const [index, lineItem] of items.entries()) {
    const quantity = Math.max(0, Number(lineItem?.quantity || 0) || 0);
    const priceCents = centsFromMoney(lineItem?.price || lineItem?.original_price);
    const explicitTotalCents = centsFromMoney(lineItem?.pre_tax_price);
    const discountCents = centsFromMoney(lineItem?.total_discount);
    const totalCents = explicitTotalCents || Math.max(0, (priceCents * quantity) - discountCents);
    const row = {
      id: id(),
      order_id: order.id,
      shopify_line_item_id: lineItemId(lineItem, index),
      shopify_product_id: lineItem?.product_id ? String(lineItem.product_id) : "",
      shopify_variant_id: lineItem?.variant_id ? String(lineItem.variant_id) : "",
      title: String(lineItem?.title || lineItem?.name || "Product").trim(),
      variant_title: String(lineItem?.variant_title || "").trim(),
      sku: String(lineItem?.sku || "").trim(),
      quantity,
      price_cents: priceCents,
      total_cents: totalCents,
      created_at: now
    };
    if (!row.title || quantity <= 0) continue;
    statement.run(row);
    saved += 1;
  }
  return saved;
}

export async function syncStoredOrderLineItems({ limit = 50 } = {}) {
  const rows = db.prepare(`
    SELECT *
    FROM orders
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit || 50))));
  const result = { checked: 0, updatedLineItems: 0, skipped: 0, errors: 0 };
  for (const order of rows) {
    if (!/^\d+$/.test(String(order.shopify_order_id || ""))) {
      result.skipped += 1;
      continue;
    }
    try {
      const data = await shopifyRest(`/orders/${encodeURIComponent(order.shopify_order_id)}.json?fields=id,line_items`);
      result.checked += 1;
      result.updatedLineItems += persistOrderLineItems(order, data.order || {});
    } catch (error) {
      result.errors += 1;
      console.warn(`Order line-item sync failed for order ${order.shopify_order_id}: ${error.message}`);
    }
  }
  return result;
}

export async function createFreeEntry({ email, firstName = null, lastName = null, drawId = null, ipAddress = "", userAgent = "" }) {
  const rule = getLotteryRule();
  if (!rule.FREE_ENTRY_ENABLED) {
    throw new Error("Gratis deelname is tijdelijk gesloten.");
  }

  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  const draw = drawId
    ? db.prepare("SELECT * FROM lottery_draws WHERE id = ? AND status = 'LIVE'").get(drawId)
    : await getOrCreateLiveDraw();
  if (!draw) throw new Error("Er is geen actieve trekking gevonden.");

  const customer = await getOrCreateCustomer({ email: cleanEmail, firstName, lastName });
  const ipHash = hashIp(ipAddress);
  const existingIpClaim = db.prepare(`
    SELECT fc.*, c.email AS claimed_email
    FROM free_entry_claims fc
    LEFT JOIN customers c ON c.id = fc.customer_id
    WHERE fc.draw_id = ? AND fc.ip_hash = ?
    LIMIT 1
  `).get(draw.id, ipHash);
  if (existingIpClaim && existingIpClaim.email !== cleanEmail) {
    throw new Error("Er is al een gratis deelname vanaf dit netwerk geregistreerd voor deze winactie.");
  }

  const existing = db.prepare(`
    SELECT e.*
    FROM lottery_entries e
    WHERE e.draw_id = ? AND e.customer_id = ? AND e.source = 'FREE_ENTRY' AND e.status = 'ACTIVE'
    LIMIT 1
  `).get(draw.id, customer.id);
  if (existing) {
    db.prepare(`
      INSERT OR IGNORE INTO free_entry_claims (id, draw_id, customer_id, email, ip_hash, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id(), draw.id, customer.id, cleanEmail, ipHash, String(userAgent || "").slice(0, 260), nowIso());
    await syncCustomerDashboardMetafields(customer);
    return { entry: existing, customer, draw, skipped: "free_entry_already_exists" };
  }

  const entry = {
    id: id(),
    entry_number: makeEntryNumber("FREE"),
    draw_id: draw.id,
    customer_id: customer.id,
    order_id: null,
    source: "FREE_ENTRY",
    status: "ACTIVE",
    reason: "Gratis deelname zonder aankoop.",
    created_at: nowIso()
  };
  db.prepare(`INSERT INTO lottery_entries
    (id, entry_number, draw_id, customer_id, order_id, source, status, reason, created_at)
    VALUES (@id, @entry_number, @draw_id, @customer_id, @order_id, @source, @status, @reason, @created_at)`).run(entry);
  try {
    db.prepare(`
      INSERT INTO free_entry_claims (id, draw_id, customer_id, email, ip_hash, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id(), draw.id, customer.id, cleanEmail, ipHash, String(userAgent || "").slice(0, 260), nowIso());
  } catch (error) {
    db.prepare("DELETE FROM lottery_entries WHERE id = ?").run(entry.id);
    throw new Error("Er is al een gratis deelname geregistreerd voor deze winactie.");
  }
  db.prepare("UPDATE customers SET total_entries = total_entries + 1, updated_at = ? WHERE id = ?").run(nowIso(), customer.id);
  await syncCustomerDashboardMetafields(customer);

  return { entry, customer, draw };
}

export async function assignEntriesForOrder(orderPayload) {
  const shopifyOrderId = String(orderPayload.id || orderPayload.admin_graphql_api_id);
  const totalCents = centsFromMoney(orderPayload.total_price);
  const entryCount = calculateEntryCount(totalCents, getLotteryRule());
  const email = orderPayload.email || orderPayload.contact_email || orderPayload.customer?.email || null;
  const shopifyCustomerId = orderPayload.customer?.id ? String(orderPayload.customer.id) : (orderPayload.customer?.admin_graphql_api_id || null);

  const existingOrder = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(shopifyOrderId);
  if (existingOrder) {
    const lineItemsSaved = persistOrderLineItems(existingOrder, orderPayload);
    const existingEntries = db.prepare("SELECT * FROM lottery_entries WHERE order_id = ?").all(existingOrder.id);
    if (existingOrder.customer_id) await syncCustomerDashboardMetafields(existingOrder.customer_id);
    return { order: existingOrder, createdEntries: existingEntries, lineItemsSaved, skipped: "order_already_processed" };
  }

  const draw = await getOrCreateLiveDraw();
  const customer = (shopifyCustomerId || email)
    ? await getOrCreateCustomer({
        shopifyCustomerId,
        email,
        firstName: orderPayload.customer?.first_name || null,
        lastName: orderPayload.customer?.last_name || null
      })
    : null;

  const order = {
    id: id(),
    shopify_order_id: shopifyOrderId,
    order_name: orderPayload.name || null,
    customer_id: customer?.id || null,
    email,
    currency: orderPayload.currency || "EUR",
    total_cents: totalCents,
    financial_status: orderPayload.financial_status || null,
    source: "shopify_order",
    created_at: nowIso(),
    updated_at: nowIso()
  };
  db.prepare(`INSERT INTO orders
    (id, shopify_order_id, order_name, customer_id, email, currency, total_cents, financial_status, source, created_at, updated_at)
    VALUES (@id, @shopify_order_id, @order_name, @customer_id, @email, @currency, @total_cents, @financial_status, @source, @created_at, @updated_at)`).run(order);
  const lineItemsSaved = persistOrderLineItems(order, orderPayload);

  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    const entry = {
      id: id(),
      entry_number: makeEntryNumber(),
      draw_id: draw.id,
      customer_id: customer?.id || null,
      order_id: order.id,
      source: "ORDER_THRESHOLD",
      status: "ACTIVE",
      reason: `Order ${order.order_name || shopifyOrderId} qualifies for ${entryCount} lot(en).`,
      created_at: nowIso()
    };
    db.prepare(`INSERT INTO lottery_entries
      (id, entry_number, draw_id, customer_id, order_id, source, status, reason, created_at)
      VALUES (@id, @entry_number, @draw_id, @customer_id, @order_id, @source, @status, @reason, @created_at)`).run(entry);
    entries.push(entry);
  }

  if (customer && entries.length > 0) {
    db.prepare("UPDATE customers SET total_entries = total_entries + ?, updated_at = ? WHERE id = ?").run(entries.length, nowIso(), customer.id);
  }
  if (customer) await syncCustomerDashboardMetafields(customer);

  return { order, createdEntries: entries, draw, lineItemsSaved };
}

export async function voidEntriesForOrder(shopifyOrderId, reason = "Order refunded or cancelled") {
  const order = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(String(shopifyOrderId));
  if (!order) return { voided: 0 };

  const activeEntries = db.prepare("SELECT * FROM lottery_entries WHERE order_id = ? AND status = 'ACTIVE'").all(order.id);
  db.prepare("UPDATE lottery_entries SET status = 'VOID', reason = ? WHERE order_id = ? AND status = 'ACTIVE'").run(reason, order.id);

  if (order.customer_id && activeEntries.length > 0) {
    db.prepare("UPDATE customers SET total_entries = MAX(0, total_entries - ?), updated_at = ? WHERE id = ?").run(activeEntries.length, nowIso(), order.customer_id);
    await syncCustomerDashboardMetafields(order.customer_id);
  }

  return { voided: activeEntries.length };
}

export async function drawWinner(drawId) {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(drawId);
  if (!draw) throw new Error("Draw not found");
  if (draw.status !== "LIVE" || draw.winner_entry_id) {
    throw new Error("Draw has already been completed");
  }
  const entries = db.prepare("SELECT * FROM lottery_entries WHERE draw_id = ? AND status = 'ACTIVE'").all(drawId);
  if (entries.length === 0) throw new Error("No active entries in this draw");

  const winner = entries[crypto.randomInt(entries.length)];
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE lottery_entries SET status = 'WINNER' WHERE id = ?").run(winner.id);
    db.prepare("UPDATE lottery_draws SET status = 'DRAWN', winner_entry_id = ?, draw_at = ?, updated_at = ? WHERE id = ?")
      .run(winner.id, nowIso(), nowIso(), draw.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (winner.customer_id) await syncCustomerDashboardMetafields(winner.customer_id);
  return winner;
}
