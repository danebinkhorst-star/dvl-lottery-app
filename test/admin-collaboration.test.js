import test from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_USERNAME = "dvl";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
process.env.INTERNAL_API_SECRET = "test-internal-api-secret";
process.env.CUSTOMER_TOKEN_SECRET = "test-customer-token-secret";
process.env.FREE_ENTRY_HASH_SECRET = "test-free-entry-hash-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-shopify-webhook-secret";
process.env.SHOPIFY_SYNC_CUSTOMER_METAFIELDS = "false";
process.env.SQLITE_PATH = "./data/test-admin-collaboration.db";

const { db } = await import("../src/db.js");
const { createAdminUser } = await import("../src/services/admin-accounts.js");
const {
  createKpiMessage,
  createKpiThread,
  listKpiThreads,
  markKpiThreadRead,
  unreadKpiMessageCount
} = await import("../src/services/admin-collaboration.js");

function resetCollaborationDb() {
  db.exec(`
    DELETE FROM admin_kpi_thread_reads;
    DELETE FROM admin_kpi_messages;
    DELETE FROM admin_kpi_threads;
    DELETE FROM admin_sessions;
    DELETE FROM admin_user_permissions;
    DELETE FROM admin_password_resets;
    DELETE FROM admin_invites;
    DELETE FROM admin_users;
    DELETE FROM admin_teams;
  `);
}

test("Teamhub tracks unread messages per admin account", async () => {
  resetCollaborationDb();
  const first = createAdminUser({
    username: "first-admin",
    email: "first@example.test",
    name: "Eerste admin",
    password: "FirstAdmin123!",
    role: "ADMIN",
    permissions: ["view_dashboard", "manage_teamhub"]
  });
  const second = createAdminUser({
    username: "second-admin",
    email: "second@example.test",
    name: "Tweede admin",
    password: "SecondAdmin123!",
    role: "ADMIN",
    permissions: ["view_dashboard", "manage_teamhub"]
  });

  const thread = createKpiThread({
    title: "Orders zonder lot",
    kpiKey: "orders",
    priority: "HIGH",
    body: "Controleer de missende orderloten.",
    createdBy: first.id
  });

  assert.equal(unreadKpiMessageCount(first.id), 0);
  assert.equal(unreadKpiMessageCount(second.id), 1);
  assert.equal(Number(listKpiThreads({ userId: second.id })[0].unread_count), 1);

  assert.equal(markKpiThreadRead({ threadId: thread.id, userId: second.id }), true);
  assert.equal(unreadKpiMessageCount(second.id), 0);

  await new Promise((resolve) => setTimeout(resolve, 5));
  createKpiMessage({ threadId: thread.id, userId: first.id, body: "De sync is opnieuw gedraaid." });

  assert.equal(unreadKpiMessageCount(second.id), 1);
  assert.equal(unreadKpiMessageCount(first.id), 0);
  assert.equal(Number(listKpiThreads({ userId: second.id })[0].unread_count), 1);
  assert.equal(listKpiThreads({ userId: second.id })[0].last_message_body, "De sync is opnieuw gedraaid.");
});
