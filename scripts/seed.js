import { db } from "../src/db.js";
import { createDraw } from "../src/services/lottery.js";

db.exec(`
  DELETE FROM free_entry_claims;
  DELETE FROM audit_logs;
  DELETE FROM lottery_entries;
  DELETE FROM orders;
  DELETE FROM customers;
  DELETE FROM lottery_draws;
  DELETE FROM app_settings;
`);

await createDraw({
  title: "Juni Premium Trekking",
  prizeName: "1 jaar gratis vlees",
  prizeValue: "Hoofdprijs",
  description: "Live trekking voor bestellingen vanaf €70 en abonnementen.",
  status: "LIVE"
});

console.log("Seeded DVL lottery app.");
