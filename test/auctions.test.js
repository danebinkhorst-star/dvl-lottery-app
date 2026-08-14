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
  placeAuctionBid
} = await import("../src/services/auctions.js");

function resetDb() {
  db.exec(`
    UPDATE auctions SET winner_bid_id = NULL;
    DELETE FROM auction_bids;
    DELETE FROM auctions;
    DELETE FROM customers;
    DELETE FROM security_events;
    DELETE FROM audit_logs;
  `);
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
