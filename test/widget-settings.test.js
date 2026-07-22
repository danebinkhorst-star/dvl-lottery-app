import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { db } from "../src/db.js";
import { createApp } from "../src/server.js";
import { getSiteStructure, getWidgetSettings, updateSiteStructure, updateWidgetSettings } from "../src/services/settings.js";

function resetSettings() {
  db.exec("DELETE FROM app_settings WHERE key LIKE 'widget:%' OR key = 'site_structure'");
  db.exec("DELETE FROM shopify_products");
}

afterEach(() => {
  resetSettings();
});

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
  assert.equal(response.body.widgets["product-cards"].cartLabel, "In winkelwagen");
  assert.equal(response.body.widgets["product-cards"].productSource, "synced");
  assert.equal(response.body.widgets.winners.winnerSource, "automatic");
  assert.equal(response.body.widgets.winners.winnerOneName, "");
  assert.equal(response.body.siteStructure.headerMenu[0].label, "Shop");
});

test("site structure can control homepage and navigation visibility", async () => {
  resetSettings();
  const structure = getSiteStructure();
  structure.homepageSections[1].enabled = false;
  structure.headerMenu[0].label = "Vlees shoppen";
  structure.productCards.directAddEnabled = false;
  updateSiteStructure(structure);

  const saved = getSiteStructure();
  assert.equal(saved.homepageSections[1].enabled, false);
  assert.equal(saved.headerMenu[0].label, "Vlees shoppen");
  assert.equal(saved.productCards.directAddEnabled, false);
});
