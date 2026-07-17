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

const request = (await import("supertest")).default;
const crypto = await import("node:crypto");
const { db } = await import("../src/db.js");
const { createApp } = await import("../src/server.js");
const { isValidWriteSecret, signCustomerToken, verifyCustomerToken } = await import("../src/auth.js");
const { verifyShopifyWebhook } = await import("../src/utils.js");

function resetDb() {
  db.exec(`
    UPDATE lottery_draws SET winner_entry_id = NULL;
    DELETE FROM free_entry_claims;
    DELETE FROM audit_logs;
    DELETE FROM lottery_entries;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
    DELETE FROM app_settings;
  `);
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
