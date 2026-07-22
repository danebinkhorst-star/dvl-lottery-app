import test from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_USERNAME = "dvl";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
process.env.INTERNAL_API_SECRET = "test-internal-api-secret";
process.env.CUSTOMER_TOKEN_SECRET = "test-customer-token-secret";
process.env.FREE_ENTRY_HASH_SECRET = "test-free-entry-hash-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-shopify-webhook-secret";
process.env.SHOPIFY_SYNC_CUSTOMER_METAFIELDS = "false";
process.env.UPLOAD_DIR = "./tmp-test-uploads";

const request = (await import("supertest")).default;
const crypto = await import("node:crypto");
const { rmSync } = await import("node:fs");
const { db } = await import("../src/db.js");
const { createApp } = await import("../src/server.js");
const { isValidWriteSecret, signCustomerToken, verifyCustomerToken } = await import("../src/auth.js");
const { verifyShopifyWebhook } = await import("../src/utils.js");
const { assignEntriesForOrder, createDraw, drawWinner } = await import("../src/services/lottery.js");

function resetDb() {
  db.exec(`
    UPDATE lottery_draws SET winner_entry_id = NULL;
    DELETE FROM analytics_events;
    DELETE FROM free_entry_claims;
    DELETE FROM audit_logs;
    DELETE FROM lottery_entries;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
    DELETE FROM app_settings;
  `);
  rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
}

function shopifyHmac(body) {
  return crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body)
    .digest("base64");
}

test("webhook verification rejects missing secret and accepts valid HMAC", () => {
  const body = Buffer.from(JSON.stringify({ id: 123 }));
  assert.equal(verifyShopifyWebhook(body, shopifyHmac(body), ""), false);
  assert.equal(verifyShopifyWebhook(body, "", process.env.SHOPIFY_WEBHOOK_SECRET), false);
  assert.equal(verifyShopifyWebhook(body, shopifyHmac(body), process.env.SHOPIFY_WEBHOOK_SECRET), true);
});

test("internal write secret does not accept admin or webhook secrets", () => {
  assert.equal(isValidWriteSecret(process.env.INTERNAL_API_SECRET), true);
  assert.equal(isValidWriteSecret(process.env.ADMIN_PASSWORD), false);
  assert.equal(isValidWriteSecret(process.env.SHOPIFY_WEBHOOK_SECRET), false);
});

test("customer tokens are scoped to a customer and expire", () => {
  const valid = signCustomerToken("111", 60);
  const expired = signCustomerToken("111", -1);
  assert.equal(verifyCustomerToken("111", valid), true);
  assert.equal(verifyCustomerToken("222", valid), false);
  assert.equal(verifyCustomerToken("111", expired), false);
});

test("customer entries endpoint rejects query-string tokens", async () => {
  resetDb();
  const app = createApp();
  await request(app)
    .get(`/api/customers/111/entries?token=${encodeURIComponent(signCustomerToken("111"))}`)
    .expect(401);
});

test("admin POST routes require CSRF after login", async () => {
  resetDb();
  const app = createApp();
  const agent = request.agent(app);

  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  await agent
    .post("/admin/regels")
    .type("form")
    .send({ mode: "ORDER_MINIMUM", minimumEuro: "70", perEuro: "70", freeEntryEnabled: "true" })
    .expect(403);

  const page = await agent.get("/admin/regels").expect(200);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  await agent
    .post("/admin/regels")
    .type("form")
    .send({ _csrf: token, mode: "ORDER_MINIMUM", minimumEuro: "70", perEuro: "70", freeEntryEnabled: "true" })
    .expect(302);
});

test("admin image upload requires CSRF and serves the stored asset", async () => {
  resetDb();
  const app = createApp();
  const agent = request.agent(app);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );

  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  await agent
    .post("/admin/uploads")
    .attach("image", png, { filename: "proof.png", contentType: "image/png" })
    .field("field", "visualImageUrl")
    .expect(403);

  const page = await agent.get("/admin/widgets").expect(200);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  const response = await agent
    .post("/admin/uploads")
    .set("X-CSRF-Token", token)
    .attach("image", png, { filename: "proof.png", contentType: "image/png" })
    .field("field", "visualImageUrl")
    .expect(200);

  assert.match(response.body.url, /^\/uploads\/.+\.png$/);
  await agent.get(response.body.url).expect(200);
  assert.equal(db.prepare("SELECT action FROM audit_logs WHERE action = 'ADMIN_IMAGE_UPLOAD'").get().action, "ADMIN_IMAGE_UPLOAD");
});

