import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

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
    DELETE FROM admin_user_permissions;
    DELETE FROM admin_password_resets;
    DELETE FROM admin_invites;
    DELETE FROM admin_users;
    DELETE FROM admin_teams;
    DELETE FROM audit_logs;
  `);
}

async function login(agent, username, password, totp = "") {
  const body = { username, password };
  if (totp) body.totp = totp;
  await agent
    .post("/admin/login")
    .type("form")
    .send(body)
    .expect(302);
}

async function csrf(agent, path = "/admin/accounts") {
  const page = await agent.get(path).expect(200);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token);
  return [token, page.text];
}

function totpCode(secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of String(secret).replace(/[\s-]/g, "").toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    assert.notEqual(index, -1);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test("team access system supports invites, granular permissions, reset links and per-user 2FA", async () => {
  resetAdminDb();
  const app = createApp();
  const owner = request.agent(app);
  const username = `ramzi-${Date.now()}`;
  const email = `${username}@example.test`;

  await login(owner, "dvl", process.env.ADMIN_PASSWORD);
  let [token, accountsHtml] = await csrf(owner);
  assert.match(accountsHtml, /Team access control/);
  assert.match(accountsHtml, /Team uitnodigen/);

  const inviteResponse = await owner
    .post("/admin/accounts/invites")
    .type("form")
    .send({
      _csrf: token,
      email,
      name: "Ramzi",
      role: "VIEWER",
      permissions: ["view_dashboard"],
      expiresInHours: "24"
    })
    .expect(200);
  const setupPath = inviteResponse.text.match(/https?:\/\/[^<]+(\/admin\/setup\/[^<]+)/)?.[1];
  assert.ok(setupPath);

  await request(app).get(setupPath).expect(200);
  await request(app)
    .post(setupPath)
    .type("form")
    .send({
      username,
      name: "Ramzi",
      title: "Operations",
      password: "Invite12345!",
      confirmPassword: "Invite12345!"
    })
    .expect(302);

  const viewer = request.agent(app);
  await login(viewer, username, "Invite12345!");
  await viewer.get("/admin").expect(200);
  await viewer.get("/admin/orders").expect(403);
  token = (await csrf(viewer))[0];
  await viewer
    .post("/admin/accounts/invites")
    .type("form")
    .send({ _csrf: token, email: `blocked-${email}`, role: "ADMIN" })
    .expect(403);

  token = (await csrf(owner))[0];
  const createdUser = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(username);
  const resetResponse = await owner
    .post(`/admin/accounts/${createdUser.id}/reset-link`)
    .type("form")
    .send({ _csrf: token })
    .expect(200);
  const resetPath = resetResponse.text.match(/https?:\/\/[^<]+(\/admin\/reset\/[^<]+)/)?.[1];
  assert.ok(resetPath);
  await request(app)
    .post(resetPath)
    .type("form")
    .send({ password: "Reset12345!", confirmPassword: "Reset12345!" })
    .expect(302);

  token = (await csrf(owner))[0];
  await owner.post("/admin/account/2fa/start").type("form").send({ _csrf: token }).expect(302);
  [token, accountsHtml] = await csrf(owner);
  const secret = accountsHtml.match(/<code class="code-line">([^<]+)<\/code>/)?.[1];
  assert.ok(secret);
  await owner
    .post("/admin/account/2fa/confirm")
    .type("form")
    .send({ _csrf: token, totp: totpCode(secret) })
    .expect(302);

  const challengedOwner = request.agent(app);
  await challengedOwner
    .post("/admin/login")
    .type("form")
    .send({ username: "dvl", password: process.env.ADMIN_PASSWORD })
    .expect(401);
  await login(challengedOwner, "dvl", process.env.ADMIN_PASSWORD, totpCode(secret));

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ADMIN_INVITE_CREATED'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ADMIN_PASSWORD_RESET_LINK_CREATED'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ADMIN_2FA_ENABLED'").get().count, 1);
});
