import "../src/config.js";
import { config } from "../src/config.js";
import { shopifyRest } from "../src/shopify/admin-api.js";

if (!config.PUBLIC_APP_URL) {
  throw new Error("Set PUBLIC_APP_URL before registering webhooks.");
}

const webhooks = [
  ["orders/create", `${config.PUBLIC_APP_URL}/webhooks/orders/create`],
  ["orders/updated", `${config.PUBLIC_APP_URL}/webhooks/orders/updated`],
  ["orders/paid", `${config.PUBLIC_APP_URL}/webhooks/orders/paid`],
  ["orders/cancelled", `${config.PUBLIC_APP_URL}/webhooks/orders/cancelled`],
  ["refunds/create", `${config.PUBLIC_APP_URL}/webhooks/refunds/create`]
];

const existing = await shopifyRest("/webhooks.json?limit=250");

for (const [topic, address] of webhooks) {
  const alreadyRegistered = existing.webhooks?.find((webhook) => webhook.topic === topic && webhook.address === address);
  if (alreadyRegistered) {
    console.log(`already registered ${topic}: ${alreadyRegistered.id}`);
    continue;
  }
  const result = await shopifyRest("/webhooks.json", {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        topic,
        address,
        format: "json"
      }
    })
  });
  console.log(`registered ${topic}: ${result.webhook.id}`);
}
