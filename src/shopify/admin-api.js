import { config } from "../config.js";

let cachedToken = "";

async function getAccessToken() {
  if (config.SHOPIFY_ACCESS_TOKEN) return config.SHOPIFY_ACCESS_TOKEN;
  if (cachedToken) return cachedToken;
  if (!config.SHOPIFY_CLIENT_ID || !config.SHOPIFY_CLIENT_SECRET) {
    throw new Error("Set SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.SHOPIFY_CLIENT_ID,
    client_secret: config.SHOPIFY_CLIENT_SECRET
  });
  const response = await fetch(`https://${config.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || JSON.stringify(data));
  }
  cachedToken = data.access_token;
  return cachedToken;
}

export async function shopifyRest(path, options = {}) {
  const accessToken = await getAccessToken();
  const url = `https://${config.SHOPIFY_SHOP}/admin/api/${config.SHOPIFY_API_VERSION}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(JSON.stringify(data.errors || data));
  }
  return data;
}

export async function shopifyGraphql(query, variables = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://${config.SHOPIFY_SHOP}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors || payload));
  }
  return payload.data || {};
}
