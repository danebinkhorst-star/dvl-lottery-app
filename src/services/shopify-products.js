import { db, id, nowIso } from "../db.js";
import { shopifyRest } from "../shopify/admin-api.js";

function centsFromShopifyMoney(value) {
  const parsed = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function choosePrimaryVariant(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.find((variant) => variant.available || Number(variant.inventory_quantity || 0) > 0) || variants[0] || null;
}

function chooseImage(product, variant) {
  const variantImageId = variant?.image_id ? String(variant.image_id) : "";
  const images = Array.isArray(product?.images) ? product.images : [];
  const variantImage = variantImageId
    ? images.find((image) => String(image.id || "") === variantImageId)
    : null;
  return variantImage?.src || product?.image?.src || images[0]?.src || "";
}

function tagMatches(tags, values) {
  const normalized = tags.map((tag) => tag.toLowerCase());
  return values.some((value) => normalized.includes(value));
}

export function productStatusTag({ tags = [], priceCents = 0, compareAtCents = 0, inventoryQuantity = null, createdAt = "" } = {}) {
  if (tagMatches(tags, ["deal", "sale", "korting", "aanbieding", "weekdeal"])) return "Deal";
  if (compareAtCents > priceCents && priceCents > 0) return "Deal";
  if (tagMatches(tags, ["nieuw", "new", "net binnen"])) return "Nieuw";
  const createdTime = Date.parse(createdAt || "");
  if (Number.isFinite(createdTime) && Date.now() - createdTime <= 1000 * 60 * 60 * 24 * 60) return "Nieuw";
  if (tagMatches(tags, ["populair", "hardloper", "bestseller"])) return "Populair";
  if (tagMatches(tags, ["laatste kans", "limited", "bijna op", "op is op"])) return "Laatste kans";
  if (Number.isFinite(Number(inventoryQuantity)) && Number(inventoryQuantity) > 0 && Number(inventoryQuantity) <= 5) return "Laatste kans";
  return "";
}

export function normalizeShopifyProduct(product) {
  const variant = choosePrimaryVariant(product);
  const tags = parseTags(product?.tags);
  const priceCents = centsFromShopifyMoney(variant?.price);
  const compareAtCents = centsFromShopifyMoney(variant?.compare_at_price);
  const inventoryQuantity = variant?.inventory_quantity == null ? null : Number(variant.inventory_quantity);
  const isManagedSoldOut = Boolean(
    variant?.inventory_management
    && variant.inventory_policy !== "continue"
    && Number.isFinite(inventoryQuantity)
    && inventoryQuantity <= 0
  );
  const available = Boolean(
    String(product?.status || "").toLowerCase() === "active"
    && variant
    && priceCents > 0
    && !isManagedSoldOut
  );

  return {
    id: id("prod"),
    shopify_product_id: String(product?.id || ""),
    handle: String(product?.handle || ""),
    title: String(product?.title || "").trim(),
    vendor: String(product?.vendor || ""),
    product_type: String(product?.product_type || ""),
    status: String(product?.status || ""),
    tags,
    image_url: chooseImage(product, variant),
    price_cents: priceCents,
    compare_at_cents: compareAtCents,
    variant_id: variant?.id ? String(variant.id) : "",
    available: available ? 1 : 0,
    inventory_quantity: Number.isFinite(inventoryQuantity) ? inventoryQuantity : null,
    product_url: product?.handle ? `/products/${product.handle}` : "/collections/all",
    status_tag: productStatusTag({ tags, priceCents, compareAtCents, inventoryQuantity, createdAt: product?.created_at }),
    synced_at: nowIso(),
    raw_json: JSON.stringify({
      id: product?.id,
      handle: product?.handle,
      title: product?.title,
      status: product?.status,
      tags,
      createdAt: product?.created_at || null,
      variantId: variant?.id || null
    })
  };
}

export function upsertShopifyProducts(products) {
  const normalized = products.map(normalizeShopifyProduct).filter((product) => {
    return product.shopify_product_id && product.handle && product.title && product.price_cents > 0;
  });
  const statement = db.prepare(`
    INSERT INTO shopify_products (
      id, shopify_product_id, handle, title, vendor, product_type, status, tags_json, image_url,
      price_cents, compare_at_cents, variant_id, available, inventory_quantity, product_url,
      status_tag, synced_at, raw_json
    )
    VALUES (
      @id, @shopify_product_id, @handle, @title, @vendor, @product_type, @status, @tags_json, @image_url,
      @price_cents, @compare_at_cents, @variant_id, @available, @inventory_quantity, @product_url,
      @status_tag, @synced_at, @raw_json
    )
    ON CONFLICT(shopify_product_id) DO UPDATE SET
      handle = excluded.handle,
      title = excluded.title,
      vendor = excluded.vendor,
      product_type = excluded.product_type,
      status = excluded.status,
      tags_json = excluded.tags_json,
      image_url = excluded.image_url,
      price_cents = excluded.price_cents,
      compare_at_cents = excluded.compare_at_cents,
      variant_id = excluded.variant_id,
      available = excluded.available,
      inventory_quantity = excluded.inventory_quantity,
      product_url = excluded.product_url,
      status_tag = excluded.status_tag,
      synced_at = excluded.synced_at,
      raw_json = excluded.raw_json
  `);

  db.exec("BEGIN");
  try {
    for (const product of normalized) {
      const { tags: _tags, ...row } = product;
      statement.run({ ...row, tags_json: JSON.stringify(product.tags) });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return normalized;
}

export async function syncShopifyProducts({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(250, Number(limit || 100)));
  const fields = [
    "id",
    "handle",
    "title",
    "vendor",
    "product_type",
    "status",
    "tags",
    "created_at",
    "image",
    "images",
    "variants"
  ].join(",");
  const response = await shopifyRest(`/products.json?limit=${safeLimit}&status=active&fields=${encodeURIComponent(fields)}`);
  const products = Array.isArray(response.products) ? response.products : [];
  const synced = upsertShopifyProducts(products);
  return {
    fetched: products.length,
    synced: synced.length,
    syncedAt: nowIso()
  };
}

export function productSyncStatus() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN available = 1 THEN 1 ELSE 0 END) AS available,
      MAX(synced_at) AS last_synced_at
    FROM shopify_products
  `).get();
  const lastSyncedAt = row?.last_synced_at || null;
  const stale = !lastSyncedAt || (Date.now() - Date.parse(lastSyncedAt)) > 1000 * 60 * 60 * 24;
  return {
    total: Number(row?.total || 0),
    available: Number(row?.available || 0),
    lastSyncedAt,
    stale
  };
}

export function listSyncedProducts({ q = "", statusTag = "", available = "", limit = 50 } = {}) {
  const where = [];
  const params = [];
  const search = String(q || "").trim();
  if (search) {
    where.push("(title LIKE ? OR handle LIKE ? OR product_type LIKE ? OR tags_json LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (statusTag) {
    where.push("status_tag = ?");
    params.push(statusTag);
  }
  if (available === "yes") {
    where.push("available = 1");
  }
  if (available === "no") {
    where.push("available = 0");
  }
  params.push(Math.max(1, Math.min(200, Number(limit || 50))));
  return db.prepare(`
    SELECT *
    FROM shopify_products
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY available DESC,
      CASE status_tag
        WHEN 'Deal' THEN 1
        WHEN 'Nieuw' THEN 2
        WHEN 'Laatste kans' THEN 3
        WHEN 'Populair' THEN 4
        ELSE 9
      END ASC,
      synced_at DESC,
      title ASC
    LIMIT ?
  `).all(...params).map((row) => ({
    ...row,
    tags: JSON.parse(row.tags_json || "[]")
  }));
}

export function productCardsForEmbed({ limit = 8, statusTag = "" } = {}) {
  return listSyncedProducts({
    statusTag,
    available: "yes",
    limit
  }).map((product) => ({
    title: product.title,
    tag: product.status_tag || "",
    description: product.product_type || product.vendor || "",
    imageUrl: product.image_url || "",
    url: product.product_url || `/products/${product.handle}`,
    variantId: product.variant_id || "",
    priceCents: Number(product.price_cents || 0),
    compareAtCents: Number(product.compare_at_cents || 0),
    available: Boolean(product.available)
  }));
}
