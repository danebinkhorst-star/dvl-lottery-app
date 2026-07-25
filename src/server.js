import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import multer from "multer";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { apiRouter } from "./routes/api.js";
import { embedRouter } from "./routes/embed.js";
import { webhookRouter } from "./routes/webhooks.js";
import { getOrCreateLiveDraw, syncStoredOrderLineItems } from "./services/lottery.js";
import { syncShopifyProducts } from "./services/shopify-products.js";
import { brandMarkSvg, brandPalette } from "./services/admin-brand.js";
import { writeAuditLog } from "./services/audit.js";
import { safeEqual } from "./auth.js";
import {
  acceptAdminInvite,
  authenticateAdminUser,
  consumeAdminPasswordReset,
  createAdminSession,
  ensureAdminAccessSystem,
  ensureBootstrapAdminAccount,
  ensureRecoveryAdminAccount,
  getAdminInviteByToken,
  getAdminPasswordResetByToken,
  getAdminUserTotpSecret,
  revokeAdminSession,
  validateAdminSessionToken,
  verifyTotpToken
} from "./services/admin-accounts.js";

const adminLoginParser = express.urlencoded({ extended: false, limit: "8kb" });
const adminCsrfParser = express.urlencoded({ extended: false, limit: "16kb" });
const adminSessionCookie = "mff_admin_session";
const adminCsrfCookie = "mff_admin_csrf";
const adminSessionMaxAgeSeconds = 60 * 60 * 12;
const productSyncIntervalMs = 1000 * 60 * 60 * 6;
const orderItemSyncIntervalMs = 1000 * 60 * 60 * 12;
const uploadMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch {
          return [part.slice(0, index), ""];
        }
      })
  );
}

function adminSessionSecret() {
  return config.ADMIN_SESSION_SECRET || "mff-dev-admin-session";
}

function signAdminSession(expiresAt) {
  return crypto
    .createHmac("sha256", adminSessionSecret())
    .update(String(expiresAt))
    .digest("base64url");
}

function isValidLegacyAdminSession(token) {
  const [expiresAt, signature] = String(token || "").split(".");
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !signature) return false;
  return safeEqual(signature, signAdminSession(expiresAt));
}

function adminCookieOptions(maxAge = adminSessionMaxAgeSeconds) {
  const secure = config.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${maxAge}; Priority=High${secure}`;
}

function clientIp(req) {
  return String(req.ip || req.get("x-forwarded-for") || "").split(",")[0].trim();
}

function auditAdminEvent(req, { actor = "admin", action, targetId = null, message = "", metadata = {} }) {
  try {
    writeAuditLog({
      actor,
      action,
      targetType: "admin_session",
      targetId,
      message,
      metadata: {
        ip: clientIp(req),
        userAgent: req.get("user-agent") || "",
        ...metadata
      }
    });
  } catch (error) {
    console.warn("Could not write admin audit log", error);
  }
}

function adminActor(req, fallback = "admin") {
  return req.adminUser?.username || fallback;
}

function safeUploadExtension(file) {
  const fromMime = uploadMimeTypes.get(file.mimetype);
  if (fromMime) return fromMime;
  const ext = extname(file.originalname || "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".img";
}

function ensureUploadDir() {
  mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

const adminImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        ensureUploadDir();
        cb(null, config.UPLOAD_DIR);
      } catch (error) {
        cb(error);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeUploadExtension(file)}`);
    }
  }),
  limits: {
    files: 1,
    fileSize: 4 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (uploadMimeTypes.has(file.mimetype)) return cb(null, true);
    return cb(new Error("Alleen JPG, PNG, WebP of GIF is toegestaan."));
  }
});

function startProductSyncScheduler() {
  const run = async () => {
    try {
      const result = await syncShopifyProducts({ limit: 100 });
      console.log(`Shopify product sync complete: ${result.synced || 0}/${result.fetched || 0}`);
    } catch (error) {
      console.warn(`Shopify product sync skipped: ${error.message}`);
    }
  };
  const bootTimer = setTimeout(run, 2500);
  const interval = setInterval(run, productSyncIntervalMs);
  bootTimer.unref?.();
  interval.unref?.();
}

