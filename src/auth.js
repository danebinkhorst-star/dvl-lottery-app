import crypto from "node:crypto";
import { config } from "./config.js";

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isValidWriteSecret(secret) {
  if (!secret) return false;
  if (config.ADMIN_PASSWORD && safeEqual(secret, config.ADMIN_PASSWORD)) return true;
  if (config.SHOPIFY_WEBHOOK_SECRET && safeEqual(secret, config.SHOPIFY_WEBHOOK_SECRET)) return true;
  return false;
}

function customerTokenSecret() {
  return config.SHOPIFY_WEBHOOK_SECRET || config.ADMIN_PASSWORD || "dvl-dev-customer-token";
}

export function signCustomerToken(shopifyCustomerId) {
  return crypto
    .createHmac("sha256", customerTokenSecret())
    .update(String(shopifyCustomerId || ""))
    .digest("hex");
}

export function verifyCustomerToken(shopifyCustomerId, token) {
  if (!shopifyCustomerId || !token) return false;
  return safeEqual(signCustomerToken(shopifyCustomerId), token);
}
