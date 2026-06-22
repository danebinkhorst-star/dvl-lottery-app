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
import { safeEqual } from "./auth.js";

const adminLoginParser = express.urlencoded({ extended: false, limit: "8kb" });
const adminSessionCookie = "mff_admin_session";
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
  return config.SHOPIFY_WEBHOOK_SECRET || config.ADMIN_PASSWORD || "mff-dev-admin-session";
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
  return `HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${maxAge}${secure}`;
}

function safeAdminRedirect(value) {
  const next = String(value || "/admin");
  if (!next.startsWith("/admin") || next.startsWith("/admin/login")) return "/admin";
  return next;
}

function adminLoginPage({ error = "", next = "/admin" } = {}) {
  return `<!doctype html>
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
        button { min-height:52px; border:1px solid var(--forest); border-radius:18px; background:var(--forest); color:#fff9ee; font:inherit; font-size:15px; font-weight:900; cursor:pointer; }
        button:focus-visible, button:hover { background:#253719; outline:none; }
        .error { margin:0; padding:11px 12px; border:1px solid #e7c1bf; border-radius:14px; background:#faeceb; color:var(--danger); font-size:13px; font-weight:850; }
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
  if (scheme === "Basic" && encoded) {
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
  app.use((req, res, next) => {
    if (req.path.startsWith("/admin")) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
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
    res.json({ ok: true, app: "dvl-lottery-app", dashboard: "brand-secure-admin-v2" });
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
    if (safeEqual(username, config.ADMIN_USERNAME) && safeEqual(suppliedPassword, password)) {
      res.setHeader("Set-Cookie", `${adminSessionCookie}=${encodeURIComponent(createAdminSessionToken())}; ${adminCookieOptions()}`);
      return res.redirect(safeAdminRedirect(req.body.next));
    }
    return res.status(401).send(adminLoginPage({
      error: "Login klopt niet. Controleer gebruiker en wachtwoord.",
      next: req.body.next
    }));
  });

  app.post("/admin/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${adminSessionCookie}=; ${adminCookieOptions(0)}`);
    res.redirect("/admin/login");
  });

  app.use("/webhooks", webhookRouter);
  app.use("/api", apiLimiter, apiRouter);
  app.use("/embed", embedRouter);
  app.use("/admin", requireAdminAuth, adminRouter);
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
