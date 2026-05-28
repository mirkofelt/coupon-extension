const ADAC_BFF_URL = "https://www.adac.de/bff/";
const ADAC_OFFER_BASE = "https://www.adac.de/mitgliedschaft/vorteilswelt/vorteilssuche/";
const ADAC_DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*\.(de|com|eu|at|ch|net|org|io|shop|co))\b/i;
const ADAC_SUFFIX_RE = /\s+(?:\d[\d,.]* ?%|bis zu|ab |€|\d+ ?€|Rabatt|Ersparnis|Vorteil|Gutschein).*/i;
const ADAC_HOST_RE = /adac\.de/i;
const BATCH = 5;
const BATCH_DELAY = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveAdacDomain(offerId) {
  try {
    const res = await fetch(`${ADAC_OFFER_BASE}${offerId}/`, {
      credentials: "include",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // data-href="https://..." — same pattern as MAO-style partner pages
    const m1 = html.match(/data-href="(https?:\/\/[^"]{8,300})"/);
    if (m1 && !ADAC_HOST_RE.test(m1[1])) {
      try { return new URL(m1[1]).hostname.replace(/^www\./, ""); } catch {}
    }

    // targetUrl / redirectUrl / partnerUrl in inline JSON or data attributes
    const m2 = html.match(/(?:targetUrl|redirectUrl|partnerUrl|shopUrl|externalUrl)[^"]*?"(https?:\/\/[^"]{8,300})"/);
    if (m2 && !ADAC_HOST_RE.test(m2[1])) {
      try { return new URL(m2[1]).hostname.replace(/^www\./, ""); } catch {}
    }

    // __NEXT_DATA__ JSON: first non-ADAC https URL in the page props
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nd) {
      try {
        const urlMatch = nd[1].match(/"(https?:\/\/(?![^"]*adac\.de)[a-z0-9][a-z0-9.-]{2,60}\.[a-z]{2,}(?:\/[^"]{0,200})?)"/i);
        if (urlMatch) return new URL(urlMatch[1]).hostname.replace(/^www\./, "");
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

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

  const mapped = items
    .filter((item) => {
      if (!blockedKeywords?.length) return true;
      const name = item.headline.toLowerCase();
      return !blockedKeywords.some((kw) => name.includes(kw));
    })
    .map((item) => {
      const domainMatch = item.headline.match(ADAC_DOMAIN_RE) ?? item.description?.match(ADAC_DOMAIN_RE);
      const provider = item.headline.replace(ADAC_SUFFIX_RE, "").trim();
      return {
        _id: item.id,
        provider,
        providerUrl: null,
        providerDomain: domainMatch ? domainMatch[1].toLowerCase() : null,
        offerUrl: `${ADAC_OFFER_BASE}${item.id}/`,
        discounts: [{ text: item.discount || item.headline, code: null, conditions: null }],
        extractedAt: Date.now(),
      };
    });

  // Fetch detail pages in batches for items that have no domain yet
  const needsDomain = mapped.filter((v) => !v.providerDomain);
  for (let i = 0; i < needsDomain.length; i += BATCH) {
    if (i > 0) await sleep(BATCH_DELAY);
    await Promise.all(
      needsDomain.slice(i, i + BATCH).map(async (v) => {
        const domain = await resolveAdacDomain(v._id);
        if (domain) v.providerDomain = domain;
      })
    );
  }

  return mapped.map(({ _id, ...rest }) => rest);
}
