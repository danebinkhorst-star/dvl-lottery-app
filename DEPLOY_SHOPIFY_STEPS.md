# DVL Lottery App snel live zetten

Doel: de custom lottery app echt laten werken met Shopify orders.

## Snelste correcte route

De app hoeft niet eerst embedded in Shopify Admin te staan om loten automatisch te verwerken. Voor de MVP is dit genoeg:

1. App online zetten op een publieke HTTPS-url.
2. Env vars instellen.
3. Shopify webhooks registreren.
4. Testorder plaatsen vanaf EUR 70.
5. Controleren in `https://jouw-app-url/admin`.

## Vereiste env vars

```txt
SHOPIFY_SHOP=de-vlees-loterij.myshopify.com
SHOPIFY_API_VERSION=2026-04
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_WEBHOOK_SECRET=...
PUBLIC_APP_URL=https://jouw-app-url
SQLITE_PATH=/app/storage/dvl-lottery.db
LOT_RULE_MODE=ORDER_MINIMUM
LOT_ORDER_MINIMUM_CENTS=7000
LOT_PER_CENTS=7000
FREE_ENTRY_ENABLED=true
```

Gebruik voor `SHOPIFY_WEBHOOK_SECRET` dezelfde secret als de Shopify app secret.

## Na deploy

```bash
npm run db:push
npm run db:ensure-live-draw
npm run register:webhooks
```

## Test

1. Open `/admin` op de app-url.
2. Maak of gebruik de live winactie.
3. Plaats in Shopify een testorder vanaf EUR 70.
4. Betaal/markeer als betaald.
5. Check of de order onder "Laatste orders" staat.
6. Check of er 1 actief lot is aangemaakt.
7. Refund/cancel de testorder.
8. Check of het lot ongeldig wordt.

## Later embedded maken

Voor een app die echt als Shopify Admin app opent, bouwen we daarna OAuth + embedded Shopify admin UI. Dat is een aparte stap bovenop deze werkende backend.
