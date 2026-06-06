import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { apiRouter } from "./routes/api.js";
import { webhookRouter } from "./routes/webhooks.js";
import { getOrCreateLiveDraw } from "./services/lottery.js";
import { safeEqual } from "./auth.js";

function requireAdminAuth(req, res, next) {
  const password = config.ADMIN_PASSWORD;
  if (!password && config.NODE_ENV !== "production") return next();

  const auth = req.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const [username, suppliedPassword] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    if (safeEqual(username, config.ADMIN_USERNAME) && safeEqual(suppliedPassword, password)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="DVL Lottery Admin"');
  return res.status(401).send("Authentication required");
}

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, app: "dvl-lottery-app" });
  });

  app.use("/webhooks", webhookRouter);
  app.use("/api", apiRouter);
  app.use("/admin", requireAdminAuth, adminRouter);
  app.get("/", (_req, res) => res.redirect("/admin"));

  return app;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (process.env.NODE_ENV !== "test" && isDirectRun) {
  await getOrCreateLiveDraw();
  createApp().listen(config.PORT, () => {
    console.log(`DVL lottery app running on http://localhost:${config.PORT}`);
  });
}
