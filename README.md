# De Vlees Loterij Custom Lottery App

Custom MVP app for the DVL lottery/loyalty system.

## What this app does

- Tracks lottery entries in its own database.
- Grants entries from Shopify order webhooks.
- Current DVL rule: `1 gratis lot bij elke bestelling vanaf €70`.
- Supports a future `1 lot per €70` mode without rebuilding the app.
- Keeps active draws, entry numbers, winners and voided entries.
- Voids entries on cancelled/refunded orders.
- Exposes live draw data for theme sections.
- Provides a simple local admin dashboard at `/admin`.

## Why not Smile.io as the core

Smile-style loyalty apps are useful for classic points and discounts. DVL needs lottery entries, draw history, transparency, subscriptions, free entry compliance and a branded customer dashboard. This app keeps that logic owned by DVL.

## Local setup

```bash
cd dvl-lottery-app
copy .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open:

```txt
http://localhost:8787/admin
```

The MVP uses Node's built-in SQLite driver, so local setup stays lightweight. For production we can keep SQLite on a small VPS, or move the same data model to Postgres when volume grows.

## Shopify webhook setup

After deploying the app or running a public tunnel, set these in `.env`:

```txt
PUBLIC_APP_URL=https://your-public-url.com
SHOPIFY_ACCESS_TOKEN=...
SHOPIFY_WEBHOOK_SECRET=...
```

Then run:

```bash
npm run register:webhooks
```

This registers:

- `orders/paid`
- `orders/cancelled`
- `refunds/create`

## Important next build steps

1. Add authentication to the admin dashboard.
2. Add a free participation form and rules page.
3. Add subscription source entries.
4. Build the customer account dashboard extension.
5. Add audit export for each draw.
6. Add theme sections that call `/api/draws/live`.

## Legal note

This app supports the technical foundation. The final lottery rules, free-entry route and prize communication should be checked legally before going live.
