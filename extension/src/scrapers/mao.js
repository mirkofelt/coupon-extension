import { sleep, fetchDoc, resetHttpErrors, checkHttpErrors } from "./utils.js";

const COND_RE = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?|gilt)\s+[^,\n]{3,80}/i;

function extractListItems(doc) {
  return Array.from(doc.querySelectorAll(".cbg3-list-item[data-id]")).map((card) => {
    const href = card.querySelector("a[href*='/offer/']")?.getAttribute("href") ?? null;
    return {
      provider: card.querySelector("h3")?.textContent?.replace(/\s*[-–]\s*$/, "").trim() ?? null,
      discountText: card.querySelector(".cbg3-list-item--discount p")?.textContent?.trim() ?? null,
      offerPath: href ? href.replace(/\/cat\/\d+$/, "") : null,
    };
  }).filter((o) => o.provider && o.offerPath);
}

export async function scrapeMao(sourceUrl) {
  resetHttpErrors();
  const origin = new URL(sourceUrl).origin;
  const homeDoc = await fetchDoc(origin + "/");
  if (!homeDoc) throw Object.assign(new Error(), { reason: "network" });

  const seen = new Set();
  const overviewUrls = Array.from(homeDoc.querySelectorAll("a[href^='/overview/']"))
    .map((a) => a.getAttribute("href"))
    .filter((h) => h && !h.includes("#") && !seen.has(h) && seen.add(h))
    .map((h) => origin + h);

  if (overviewUrls.length === 0) throw Object.assign(new Error(), { reason: "not_logged_in" });

  let offers = [];
  for (const url of overviewUrls) {
    const doc = await fetchDoc(url);
    if (doc) offers = offers.concat(extractListItems(doc));
  }

  if (offers.length === 0) throw Object.assign(new Error(), { reason: "no_items" });

  const seenPaths = new Set();
  offers = offers.filter((o) => {
    if (seenPaths.has(o.offerPath)) return false;
    seenPaths.add(o.offerPath);
    return true;
  });
  const seenProviders = new Set();
  offers = offers.filter((o) => {
    const key = o.provider?.toLowerCase().replace(/\s+/g, "") ?? o.offerPath;
    if (seenProviders.has(key)) return false;
    seenProviders.add(key);
    return true;
  });

  const { blockedKeywords } = await chrome.storage.sync.get("blockedKeywords");
  if (blockedKeywords?.length) {
    offers = offers.filter((o) => {
      const name = (o.provider ?? "").toLowerCase();
      return !blockedKeywords.some((kw) => name.includes(kw));
    });
  }

  const vouchers = [];
  const BATCH = 2;
  const BATCH_DELAY = 2000;
  for (let i = 0; i < offers.length; i += BATCH) {
    if (i > 0) await sleep(BATCH_DELAY);
    const results = await Promise.all(
      offers.slice(i, i + BATCH).map(async (offer) => {
        const doc = await fetchDoc(origin + offer.offerPath);
        if (!doc) return null;

        const extEl = doc.querySelector("[data-href^='http']");
        const providerUrl = extEl?.dataset?.href ?? null;
        let providerDomain = null;
        if (providerUrl) {
          try { providerDomain = new URL(providerUrl).hostname.replace(/^www\./, ""); } catch {}
        }

        let code = null;
        const couponBtn = doc.querySelector("[data-url*='/api/coupon'], [data-salesoptionid]");
        if (couponBtn) {
          const dataUrl = couponBtn.dataset.url ?? "";
          const ac = new URLSearchParams(dataUrl.split("?")[1] ?? "").get("ac");
          const offerId = couponBtn.dataset.offerid;
          const saleOptionId = couponBtn.dataset.salesoptionid;
          if (ac && offerId && saleOptionId) {
            try {
              const res = await fetch(`${origin}/api/coupon?ac=${ac}`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offerId, saleOptionId }),
              });
              const data = await res.json();
              if (data.success && data.code?.length > 0) code = data.code[0];
            } catch {}
          }
        }

        let conditions = null;
        for (const el of doc.querySelectorAll("p, li")) {
          const t = el.textContent.trim();
          if (t.length > 10 && t.length < 200 && COND_RE.test(t)) { conditions = t.slice(0, 150); break; }
        }

        const discounts = [];
        if (offer.discountText) {
          discounts.push({ text: offer.discountText, code: code ?? null, conditions: conditions ?? null });
        } else if (code) {
          discounts.push({ text: "Gutschein", code, conditions });
        }

        if (discounts.length === 0 && !providerDomain) return null;

        return {
          provider: offer.provider, providerUrl, providerDomain,
          offerUrl: origin + offer.offerPath, discounts, extractedAt: Date.now(),
        };
      })
    );
    vouchers.push(...results.filter(Boolean));
  }

  checkHttpErrors();
  return vouchers;
}
