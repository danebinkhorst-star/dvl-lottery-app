import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { db } from "../src/db.js";
import { createApp } from "../src/server.js";
import { normalizeShopifyProduct, productStatusTag, upsertShopifyProducts } from "../src/services/shopify-products.js";

function resetProducts() {
  db.exec("DELETE FROM shopify_products");
  db.exec("DELETE FROM app_settings WHERE key LIKE 'widget:%'");
}

afterEach(() => {
  resetProducts();
});

test("product status tags use commercial state instead of category tags", () => {
  assert.equal(productStatusTag({ tags: ["Rundvlees", "BBQ"], priceCents: 2500, compareAtCents: 0 }), "");
  assert.equal(productStatusTag({ tags: ["Rundvlees", "Deal"], priceCents: 2500, compareAtCents: 0 }), "Deal");
  assert.equal(productStatusTag({ tags: ["Rundvlees"], priceCents: 1999, compareAtCents: 2499 }), "Deal");
  assert.equal(productStatusTag({ tags: ["Nieuw"], priceCents: 1999, compareAtCents: 0 }), "Nieuw");
  assert.equal(productStatusTag({ tags: ["BBQ"], priceCents: 1999, compareAtCents: 0, inventoryQuantity: 3 }), "Laatste kans");
});

test("shopify products normalize to product-card data", () => {
  const product = normalizeShopifyProduct({
    id: 111,
    handle: "ribeye",
    title: "Ribeye",
    vendor: "Meat For Free",
    product_type: "Rundvlees",
    status: "active",
    tags: "Rundvlees, Deal",
    image: { src: "https://cdn.shopify.com/ribeye.jpg" },
    variants: [{
      id: 222,
      price: "25.49",
      compare_at_price: "29.99",
      inventory_quantity: 8
    }]
  });

  assert.equal(product.shopify_product_id, "111");
  assert.equal(product.variant_id, "222");
  assert.equal(product.price_cents, 2549);
  assert.equal(product.compare_at_cents, 2999);
  assert.equal(product.status_tag, "Deal");
  assert.equal(product.product_url, "/products/ribeye");
  assert.equal(product.available, 1);
});

test("site summary exposes synced product cards for embeds", async () => {
  resetProducts();
  upsertShopifyProducts([{
    id: 111,
    handle: "ribeye",
    title: "Ribeye",
    vendor: "Meat For Free",
    product_type: "Rundvlees",
    status: "active",
    tags: "Rundvlees, Nieuw",
    image: { src: "https://cdn.shopify.com/ribeye.jpg" },
    variants: [{ id: 222, price: "25.49", inventory_quantity: 8 }]
  }]);

  const response = await request(createApp()).get("/api/site/summary").expect(200);

  assert.equal(response.body.products.productCards.length, 1);
  assert.equal(response.body.products.productCards[0].title, "Ribeye");
  assert.equal(response.body.products.productCards[0].tag, "Nieuw");
  assert.equal(response.body.products.productCards[0].variantId, "222");
  assert.equal(response.body.products.sync.available, 1);
});
