# Meat For Free Lottery Shopify Embed

Public widget script:

```html
<script async src="https://dvl-lottery-app.onrender.com/embed/dvl-lottery.js"></script>
```

Live winacties:

```html
<div data-dvl-lottery="live"></div>
```

Cart voortgang naar gratis lot:

```html
<div data-dvl-lottery="cart"></div>
```

This widget reads Shopify's same-origin `/cart.js`. Use it as a direct script embed in the Shopify cart/cart drawer, not inside a cross-origin iframe.

Laatste winnaars:

```html
<div data-dvl-lottery="winners"></div>
```

Gratis deelname:

```html
<div data-dvl-lottery="free-entry"></div>
```

Klantdashboard voorbereiding:

```html
<div
  data-dvl-lottery="customer"
  data-shopify-customer-id="{{ customer.id }}"
  data-customer-token="{{ customer.metafields.mff.dashboard_token }}"
></div>
```

The personal customer entry endpoint is protected with a signed token. Do not expose customer lot numbers from Liquid without a Shopify app proxy or a Customer Account extension that can safely sign requests.

Productpagina mini-blok:

```html
<div data-dvl-lottery="pdp" data-product-price-cents="{{ product.price }}"></div>
```

Use this near the product form to show whether the current product already qualifies the order for a free lottery ticket.
