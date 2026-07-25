import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}, z.boolean());

const configSchema = z.object({
  NODE_ENV: z.string().default("development"),
  SQLITE_PATH: z.string().default("./data/dvl-lottery.db"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  PORT: z.coerce.number().default(8787),
  ADMIN_USERNAME: z.string().default("dvl"),
  ADMIN_PASSWORD: z.string().optional().default(""),
  ADMIN_SESSION_SECRET: z.string().optional().default(""),
  ADMIN_TOTP_SECRET: z.string().optional().default(""),
  ADMIN_ENV_RECOVERY_ENABLED: envBoolean.default(false),
  INTERNAL_API_SECRET: z.string().optional().default(""),
  CUSTOMER_TOKEN_SECRET: z.string().optional().default(""),
  FREE_ENTRY_HASH_SECRET: z.string().optional().default(""),
  SHOPIFY_SHOP: z.string().default("de-vlees-loterij.myshopify.com"),
  SHOPIFY_API_VERSION: z.string().default("2026-04"),
  SHOPIFY_ACCESS_TOKEN: z.string().optional().default(""),
  SHOPIFY_CLIENT_ID: z.string().optional().default(""),
  SHOPIFY_CLIENT_SECRET: z.string().optional().default(""),
  SHOPIFY_WEBHOOK_SECRET: z.string().optional().default(""),
  PUBLIC_APP_URL: z.string().optional().default(""),
  LOT_RULE_MODE: z.enum(["ORDER_MINIMUM", "PER_AMOUNT"]).default("ORDER_MINIMUM"),
  LOT_ORDER_MINIMUM_CENTS: z.coerce.number().int().positive().default(7000),
  LOT_PER_CENTS: z.coerce.number().int().positive().default(7000),
  FREE_ENTRY_ENABLED: envBoolean.default(true),
  SHOPIFY_SYNC_CUSTOMER_METAFIELDS: envBoolean.default(true),
  AUTO_CREATE_LIVE_DRAW: envBoolean.default(process.env.NODE_ENV !== "production")
});

export const config = configSchema.parse(process.env);

const productionRequiredSecrets = [
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "INTERNAL_API_SECRET",
  "CUSTOMER_TOKEN_SECRET",
  "FREE_ENTRY_HASH_SECRET",
  "SHOPIFY_WEBHOOK_SECRET"
];

if (config.NODE_ENV === "production") {
  const missing = productionRequiredSecrets.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required production secret(s): ${missing.join(", ")}`);
  }
}
