# DVL Lottery Shopify Embed

Public widget script:

```html
<script async src="https://dvl-lottery-app.onrender.com/embed/dvl-lottery.js"></script>
```

Live winacties:

```html
<div data-dvl-lottery="live"></div>
```

Gratis deelname:

```html
<div data-dvl-lottery="free-entry"></div>
```

Klantdashboard voorbereiding:

```html
<div data-dvl-lottery="customer"></div>
```

The personal customer entry endpoint is protected with a signed token. Do not expose customer lot numbers from Liquid without a Shopify app proxy or a Customer Account extension that can safely sign requests.
