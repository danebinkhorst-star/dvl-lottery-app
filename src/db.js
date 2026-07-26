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

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      shopify_line_item_id TEXT,
      shopify_product_id TEXT,
      shopify_variant_id TEXT,
      title TEXT NOT NULL,
      variant_title TEXT,
      sku TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      price_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      UNIQUE(order_id, shopify_line_item_id)
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
      winner_public_status TEXT NOT NULL DEFAULT 'PRIVATE',
      winner_public_name TEXT,
      winner_public_statement TEXT,
      winner_public_image_url TEXT,
      winner_public_approved_at TEXT,
      winner_contact_status TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
      winner_consent_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      winner_consent_reference TEXT,
      winner_internal_note TEXT,
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

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      name TEXT,
      title TEXT,
      avatar_url TEXT,
      phone TEXT,
      bio TEXT,
      focus_area TEXT,
      availability_status TEXT NOT NULL DEFAULT 'ONLINE',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      force_password_change INTEGER NOT NULL DEFAULT 0,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      password_updated_at TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      totp_confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES admin_teams(id)
    );

    CREATE TABLE IF NOT EXISTS admin_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      shop_domain TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_user_permissions (
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      PRIMARY KEY (user_id, permission),
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_invites (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      token_hash TEXT NOT NULL UNIQUE,
      invited_by TEXT,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES admin_teams(id),
      FOREIGN KEY (invited_by) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      requested_by TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      ip TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_kpi_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kpi_key TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_by TEXT,
      assigned_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (created_by) REFERENCES admin_users(id),
      FOREIGN KEY (assigned_to) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_kpi_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      user_id TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES admin_kpi_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopify_products (
      id TEXT PRIMARY KEY,
      shopify_product_id TEXT NOT NULL UNIQUE,
      handle TEXT NOT NULL,
      title TEXT NOT NULL,
      vendor TEXT,
      product_type TEXT,
      status TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      compare_at_cents INTEGER NOT NULL DEFAULT 0,
      variant_id TEXT,
      available INTEGER NOT NULL DEFAULT 0,
      inventory_quantity INTEGER,
      product_url TEXT,
      status_tag TEXT,
      synced_at TEXT NOT NULL,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      ip_hash TEXT,
      email_hash TEXT,
      path TEXT,
      message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      widget TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      value TEXT,
      page_url TEXT,
      referrer TEXT,
      shop_origin TEXT,
      ip_hash TEXT,
      user_agent_hash TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_draws_status_starts ON lottery_draws(status, starts_at);
    CREATE INDEX IF NOT EXISTS idx_entries_draw_status ON lottery_entries(draw_id, status);
    CREATE INDEX IF NOT EXISTS idx_entries_customer ON lottery_entries(customer_id);
    CREATE INDEX IF NOT EXISTS idx_entries_order ON lottery_entries(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(shopify_product_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(shopify_variant_id);
    CREATE INDEX IF NOT EXISTS idx_free_claims_draw ON free_entry_claims(draw_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_free_claims_ip ON free_entry_claims(ip_hash, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status, role);
    CREATE INDEX IF NOT EXISTS idx_admin_invites_email ON admin_invites(email, expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_password_resets_user ON admin_password_resets(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_kpi_threads_status ON admin_kpi_threads(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_admin_kpi_threads_kpi ON admin_kpi_threads(kpi_key, updated_at);
    CREATE INDEX IF NOT EXISTS idx_admin_kpi_messages_thread ON admin_kpi_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_shopify_products_synced ON shopify_products(synced_at);
    CREATE INDEX IF NOT EXISTS idx_shopify_products_available ON shopify_products(available, price_cents);
    CREATE INDEX IF NOT EXISTS idx_shopify_products_status_tag ON shopify_products(status_tag);
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_hash, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_widget_action ON analytics_events(widget, action, created_at);
  `);
  ensureColumn("lottery_draws", "winner_public_status", "TEXT NOT NULL DEFAULT 'PRIVATE'");
  ensureColumn("lottery_draws", "winner_public_name", "TEXT");
  ensureColumn("lottery_draws", "winner_public_statement", "TEXT");
  ensureColumn("lottery_draws", "winner_public_image_url", "TEXT");
  ensureColumn("lottery_draws", "winner_public_approved_at", "TEXT");
  ensureColumn("lottery_draws", "winner_contact_status", "TEXT NOT NULL DEFAULT 'NOT_CONTACTED'");
  ensureColumn("lottery_draws", "winner_consent_status", "TEXT NOT NULL DEFAULT 'UNKNOWN'");
  ensureColumn("lottery_draws", "winner_consent_reference", "TEXT");
  ensureColumn("lottery_draws", "winner_internal_note", "TEXT");
  ensureColumn("admin_users", "team_id", "TEXT");
  ensureColumn("admin_users", "title", "TEXT");
  ensureColumn("admin_users", "avatar_url", "TEXT");
  ensureColumn("admin_users", "phone", "TEXT");
  ensureColumn("admin_users", "bio", "TEXT");
  ensureColumn("admin_users", "focus_area", "TEXT");
  ensureColumn("admin_users", "availability_status", "TEXT NOT NULL DEFAULT 'ONLINE'");
  ensureColumn("admin_users", "totp_secret", "TEXT");
  ensureColumn("admin_users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("admin_users", "totp_confirmed_at", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_draws_winner_public ON lottery_draws(winner_public_status, draw_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_admin_users_team ON admin_users(team_id, status)");
}

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
