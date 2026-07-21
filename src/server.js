import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import crypto from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { apiRouter } from "./routes/api.js";
import { embedRouter } from "./routes/embed.js";
import { webhookRouter } from "./routes/webhooks.js";
import { getOrCreateLiveDraw } from "./services/lottery.js";
import { brandMarkSvg, brandPalette } from "./services/admin-brand.js";
import { writeAuditLog } from "./services/audit.js";
import { safeEqual } from "./auth.js";

const adminLoginParser = express.urlencoded({ extended: false, limit: "8kb" });
const adminCsrfParser = express.urlencoded({ extended: false, limit: "16kb" });
const adminSessionCookie = "mff_admin_session";
const adminCsrfCookie = "mff_admin_csrf";
const adminSessionMaxAgeSeconds = 60 * 60 * 12;

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

function createAdminSessionToken() {
  const expiresAt = Date.now() + (adminSessionMaxAgeSeconds * 1000);
  return `${expiresAt}.${signAdminSession(expiresAt)}`;
}

function isValidAdminSession(token) {
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

function normalizeTotpSecret(secret) {
  return String(secret || "").replace(/[\s-]/g, "").toUpperCase();
}

function base32ToBuffer(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of normalizeTotpSecret(value).replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    if (index === -1) return null;
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, counter) {
  const key = base32ToBuffer(secret);
  if (!key || !key.length) return "";
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

function isAdminMfaEnabled() {
  return normalizeTotpSecret(config.ADMIN_TOTP_SECRET).length > 0;
}

function isValidTotpToken(token, now = Date.now()) {
  const secret = normalizeTotpSecret(config.ADMIN_TOTP_SECRET);
  const supplied = String(token || "").replace(/\D/g, "");
  if (!secret) return true;
  if (!/^\d{6}$/.test(supplied)) return false;

  const counter = Math.floor(now / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (safeEqual(supplied, totpCode(secret, counter + drift))) return true;
  }
  return false;
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
                : '<p class="security-note">2FA is klaar voor gebruik. Voeg ADMIN_TOTP_SECRET toe op Render om codes af te dwingen.</p>'
            }
            <button type="submit">Open dashboard</button>
          </form>
          <div class="foot">Meat For Free beheeromgeving</div>
        </section>
      </main>
    </body>
  </html>`;
}

function requireAdminAuth(req, res, next) {
  const password = config.ADMIN_PASSWORD;
  if (!password && config.NODE_ENV !== "production") return next();

  const cookies = parseCookies(req.get("cookie"));
  if (isValidAdminSession(cookies[adminSessionCookie])) return next();

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
      securityBuild: "admin-csrf-totp-v3"
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
    const passwordIsValid = safeEqual(username, config.ADMIN_USERNAME) && safeEqual(suppliedPassword, password);

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

    if (!isValidTotpToken(req.body.totp)) {
      auditAdminEvent(req, {
        actor: username,
        action: "ADMIN_LOGIN_MFA_FAILED",
        message: "Admin login geweigerd: onjuiste 2FA-code.",
        metadata: { mfaEnabled: true }
      });
      return res.status(401).send(adminLoginPage({
        error: "2FA-code klopt niet. Probeer opnieuw.",
        next: req.body.next
      }));
    }

    if (passwordIsValid) {
      auditAdminEvent(req, {
        actor: username,
        action: "ADMIN_LOGIN_SUCCESS",
        message: "Admin login geslaagd.",
        metadata: { mfaEnabled: isAdminMfaEnabled() }
      });
      res.setHeader("Set-Cookie", `${adminSessionCookie}=${encodeURIComponent(createAdminSessionToken())}; ${adminCookieOptions()}`);
      return res.redirect(safeAdminRedirect(req.body.next));
    }
  });

  app.post("/admin/logout", requireAdminAuth, adminCsrfProtection, (req, res) => {
    auditAdminEvent(req, {
      actor: "admin",
      action: "ADMIN_LOGOUT",
      message: "Admin logout."
    });
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
  createApp().listen(config.PORT, () => {
    console.log(`Meat For Free lottery app running on http://localhost:${config.PORT}`);
  });
}
