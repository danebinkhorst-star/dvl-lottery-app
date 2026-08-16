import crypto from "node:crypto";
import { db, id, nowIso } from "../db.js";
import { formatEuro } from "../utils.js";

export const auctionStatuses = ["DRAFT", "LIVE", "ENDED", "AWARDED", "CANCELLED"];
export const auctionBidStatuses = ["WINNING", "OUTBID", "WINNER", "VOID"];
const bannedMessagePatterns = [
  /kanker/i,
  /tering/i,
  /tyfus/i,
  /hoer/i,
  /neuk/i,
  /kut/i,
  /lul/i,
  /mongool/i,
  /nazi/i,
  /fuck/i,
  /shit/i,
  /bitch/i,
  /cunt/i,
  /http/i,
  /www\./i
];

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function moneyCents(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const numeric = Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric * 100));
}

function normalizedStatus(value, fallback = "DRAFT") {
  const status = String(value || "").toUpperCase();
  return auctionStatuses.includes(status) ? status : fallback;
}

function normalizeShopifyProductId(value) {
  const raw = text(value, 80);
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function hashValue(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cleanBidMessage(value) {
  const raw = text(value, 120)
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim();
  if (!raw) return { message: "", status: "APPROVED" };
  const bad = bannedMessagePatterns.some((pattern) => pattern.test(raw));
  const tooLoud = raw.length > 18 && raw === raw.toUpperCase();
  return {
    message: bad ? "" : raw,
    status: bad || tooLoud ? "HIDDEN" : "APPROVED"
  };
}

function publicBidderName(bid) {
  const source = text(bid.customer_name, 80) || text((bid.customer_email || "").split("@")[0], 80) || "Bieder";
  const first = source.split(/\s+/)[0] || "Bieder";
  if (first.length <= 2) return `${first[0] || "B"}***`;
  return `${first[0]}${"*".repeat(Math.min(3, first.length - 1))}${first.slice(-1)}`;
}

function publicBid(bid) {
  return {
    id: bid.id,
    bidder: publicBidderName(bid),
    amountCents: Number(bid.amount_cents || 0),
    amountLabel: formatEuro(Number(bid.amount_cents || 0)),
    status: bid.status,
    message: bid.message_status === "APPROVED" ? bid.message || "" : "",
    createdAt: bid.created_at
  };
}

function liveStatusFor(auction, at = new Date()) {
  if (!auction) return "DRAFT";
  if (["AWARDED", "CANCELLED"].includes(auction.status)) return auction.status;
  const now = at.getTime();
  const starts = new Date(auction.starts_at).getTime();
  const ends = new Date(auction.ends_at).getTime();
  if (Number.isFinite(ends) && ends <= now) return "ENDED";
  if (auction.status === "LIVE" && Number.isFinite(starts) && starts <= now) return "LIVE";
  return auction.status;
}

function highestBid(auctionId) {
  return db.prepare(`
    SELECT *
    FROM auction_bids
    WHERE auction_id = ? AND status IN ('WINNING', 'WINNER')
    ORDER BY amount_cents DESC, created_at ASC
    LIMIT 1
  `).get(auctionId) || null;
}

function bidCount(auctionId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM auction_bids
    WHERE auction_id = ? AND status IN ('WINNING', 'OUTBID', 'WINNER')
  `).get(auctionId)?.count || 0);
}

export function syncAuctionStatuses() {
  const at = nowIso();
  db.prepare(`
    UPDATE auctions
    SET status = 'ENDED', updated_at = ?
    WHERE status = 'LIVE' AND ends_at <= ?
  `).run(at, at);
}

export function publicAuction(auction) {
  if (!auction) return null;
  const bid = auction.highest_bid_id ? auction : highestBid(auction.id);
  const currentBidCents = Number(bid?.amount_cents || 0);
  const minimumBidCents = currentBidCents
    ? currentBidCents + Number(auction.bid_step_cents || 100)
    : Number(auction.start_price_cents || 0);
  const status = liveStatusFor(auction);
  return {
    id: auction.id,
    shopifyProductId: auction.shopify_product_id,
    productHandle: auction.product_handle || "",
    productTitle: auction.product_title || auction.title,
    productImageUrl: auction.product_image_url || "",
    title: auction.title,
    description: auction.description || "",
    status,
    startsAt: auction.starts_at,
    endsAt: auction.ends_at,
    startPriceCents: Number(auction.start_price_cents || 0),
    startPriceLabel: formatEuro(Number(auction.start_price_cents || 0)),
    bidStepCents: Number(auction.bid_step_cents || 0),
    bidStepLabel: formatEuro(Number(auction.bid_step_cents || 0)),
    currentBidCents,
    currentBidLabel: currentBidCents ? formatEuro(currentBidCents) : "",
    minimumBidCents,
    minimumBidLabel: formatEuro(minimumBidCents),
    bidCount: Number(auction.bid_count ?? bidCount(auction.id)),
    canBid: status === "LIVE",
    winnerSelected: Boolean(auction.winner_bid_id)
  };
}

export function publicAuctionWithBids(auction, { shopifyCustomerId = "", limit = 8 } = {}) {
  const publicData = publicAuction(auction);
  if (!publicData) return null;
  const bids = listAuctionBids(auction.id, limit);
  const ownBid = shopifyCustomerId
    ? db.prepare(`
      SELECT *
      FROM auction_bids
      WHERE auction_id = ? AND shopify_customer_id = ? AND status IN ('WINNING', 'OUTBID', 'WINNER')
      ORDER BY amount_cents DESC, created_at DESC
      LIMIT 1
    `).get(auction.id, String(shopifyCustomerId))
    : null;
  return {
    ...publicData,
    bids: bids.filter((bid) => bid.status !== "VOID").map(publicBid),
    viewer: ownBid ? {
      hasBid: true,
      isWinning: ownBid.status === "WINNING" || ownBid.status === "WINNER",
      amountCents: Number(ownBid.amount_cents || 0),
      amountLabel: formatEuro(Number(ownBid.amount_cents || 0)),
      status: ownBid.status
    } : { hasBid: false, isWinning: false, amountCents: 0, amountLabel: "", status: "" }
  };
}

export function getAuction(idValue) {
  const auction = db.prepare("SELECT * FROM auctions WHERE id = ?").get(idValue);
  return auction || null;
}

export function listAuctions({ status = "", publicOnly = false, limit = 80 } = {}) {
  syncAuctionStatuses();
  const statuses = String(status || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => auctionStatuses.includes(item));
  const params = [];
  const where = [];
  if (statuses.length) {
    where.push(`a.status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  if (publicOnly) {
    where.push("a.status IN ('LIVE', 'ENDED', 'AWARDED')");
  }
  params.push(Math.max(1, Math.min(Number(limit || 80), 200)));
  return db.prepare(`
    SELECT a.*,
      COUNT(b.id) AS bid_count,
      hb.id AS highest_bid_id,
      hb.amount_cents,
      hb.customer_email AS highest_customer_email,
      hb.customer_name AS highest_customer_name
    FROM auctions a
    LEFT JOIN auction_bids b ON b.auction_id = a.id AND b.status IN ('WINNING', 'OUTBID', 'WINNER')
    LEFT JOIN auction_bids hb ON hb.id = (
      SELECT id FROM auction_bids
      WHERE auction_id = a.id AND status IN ('WINNING', 'WINNER')
      ORDER BY amount_cents DESC, created_at ASC
      LIMIT 1
    )
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY a.id
    ORDER BY
      CASE a.status WHEN 'LIVE' THEN 0 WHEN 'DRAFT' THEN 1 WHEN 'ENDED' THEN 2 WHEN 'AWARDED' THEN 3 ELSE 4 END,
      a.ends_at ASC
    LIMIT ?
  `).all(...params);
}

export function getAuctionByProduct(shopifyProductId) {
  syncAuctionStatuses();
  const productId = normalizeShopifyProductId(shopifyProductId);
  const auction = db.prepare(`
    SELECT *
    FROM auctions
    WHERE shopify_product_id = ?
      AND status IN ('LIVE', 'DRAFT', 'ENDED', 'AWARDED')
    ORDER BY
      CASE status WHEN 'LIVE' THEN 0 WHEN 'DRAFT' THEN 1 WHEN 'ENDED' THEN 2 WHEN 'AWARDED' THEN 3 ELSE 4 END,
      ends_at ASC
    LIMIT 1
  `).get(productId);
  return auction || null;
}

export function createAuction(input = {}) {
  const now = nowIso();
  const shopifyProductId = normalizeShopifyProductId(input.shopifyProductId);
  const title = text(input.title, 140);
  const productTitle = text(input.productTitle || title, 140);
  const startsAt = text(input.startsAt || now, 40);
  const endsAt = text(input.endsAt, 40);
  if (!shopifyProductId) throw new Error("Kies een Shopify product voor deze veiling.");
  if (!title) throw new Error("Vul een veilingtitel in.");
  if (!endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("Eindtijd moet na de starttijd liggen.");
  }
  const activeDuplicate = db.prepare(`
    SELECT id FROM auctions
    WHERE shopify_product_id = ? AND status IN ('DRAFT', 'LIVE', 'ENDED')
    LIMIT 1
  `).get(shopifyProductId);
  if (activeDuplicate) throw new Error("Dit product heeft al een open veiling.");

  const auction = {
    id: id(),
    shopify_product_id: shopifyProductId,
    product_handle: text(input.productHandle, 160),
    product_title: productTitle,
    product_image_url: text(input.productImageUrl, 600),
    title,
    description: text(input.description, 900),
    start_price_cents: moneyCents(input.startPrice, 0),
    bid_step_cents: Math.max(100, moneyCents(input.bidStep, 100)),
    reserve_price_cents: moneyCents(input.reservePrice, 0),
    starts_at: startsAt,
    ends_at: endsAt,
    status: normalizedStatus(input.status),
    winner_bid_id: null,
    winner_note: "",
    awarded_at: null,
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO auctions (
      id, shopify_product_id, product_handle, product_title, product_image_url, title, description,
      start_price_cents, bid_step_cents, reserve_price_cents, starts_at, ends_at, status,
      winner_bid_id, winner_note, awarded_at, created_at, updated_at
    ) VALUES (
      @id, @shopify_product_id, @product_handle, @product_title, @product_image_url, @title, @description,
      @start_price_cents, @bid_step_cents, @reserve_price_cents, @starts_at, @ends_at, @status,
      @winner_bid_id, @winner_note, @awarded_at, @created_at, @updated_at
    )
  `).run(auction);
  return auction;
}

export function updateAuction(idValue, input = {}) {
  const auction = getAuction(idValue);
  if (!auction) throw new Error("Veiling niet gevonden.");
  if (auction.status === "AWARDED") throw new Error("Een afgeronde veiling kan niet meer worden aangepast.");
  const startsAt = text(input.startsAt || auction.starts_at, 40);
  const endsAt = text(input.endsAt || auction.ends_at, 40);
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("Eindtijd moet na de starttijd liggen.");
  }
  const next = {
    id: auction.id,
    product_handle: text(input.productHandle ?? auction.product_handle, 160),
    product_title: text(input.productTitle ?? auction.product_title, 140),
    product_image_url: text(input.productImageUrl ?? auction.product_image_url, 600),
    title: text(input.title ?? auction.title, 140),
    description: text(input.description ?? auction.description, 900),
    start_price_cents: moneyCents(input.startPrice, auction.start_price_cents),
    bid_step_cents: Math.max(100, moneyCents(input.bidStep, auction.bid_step_cents)),
    reserve_price_cents: moneyCents(input.reservePrice, auction.reserve_price_cents),
    starts_at: startsAt,
    ends_at: endsAt,
    status: normalizedStatus(input.status, auction.status),
    updated_at: nowIso()
  };
  db.prepare(`
    UPDATE auctions
    SET product_handle = @product_handle,
        product_title = @product_title,
        product_image_url = @product_image_url,
        title = @title,
        description = @description,
        start_price_cents = @start_price_cents,
        bid_step_cents = @bid_step_cents,
        reserve_price_cents = @reserve_price_cents,
        starts_at = @starts_at,
        ends_at = @ends_at,
        status = @status,
        updated_at = @updated_at
    WHERE id = @id
  `).run(next);
  return getAuction(idValue);
}

export function listAuctionBids(auctionId, limit = 80) {
  return db.prepare(`
    SELECT *
    FROM auction_bids
    WHERE auction_id = ?
    ORDER BY amount_cents DESC, created_at ASC
    LIMIT ?
  `).all(auctionId, Math.max(1, Math.min(Number(limit || 80), 200)));
}

export function placeAuctionBid(auctionId, input = {}) {
  const amountCents = moneyCents(input.amount, 0);
  const shopifyCustomerId = text(input.shopifyCustomerId, 80);
  const customerEmail = text(input.customerEmail, 160).toLowerCase();
  const customerName = text(input.customerName, 140);
  const bidMessage = cleanBidMessage(input.message);
  if (!shopifyCustomerId || !customerEmail) throw new Error("Log in voordat je biedt.");
  if (amountCents <= 0) throw new Error("Vul een geldig bod in.");

  db.exec("BEGIN IMMEDIATE");
  try {
    const auction = db.prepare("SELECT * FROM auctions WHERE id = ?").get(auctionId);
    if (!auction) throw new Error("Veiling niet gevonden.");
    const status = liveStatusFor(auction);
    if (status !== "LIVE") throw new Error("Deze veiling staat niet open voor biedingen.");
    const current = highestBid(auction.id);
    const minimum = current
      ? Number(current.amount_cents || 0) + Number(auction.bid_step_cents || 100)
      : Number(auction.start_price_cents || 0);
    if (amountCents < minimum) throw new Error(`Minimum bod is ${formatEuro(minimum)}.`);
    if (current?.shopify_customer_id === shopifyCustomerId && Number(current.amount_cents || 0) >= amountCents) {
      throw new Error("Je hebt al het hoogste bod.");
    }

    db.prepare(`
      UPDATE auction_bids
      SET status = 'OUTBID'
      WHERE auction_id = ? AND status = 'WINNING'
    `).run(auction.id);

    const bid = {
      id: id(),
      auction_id: auction.id,
      shopify_customer_id: shopifyCustomerId,
      customer_email: customerEmail,
      customer_name: customerName,
      amount_cents: amountCents,
      status: "WINNING",
      message: bidMessage.message,
      message_status: bidMessage.status,
      ip_hash: hashValue(input.ip || ""),
      user_agent_hash: hashValue(input.userAgent || ""),
      created_at: nowIso()
    };
    db.prepare(`
      INSERT INTO auction_bids (
        id, auction_id, shopify_customer_id, customer_email, customer_name,
        amount_cents, status, message, message_status, ip_hash, user_agent_hash, created_at
      ) VALUES (
        @id, @auction_id, @shopify_customer_id, @customer_email, @customer_name,
        @amount_cents, @status, @message, @message_status, @ip_hash, @user_agent_hash, @created_at
      )
    `).run(bid);
    const now = nowIso();
    const endsAt = new Date(auction.ends_at).getTime();
    const shouldExtend = Number.isFinite(endsAt) && endsAt - Date.now() > 0 && endsAt - Date.now() <= 60_000;
    const nextEndsAt = shouldExtend ? new Date(Date.now() + 120_000).toISOString() : auction.ends_at;
    db.prepare("UPDATE auctions SET ends_at = ?, updated_at = ? WHERE id = ?").run(nextEndsAt, now, auction.id);
    db.exec("COMMIT");
    return { auction: getAuction(auction.id), bid };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateAuctionBidModeration(bidId, { status = "", messageStatus = "" } = {}) {
  const bid = db.prepare("SELECT * FROM auction_bids WHERE id = ?").get(bidId);
  if (!bid) throw new Error("Bod niet gevonden.");
  const nextStatus = text(status, 20).toUpperCase();
  const nextMessageStatus = text(messageStatus, 20).toUpperCase();
  const updates = [];
  const params = [];
  if (auctionBidStatuses.includes(nextStatus)) {
    updates.push("status = ?");
    params.push(nextStatus);
  }
  if (["APPROVED", "HIDDEN"].includes(nextMessageStatus)) {
    updates.push("message_status = ?");
    params.push(nextMessageStatus);
  }
  if (!updates.length) return bid;
  params.push(bid.id);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE auction_bids SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    if (nextStatus === "VOID" && bid.status === "WINNING") {
      const nextWinning = db.prepare(`
        SELECT id
        FROM auction_bids
        WHERE auction_id = ? AND status = 'OUTBID'
        ORDER BY amount_cents DESC, created_at ASC
        LIMIT 1
      `).get(bid.auction_id);
      if (nextWinning) db.prepare("UPDATE auction_bids SET status = 'WINNING' WHERE id = ?").run(nextWinning.id);
    }
    db.prepare("UPDATE auctions SET updated_at = ? WHERE id = ?").run(nowIso(), bid.auction_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM auction_bids WHERE id = ?").get(bid.id);
}

export function awardAuctionWinner(auctionId, { bidId = "", note = "" } = {}) {
  const auction = getAuction(auctionId);
  if (!auction) throw new Error("Veiling niet gevonden.");
  if (auction.status === "CANCELLED") throw new Error("Geannuleerde veiling heeft geen winnaar.");
  const bid = bidId
    ? db.prepare("SELECT * FROM auction_bids WHERE id = ? AND auction_id = ?").get(bidId, auction.id)
    : highestBid(auction.id);
  if (!bid) throw new Error("Geen geldig bod gevonden.");
  const now = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE auction_bids
      SET status = CASE WHEN id = ? THEN 'WINNER' ELSE CASE WHEN status = 'WINNING' THEN 'OUTBID' ELSE status END END
      WHERE auction_id = ?
    `).run(bid.id, auction.id);
    db.prepare(`
      UPDATE auctions
      SET status = 'AWARDED',
          winner_bid_id = ?,
          winner_note = ?,
          awarded_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(bid.id, text(note, 700), now, now, auction.id);
    db.exec("COMMIT");
    return { auction: getAuction(auction.id), bid: db.prepare("SELECT * FROM auction_bids WHERE id = ?").get(bid.id) };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cancelAuction(auctionId, note = "") {
  const auction = getAuction(auctionId);
  if (!auction) throw new Error("Veiling niet gevonden.");
  if (auction.status === "AWARDED") throw new Error("Een toegewezen winnaar kan niet via annuleren worden overschreven.");
  db.prepare(`
    UPDATE auctions
    SET status = 'CANCELLED', winner_note = ?, updated_at = ?
    WHERE id = ?
  `).run(text(note, 700), nowIso(), auction.id);
  db.prepare("UPDATE auction_bids SET status = 'VOID' WHERE auction_id = ? AND status IN ('WINNING', 'OUTBID')").run(auction.id);
  return getAuction(auction.id);
}