function startOrderItemSyncScheduler() {
  const run = async () => {
    try {
      const result = await syncStoredOrderLineItems({ limit: 75 });
      console.log(`Order line-item sync complete: ${result.updatedLineItems || 0} item(s), ${result.checked || 0} order(s) checked`);
    } catch (error) {
      console.warn(`Order line-item sync skipped: ${error.message}`);
    }
  };
  const bootTimer = setTimeout(run, 6500);
  const interval = setInterval(run, orderItemSyncIntervalMs);
  bootTimer.unref?.();
  interval.unref?.();
}

function normalizeTotpSecret(secret) {
  return String(secret || "").replace(/[\s-]/g, "").toUpperCase();
}

function isAdminMfaEnabled() {
  return normalizeTotpSecret(config.ADMIN_TOTP_SECRET).length > 0;
}

function isValidTotpToken(token, secret = config.ADMIN_TOTP_SECRET) {
  return verifyTotpToken(secret, token);
}

function createAdminCsrfToken(sessionToken) {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const signature = crypto
    .createHmac("sha256", adminSessionSecret())
    .update(`${sessionToken}.${nonce}`)
    .digest("base64url");
  return `${nonce}.${signature}`;
}

function isValidAdminCsrfToken(sessionToken, token) {
  const [nonce, signature] = String(token || "").split(".");
  if (!sessionToken || !nonce || !signature) return false;
  const expected = crypto
    .createHmac("sha256", adminSessionSecret())
    .update(`${sessionToken}.${nonce}`)
    .digest("base64url");
  return safeEqual(signature, expected);
}

function injectAdminCsrf(html, token) {
  if (!token || typeof html !== "string" || !html.includes('method="post"')) return html;
  const field = `<input type="hidden" name="_csrf" value="${escapeHtml(token)}">`;
  return html.replace(/<form\b([^>]*method="post"[^>]*)>/gi, (match) => `${match}${field}`);
}

function safeAdminRedirect(value) {
  const next = String(value || "/admin");
  if (!next.startsWith("/admin") || next.startsWith("/admin/login")) return "/admin";
  return next;
}

function adminLoginPage({ error = "", next = "/admin" } = {}) {
  return `<!doctype html>
  <!-- mff-security-build: admin-csrf-totp-v3 -->
  <html lang="nl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Admin login | Meat For Free</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg:${brandPalette.cream};
          --panel:${brandPalette.paper};
          --ink:${brandPalette.ink};
          --muted:${brandPalette.muted};
          --line:#d9d4c7;
          --forest:${brandPalette.forest};
          --moss:${brandPalette.moss};
          --leaf:${brandPalette.leaf};
          --danger:#9b2226;
        }
        * { box-sizing:border-box; }
        html, body { min-height:100%; margin:0; background:var(--bg); color:var(--ink); font-family:Manrope, ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
        body { display:grid; place-items:center; padding:24px; }
        .login-shell { width:min(100%,430px); }
        .logo { width:104px; height:118px; display:block; margin:0 auto 18px; filter:drop-shadow(0 16px 24px rgba(20,18,13,.13)); }
        .panel { border:1px solid var(--line); border-radius:26px; background:rgba(255,252,247,.86); box-shadow:0 24px 70px rgba(20,18,13,.16); backdrop-filter:blur(20px); overflow:hidden; }
        .panel-head { padding:26px 24px 10px; text-align:center; }
        .eyebrow { margin:0 0 8px; color:var(--moss); font-size:11px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
        h1 { margin:0; font-size:34px; line-height:1; font-weight:950; }
        p { margin:10px 0 0; color:var(--muted); font-size:14px; font-weight:700; line-height:1.45; }
        form { display:grid; gap:14px; padding:20px 20px 22px; }
        label { display:block; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
        input { width:100%; min-height:50px; margin-top:7px; padding:12px 14px; border:1px solid var(--line); border-radius:16px; background:#fff; color:var(--ink); font:inherit; font-size:15px; font-weight:750; }
        input:focus { outline:4px solid rgba(95,141,62,.14); border-color:var(--moss); }
        input[name="totp"] { letter-spacing:.2em; text-align:center; }
        button { min-height:52px; border:1px solid var(--forest); border-radius:18px; background:var(--forest); color:#fff9ee; font:inherit; font-size:15px; font-weight:900; cursor:pointer; }
        button:focus-visible, button:hover { background:#253719; outline:none; }
        .error { margin:0; padding:11px 12px; border:1px solid #e7c1bf; border-radius:14px; background:#faeceb; color:var(--danger); font-size:13px; font-weight:850; }
        .security-note { margin:0; padding:11px 12px; border:1px solid #d9d4c7; border-radius:14px; background:#fff7e6; color:var(--muted); font-size:12px; font-weight:800; text-align:left; }
        .foot { padding:0 20px 22px; color:var(--muted); font-size:12px; font-weight:700; text-align:center; }
        @media (max-width:520px) {
          body { align-items:start; padding:34px 14px; }
          .logo { width:92px; height:104px; }
          .panel { border-radius:24px; }
          h1 { font-size:30px; }
        }
      </style>
    </head>
    <body>
      <main class="login-shell">
        ${brandMarkSvg("logo")}
        <section class="panel">
          <div class="panel-head">
            <p class="eyebrow">Admin</p>
            <h1>Inloggen</h1>
            <p>Beheer winacties, loten, orders en compliance.</p>
          </div>
          <form method="post" action="/admin/login">
            <input type="hidden" name="next" value="${escapeHtml(safeAdminRedirect(next))}">
            ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
            <label>Gebruiker<input name="username" autocomplete="username" inputmode="text" required autofocus></label>
            <label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label>
            ${
              isAdminMfaEnabled()
                ? '<label>2FA-code<input name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>'
                : '<label>2FA-code <span style="text-transform:none;letter-spacing:0;color:var(--muted)">(indien ingesteld)</span><input name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label>'
            }
            <button type="submit">Open dashboard</button>
          </form>
          <div class="foot">Meat For Free beheeromgeving</div>
        </section>
      </main>
    </body>
	  </html>`;
}

