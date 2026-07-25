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
process.env.SQLITE_PATH = "./data/test-admin-accounts.db";

const request = (await import("supertest")).default;
const { db } = await import("../src/db.js");
const { createApp } = await import("../src/server.js");

function resetAdminDb() {
  db.exec(`
    DELETE FROM admin_sessions;
    DELETE FROM admin_users;
    DELETE FROM audit_logs;
  `);
}

async function login(agent, username, password) {
  await agent
    .post("/admin/login")
    .type("form")
    .send({ username, password })
    .expect(302);
}

async function csrf(agent, path = "/admin/accounts") {
  const page = await agent.get(path).expect(200);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);
  return token;
}

test("owner can create admin account, new admin can log in, and non-owner cannot create users", async () => {
  resetAdminDb();
  const app = createApp();
  const owner = request.agent(app);
  const username = `ramzi-${Date.now()}`;

  await login(owner, "dvl", process.env.ADMIN_PASSWORD);
  let token = await csrf(owner);
  await owner
    .post("/admin/accounts")
    .type("form")
    .send({
      _csrf: token,
      username,
      name: "Ramzi",
      email: `${username}@example.test`,
      role: "ADMIN",
      password: "Admin12345!",
      forcePasswordChange: "1"
    })
    .expect(302);

  const created = db.prepare("SELECT username, role, force_password_change FROM admin_users WHERE username = ?").get(username);
  assert.equal(created.username, username);
  assert.equal(created.role, "ADMIN");
  assert.equal(created.force_password_change, 1);

  const admin = request.agent(app);
  await admin
    .post("/admin/login")
    .type("form")
    .send({ username, password: "Admin12345!" })
    .expect(302)
    .expect("location", "/admin/accounts?reason=password");

  token = await csrf(admin);
  await admin
    .post("/admin/account/password")
    .type("form")
    .send({
      _csrf: token,
      currentPassword: "Admin12345!",
      newPassword: "Nieuw12345!",
      confirmPassword: "Nieuw12345!"
    })
    .expect(302);

  const afterChange = db.prepare("SELECT force_password_change FROM admin_users WHERE username = ?").get(username);
  assert.equal(afterChange.force_password_change, 0);

  token = await csrf(admin);
  await admin
    .post("/admin/accounts")
    .type("form")
    .send({
      _csrf: token,
      username: `blocked-${Date.now()}`,
      role: "ADMIN",
      password: "Blocked12345!"
    })
    .expect(400);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ADMIN_ACCOUNT_CREATED'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ADMIN_PASSWORD_CHANGED'").get().count, 1);
});
