import { config } from "../config.js";
import { db, nowIso } from "../db.js";

export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());
}

export function getLotteryRule() {
  const mode = getSetting("lot_rule_mode", config.LOT_RULE_MODE);
  const minimumCents = Number(getSetting("lot_order_minimum_cents", config.LOT_ORDER_MINIMUM_CENTS));
  const perCents = Number(getSetting("lot_per_cents", config.LOT_PER_CENTS));
  const freeEntryEnabled = getSetting("free_entry_enabled", config.FREE_ENTRY_ENABLED ? "true" : "false") === "true";
  return {
    LOT_RULE_MODE: mode === "PER_AMOUNT" ? "PER_AMOUNT" : "ORDER_MINIMUM",
    LOT_ORDER_MINIMUM_CENTS: Number.isFinite(minimumCents) && minimumCents > 0 ? Math.round(minimumCents) : config.LOT_ORDER_MINIMUM_CENTS,
    LOT_PER_CENTS: Number.isFinite(perCents) && perCents > 0 ? Math.round(perCents) : config.LOT_PER_CENTS,
    FREE_ENTRY_ENABLED: freeEntryEnabled
  };
}

export function updateLotteryRule({ mode, minimumCents, perCents, freeEntryEnabled }) {
  setSetting("lot_rule_mode", mode === "PER_AMOUNT" ? "PER_AMOUNT" : "ORDER_MINIMUM");
  setSetting("lot_order_minimum_cents", Math.max(1, Math.round(Number(minimumCents || config.LOT_ORDER_MINIMUM_CENTS))));
  setSetting("lot_per_cents", Math.max(1, Math.round(Number(perCents || config.LOT_PER_CENTS))));
  setSetting("free_entry_enabled", freeEntryEnabled ? "true" : "false");
  return getLotteryRule();
}