function adminSetupPage({ token, invite, error = "", mode = "invite" } = {}) {
  const title = mode === "reset" ? "Wachtwoord instellen" : "Account activeren";
  const copy = mode === "reset"
    ? `Reset voor ${invite?.username || "admin account"}. Kies een nieuw wachtwoord.`
    : `Uitnodiging voor ${invite?.email || "admin account"}. Maak je persoonlijke login aan.`;
  const action = mode === "reset" ? `/admin/reset/${escapeHtml(token)}` : `/admin/setup/${escapeHtml(token)}`;
  return `<!doctype html>
  <html lang="nl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} | Meat For Free</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800;900&display=swap" rel="stylesheet">
      <style>
        :root { --bg:${brandPalette.cream}; --panel:${brandPalette.paper}; --ink:${brandPalette.ink}; --muted:${brandPalette.muted}; --line:#d9d4c7; --forest:${brandPalette.forest}; --moss:${brandPalette.moss}; --danger:#9b2226; }
        * { box-sizing:border-box; }
        html, body { min-height:100%; margin:0; background:var(--bg); color:var(--ink); font-family:Manrope, ui-sans-serif, system-ui, sans-serif; }
        body { display:grid; place-items:center; padding:24px; }
        .shell { width:min(100%,460px); }
        .logo { width:96px; height:108px; display:block; margin:0 auto 18px; }
        .panel { border:1px solid var(--line); border-radius:22px; background:rgba(255,252,247,.92); overflow:hidden; }
        .head { padding:26px 24px 10px; text-align:center; }
        .eyebrow { margin:0 0 8px; color:var(--moss); font-size:11px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
        h1 { margin:0; font-size:32px; line-height:1; font-weight:950; }
        p { margin:10px 0 0; color:var(--muted); font-size:14px; font-weight:750; line-height:1.45; }
        form { display:grid; gap:14px; padding:20px 20px 22px; }
        label { display:block; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
        input { width:100%; min-height:50px; margin-top:7px; padding:12px 14px; border:1px solid var(--line); border-radius:14px; background:#fff; color:var(--ink); font:inherit; font-size:15px; font-weight:750; }
        input:focus { outline:4px solid rgba(95,141,62,.14); border-color:var(--moss); }
        button { min-height:52px; border:1px solid var(--forest); border-radius:16px; background:var(--forest); color:#fff9ee; font:inherit; font-size:15px; font-weight:900; cursor:pointer; }
        .error { margin:0; padding:11px 12px; border:1px solid #e7c1bf; border-radius:14px; background:#faeceb; color:var(--danger); font-size:13px; font-weight:850; }
      </style>
    </head>
    <body>
      <main class="shell">
        ${brandMarkSvg("logo")}
        <section class="panel">
          <div class="head"><p class="eyebrow">Admin security</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div>
          <form method="post" action="${action}">
            ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
            ${mode === "invite" ? `<label>Gebruikersnaam<input name="username" autocomplete="username" required></label><label>Naam<input name="name" autocomplete="name" value="${escapeHtml(invite?.name || "")}"></label><label>Functie<input name="title" autocomplete="organization-title"></label>` : ""}
            <label>Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
            <label>Herhaal wachtwoord<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></label>
            <button type="submit">${mode === "reset" ? "Wachtwoord opslaan" : "Account activeren"}</button>
          </form>
        </section>
      </main>
    </body>
  </html>`;
}

