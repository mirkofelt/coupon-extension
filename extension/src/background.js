const REFRESH_ALARM = "coupon-refresh";
const MAO_HOSTNAME = "mitarbeiterangebote.de";
const COND_RE = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?|gilt)\s+[^,\n]{3,80}/i;

const DEFAULT_SOURCES = [
  { id: "gutscheinpony", url: "https://www.gutscheinpony.com/gutscheine/", label: "Gutscheinpony", type: "generic", enabled: false },
  { id: "coupons-de", url: "https://www.coupons.de/", label: "Coupons.de", type: "generic", enabled: false },
  { id: "mydealz", url: "https://www.mydealz.de/gutscheine", label: "MyDealz Coupons", type: "generic", enabled: false },
  { id: "shoop", url: "https://www.shoop.de/gutscheine/", label: "Shoop", type: "generic", enabled: false },
  { id: "snipster", url: "https://www.snipster.de/", label: "Snipster", type: "generic", enabled: false },
];

chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 30 });

  const { sources } = await chrome.storage.sync.get("sources");
  if (!sources) {
    await chrome.storage.sync.set({ sources: DEFAULT_SOURCES, refreshIntervalHours: 24 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) backgroundRefreshAll();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VOUCHERS_UPDATED") {
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ ok: true });
  }
  if (msg.type === "VOUCHER_MATCH" && sender.tab?.id) {
    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId: sender.tab.id });
    chrome.action.setBadgeText({ text: "✓", tabId: sender.tab.id });
  }
  if (msg.type === "GET_VOUCHERS") {
    chrome.storage.local.get("vouchers").then(({ vouchers }) => {
      sendResponse({ vouchers: vouchers ?? [] });
    });
    return true;
  }
  if (msg.type === "REFRESH_SOURCE") {
    refreshSource(msg.source).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "SOURCE_ERROR") {
    chrome.storage.sync.get("sources").then(({ sources }) => {
      if (!sources) return;
      const updated = sources.map((s) =>
        s.url === msg.sourceUrl ? { ...s, lastError: msg.reason, lastErrorAt: Date.now() } : s
      );
      chrome.storage.sync.set({ sources: updated });
    });
  }
});

// --- Background refresh ---

async function backgroundRefreshAll() {
  const { sources, refreshIntervalHours } = await chrome.storage.sync.get(["sources", "refreshIntervalHours"]);
  if (!sources) return;

  const intervalMs = (refreshIntervalHours ?? 24) * 60 * 60 * 1000;
  const now = Date.now();

  for (const source of sources.filter((s) => s.enabled)) {
    if (source.lastRefreshed && now - source.lastRefreshed < intervalMs) continue;
    await refreshSource(source);
  }
}

async function refreshSource(source) {
  chrome.action.setBadgeText({ text: "↻" });
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

  let newVouchers = [];
  let scrapeError = null;
  try {
    if (source.url.includes(MAO_HOSTNAME)) {
      newVouchers = await scrapeMao(source.url);
    } else {
      newVouchers = await scrapeGeneric(source.url);
    }
  } catch (err) {
    scrapeError = err.reason ?? "unknown";
  }

  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });

  if (scrapeError || newVouchers.length === 0) {
    chrome.runtime.sendMessage({
      type: "SOURCE_ERROR",
      sourceUrl: source.url,
      reason: scrapeError ?? "no_results",
    }).catch(() => {});
    return;
  }

  const tagged = newVouchers.map((v) => ({ ...v, sourceUrl: source.url }));
  const { vouchers: existing } = await chrome.storage.local.get("vouchers");
  const kept = (existing ?? []).filter((v) => v.sourceUrl !== source.url);
  const updated = [...kept, ...tagged];

  await chrome.storage.local.set({ vouchers: updated });

  const { sources } = await chrome.storage.sync.get("sources");
  if (sources) {
    const updatedSources = sources.map((s) =>
      s.url === source.url ? { ...s, lastRefreshed: Date.now() } : s
    );
    await chrome.storage.sync.set({ sources: updatedSources });
  }

  chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: updated.length }).catch(() => {});
}

// --- MAO scraper ---

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDoc(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 429) {
        if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
        return null;
      }
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch {
      return null;
    }
  }
  return null;
}

function extractListItems(doc, origin) {
  return Array.from(doc.querySelectorAll(".cbg3-list-item[data-id]")).map((card) => {
    const href = card.querySelector("a[href*='/offer/']")?.getAttribute("href") ?? null;
    return {
      provider: card.querySelector("h3")?.textContent?.replace(/\s*[-–]\s*$/, "").trim() ?? null,
      discountText: card.querySelector(".cbg3-list-item--discount p")?.textContent?.trim() ?? null,
      offerPath: href ? href.replace(/\/cat\/\d+$/, "") : null,
    };
  }).filter((o) => o.provider && o.offerPath);
}

async function scrapeMao(sourceUrl) {
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
    if (doc) offers = offers.concat(extractListItems(doc, origin));
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
  const BATCH = 3;
  for (let i = 0; i < offers.length; i += BATCH) {
    if (i > 0) await sleep(400);
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

  return vouchers;
}

// --- Generic scraper ---

const DISCOUNT_SIGNAL = /(\d+[\.,]?\d*\s*%|\d+[\.,]?\d*\s*€|€\s*\d+[\.,]?\d*|gutschein|rabatt|voucher|cashback|bonus|sparen|vorteil|code\s*[:：]|deal)/i;
const CODE_PATTERN = /\b([A-Z][A-Z0-9]{3,19})\b/;
const CONDITION_PATTERN = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?)\s+[^,\n]{3,60}/i;

async function scrapeGeneric(sourceUrl) {
  const doc = await fetchDoc(sourceUrl);
  if (!doc) return [];

  const origin = new URL(sourceUrl).origin;
  const seen = new Set();
  const vouchers = [];

  for (const link of doc.querySelectorAll("a[href]")) {
    let domain;
    try {
      const u = new URL(link.href, sourceUrl);
      if (u.origin === origin || !u.protocol.startsWith("http")) continue;
      domain = u.hostname.replace(/^www\./, "");
    } catch { continue; }

    if (seen.has(domain)) continue;

    let node = link;
    let container = null;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      if (DISCOUNT_SIGNAL.test(node.textContent)) { container = node; break; }
      node = node.parentElement;
    }
    if (!container) continue;

    const discounts = [];
    for (const line of (container.innerText || container.textContent).split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 4 && l.length < 250)) {
      if (!DISCOUNT_SIGNAL.test(line)) continue;
      discounts.push({ text: line, code: line.match(CODE_PATTERN)?.[1] ?? null, conditions: line.match(CONDITION_PATTERN)?.[0] ?? null });
      if (discounts.length >= 5) break;
    }
    if (discounts.length === 0) continue;

    const heading = container.querySelector("h1,h2,h3,h4,h5,strong,b,[class*='title'],[class*='name'],[class*='brand']");
    const provider = (heading?.textContent?.trim() || link.textContent?.trim())?.replace(/\s+/g, " ").slice(0, 100);
    if (!provider || provider.length < 2) continue;

    seen.add(domain);
    vouchers.push({
      provider, providerUrl: link.href, providerDomain: domain,
      offerUrl: null, discounts, extractedAt: Date.now(),
    });
  }

  return vouchers;
}
