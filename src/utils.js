import crypto from "node:crypto";

export function centsFromMoney(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

export function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function makeEntryNumber(prefix = "DVL") {
  const body = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${body}`;
}

export function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!secret) return true;
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  if (Buffer.byteLength(digest) !== Buffer.byteLength(hmacHeader)) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

export function formatEuro(cents) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR"
  }).format(cents / 100);
}