function requireAdminAuth(req, res, next) {
  const password = config.ADMIN_PASSWORD;
  if (!password && config.NODE_ENV !== "production") {
    req.adminUser = { id: "dev", username: "dev-admin", role: "OWNER", status: "ACTIVE", forcePasswordChange: false };
    req.adminSession = { id: "dev" };
    return next();
  }

  const cookies = parseCookies(req.get("cookie"));
  const sessionContext = validateAdminSessionToken(cookies[adminSessionCookie]);
  if (sessionContext) {
    req.adminUser = sessionContext.user;
    req.adminSession = sessionContext.session;
    if (sessionContext.user.forcePasswordChange && req.method === "GET" && req.path !== "/accounts") {
      return res.redirect("/admin/accounts?reason=password");
    }
    return next();
  }
  if (isValidLegacyAdminSession(cookies[adminSessionCookie])) {
    req.adminUser = { id: "legacy", username: config.ADMIN_USERNAME || "dvl", role: "OWNER", status: "ACTIVE", forcePasswordChange: false };
    req.adminSession = { id: "legacy" };
    return next();
  }

  const auth = req.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (config.NODE_ENV !== "production" && scheme === "Basic" && encoded) {
    const [username, suppliedPassword] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    if (safeEqual(username, config.ADMIN_USERNAME) && safeEqual(suppliedPassword, password)) {
      return next();
    }
  }

  if (req.method === "GET") {
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`);
  }
  return res.status(401).send("Authentication required");
}

function adminCsrfProtection(req, res, next) {
  if (!config.ADMIN_PASSWORD && config.NODE_ENV !== "production") return next();

  const cookies = parseCookies(req.get("cookie"));
  const sessionToken = cookies[adminSessionCookie];
  const csrfToken = isValidAdminCsrfToken(sessionToken, cookies[adminCsrfCookie])
    ? cookies[adminCsrfCookie]
    : createAdminCsrfToken(sessionToken);

  res.setHeader("Set-Cookie", `${adminCsrfCookie}=${encodeURIComponent(csrfToken)}; ${adminCookieOptions()}`);
  const originalSend = res.send.bind(res);
  res.send = (body) => originalSend(injectAdminCsrf(body, csrfToken));

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  return adminCsrfParser(req, res, () => {
    const supplied = req.get("x-csrf-token") || req.body?._csrf || "";
    if (!isValidAdminCsrfToken(sessionToken, supplied) || supplied !== csrfToken) {
      return res.status(403).send("Invalid CSRF token");
    }
    return next();
  });
}

export function createApp() {
  ensureAdminAccessSystem();
  ensureBootstrapAdminAccount();
  const app = express();
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: "Te veel loginpogingen. Probeer het over 15 minuten opnieuw."
  });

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(morgan("dev"));
  app.use("/assets", express.static(resolve("public"), { maxAge: "1d" }));
  app.use("/brand", express.static(resolve("public", "brand"), { maxAge: "1d" }));
  app.use("/placeholders", express.static(resolve("public", "placeholders"), { maxAge: "1d" }));
  app.use("/uploads", express.static(config.UPLOAD_DIR, { maxAge: "30d", immutable: true }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/admin")) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Content-Security-Policy", [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "object-src 'none'"
      ].join("; "));
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    }
    if (req.path.startsWith("/api/") || req.path.startsWith("/embed/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-DVL-Admin-Secret, X-DVL-Customer-Token");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      app: "mff-lottery-app",
      dashboard: "brand-secure-admin-v2",
      securityBuild: "team-access-v1"
    });
  });

  app.get("/admin/login", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.send(adminLoginPage({ next: req.query.next }));
  });

  app.post("/admin/login", authLimiter, adminLoginParser, (req, res) => {
    const password = config.ADMIN_PASSWORD;
    if (!password && config.NODE_ENV !== "production") return res.redirect(safeAdminRedirect(req.body.next));
    const username = String(req.body.username || "");
    const suppliedPassword = String(req.body.password || "");
    let authResult = authenticateAdminUser({ username, password: suppliedPassword });
    let usedRecovery = false;
    if (!authResult.ok && safeEqual(username, config.ADMIN_USERNAME) && safeEqual(suppliedPassword, password)) {
      const recoveryUser = ensureRecoveryAdminAccount();
      authResult = recoveryUser ? { ok: true, user: recoveryUser } : authResult;
      usedRecovery = Boolean(recoveryUser);
    }
    const passwordIsValid = Boolean(authResult.ok && authResult.user);

    if (!passwordIsValid) {
      auditAdminEvent(req, {
        actor: username || "unknown",
        action: "ADMIN_LOGIN_FAILED",
        message: "Admin login geweigerd: onjuiste gebruiker of wachtwoord.",
        metadata: { mfaEnabled: isAdminMfaEnabled() }
      });
      return res.status(401).send(adminLoginPage({
        error: "Login klopt niet. Controleer gebruiker en wachtwoord.",
        next: req.body.next
      }));
    }

    const userTotpSecret = authResult.user?.id ? getAdminUserTotpSecret(authResult.user.id) : "";
    const requiredTotpSecret = userTotpSecret || config.ADMIN_TOTP_SECRET;
    if (!isValidTotpToken(req.body.totp, requiredTotpSecret)) {
      auditAdminEvent(req, {
        actor: username,
        action: "ADMIN_LOGIN_MFA_FAILED",
        message: "Admin login geweigerd: onjuiste 2FA-code.",
        metadata: { mfaEnabled: true, perUser: Boolean(userTotpSecret) }
      });
      return res.status(401).send(adminLoginPage({
        error: "2FA-code klopt niet. Probeer opnieuw.",
        next: req.body.next
      }));
    }

    if (passwordIsValid) {
      auditAdminEvent(req, {
        actor: authResult.user.username,
        action: "ADMIN_LOGIN_SUCCESS",
        message: "Admin login geslaagd.",
        metadata: { mfaEnabled: Boolean(requiredTotpSecret), perUserMfa: Boolean(userTotpSecret), role: authResult.user.role, recovery: usedRecovery }
      });
      const sessionToken = createAdminSession({
        userId: authResult.user.id,
        ip: clientIp(req),
        userAgent: req.get("user-agent") || ""
      });
      res.setHeader("Set-Cookie", `${adminSessionCookie}=${encodeURIComponent(sessionToken)}; ${adminCookieOptions()}`);
      return res.redirect(authResult.user.forcePasswordChange ? "/admin/accounts?reason=password" : safeAdminRedirect(req.body.next));
    }
  });

  app.get("/admin/setup/:token", authLimiter, (req, res) => {
    const token = String(req.params.token || "");
    const invite = getAdminInviteByToken(token);
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date().toISOString()) {
      return res.status(410).send(adminSetupPage({ token, invite: { email: "verlopen uitnodiging" }, error: "Deze uitnodiging is verlopen of ingetrokken." }));
    }
    return res.send(adminSetupPage({ token, invite }));
  });

  app.post("/admin/setup/:token", authLimiter, adminLoginParser, (req, res) => {
    const token = String(req.params.token || "");
    const password = String(req.body.password || "");
    if (password !== String(req.body.confirmPassword || "")) {
      return res.status(400).send(adminSetupPage({ token, invite: getAdminInviteByToken(token), error: "Wachtwoorden zijn niet gelijk." }));
    }
    try {
      const user = acceptAdminInvite(token, {
        username: req.body.username,
        name: req.body.name,
        title: req.body.title,
        password
      });
      auditAdminEvent(req, {
        actor: user.username,
        action: "ADMIN_INVITE_ACCEPTED",
        targetId: user.id,
        message: "Admin uitnodiging geaccepteerd."
      });
      return res.redirect("/admin/login");
    } catch (error) {
      return res.status(400).send(adminSetupPage({ token, invite: getAdminInviteByToken(token), error: error.message }));
    }
  });

  app.get("/admin/reset/:token", authLimiter, (req, res) => {
    const token = String(req.params.token || "");
    const reset = getAdminPasswordResetByToken(token);
    if (!reset || reset.revokedAt || reset.usedAt || reset.expiresAt <= new Date().toISOString()) {
      return res.status(410).send(adminSetupPage({ token, invite: { username: "verlopen reset" }, mode: "reset", error: "Deze resetlink is verlopen of ingetrokken." }));
    }
    return res.send(adminSetupPage({ token, invite: reset, mode: "reset" }));
  });

  app.post("/admin/reset/:token", authLimiter, adminLoginParser, (req, res) => {
    const token = String(req.params.token || "");
    const password = String(req.body.password || "");
    if (password !== String(req.body.confirmPassword || "")) {
      return res.status(400).send(adminSetupPage({ token, invite: getAdminPasswordResetByToken(token), mode: "reset", error: "Wachtwoorden zijn niet gelijk." }));
    }
    try {
      const user = consumeAdminPasswordReset(token, password);
      auditAdminEvent(req, {
        actor: user.username,
        action: "ADMIN_PASSWORD_RESET_CONSUMED",
        targetId: user.id,
        message: "Admin wachtwoordreset gebruikt."
      });
      return res.redirect("/admin/login");
    } catch (error) {
      return res.status(400).send(adminSetupPage({ token, invite: getAdminPasswordResetByToken(token), mode: "reset", error: error.message }));
    }
  });

  app.post("/admin/uploads", requireAdminAuth, adminCsrfProtection, (req, res) => {
    adminImageUpload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message || "Upload mislukt." });
      if (!req.file) return res.status(400).json({ error: "Geen afbeelding ontvangen." });
      auditAdminEvent(req, {
        actor: adminActor(req),
        action: "ADMIN_IMAGE_UPLOAD",
        targetId: req.file.filename,
        message: "Admin afbeelding geupload.",
        metadata: {
          field: req.body?.field || "",
          mimetype: req.file.mimetype,
          size: req.file.size
        }
      });
      return res.json({
        ok: true,
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename
      });
    });
  });

  app.post("/admin/logout", requireAdminAuth, adminCsrfProtection, (req, res) => {
    auditAdminEvent(req, {
      actor: adminActor(req),
      action: "ADMIN_LOGOUT",
      message: "Admin logout."
    });
    if (req.adminSession?.id && req.adminSession.id !== "legacy") revokeAdminSession(req.adminSession.id);
    res.setHeader("Set-Cookie", `${adminSessionCookie}=; ${adminCookieOptions(0)}`);
    res.redirect("/admin/login");
  });

  app.use("/webhooks", webhookRouter);
  app.use("/api", apiLimiter, apiRouter);
  app.use("/embed", embedRouter);
  app.use("/admin", requireAdminAuth, adminCsrfProtection, adminRouter);
  app.get("/", (_req, res) => res.redirect("/admin"));

  return app;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (process.env.NODE_ENV !== "test" && isDirectRun) {
  await getOrCreateLiveDraw();
  startProductSyncScheduler();
  startOrderItemSyncScheduler();
  createApp().listen(config.PORT, () => {
    console.log(`Meat For Free lottery app running on http://localhost:${config.PORT}`);
  });
}
