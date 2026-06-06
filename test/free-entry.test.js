import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { db } from "../src/db.js";
import { createApp } from "../src/server.js";
import { assignEntriesForOrder, createDraw, createFreeEntry } from "../src/services/lottery.js";
import { signCustomerToken } from "../src/auth.js";

function resetDb() {
  db.exec(`
    DELETE FROM lottery_entries;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
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
    .get(`/api/customers/111/entries?token=${signCustomerToken("111")}`)
    .expect(200);

  assert.equal(response.body.totalEntries, 1);
  assert.equal(response.body.entries.length, 1);
});
