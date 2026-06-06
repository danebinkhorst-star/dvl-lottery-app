import { db } from "../db.js";
import { shopifyRest } from "../shopify/admin-api.js";
import { voidEntriesForOrder } from "./lottery.js";

function shouldVoidOrder(order) {
  if (order.cancelled_at) return true;
  if (["refunded", "voided"].includes(order.financial_status)) return true;
  return false;
}

export async function reconcileActiveOrderEntries() {
  const activeOrders = db.prepare(`
    SELECT DISTINCT o.shopify_order_id, o.order_name
    FROM lottery_entries e
    JOIN orders o ON o.id = e.order_id
    WHERE e.status = 'ACTIVE'
  `).all();

  const results = [];
  for (const orderRef of activeOrders) {
    try {
      const data = await shopifyRest(`/orders/${orderRef.shopify_order_id}.json?fields=id,name,cancelled_at,financial_status`);
      const order = data.order;
      if (order && shouldVoidOrder(order)) {
        const result = await voidEntriesForOrder(orderRef.shopify_order_id, "Order reconciliation found cancelled/refunded order");
        results.push({ orderId: orderRef.shopify_order_id, orderName: order.name || orderRef.order_name, action: "voided", ...result });
      } else {
        results.push({ orderId: orderRef.shopify_order_id, orderName: order?.name || orderRef.order_name, action: "kept_active", financialStatus: order?.financial_status || null });
      }
    } catch (error) {
      results.push({ orderId: orderRef.shopify_order_id, orderName: orderRef.order_name, action: "error", error: error.message });
    }
  }

  return {
    checked: activeOrders.length,
    results
  };
}
