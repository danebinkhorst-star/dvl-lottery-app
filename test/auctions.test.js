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
const { db, nowIso } = await import("../src/db.js");
const { createApp } = await import("../src/server.js");
const { ensureCustomerAuctionToken, signCustomerToken } = await import("../src/auth.js");
const {
  awardAuctionWinner,
  createAuction,
  listAuctionBids,
  placeAuctionBid,
  publicAuctionWithBids,
  updateAuctionBidModeration
} = await import("../src/services/auctions.js");

function resetDb() {
  db.exec(`
    UPDATE auctions SET winner_bid_id = NULL;
    DELETE FROM auction_bids;
    DELETE FROM auctions;
    DELETE FROM shopify_products;
    DELETE FROM customers;
    DELETE FROM security_events;
    DELETE FROM audit_logs;
  `);
}

function insertSyncedProduct(overrides = {}) {
  const product = {
    id: "prod-auction-picker",
    shopify_product_id: "777001",
    handle: "premium-auction-box",
    title: "Premium auction box",
    vendor: "Meat For Free",
    product_type: "Box",
    status: "active",
    tags_json: JSON.stringify(["Nieuw"]),
    image_url: "https://cdn.example.com/premium.jpg",
    price_cents: 4900,
    compare_at_cents: 0,
    variant_id: "888001",
    available: 1,
    inventory_quantity: 4,
    product_url: "/products/premium-auction-box",
    status_tag: "Nieuw",
    synced_at: nowIso(),
    raw_json: "{}",
    ...overrides
  };
  db.prepare(`
    INSERT INTO shopify_products (
      id, shopify_product_id, handle, title, vendor, product_type, status, tags_json, image_url,
      price_cents, compare_at_cents, variant_id, available, inventory_quantity, product_url,
      status_tag, synced_at, raw_json
    ) VALUES (
      @id, @shopify_product_id, @handle, @title, @vendor, @product_type, @status, @tags_json, @image_url,
      @price_cents, @compare_at_cents, @variant_id, @available, @inventory_quantity, @product_url,
      @status_tag, @synced_at, @raw_json
    )
  `).run(product);
  return product;
}

function auctionInput(overrides = {}) {
  return {
    shopifyProductId: `900${Date.now()}`,
    productHandle: "premium-box",
    productTitle: "Premium box",
    title: "Premium box veiling",
    startPrice: "25.00",
    bidStep: "5.00",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86400_000).toISOString(),
    status: "LIVE",
    ...overrides
  };
}

test("auction bids enforce minimums and outbid the previous winner", () => {
  resetDb();
  const auction = createAuction(auctionInput());

  assert.throws(() => placeAuctionBid(auction.id, {
    shopifyCustomerId: "101",
    customerEmail: "first@example.com",
    amount: "20.00"
  }), /Minimum bod/);

  const first = placeAuctionBid(auction.id, {
    shopifyCustomerId: "101",
    customerEmail: "first@example.com",
    amount: "25.00"
  });
  assert.equal(first.bid.status, "WINNING");

  const second = placeAuctionBid(auction.id, {
    shopifyCustomerId: "102",
    customerEmail: "second@example.com",
    amount: "30.00"
  });
  assert.equal(second.bid.status, "WINNING");

  const bids = listAuctionBids(auction.id);
  assert.equal(bids[0].customer_email, "second@example.com");
  assert.equal(bids.find((bid) => bid.customer_email === "first@example.com").status, "OUTBID");
});

test("auction API requires a valid customer token before bidding", async () => {
  resetDb();
  const auction = createAuction(auctionInput({ shopifyProductId: "901234" }));
  const app = createApp();

  await request(app)
    .post(`/api/auctions/${auction.id}/bids`)
    .send({ shopifyCustomerId: "101", customerEmail: "first@example.com", amount: "25.00" })
    .expect(401);

  const token = signCustomerToken("101");
  const response = await request(app)
    .post(`/api/auctions/${auction.id}/bids`)
    .set("x-dvl-customer-token", token)
    .send({ shopifyCustomerId: "101", customerEmail: "first@example.com", amount: "25.00" })
    .expect(201);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.auction.currentBidCents, 2500);
});

test("auction API accepts the synced per-customer auction token", async () => {
  resetDb();
  const auction = createAuction(auctionInput({ shopifyProductId: "901235" }));
  db.prepare(`
    INSERT INTO customers (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
    VALUES ('cust-auction-token', '301', 'token@example.com', 'Token', 'Klant', 0, ?, ?)
  `).run(nowIso(), nowIso());
  const token = ensureCustomerAuctionToken("301");
  assert.ok(token);

  const app = createApp();
  const response = await request(app)
    .post(`/api/auctions/${auction.id}/bids`)
    .set("x-dvl-customer-token", token)
    .send({ shopifyCustomerId: "301", customerEmail: "token@example.com", amount: "25.00" })
    .expect(201);

  assert.equal(response.body.auction.currentBidCents, 2500);
});

