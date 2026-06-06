import { db } from "../src/db.js";
import { createDraw } from "../src/services/lottery.js";

const live = db.prepare("SELECT * FROM lottery_draws WHERE status = 'LIVE' LIMIT 1").get();

if (live) {
  console.log(`Live draw already exists: ${live.title}`);
} else {
  const draw = await createDraw({
    title: "Actieve DVL trekking",
    prizeName: "Premium vleespakket",
    prizeValue: "Live prijs",
    description: "Live trekking voor bestellingen vanaf €70, abonnementen en geldige gratis deelnames.",
    status: "LIVE"
  });
  console.log(`Created live draw: ${draw.title}`);
}
