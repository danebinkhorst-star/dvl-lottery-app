import crypto from "node:crypto";
import { config } from "./config.js";
import { db, nowIso } from "./db.js";

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isValidWriteSecret(secret) {
  if (!secret) return false;
  if (config.INTERNAL_API_SECRET && safeEqual(secret, config.INTERNAL_API_SECRET)) return true;
  return false;
}

function customerTokenSecret() {
  return config.CUSTOMER_TOKEN_SECRET || "dvl-dev-customer-token";
}

export function signCustomerToken(shopifyCustomerId, ttlSeconds = 15 * 60) {
  const expiresAt = Math.floor(Date.now() / 1000) + Number(ttlSeconds || 0);
  const payload = `${shopifyCustomerId}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", customerTokenSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCustomerToken(shopifyCustomerId, token) {
  if (!shopifyCustomerId || !token) return false;
  const [tokenCustomerId, expiresAt, signature] = String(token).split(".");
  const expiry = Number(expiresAt);
  if (!tokenCustomerId || !Number.isFinite(expiry) || !signature) return false;
  if (tokenCustomerId !== String(shopifyCustomerId)) return false;
  if (expiry <= Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac("sha256", customerTokenSecret())
    .update(`${tokenCustomerId}.${expiresAt}`)
    .digest("base64url");
  return safeEqual(signature, expected);
}

export function ensureCustomerAuctionToken(shopifyCustomerId) {
  if (!shopifyCustomerId) return "";
  const customer = db.prepare("SELECT id, auction_token FROM customers WHERE shopify_customer_id = ?").get(String(shopifyCustomerId));
  if (!customer) return "";
  if (customer.auction_token) return customer.auction_token;
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("UPDATE customers SET auction_token = ?, updated_at = ? WHERE id = ?").run(token, nowIso(), customer.id);
  return token;
}

export function verifyCustomerAccessToken(shopifyCustomerId, token) {
  if (verifyCustomerToken(shopifyCustomerId, token)) return true;
  if (!shopifyCustomerId || !token) return false;
  const customer = db.prepare("SELECT auction_token FROM customers WHERE shopify_customer_id = ?").get(String(shopifyCustomerId));
  return Boolean(customer?.auction_token) && safeEqual(customer.auction_token, token);
}
