import { shopifyRest } from "../shopify/admin-api.js";

function isTestRun() {
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function ensureShopifyAuctionProduct(shopifyProductId) {
  if (isTestRun() || !shopifyProductId) return { skipped: "test_or_missing_product" };
  const productId = String(shopifyProductId).replace(/^gid:\/\/shopify\/Product\//, "");
  const product = (await shopifyRest(`/products/${productId}.json`)).product;
  const tags = new Set(tagList(product?.tags));
  tags.add("Veiling");
  tags.add("Auction");
  await shopifyRest(`/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({
      product: {
        id: productId,
        tags: [...tags].join(", "),
        template_suffix: "auction"
      }
    })
  });
  return { ok: true, productId };
}

export async function ensureShopifyAuctionCollection() {
  if (isTestRun()) return { skipped: "test" };
  const existing = (await shopifyRest("/smart_collections.json?handle=veilingen")).smart_collections?.[0];
  const payload = {
    title: "Veilingen",
    handle: "veilingen",
    template_suffix: "auctions",
    rules: [{ column: "tag", relation: "equals", condition: "Veiling" }],
    disjunctive: false,
    published: true
  };
  if (existing?.id) {
    await shopifyRest(`/smart_collections/${existing.id}.json`, {
      method: "PUT",
      body: JSON.stringify({ smart_collection: { id: existing.id, ...payload } })
    });
    return { ok: true, collectionId: existing.id, updated: true };
  }
  const created = await shopifyRest("/smart_collections.json", {
    method: "POST",
    body: JSON.stringify({ smart_collection: payload })
  });
  return { ok: true, collectionId: created.smart_collection?.id, created: true };
}

export async function ensureShopifyAuctionEntryPoints(shopifyProductId) {
  const product = await ensureShopifyAuctionProduct(shopifyProductId);
  const collection = await ensureShopifyAuctionCollection();
  return { product, collection };
}
