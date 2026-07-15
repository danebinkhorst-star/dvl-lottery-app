import { config } from "../config.js";
import { db, nowIso } from "../db.js";

export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());
}

export function getLotteryRule() {
  const mode = getSetting("lot_rule_mode", config.LOT_RULE_MODE);
  const minimumCents = Number(getSetting("lot_order_minimum_cents", config.LOT_ORDER_MINIMUM_CENTS));
  const perCents = Number(getSetting("lot_per_cents", config.LOT_PER_CENTS));
  const freeEntryEnabled = getSetting("free_entry_enabled", config.FREE_ENTRY_ENABLED ? "true" : "false") === "true";
  return {
    LOT_RULE_MODE: mode === "PER_AMOUNT" ? "PER_AMOUNT" : "ORDER_MINIMUM",
    LOT_ORDER_MINIMUM_CENTS: Number.isFinite(minimumCents) && minimumCents > 0 ? Math.round(minimumCents) : config.LOT_ORDER_MINIMUM_CENTS,
    LOT_PER_CENTS: Number.isFinite(perCents) && perCents > 0 ? Math.round(perCents) : config.LOT_PER_CENTS,
    FREE_ENTRY_ENABLED: freeEntryEnabled
  };
}

export function updateLotteryRule({ mode, minimumCents, perCents, freeEntryEnabled }) {
  setSetting("lot_rule_mode", mode === "PER_AMOUNT" ? "PER_AMOUNT" : "ORDER_MINIMUM");
  setSetting("lot_order_minimum_cents", Math.max(1, Math.round(Number(minimumCents || config.LOT_ORDER_MINIMUM_CENTS))));
  setSetting("lot_per_cents", Math.max(1, Math.round(Number(perCents || config.LOT_PER_CENTS))));
  setSetting("free_entry_enabled", freeEntryEnabled ? "true" : "false");
  return getLotteryRule();
}