test("auction bids support short moderated public messages", async () => {
  resetDb();
  const auction = createAuction(auctionInput({ shopifyProductId: "901236" }));
  db.prepare(`
    INSERT INTO customers (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
    VALUES ('cust-auction-message', '302', 'message@example.com', 'Message', 'Klant', 0, ?, ?)
  `).run(nowIso(), nowIso());
  const token = ensureCustomerAuctionToken("302");

  const app = createApp();
  const response = await request(app)
    .post(`/api/auctions/${auction.id}/bids`)
    .set("x-dvl-customer-token", token)
    .send({
      shopifyCustomerId: "302",
      customerEmail: "message@example.com",
      customerName: "Message Klant",
      amount: "25.00",
      message: "Voor de zondag BBQ"
    })
    .expect(201);

  assert.equal(response.body.bid.message, "Voor de zondag BBQ");
  assert.equal(response.body.auction.bids[0].message, "Voor de zondag BBQ");

  const bad = placeAuctionBid(auction.id, {
    shopifyCustomerId: "303",
    customerEmail: "bad@example.com",
    customerName: "Bad Klant",
    amount: "30.00",
    message: "www.spam.test"
  });
  assert.equal(bad.bid.message_status, "HIDDEN");
  assert.equal(publicAuctionWithBids(bad.auction).bids[0].message, "");
});

test("admin can create an auction by picking a synced Shopify product", async () => {
  resetDb();
  const product = insertSyncedProduct();
  const app = createApp();
  const agent = request.agent(app);

  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(302);

  const page = await agent.get("/admin/veilingen").expect(200);
  assert.match(page.text, /Premium auction box/);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);

  await agent
    .post("/admin/veilingen")
    .type("form")
    .send({
      _csrf: token,
      shopifyProductId: product.shopify_product_id,
      startPrice: "25.00",
      bidStep: "5.00",
      status: "LIVE",
      startsAt: new Date(Date.now() - 60_000).toISOString().slice(0, 16),
      endsAt: new Date(Date.now() + 86400_000).toISOString().slice(0, 16)
    })
    .expect(302);

  const auction = db.prepare("SELECT * FROM auctions WHERE shopify_product_id = ?").get(product.shopify_product_id);
  assert.equal(auction.product_handle, product.handle);
  assert.equal(auction.product_title, product.title);
  assert.equal(auction.product_image_url, product.image_url);
  assert.equal(auction.title, `${product.title} veiling`);
});

test("ended auctions reject bids and admin can award the highest bidder", () => {
  resetDb();
  const live = createAuction(auctionInput({ shopifyProductId: "902345" }));
  placeAuctionBid(live.id, { shopifyCustomerId: "201", customerEmail: "one@example.com", amount: "25.00" });
  placeAuctionBid(live.id, { shopifyCustomerId: "202", customerEmail: "two@example.com", amount: "35.00" });

  const award = awardAuctionWinner(live.id, { note: "Hoogste bod bevestigd." });
  assert.equal(award.auction.status, "AWARDED");
  assert.equal(award.bid.customer_email, "two@example.com");
  assert.equal(award.bid.status, "WINNER");

  const ended = createAuction(auctionInput({
    shopifyProductId: "903456",
    startsAt: new Date(Date.now() - 86400_000).toISOString(),
    endsAt: nowIso(),
    status: "LIVE"
  }));
  assert.throws(() => placeAuctionBid(ended.id, {
    shopifyCustomerId: "203",
    customerEmail: "late@example.com",
    amount: "25.00"
  }), /niet open/);
});

test("admin voiding the winning bid promotes the next highest bid", () => {
  resetDb();
  const auction = createAuction(auctionInput({ shopifyProductId: "904567" }));
  const first = placeAuctionBid(auction.id, { shopifyCustomerId: "401", customerEmail: "one@example.com", amount: "25.00" });
  const second = placeAuctionBid(auction.id, { shopifyCustomerId: "402", customerEmail: "two@example.com", amount: "35.00" });

  updateAuctionBidModeration(second.bid.id, { status: "VOID" });
  const bids = listAuctionBids(auction.id);

  assert.equal(bids.find((bid) => bid.id === second.bid.id).status, "VOID");
  assert.equal(bids.find((bid) => bid.id === first.bid.id).status, "WINNING");
});
