import { reconcileLoyaltyOrders } from "../src/services/reconcile-loyalty.js";

console.log(JSON.stringify(await reconcileLoyaltyOrders(), null, 2));
