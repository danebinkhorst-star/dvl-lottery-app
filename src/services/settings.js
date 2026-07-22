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

export const widgetVisualDefaults = {
  visualTheme: "mff",
  backgroundColor: "#fff7ea",
  surfaceColor: "#fffdf7",
  textColor: "#21150f",
  mutedColor: "#765f4d",
  accentColor: "#efb12c",
  secondaryColor: "#b72b22",
  borderColor: "#21150f",
  backgroundImageUrl: "",
  backgroundImageOpacity: "18",
  backgroundImagePosition: "center center",
  visualImageUrl: "",
  visualImageAlt: "",
  cornerStyle: "mff",
  shadowStyle: "hard"
};

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
      heading: "Recente winnaars.",
      body: "Een snelle blik op recente Meat For Free trekkingen.",
      emptyLabel: "Nog geen winnaars gepubliceerd",
      emptyValue: "Na trekking",
      winnerOneName: "Mark",
      winnerOnePrize: "BBQ Box",
      winnerOneStory: "Niet verwacht, maar die BBQ Box kwam perfect uit voor het weekend.",
      winnerOneImageUrl: "https://i.pravatar.cc/160?img=12",
      winnerTwoName: "Sanne",
      winnerTwoPrize: "250 euro vleestegoed",
      winnerTwoStory: "Mijn bestelling pakte automatisch een lot en ineens had ik 250 euro vleestegoed.",
      winnerTwoImageUrl: "https://i.pravatar.cc/160?img=47",
      winnerThreeName: "Youssef",
      winnerThreePrize: "Kamado pakket",
      winnerThreeStory: "Ik checkte Mijn MFF en zag dat het kamado pakket gewoon van mij was.",
      winnerThreeImageUrl: "https://i.pravatar.cc/160?img=32",
      winnerFourName: "Niels",
      winnerFourPrize: "Dry-aged pakket",
      winnerFourStory: "Tweede bestelling, tweede lot, en toen stond dat dry-aged pakket op mijn naam.",
      winnerFourImageUrl: "https://i.pravatar.cc/160?img=68"
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
      kicker: "MFF Club",
      heading: "Word lid van de club.",
      body: "Voor vaste Meat For Free leden: automatische deelname, vroege toegang en ledenvoordeel op acties.",
      featureOne: "Automatische deelname",
      featureTwo: "Ledenvoordeel",
      featureThree: "Vroege toegang",
      featureFour: "Exclusieve clubacties",
      cardTitle: "Altijd erbij",
      cardText: "Je lidmaatschap laat je automatisch meelopen met geldige acties en houdt alles overzichtelijk in Mijn MFF.",
      primaryLabel: "Lid worden",
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
  },
  {
    key: "product-cards",
    label: "Homepage productkaarten",
    description: "Productblok met korting, prijs, details-link, directe add-to-cart en lot-progress.",
    defaults: {
      heading: "Vlees voor pan, grill en BBQ.",
      body: "Kies je cut. Vanaf €70 ontvang je automatisch 1 lot voor de actieve winactie.",
      collectionUrl: "/collections/all",
      detailLabel: "Alle gegevens bekijken",
      cartLabel: "In winkelwagen",
      soldOutLabel: "Bekijk product",
      lotLabel: "Telt mee voor je lot",
      productSource: "synced",
      productLimit: "8",
      productStatusFilter: "",
      productOneTitle: "Amerikaanse spareribs (10 kg) bevroren",
      productOneTag: "Deal",
      productOneDescription: "Grote BBQ-box die je bijna direct richting een gratis lot brengt.",
      productOneImageUrl: "https://cdn.shopify.com/s/files/1/1075/5814/2291/files/spareribs2.jpg?v=1780244492",
      productOneUrl: "/products/spareribs-10-kg",
      productOneVariantId: "53892623860051",
      productOnePriceCents: "6499",
      productOneCompareAtCents: "",
      productTwoTitle: "Bavette (per kilo)",
      productTwoTag: "Nieuw",
      productTwoDescription: "Volle rundsmaak voor grill, pan of BBQ.",
      productTwoImageUrl: "https://cdn.shopify.com/s/files/1/1075/5814/2291/files/Bavette-rundvlees.jpg?v=1780244513",
      productTwoUrl: "/products/bavette-rundvlees",
      productTwoVariantId: "53892624679251",
      productTwoPriceCents: "2599",
      productTwoCompareAtCents: "",
      productThreeTitle: "Entrecote",
      productThreeTag: "Populair",
      productThreeDescription: "Steakfavoriet met stevige waarde richting je volgende lot.",
      productThreeImageUrl: "https://cdn.shopify.com/s/files/1/1075/5814/2291/files/entrecote.jpg?v=1780244657",
      productThreeUrl: "/products/entrecote",
      productThreeVariantId: "53892631888211",
      productThreePriceCents: "2299",
      productThreeCompareAtCents: "",
      productFourTitle: "Brisket (per kilo)",
      productFourTag: "Laatste kans",
      productFourDescription: "Low & slow klassieker voor serieuze BBQ-plannen.",
      productFourImageUrl: "https://cdn.shopify.com/s/files/1/1075/5814/2291/files/brisket.jpg?v=1780244521",
      productFourUrl: "/products/brisket-borststuk",
      productFourVariantId: "53892625105235",
      productFourPriceCents: "1799",
      productFourCompareAtCents: ""
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
    ...widgetVisualDefaults,
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
  for (const key of [...Object.keys(widgetVisualDefaults), ...Object.keys(definition.defaults)]) {
    next[key] = String(fields?.[key] ?? "").trim();
  }
  setSetting(widgetSettingKey(widgetKey), JSON.stringify(next));
  return getWidgetSettings(widgetKey);
}

export const siteStructureDefaults = {
  homepageSections: [
    { key: "hero", label: "Live winactie", widget: "live", placement: "Homepage bovenaan", purpose: "Leg direct uit wat de actie is en waar bezoekers kunnen shoppen.", enabled: true },
    { key: "products", label: "Populaire producten", widget: "product-cards", placement: "Onder hero", purpose: "Productkeuze, korting en direct in winkelwagen.", enabled: true },
    { key: "how", label: "Hoe het werkt", widget: "how-it-works", placement: "Na producten", purpose: "Bestellen, lot krijgen en trekking volgen.", enabled: true },
    { key: "winners", label: "Recente winnaars", widget: "winners", placement: "Bewijsblok", purpose: "Sociaal bewijs zonder privacy te lekken.", enabled: true },
    { key: "trust", label: "Trust en levering", widget: "trust", placement: "Onder bewijs", purpose: "Gekoelde levering, transparantie en service vertrouwen.", enabled: true },
    { key: "free", label: "Gratis deelname", widget: "free-entry", placement: "In FAQ/legal context", purpose: "Zichtbare compliance route zonder de shop te verstoren.", enabled: true }
  ],
  headerMenu: [
    { key: "shop", label: "Shop", url: "/collections/all", group: "Hoofdmenu", visible: true },
    { key: "winacties", label: "Winacties", url: "/pages/actieve-loterijen", group: "Hoofdmenu", visible: true },
    { key: "winnaars", label: "Winnaars", url: "/pages/live-winnaars", group: "Hoofdmenu", visible: true },
    { key: "dashboard", label: "Mijn MFF", url: "/pages/mijn-mff-dashboard", group: "Hoofdmenu", visible: true },
    { key: "community", label: "Community", url: "/pages/community", group: "Hoofdmenu", visible: true },
    { key: "challenges", label: "Challenges", url: "/pages/challenges", group: "Hoofdmenu", visible: true },
    { key: "bezorging", label: "Bezorging", url: "/pages/bezorging", group: "Hoofdmenu", visible: true },
    { key: "retourbeleid", label: "Retourbeleid", url: "/pages/omruil-en-retourbeleid", group: "Hoofdmenu", visible: true },
    { key: "contact", label: "Contact", url: "/pages/contact", group: "Hoofdmenu", visible: true }
  ],
  infoPages: [
    { key: "actieve-loterijen", title: "Actieve loterijen", url: "/pages/actieve-loterijen", status: "live", inHeader: true, purpose: "Alle lopende prijzen, looptijden en trekkingdata." },
    { key: "live-winnaars", title: "Live winnaars", url: "/pages/live-winnaars", status: "live", inHeader: true, purpose: "Gepubliceerde winnaars met toestemming en prijscontext." },
    { key: "mijn-mff-dashboard", title: "Mijn MFF dashboard", url: "/pages/mijn-mff-dashboard", status: "live", inHeader: true, purpose: "Klant ziet loten, orders en winacties." },
    { key: "community", title: "Community", url: "/pages/community", status: "live", inHeader: true, purpose: "Community-updates, klantmomenten en acties." },
    { key: "challenges", title: "Challenges", url: "/pages/challenges", status: "live", inHeader: true, purpose: "Community challenges en tijdelijke acties." },
    { key: "bezorging", title: "Bezorging", url: "/pages/bezorging", status: "live", inHeader: true, purpose: "Heldere leverinformatie voor klanten." },
    { key: "retourbeleid", title: "Retourbeleid", url: "/pages/omruil-en-retourbeleid", status: "live", inHeader: true, purpose: "Omruil- en retourvragen duidelijk afvangen." },
    { key: "contact", title: "Contact", url: "/pages/contact", status: "live", inHeader: true, purpose: "Support route voor bestelling, levering en deelname." },
    { key: "algemene-voorwaarden", title: "Algemene voorwaarden", url: "/pages/algemene-voorwaarden", status: "live", inHeader: false, purpose: "Footer legal: voorwaarden voor bestellingen, levering, klachten en winacties." },
    { key: "privacybeleid", title: "Privacybeleid", url: "/pages/privacybeleid", status: "live", inHeader: false, purpose: "Footer legal: privacy, Shopify, klantdashboard, loten en IP-hashing." },
    { key: "disclaimer", title: "Disclaimer", url: "/pages/disclaimer", status: "live", inHeader: false, purpose: "Footer legal: website-informatie, productafwijkingen, externe links en aansprakelijkheid." }
  ],
  productCards: {
    enabled: true,
    directAddEnabled: true,
    showSavings: true,
    showLotProgress: true,
    showDetailsLink: true,
    placement: "Homepage onder de live winactie",
    note: "Gebruik Shopify variant IDs voor echte add-to-cart. Zonder variant ID stuurt de kaart naar de productpagina."
  }
};

function settingJson(key, fallback) {
  const raw = getSetting(key, "");
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function mergeRows(defaultRows, savedRows = [], fields) {
  const savedByKey = new Map((Array.isArray(savedRows) ? savedRows : []).map((row) => [row?.key, row]));
  return defaultRows.map((row) => {
    const saved = savedByKey.get(row.key) || {};
    const next = { ...row, ...saved };
    for (const field of fields) {
      if (next[field] == null) next[field] = row[field];
    }
    next.enabled = next.enabled === true || next.visible === true || next.inHeader === true ? true : Boolean(next.enabled);
    return next;
  });
}

export function getSiteStructure() {
  const saved = settingJson("site_structure", {});
  return {
    homepageSections: mergeRows(siteStructureDefaults.homepageSections, saved.homepageSections, ["label", "widget", "placement", "purpose", "enabled"]),
    headerMenu: mergeRows(siteStructureDefaults.headerMenu, saved.headerMenu, ["label", "url", "group", "visible"]).map((row) => ({ ...row, visible: row.visible !== false })),
    infoPages: mergeRows(siteStructureDefaults.infoPages, saved.infoPages, ["title", "url", "status", "inHeader", "purpose"]).map((row) => ({ ...row, inHeader: row.inHeader !== false })),
    productCards: { ...siteStructureDefaults.productCards, ...(saved.productCards || {}) }
  };
}

export function updateSiteStructure(nextStructure) {
  setSetting("site_structure", JSON.stringify(nextStructure));
  return getSiteStructure();
}
