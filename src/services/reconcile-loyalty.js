import { db } from "../db.js";
import { shopifyRest } from "../shopify/admin-api.js";
import { reconcileLoyaltyForOrder } from "./loyalty.js";

function refundedAmount(order = {}) {
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  const cents = refunds.reduce((total, refund) => {
    const transactions = Array.isArray(refund.transactions) ? refund.transactions : [];
    return total + transactions.reduce((refundTotal, transaction) => {
      const kind = String(transaction?.kind || "").toLowerCase();
      const status = String(transaction?.status || "success").toLowerCase();
      return kind === "refund" && status === "success"
        ? refundTotal + Math.round(Number(transaction?.amount || 0) * 100)
        : refundTotal;
    }, 0);
  }, 0);
  return (cents / 100).toFixed(2);
}

export async function reconcileLoyaltyOrders() {
  const orders = db.prepare(`
    SELECT shopify_order_id, order_name
    FROM orders
    WHERE customer_id IS NOT NULL
    ORDER BY created_at ASC
  `).all();
  const results = [];

  for (const storedOrder of orders) {
    try {
      const response = await shopifyRest(
        `/orders/${storedOrder.shopify_order_id}.json?fields=id,name,current_total_price,total_price,financial_status,cancelled_at,cancel_reason,refunds`
      );
      const order = response.order;
      const result = reconcileLoyaltyForOrder(
        { ...order, total_refunded: refundedAmount(order) },
        { topic: "loyalty/reconcile" }
      );
      results.push({
        orderId: storedOrder.shopify_order_id,
        orderName: order?.name || storedOrder.order_name,
        action: "reconciled",
        ...result
      });
    } catch (error) {
      results.push({
        orderId: storedOrder.shopify_order_id,
        orderName: storedOrder.order_name,
        action: "error",
        error: error.message
      });
    }
  }

  return {
    checked: orders.length,
    errors: results.filter((result) => result.action === "error").length,
    pointsDelta: results.reduce((total, result) => total + Number(result.pointsDelta || 0), 0),
    results
  };
}
