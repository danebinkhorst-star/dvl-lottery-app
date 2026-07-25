import crypto from "node:crypto";
import { db } from "../src/db.js";
import { config } from "../src/config.js";
import { assignEntriesForOrder, createDraw, voidEntriesForOrder } from "../src/services/lottery.js";

function arg(name) {
  const prefix = `${name}=`;
  const directIndex = process.argv.indexOf(name);
  if (directIndex !== -1) return process.argv[directIndex + 1] || "";
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

function hmac(body) {
  return crypto.createHmac("sha256", config.SHOPIFY_WEBHOOK_SECRET).update(body).digest("base64");
}

function proofOrder() {
  const suffix = Date.now();
  return {
    id: suffix,
    admin_graphql_api_id: `gid://shopify/Order/${suffix}`,
    name: `#MFF-PROOF-${suffix}`,
    total_price: "80.00",
    currency: "EUR",
    financial_status: "paid",
    email: `proof-${suffix}@example.test`,
    customer: {
      id: suffix,
      admin_graphql_api_id: `gid://shopify/Customer/${suffix}`,
      email: `proof-${suffix}@example.test`,
      first_name: "Proof",
      last_name: "Order"
    },
    line_items: [
      {
        id: suffix + 1,
        product_id: 111,
        variant_id: 222,
        title: "Ribeye",
        variant_title: "1 kg",
        sku: "MFF-PROOF",
        quantity: 1,
        price: "80.00"
      }
    ]
  };
}

async function ensureLiveDrawForLocalProof() {
  const live = db.prepare("SELECT * FROM lottery_draws WHERE status = 'LIVE' ORDER BY starts_at DESC LIMIT 1").get();
  if (live) return live;
  return createDraw({
    title: "Commerce proof trekking",
    slug: `commerce-proof-${Date.now()}`,
    prizeName: "Proof vleespakket",
    prizeValue: "Interne test",
    status: "LIVE"
  });
}

async function runLocalProof() {
  const draw = await ensureLiveDrawForLocalProof();
  const order = proofOrder();
  const created = await assignEntriesForOrder(order);
  const repeated = await assignEntriesForOrder(order);
  const voided = await voidEntriesForOrder(order.id, "Commerce proof refund/cancel check");
  const row = db.prepare(`
    SELECT o.order_name, o.total_cents, c.email, COUNT(e.id) AS entries,
      SUM(CASE WHEN e.status = 'VOID' THEN 1 ELSE 0 END) AS void_entries
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    WHERE o.shopify_order_id = ?
    GROUP BY o.id
  `).get(order.admin_graphql_api_id);
  return {
    mode: "local",
    draw: { id: draw.id, title: draw.title, status: draw.status },
    order: row,
    createdEntries: created.createdEntries.length,
    repeatedSkipped: repeated.skipped || null,
    voided: voided.voided
  };
}

async function runWebhookProof(webhookBaseUrl) {
  if (!config.SHOPIFY_WEBHOOK_SECRET) throw new Error("SHOPIFY_WEBHOOK_SECRET is nodig voor webhook proof.");
  const base = webhookBaseUrl.replace(/\/+$/, "");
  const order = proofOrder();
  const body = JSON.stringify(order);
  const paid = await fetch(`${base}/webhooks/orders/paid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac(Buffer.from(body))
    },
    body
  });
  const refundBody = JSON.stringify({ order_id: order.admin_graphql_api_id });
  const refund = await fetch(`${base}/webhooks/refunds/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac(Buffer.from(refundBody))
    },
    body: refundBody
  });
  return {
    mode: "webhook",
    webhookBaseUrl: base,
    paid: { status: paid.status, body: await paid.text() },
    refund: { status: refund.status, body: await refund.text() }
  };
}

const webhookUrl = arg("--webhook-url");
const result = webhookUrl ? await runWebhookProof(webhookUrl) : await runLocalProof();
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
