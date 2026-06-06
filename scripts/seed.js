import { db } from "../src/db.js";
import { createDraw } from "../src/services/lottery.js";

db.exec(`
  DELETE FROM lottery_entries;
  DELETE FROM orders;
  DELETE FROM customers;
  DELETE FROM lottery_draws;
`);

await createDraw({
  title: "Juni Premium Trekking",
  prizeName: "1 jaar gratis vlees",
  prizeValue: "Hoofdprijs",
  description: "Live trekking voor bestellingen vanaf €70 en abonnementen.",
  status: "LIVE"
});

console.log("Seeded DVL lottery app.");
