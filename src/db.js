import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";

dotenv.config();

const dbPath = path.resolve(process.env.SQLITE_PATH || "./data/dvl-lottery.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA foreign_keys = ON");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      shopify_customer_id TEXT UNIQUE,
      email TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      total_entries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      shopify_order_id TEXT NOT NULL UNIQUE,
      order_name TEXT,
      customer_id TEXT,
      email TEXT,
      currency TEXT NOT NULL DEFAULT 'EUR',
      total_cents INTEGER NOT NULL,
      financial_status TEXT,
      source TEXT NOT NULL DEFAULT 'shopify_order',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS lottery_draws (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      prize_name TEXT NOT NULL,
      prize_value TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      draw_at TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      winner_entry_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (winner_entry_id) REFERENCES lottery_entries(id)
    );

    CREATE TABLE IF NOT EXISTS lottery_entries (
      id TEXT PRIMARY KEY,
      entry_number TEXT NOT NULL UNIQUE,
      draw_id TEXT NOT NULL,
      customer_id TEXT,
      order_id TEXT,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (draw_id) REFERENCES lottery_draws(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS free_entry_claims (
      id TEXT PRIMARY KEY,
      draw_id TEXT NOT NULL,
      customer_id TEXT,
      email TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (draw_id) REFERENCES lottery_draws(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      UNIQUE(draw_id, email),
      UNIQUE(draw_id, ip_hash)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_draws_status_starts ON lottery_draws(status, starts_at);
    CREATE INDEX IF NOT EXISTS idx_entries_draw_status ON lottery_entries(draw_id, status);
    CREATE INDEX IF NOT EXISTS idx_entries_customer ON lottery_entries(customer_id);
    CREATE INDEX IF NOT EXISTS idx_entries_order ON lottery_entries(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_free_claims_draw ON free_entry_claims(draw_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_free_claims_ip ON free_entry_claims(ip_hash, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix = "") {
  return `${prefix}${cryptoRandom()}`;
}

function cryptoRandom() {
  return crypto.randomUUID();
}

import crypto from "node:crypto";

initDb();
