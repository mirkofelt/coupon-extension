const ADAC_BFF_URL = "https://www.adac.de/bff/";
const ADAC_OFFER_BASE = "https://www.adac.de/mitgliedschaft/vorteilswelt/vorteilssuche/";
const ADAC_DOMAIN_RE = /\b([a-z0-9-]+\.(de|com|eu|at|ch|net|org))\b/i;
const ADAC_SUFFIX_RE = /\s+(?:\d[\d,.]* ?%|bis zu|ab |€|\d+ ?€|Rabatt|Ersparnis|Vorteil|Gutschein).*/i;

export async function scrapeAdac() {
  const query = `{ loyaltySearch(params: { kategorien: [], rows: "500", sort: POPULAR_ASC }) { numResult items { id headline description discount } } }`;
  let data;
  try {
    const res = await fetch(ADAC_BFF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw Object.assign(new Error(), { reason: "http_error", status: res.status, count: 1 });
    data = await res.json();
  } catch (err) {
    if (err.reason) throw err;
    throw Object.assign(new Error(), { reason: "network" });
  }

  const items = data?.data?.loyaltySearch?.items;
  if (!items?.length) throw Object.assign(new Error(), { reason: "no_items" });

  const { blockedKeywords } = await chrome.storage.sync.get("blockedKeywords");

  return items
    .filter((item) => {
      if (!blockedKeywords?.length) return true;
      const name = item.headline.toLowerCase();
      return !blockedKeywords.some((kw) => name.includes(kw));
    })
    .map((item) => {
      const domainMatch = item.headline.match(ADAC_DOMAIN_RE) ?? item.description?.match(ADAC_DOMAIN_RE);
      const providerDomain = domainMatch ? domainMatch[1].toLowerCase() : null;
      const provider = item.headline.replace(ADAC_SUFFIX_RE, "").trim();
      return {
        provider,
        providerUrl: null,
        providerDomain,
        offerUrl: `${ADAC_OFFER_BASE}${item.id}/`,
        discounts: [{ text: item.discount || item.headline, code: null, conditions: null }],
        extractedAt: Date.now(),
      };
    });
}
