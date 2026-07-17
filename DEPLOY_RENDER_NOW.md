# Deploy DVL Lottery App on Render

This is the recommended fast route for the current MVP because it gives us:

- public HTTPS URL
- persistent disk for SQLite
- always-on webhook endpoint
- simple logs for testing Shopify orders

## 1. Put this folder in GitHub

Create a new GitHub repo containing only:

```txt
dvl-lottery-app/
```

Do not upload `.env`, `data/`, `node_modules/`, or logs. `.gitignore` already blocks them.

## 2. Create Render service

Go to:

```txt
https://dashboard.render.com/blueprints
```

Click:

```txt
New Blueprint Instance
```

Connect the GitHub repo with `dvl-lottery-app`.

Render will read:

```txt
render.yaml
```

## 3. Fill required secrets

In Render, set these env vars:

```txt
ADMIN_PASSWORD=make-a-strong-password
ADMIN_SESSION_SECRET=generate-a-long-random-value
INTERNAL_API_SECRET=generate-a-different-long-random-value
CUSTOMER_TOKEN_SECRET=generate-a-different-long-random-value
FREE_ENTRY_HASH_SECRET=generate-a-different-long-random-value
SHOPIFY_CLIENT_ID=from Shopify custom app
SHOPIFY_CLIENT_SECRET=from Shopify custom app
SHOPIFY_WEBHOOK_SECRET=same value as Shopify client secret for this custom app
PUBLIC_APP_URL=https://your-render-url.onrender.com
```

Do not reuse these secrets. The app refuses to start in production when any required secret is missing.

Keep:

```txt
SQLITE_PATH=/app/storage/dvl-lottery.db
LOT_ORDER_MINIMUM_CENTS=7000
```

## 4. Deploy

Click:

```txt
Apply
```

Wait until Render shows:

```txt
Live
```

## 5. Initialize app on Render shell

Open Render service > Shell.

Run:

```bash
npm run db:push
npm run db:ensure-live-draw
npm run register:webhooks
```

## 6. Verify

Open:

```txt
https://your-render-url.onrender.com/health
https://your-render-url.onrender.com/admin
```

The admin page should ask for login:

```txt
username: dvl
password: the ADMIN_PASSWORD you set
```

## 7. Live Shopify test

1. Place a Shopify test order from EUR 70 or more.
2. Mark it as paid.
3. Open the Render app admin.
4. Confirm one order and one lot appear.
5. Cancel/refund the test order.
6. Confirm the lot becomes void.
