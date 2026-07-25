import { db } from "../src/db.js";

function numberArg(name, fallback) {
  const prefix = `${name}=`;
  const directIndex = process.argv.indexOf(name);
  const raw = directIndex !== -1
    ? process.argv[directIndex + 1]
    : process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cutoff(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const dryRun = process.argv.includes("--dry-run");
const windows = {
  analytics_events: numberArg("--analytics-days", Number(process.env.ANALYTICS_RETENTION_DAYS || 90)),
  security_events: numberArg("--security-days", Number(process.env.SECURITY_RETENTION_DAYS || 180)),
  audit_logs: numberArg("--audit-days", Number(process.env.AUDIT_RETENTION_DAYS || 730))
};

const result = {};
for (const [table, days] of Object.entries(windows)) {
  const before = cutoff(days);
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE created_at < ?`).get(before).count;
  if (!dryRun && count > 0) {
    db.prepare(`DELETE FROM ${table} WHERE created_at < ?`).run(before);
  }
  result[table] = { days, cutoff: before, deleted: dryRun ? 0 : count, matched: count };
}

console.log(JSON.stringify({ ok: true, dryRun, result }, null, 2));
