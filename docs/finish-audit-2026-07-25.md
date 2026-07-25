# Meat For Free Finish Audit - 2026-07-25

## Verdict

Meat For Free is now much closer to launch-ready on the technical side. The admin/account base is real, the lottery logic is tested, product sync is live, and the most important self-contained security/ops gaps from the audit have been built locally.

The remaining blocker is not more styling. The project still needs a real production proof:

`Shopify paid order -> webhook -> loten -> customer/admin sync -> refund/cancel void -> winner/public widgets`

Until that path is proven on the live shop, it should not be considered fully finished.

## Evidence Snapshot

- Render health: `https://dvl-lottery-app.onrender.com/health` returned `ok: true`, app `mff-lottery-app`, dashboard `brand-secure-admin-v2`, security build `team-access-v2`.
- Render deployment: app changes were pushed to `main` and the live app returned stable `ok: true` health after restart.
- Live embed hardening verified: `/embed/frame?widget=winners` sends Shopify `frame-ancestors` CSP and no `X-Frame-Options`.
- Live site summary: `1 gratis lot bij bestelling vanaf EUR 70`, free entry enabled, product sync has `100` products available and `stale: false`.
- Live draw: `Actieve maandtrekking`, prize `Premium vleespakket`, but `entryCount: 0`.
- Live winners: `0`.
- Shopify helper has live API access to `de-vlees-loterij.myshopify.com`, plan `Development`, token source `client_credentials`.
- Authenticated storefront QA passed for home, PDP, search and cart on desktop/mobile: no horizontal overflow, PDP title visible, delivery note spacing fixed, and main product surfaces loaded.
- Known storefront gap: empty cart copy is still English. Current checked source does not contain the cart/locale file needed to fix it safely.
- Known theme source fix: footer black strip source was removed in `live-theme-working`, but this source change still needs Shopify deployment.
- Tests after hardening: `npm test` passed `29/29`.
- Dependency audit after hardening: `npm audit --omit=dev` returned `0` vulnerabilities.
- Local commerce proof script passed: one entry created, duplicate order skipped, refund/cancel voided the entry.

## Finish Score

| Dimension | Score | Reason |
| --- | ---: | --- |
| Backend lottery logic | 3/4 | Strong tests and local commerce proof. Needs live Shopify paid-order proof. |
| Admin scalability | 3.5/4 | Team accounts, roles, 2FA, invites, resets, sessions, audit logs and export controls exist. Email provider delivery is still external. |
| Security | 3.5/4 | CSRF, rate limits, IP duplicate controls, HMAC, upload content validation, embed CSP and PII export protection are covered. Shopify runtime scopes still need least-privilege cleanup. |
| Storefront UX | 3/4 | Authenticated desktop/mobile smoke passed. Remaining issues are deployment/state cleanup, English cart-empty copy and final visual pass. |
| Data readiness | 2.5/4 | Product data is real. Draw/winner/order data still needs real customer/order volume. |
| Operations | 3/4 | Backup, restore, pruning and proof scripts exist. Needs scheduled backups/alerts and live restore drill. |

Current readiness: **18.5/24**. The build is solid; the live launch proof and production owner settings are the remaining heavy items.

## Completed In This Pass

### Security and permissions

- PII CSV export now requires `view_entries`, not just draw access.
- CSV exports now write an audit log with row count and `includesPii: true`.
- `/sync-products` permission ordering is fixed so it requires product access.
- Spoofed image uploads are rejected by magic-byte validation and logged as rejected uploads.
- Embed iframe response no longer sends invalid `X-Frame-Options: ALLOWALL`.
- Embed iframe response now uses CSP `frame-ancestors` for Shopify/admin origins.
- Production no longer silently auto-creates a generic live draw when `AUTO_CREATE_LIVE_DRAW=false`.

### Accounts and admin workflow

- Invite and reset link pages now include a prefilled mail action, so admin can prepare a secure one-time email without copying links by hand.
- Reset flows now carry the user email through the admin page.
- Export button is hidden for admins without entry export access.

### Operations

- Added `npm run db:backup` for consistent SQLite snapshots.
- Added `npm run db:restore -- --force` with backup-before-restore behavior.
- Added optional encrypted backups via `BACKUP_ENCRYPTION_KEY`.
- Added `npm run data:prune` with dry-run support for analytics/security/audit retention.
- Added `npm run proof:commerce-loop` for local or webhook-based order/idempotency/refund proof.

### QA

- Syntax checks passed for changed server/routes/services/scripts.
- Full test suite passed `29/29`.
- `npm audit --omit=dev` returned `0` vulnerabilities.
- Authenticated Shopify storefront smoke covered home, PDP, search and cart in mobile and desktop sizes.

## Still Needed Before Launch

### P0 - Live commerce proof

- Create a real paid Shopify test order above EUR 70.
- Confirm live webhook creates exactly one active lot.
- Confirm admin `/orders`, `/loten`, `/deelnemers`, KPIs and customer dashboard/metafields update.
- Cancel/refund that order and verify the lot is voided.
- Re-run reconcile/sync and verify idempotency.

### P0 - Production identity

- Connect final Meat For Free domain.
- Align public Shopify name, sender email, legal identity, checkout, shipping, taxes and payment settings.
- Move away from development-plan assumptions before public launch.

### P1 - External services

- Add transactional email delivery for invite/reset emails.
- Schedule encrypted backups and retention pruning.
- Add monitoring/alerts for failed webhooks, failed backups and stale product sync.
- Reduce Shopify runtime scopes to least privilege and keep theme/deploy credentials separate.

### P1 - Storefront source/deploy cleanup

- Deploy the footer source fix that removes the black strip from the zigzag transition.
- Fix English empty-cart copy once the canonical locale/cart source is found.
- Keep one canonical theme source folder and deploy checklist so live edits are traceable.

## Recommended Finish Order

1. Deploy the confirmed Shopify theme source fix only after a focused visual check.
2. Run the real live order proof.
3. Lock production identity/domain/settings.
4. Set up scheduled backups, email provider and monitoring.
5. Final authenticated visual QA pass across home, PDP, search/collection, cart, footer, widgets and customer dashboard.

## Links

- Live storefront: `https://de-vlees-loterij.myshopify.com/?pb=0`
- Render admin: `https://dvl-lottery-app.onrender.com/admin`
- Render winners widget: `https://dvl-lottery-app.onrender.com/embed/frame?widget=winners`
