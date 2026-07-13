import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { db } from "../src/db.js";
import { createApp } from "../src/server.js";
import { getWidgetSettings, updateWidgetSettings } from "../src/services/settings.js";

function resetSettings() {
  db.exec("DELETE FROM app_settings WHERE key LIKE 'widget:%'");
}

test("widget settings have defaults and can be edited per widget", async () => {
  resetSettings();

  assert.equal(getWidgetSettings("live").heading, "Bestel. Pak je lot.");

  updateWidgetSettings("live", {
    ...getWidgetSettings("live"),
    heading: "Nieuwe live heading",
    primaryLabel: "Nieuwe knop"
  });

  const settings = getWidgetSettings("live");
  assert.equal(settings.heading, "Nieuwe live heading");
  assert.equal(settings.primaryLabel, "Nieuwe knop");
});

test("site summary exposes editable widget copy to embeds", async () => {
  resetSettings();
  updateWidgetSettings("pdp", {
    ...getWidgetSettings("pdp"),
    qualifiesHeading: "Product haalt direct een lot"
  });

  const app = createApp();
  const response = await request(app).get("/api/site/summary").expect(200);

  assert.equal(response.body.widgets.pdp.qualifiesHeading, "Product haalt direct een lot");
  assert.equal(response.body.widgets.cart.badge, "Gratis lot");
});
