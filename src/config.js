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
  PORT: z.coerce.number().default(8787),
  ADMIN_USERNAME: z.string().default("dvl"),
  ADMIN_PASSWORD: z.string().optional().default(""),
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
  FREE_ENTRY_ENABLED: envBoolean.default(true)
});

export const config = configSchema.parse(process.env);
