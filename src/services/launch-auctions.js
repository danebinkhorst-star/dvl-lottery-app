import { db } from "../db.js";
import { createAuction } from "./auctions.js";
import { ensureShopifyAuctionEntryPoints } from "./shopify-auctions.js";
import { getSetting, setSetting } from "./settings.js";

const seedKey = "release_seed_2026_08_22_six_auctions";
const targetCount = 6;

function readSeedState() {
  try {
    const parsed = JSON.parse(getSetting(seedKey, "{}"));
    return {
      auctionIds: Array.isArray(parsed.auctionIds) ? parsed.auctionIds.map(String) : [],
      completedAt: String(parsed.completedAt || "")
    };
  } catch {
    return { auctionIds: [], completedAt: "" };
  }
}

function writeSeedState(state) {
  setSetting(seedKey, JSON.stringify(state));
}

function existingSeedAuctionIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`SELECT id FROM auctions WHERE id IN (${placeholders})`).all(...ids).map((row) => row.id);
}

function eligibleProducts(limit) {
  return db.prepare(`
    SELECT p.*
    FROM shopify_products p
    WHERE p.available = 1
      AND p.image_url != ''
      AND NOT EXISTS (
        SELECT 1
        FROM auctions a
        WHERE a.shopify_product_id = p.shopify_product_id
          AND a.status IN ('DRAFT', 'LIVE', 'ENDED')
      )
    ORDER BY p.price_cents DESC, p.inventory_quantity DESC, p.title ASC
    LIMIT ?
  `).all(limit);
}

function startPriceFor(product) {
  const retailCents = Number(product.price_cents || 0);
  if (!retailCents) return 25;
  return Math.max(5, Math.floor((retailCents * 0.35) / 500) * 5);
}

function bidStepFor(product) {
  const retailCents = Number(product.price_cents || 0);
  if (retailCents >= 15000) return 10;
  if (retailCents >= 5000) return 5;
  return 2.5;
}

export async function ensureSixLaunchAuctions({
  now = Date.now(),
  publishProduct = ensureShopifyAuctionEntryPoints
} = {}) {
  const state = readSeedState();
  const auctionIds = existingSeedAuctionIds(state.auctionIds);
  if (auctionIds.length >= targetCount) {
    if (!state.completedAt) writeSeedState({ auctionIds, completedAt: new Date(now).toISOString() });
    return { created: 0, total: auctionIds.length, complete: true, auctionIds };
  }

  const products = eligibleProducts(targetCount - auctionIds.length);
  const startsAt = new Date(now - 60_000).toISOString();
  const created = [];
  const errors = [];

  for (const [index, product] of products.entries()) {
    try {
      await publishProduct(product.shopify_product_id);
      const auction = createAuction({
        shopifyProductId: product.shopify_product_id,
        productHandle: product.handle,
        productTitle: product.title,
        productImageUrl: product.image_url,
        title: `${product.title} - live veiling`,
        description: product.product_type || "Live vleesveiling van Meat For Free.",
        startPrice: startPriceFor(product),
        bidStep: bidStepFor(product),
        startsAt,
        endsAt: new Date(now + (7 * 24 * 60 * 60 * 1000) + (index * 30 * 60 * 1000)).toISOString(),
        status: "LIVE"
      });
      created.push(auction.id);
      auctionIds.push(auction.id);
      writeSeedState({ auctionIds, completedAt: "" });
    } catch (error) {
      errors.push({ productId: product.shopify_product_id, message: error.message });
    }
  }

  const complete = auctionIds.length >= targetCount;
  writeSeedState({
    auctionIds,
    completedAt: complete ? new Date(now).toISOString() : ""
  });
  return { created: created.length, total: auctionIds.length, complete, auctionIds, errors };
}