export const widgetDefinitions = [
  {
    key: "live",
    label: "Homepage / Actieve winacties",
    description: "De hoofd-widget met live trekking, prijs en CTA's.",
    defaults: {
      kicker: "Live winactie",
      heading: "Bestel. Pak je lot.",
      body: "{rule}. Volg je loten en trekkingen transparant in Mijn MFF.",
      primaryLabel: "Bekijk winacties",
      primaryUrl: "/pages/actieve-loterijen",
      secondaryLabel: "Shop vlees",
      secondaryUrl: "/collections/all",
      prizeLabel: "Hoofdprijs nu",
      fallbackPrize: "Vleespakket",
      fallbackPrizeValue: "Actieve trekking"
    }
  },
  {
    key: "cart",
    label: "Winkelwagen lot-progress",
    description: "De cart-widget die laat zien hoeveel nog nodig is voor een gratis lot.",
    defaults: {
      badge: "Gratis lot",
      reachedHeading: "Lot actief.",
      remainingHeading: "Nog {remaining}",
      emptyBody: "Je winkelwagen is leeg. Voeg vlees toe en speel mee vanaf {threshold}.",
      reachedBody: "Je bestelling haalt de grens. Na checkout koppelen we je gratis lot automatisch.",
      remainingBody: "Tot je gratis lot bij de actieve winactie.",
      cartLabel: "Winkelwagen",
      thresholdLabel: "Drempel",
      primaryLabelFilled: "Afrekenen",
      primaryLabelEmpty: "Shop vlees",
      primaryUrlFilled: "/checkout",
      primaryUrlEmpty: "/collections/all",
      secondaryLabel: "Winactie",
      secondaryUrl: "/pages/actieve-loterijen"
    }
  },
  {
    key: "winners",
    label: "Laatste winnaars",
    description: "Winnaarsbewijs voor homepage en winactie-pagina.",
    defaults: {
      kicker: "Winnaars",
      heading: "Echte trekkingen.",
      body: "Laat recente winnaars zien zonder lange uitleg. Bewijs boven praatjes.",
      emptyLabel: "Nog geen winnaars gepubliceerd",
      emptyValue: "Live"
    }
  },
  {
    key: "customer",
    label: "Mijn MFF dashboard",
    description: "Klantdashboard-widget voor login, loten en wallet.",
    defaults: {
      kicker: "Mijn MFF",
      heading: "Je loten. Je trekkingen.",
      body: "Een rustig dashboard voor actieve loten, gekoppelde orders en winacties.",
      loggedInFallback: "Bestel, spaar loten en volg elke trekking transparant.",
      buttonLabel: "Open dashboard",
      buttonUrl: "/pages/mijn-mff-dashboard",
      panelBadge: "Dashboard",
      personalLabel: "Persoonlijke loten",
      personalValue: "Na login"
    }
  },
  {
    key: "pdp",
    label: "Productpagina lot-widget",
    description: "Productpagina-widget die uitlegt of dit product een lot haalt.",
    defaults: {
      kicker: "Lot bij je bestelling",
      qualifiesHeading: "Dit product pakt een lot.",
      remainingHeading: "Dichter bij je lot.",
      qualifiesBody: "Bestel dit product en je krijgt automatisch 1 gratis lot voor de actieve winactie.",
      remainingBody: "{remaining} extra in je mandje en je bestelling pakt automatisch een gratis lot.",
      primaryLabel: "Verder shoppen",
      primaryUrl: "/collections/all",
      secondaryLabel: "Winactie",
      secondaryUrl: "/pages/actieve-loterijen"
    }
  },
  {
    key: "free-entry",
    label: "Gratis deelname formulier",
    description: "Widget voor eenmalig gratis meedoen.",
    defaults: {
      kicker: "Gratis deelname",
      heading: "Een keer gratis meedoen.",
      firstNamePlaceholder: "Voornaam",
      lastNamePlaceholder: "Achternaam",
      emailPlaceholder: "E-mailadres",
      buttonLabel: "Vraag gratis lot aan",
      loadingText: "Aanvraag wordt verwerkt...",
      duplicateText: "Je gratis deelname stond al geregistreerd.",
      successPrefix: "Gelukt. Lotnummer:"
    }
  },
  {
    key: "how-it-works",
    label: "Hoe Meat For Free werkt",
    description: "Korte uitleg voor homepage: bestellen, lot krijgen, trekking volgen.",
    defaults: {
      kicker: "Zo werkt het",
      heading: "Vlees kopen. Loten sparen.",
      body: "Hou het simpel: bestel goed vlees, ontvang automatisch loten en volg elke trekking in Mijn MFF.",
      stepOneTitle: "Bestel vlees",
      stepOneText: "Vanaf EUR 70 telt je bestelling mee.",
      stepTwoTitle: "Pak je lot",
      stepTwoText: "Je lot wordt automatisch gekoppeld.",
      stepThreeTitle: "Volg de trekking",
      stepThreeText: "Alles zichtbaar in Mijn MFF.",
      primaryLabel: "Shop vlees",
      primaryUrl: "/collections/all",
      secondaryLabel: "Bekijk winacties",
      secondaryUrl: "/pages/actieve-loterijen"
    }
  },
  {
    key: "trust",
    label: "Trust / herkomst / levering",
    description: "Rustige bewijs-sectie voor gekoelde levering, reviews en herkomst.",
    defaults: {
      kicker: "Waarom MFF",
      heading: "Duidelijk vlees. Eerlijke kansen.",
      body: "Minder praat, meer bewijs: gekoeld geleverd, helder verpakt en transparante winacties.",
      proofOneValue: "4.8/5",
      proofOneLabel: "Beoordeling",
      proofTwoValue: "Gekoeld",
      proofTwoLabel: "Vers verpakt",
      proofThreeValue: "NL",
      proofThreeLabel: "Heldere herkomst",
      proofFourValue: "Live",
      proofFourLabel: "Trekkingen"
    }
  },
  {
    key: "membership",
    label: "Membership / abonnement",
    description: "Retentie-blok voor abonnement, automatische deelname en Mijn MFF.",
    defaults: {
      kicker: "Meat For Free club",
      heading: "Altijd meedoen.",
      body: "Voor vaste liefhebbers: automatische deelname, betere acties en een dashboard voor je loten.",
      featureOne: "Automatische loten",
      featureTwo: "Vroege toegang",
      featureThree: "Clubvoordeel",
      featureFour: "Mijn MFF dashboard",
      primaryLabel: "Word lid",
      primaryUrl: "/pages/memberships",
      secondaryLabel: "Mijn MFF",
      secondaryUrl: "/pages/mijn-mff-dashboard"
    }
  },
  {
    key: "community",
    label: "Community / BBQ inspiratie",
    description: "Editorial blok voor recepten, BBQ inspiratie en klantcontent.",
    defaults: {
      kicker: "BBQ inspiratie",
      heading: "Wat zet jij op het vuur?",
      body: "Laat recepten, klantfoto's en BBQ challenges zien zonder de shop uit het oog te verliezen.",
      noteOne: "Recepten",
      noteTwo: "Klantfoto's",
      noteThree: "Challenges",
      primaryLabel: "Bekijk inspiratie",
      primaryUrl: "/pages/bbq-inspiratie",
      secondaryLabel: "Community",
      secondaryUrl: "/pages/community"
    }
  }
];

const widgetDefinitionMap = new Map(widgetDefinitions.map((definition) => [definition.key, definition]));

function widgetSettingKey(widgetKey) {
  return `widget:${widgetKey}`;
}

function parseWidgetSetting(widgetKey) {
  const definition = widgetDefinitionMap.get(widgetKey);
  if (!definition) return null;
  const raw = getSetting(widgetSettingKey(widgetKey), "");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

export function getWidgetSettings(widgetKey) {
  const definition = widgetDefinitionMap.get(widgetKey);
  if (!definition) return null;
  return {
    ...definition.defaults,
    ...parseWidgetSetting(widgetKey)
  };
}

export function getAllWidgetSettings() {
  return Object.fromEntries(
    widgetDefinitions.map((definition) => [definition.key, getWidgetSettings(definition.key)])
  );
}

export function updateWidgetSettings(widgetKey, fields) {
  const definition = widgetDefinitionMap.get(widgetKey);
  if (!definition) throw new Error("Onbekende widget.");
  const next = {};
  for (const key of Object.keys(definition.defaults)) {
    next[key] = String(fields?.[key] ?? "").trim();
  }
  setSetting(widgetSettingKey(widgetKey), JSON.stringify(next));
  return getWidgetSettings(widgetKey);
}
