import { db, id, nowIso } from "../db.js";
import { config } from "../config.js";
import { centsFromMoney, makeEntryNumber, slugify } from "../utils.js";

export function calculateEntryCount(totalCents, rule = config) {
  if (rule.LOT_RULE_MODE === "PER_AMOUNT") {
    return Math.floor(totalCents / rule.LOT_PER_CENTS);
  }
  return totalCents >= rule.LOT_ORDER_MINIMUM_CENTS ? 1 : 0;
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

export async function assignEntriesForOrder(orderPayload) {
  const shopifyOrderId = String(orderPayload.id || orderPayload.admin_graphql_api_id);
  const totalCents = centsFromMoney(orderPayload.total_price);
  const entryCount = calculateEntryCount(totalCents);
  const email = orderPayload.email || orderPayload.contact_email || orderPayload.customer?.email || null;
  const shopifyCustomerId = orderPayload.customer?.id ? String(orderPayload.customer.id) : (orderPayload.customer?.admin_graphql_api_id || null);

  const existingOrder = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(shopifyOrderId);
  if (existingOrder) {
    const existingEntries = db.prepare("SELECT * FROM lottery_entries WHERE order_id = ?").all(existingOrder.id);
    return { order: existingOrder, createdEntries: existingEntries, skipped: "order_already_processed" };
  }

  const draw = await getOrCreateLiveDraw();
  let customer = null;
  if (shopifyCustomerId || email) {
    customer = shopifyCustomerId
      ? db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ?").get(shopifyCustomerId)
      : db.prepare("SELECT * FROM customers WHERE email = ?").get(email);

    if (!customer) {
      customer = {
        id: id(),
        shopify_customer_id: shopifyCustomerId,
        email,
        first_name: orderPayload.customer?.first_name || null,
        last_name: orderPayload.customer?.last_name || null,
        total_entries: 0,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      db.prepare(`INSERT INTO customers
        (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
        VALUES (@id, @shopify_customer_id, @email, @first_name, @last_name, @total_entries, @created_at, @updated_at)`).run(customer);
    } else {
      db.prepare("UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?")
        .run(email, orderPayload.customer?.first_name || null, orderPayload.customer?.last_name || null, nowIso(), customer.id);
    }
  }

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

  return { order, createdEntries: entries, draw };
}

export async function voidEntriesForOrder(shopifyOrderId, reason = "Order refunded or cancelled") {
  const order = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(String(shopifyOrderId));
  if (!order) return { voided: 0 };

  const activeEntries = db.prepare("SELECT * FROM lottery_entries WHERE order_id = ? AND status = 'ACTIVE'").all(order.id);
  db.prepare("UPDATE lottery_entries SET status = 'VOID', reason = ? WHERE order_id = ? AND status = 'ACTIVE'").run(reason, order.id);

  if (order.customer_id && activeEntries.length > 0) {
    db.prepare("UPDATE customers SET total_entries = MAX(0, total_entries - ?), updated_at = ? WHERE id = ?").run(activeEntries.length, nowIso(), order.customer_id);
  }

  return { voided: activeEntries.length };
}

export async function drawWinner(drawId) {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(drawId);
  if (!draw) throw new Error("Draw not found");
  const entries = db.prepare("SELECT * FROM lottery_entries WHERE draw_id = ? AND status = 'ACTIVE'").all(drawId);
  if (entries.length === 0) throw new Error("No active entries in this draw");

  const winner = entries[Math.floor(Math.random() * entries.length)];
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

  return winner;
}