test("admin winners page is available after login", async () => {
  resetDb();
  const app = createApp();
  const agent = request.agent(app);

  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  const response = await agent.get("/admin/winnaars").expect(200);
  assert.match(response.text, /Beheer publicatie van winnaars/);
  assert.match(response.text, /Widget aanpassen/);
});

test("admin can approve winner publication with CSRF", async () => {
  resetDb();
  const draw = await createDraw({
    title: "Publicatie test",
    prizeName: "BBQ pakket",
    status: "LIVE"
  });
  await assignEntriesForOrder({
    id: 62345,
    name: "#6201",
    total_price: "80.00",
    currency: "EUR",
    financial_status: "paid",
    email: "publicatie@example.com",
    customer: { id: 6201, email: "publicatie@example.com", first_name: "Bas", last_name: "Tester" }
  });
  await drawWinner(draw.id);

  const app = createApp();
  const agent = request.agent(app);
  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  const page = await agent.get("/admin/winnaars").expect(200);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  await agent
    .post(`/admin/winnaars/${draw.id}/publication`)
    .type("form")
    .send({
      _csrf: token,
      publicStatus: "PUBLIC",
      publicName: "Bas",
      publicStatement: "Ik had vlees besteld voor de BBQ en won daarna het pakket.",
      publicImageUrl: "/uploads/winnaar-bas.png"
    })
    .expect(302);

  const updated = db.prepare("SELECT winner_public_status, winner_public_name, winner_public_statement, winner_public_image_url, winner_public_approved_at FROM lottery_draws WHERE id = ?").get(draw.id);
  assert.equal(updated.winner_public_status, "PUBLIC");
  assert.equal(updated.winner_public_name, "Bas");
  assert.equal(updated.winner_public_statement, "Ik had vlees besteld voor de BBQ en won daarna het pakket.");
  assert.equal(updated.winner_public_image_url, "/uploads/winnaar-bas.png");
  assert.ok(updated.winner_public_approved_at);
  assert.equal(db.prepare("SELECT action FROM audit_logs WHERE action = 'WINNAAR_PUBLICATIE_BIJGEWERKT'").get().action, "WINNAAR_PUBLICATIE_BIJGEWERKT");
});

test("widget analytics events are stored privacy-safe and visible in admin growth", async () => {
  resetDb();
  const app = createApp();
  await request(app)
    .post("/api/events")
    .set("x-forwarded-for", "203.0.113.77")
    .send({
      widget: "product-cards",
      action: "product_add_success",
      target: "variant-1",
      pageUrl: "https://meatforfree.nl/products/ribeye?customer_email=secret@example.com",
      referrer: "https://meatforfree.nl/",
      shopOrigin: "https://meatforfree.nl",
      metadata: { product: "Ribeye", label: "In winkelwagen", email: "secret@example.com" }
    })
    .expect(204);

  const stored = db.prepare("SELECT * FROM analytics_events WHERE widget = 'product-cards'").get();
  assert.equal(stored.action, "product_add_success");
  assert.equal(stored.target, "variant-1");
  assert.equal(stored.page_url, "https://meatforfree.nl/products/ribeye");
  assert.ok(stored.ip_hash);
  assert.doesNotMatch(String(stored.metadata || ""), /secret@example.com/);

  const agent = request.agent(app);
  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  const page = await agent.get("/admin/groei").expect(200);
  assert.match(page.text, /Conversie en live readiness/);
  assert.match(page.text, /product-cards/);

  const csv = await agent.get("/admin/groei/events.csv").expect(200);
  assert.match(csv.text, /product-cards/);
  assert.doesNotMatch(csv.text, /secret@example.com/);
});
