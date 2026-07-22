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
const { db, id, nowIso } = await import("../src/db.js");
const { createApp } = await import("../src/server.js");

function resetDb() {
  db.exec(`
    UPDATE lottery_draws SET winner_entry_id = NULL;
    DELETE FROM free_entry_claims;
    DELETE FROM audit_logs;
    DELETE FROM lottery_entries;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
    DELETE FROM app_settings;
  `);
}

function insertDraw() {
  const draw = {
    id: id(),
    title: "Checklist trekking",
    slug: `checklist-${Date.now()}`,
    description: "Deze trekking heeft genoeg publieke uitleg voor de checklist.",
    prize_name: "Premium vleespakket",
    prize_value: "EUR 250",
    starts_at: nowIso(),
    ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    draw_at: null,
    status: "DRAFT",
    winner_entry_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  db.prepare(`
    INSERT INTO lottery_draws
      (id, title, slug, description, prize_name, prize_value, starts_at, ends_at, draw_at, status, winner_entry_id, created_at, updated_at)
    VALUES
      (@id, @title, @slug, @description, @prize_name, @prize_value, @starts_at, @ends_at, @draw_at, @status, @winner_entry_id, @created_at, @updated_at)
  `).run(draw);
  return draw;
}

test("admin draw status publish requires checklist and writes audit log", async () => {
  resetDb();
  const draw = insertDraw();
  const app = createApp();
  const agent = request.agent(app);

  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  let page = await agent.get(`/admin/winacties/${draw.id}`).expect(200);
  let token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  await agent
    .post(`/admin/winacties/${draw.id}/status`)
    .type("form")
    .send({ _csrf: token, status: "LIVE" })
    .expect(400);
  assert.equal(db.prepare("SELECT status FROM lottery_draws WHERE id = ?").get(draw.id).status, "DRAFT");

  db.prepare(`
    INSERT INTO lottery_entries (id, entry_number, draw_id, customer_id, order_id, source, status, reason, created_at)
    VALUES (?, ?, ?, NULL, NULL, 'MANUAL', 'ACTIVE', 'Test lot.', ?)
  `).run(id(), `TEST-${Date.now()}`, draw.id, nowIso());

  page = await agent.get(`/admin/winacties/${draw.id}`).expect(200);
  token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  await agent
    .post(`/admin/winacties/${draw.id}/status`)
    .type("form")
    .send({ _csrf: token, status: "LIVE" })
    .expect(302);

  assert.equal(db.prepare("SELECT status FROM lottery_draws WHERE id = ?").get(draw.id).status, "LIVE");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'WINACTIE_STATUS_AANGEPAST'").get().count, 1);
});
