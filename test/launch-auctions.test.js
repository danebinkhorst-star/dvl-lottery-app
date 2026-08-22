import test from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_USERNAME = "dvl";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
process.env.INTERNAL_API_SECRET = "test-internal-api-secret";
process.env.CUSTOMER_TOKEN_SECRET = "test-customer-token-secret";
process.env.FREE_ENTRY_HASH_SECRET = "test-free-entry-hash-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-shopify-webhook-secret";

const { db, nowIso } = await import("../src/db.js");
const { ensureSixLaunchAuctions } = await import("../src/services/launch-auctions.js");

function reset() {
  db.exec(`
    UPDATE auctions SET winner_bid_id = NULL;
    DELETE FROM auction_bids;
    DELETE FROM auctions;
    DELETE FROM shopify_products;
    DELETE FROM app_settings WHERE key = 'release_seed_2026_08_22_six_auctions';
  `);
}

function insertProduct(index) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO shopify_products (
      id, shopify_product_id, handle, title, vendor, product_type, status, tags_json, image_url,
      price_cents, compare_at_cents, variant_id, available, inventory_quantity, product_url,
      status_tag, synced_at, raw_json
    ) VALUES (?, ?, ?, ?, 'Meat For Free', 'Vleespakket', 'active', '[]', ?, ?, 0, ?, 1, 10, ?, '', ?, '{}')
  `).run(
    `launch-product-${index}`,
    `88000${index}`,
    `launch-pakket-${index}`,
    `Launch pakket ${index}`,
    `https://cdn.example.com/launch-${index}.jpg`,
    3000 + (index * 2000),
    `99000${index}`,
    `/products/launch-pakket-${index}`,
    now
  );
}

test("launch seed creates exactly six distinct live auctions once", async () => {
  reset();
  for (let index = 1; index <= 8; index += 1) insertProduct(index);
  const published = [];
  const publishProduct = async (productId) => published.push(productId);
  const now = Date.parse("2026-08-22T12:00:00.000Z");

  const first = await ensureSixLaunchAuctions({ now, publishProduct });
  assert.equal(first.created, 6);
  assert.equal(first.total, 6);
  assert.equal(first.complete, true);
  assert.equal(new Set(published).size, 6);

  const rows = db.prepare("SELECT * FROM auctions ORDER BY ends_at ASC").all();
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map((row) => row.shopify_product_id)).size, 6);
  assert.ok(rows.every((row) => row.status === "LIVE"));
  assert.ok(rows.every((row) => row.start_price_cents >= 500));
  assert.equal(Date.parse(rows[1].ends_at) - Date.parse(rows[0].ends_at), 30 * 60 * 1000);

  const second = await ensureSixLaunchAuctions({ now: now + 60_000, publishProduct });
  assert.equal(second.created, 0);
  assert.equal(second.total, 6);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auctions").get().count, 6);
  reset();
});
