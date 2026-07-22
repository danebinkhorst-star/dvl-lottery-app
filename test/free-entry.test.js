import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { db } from "../src/db.js";
import { createApp } from "../src/server.js";
import { assignEntriesForOrder, createDraw, createFreeEntry } from "../src/services/lottery.js";
import { signCustomerToken } from "../src/auth.js";

function resetDb() {
  db.exec(`
    UPDATE lottery_draws SET winner_entry_id = NULL;
    DELETE FROM security_events;
    DELETE FROM free_entry_claims;
    DELETE FROM audit_logs;
    DELETE FROM lottery_entries;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
    DELETE FROM app_settings;
  `);
}

test("free entry is one per live draw and later merges with Shopify customer", async () => {
  resetDb();
  await createDraw({
    title: "Gratis deelname test",
    prizeName: "BBQ pakket",
    status: "LIVE"
  });

  const first = await createFreeEntry({ email: "Lot@example.com", firstName: "Lot" });
  const duplicate = await createFreeEntry({ email: "lot@example.com", firstName: "Lot" });

  assert.equal(first.entry.status, "ACTIVE");
  assert.equal(duplicate.skipped, "free_entry_already_exists");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE source = 'FREE_ENTRY'").get().count, 1);

  await assignEntriesForOrder({
    id: 456,
    name: "#1002",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "lot@example.com",
    customer: { id: 999, email: "lot@example.com", first_name: "Lot", last_name: "Klant" }
  });

  const customer = db.prepare("SELECT * FROM customers WHERE email = ?").get("lot@example.com");
  assert.equal(customer.shopify_customer_id, "999");
  assert.equal(customer.total_entries, 2);
});

test("free entry allows one claim per IP per live draw", async () => {
  resetDb();
  await createDraw({
    title: "IP test",
    prizeName: "BBQ pakket",
    status: "LIVE"
  });

  await createFreeEntry({ email: "eerste@example.com", ipAddress: "203.0.113.10" });
  await assert.rejects(
    () => createFreeEntry({ email: "tweede@example.com", ipAddress: "203.0.113.10" }),
    /gratis deelname vanaf dit netwerk/
  );

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE source = 'FREE_ENTRY'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM free_entry_claims").get().count, 1);
});

test("free entry duplicate IP through API records a hashed security event", async () => {
  resetDb();
  await createDraw({
    title: "Security event test",
    prizeName: "BBQ pakket",
    status: "LIVE"
  });

  const app = createApp();
  await request(app)
    .post("/api/free-entry")
    .set("x-forwarded-for", "203.0.113.22")
    .send({ email: "eerste-api@example.com" })
    .expect(201);
  await request(app)
    .post("/api/free-entry")
    .set("x-forwarded-for", "203.0.113.22")
    .send({ email: "tweede-api@example.com" })
    .expect(400);

  const event = db.prepare("SELECT * FROM security_events WHERE event_type = 'FREE_ENTRY_DUPLICATE_OR_BLOCKED'").get();
  assert.ok(event);
  assert.ok(event.ip_hash);
  assert.ok(event.email_hash);
  assert.equal(String(event.message).includes("203.0.113.22"), false);
  assert.equal(String(event.metadata || "").includes("tweede-api@example.com"), false);
});

test("customer entries endpoint requires a signed token", async () => {
  resetDb();
  await createDraw({
    title: "Token test",
    prizeName: "Ribeye box",
    status: "LIVE"
  });
  await assignEntriesForOrder({
    id: 789,
    name: "#1003",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "veilig@example.com",
    customer: { id: 111, email: "veilig@example.com", first_name: "Veilig" }
  });

  const app = createApp();
  await request(app).get("/api/customers/111/entries").expect(401);
  const response = await request(app)
    .get("/api/customers/111/entries")
    .set("x-dvl-customer-token", signCustomerToken("111"))
    .expect(200);

  assert.equal(response.body.summary.totalEntries, 1);
  assert.equal(response.body.summary.liveDrawEntries, 1);
  assert.equal(response.body.entries.length, 1);
  assert.equal(response.body.orders.length, 1);
});
