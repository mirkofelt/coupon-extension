(() => {
  const BADGE_CLASS = "coupon-alert-badge";
  const MAO_HOSTNAME = "mitarbeiterangebote.de";
  const SCRAPE_COOLDOWN_MS = 30 * 60 * 1000;

  // --- Progress banner ---

  function setBanner(text, done = false) {
    let el = document.getElementById("coupon-alert-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "coupon-alert-banner";
      el.style.cssText = `
        position:fixed;top:16px;right:16px;z-index:2147483647;
        background:#1a1a2e;color:#e2e8f0;padding:10px 16px;border-radius:8px;
        font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.3);
        border-left:4px solid #f59e0b;min-width:220px;cursor:default;
      `;
      document.body?.appendChild(el);
    }
    el.textContent = `CouponAlert: ${text}`;
    el.style.borderLeftColor = done ? "#10b981" : "#f59e0b";
    if (done) setTimeout(() => el?.remove(), 4000);
  }

  // --- Site-specific: mitarbeiterangebote.de ---

  function isOnMaoSite() {
    return location.hostname.endsWith(MAO_HOSTNAME);
  }

  function isOnMaoListingPage() {
    return isOnMaoSite() && document.querySelector(".cbg3-global-banner[data-id]") !== null;
  }

  async function fetchDoc(urlOrPath) {
    const url = urlOrPath.startsWith("http") ? urlOrPath : location.origin + urlOrPath;
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch {
      return null;
    }
  }

  async function fetchCouponCode(ac, offerId, saleOptionId) {
    try {
      const res = await fetch(`${location.origin}/api/coupon?ac=${ac}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, saleOptionId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success && data.code?.length > 0) return data.code[0];
    } catch {}
    return null;
  }

  const COND_RE = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?|gilt)\s+[^,\n]{3,80}/i;

  async function processDetailDoc(doc) {
    const extEl = doc.querySelector("[data-href^='http']");
    const providerUrl = extEl?.dataset?.href ?? null;

    let code = null;
    const couponBtn = doc.querySelector("[data-url*='/api/coupon'], [data-salesoptionid]");
    if (couponBtn) {
      const dataUrl = couponBtn.dataset.url ?? "";
      const ac = new URLSearchParams(dataUrl.split("?")[1] ?? "").get("ac");
      const offerId = couponBtn.dataset.offerid;
      const saleOptionId = couponBtn.dataset.salesoptionid;
      if (ac && offerId && saleOptionId) {
        code = await fetchCouponCode(ac, offerId, saleOptionId);
      }
    }

    let conditions = null;
    for (const el of doc.querySelectorAll("p, li")) {
      const t = el.textContent.trim();
      if (t.length > 10 && t.length < 200 && COND_RE.test(t)) {
        conditions = t.slice(0, 150);
        break;
      }
    }

    return { providerUrl, code, conditions };
  }

  function extractOffersFromDoc(doc) {
    return Array.from(doc.querySelectorAll(".cbg3-global-banner[data-id]")).map((card) => ({
      provider: card.querySelector("h3")?.textContent?.trim() ?? null,
      discountText: card.querySelector(".cbg3-banner--discount p, .cbg3-banner--discount")?.textContent?.trim() ?? null,
      offerPath: card.querySelector("a[href*='/offer/']")?.getAttribute("href") ?? null,
    })).filter((o) => o.provider && o.offerPath);
  }

  function detectMaxPageFromDoc(doc, hostname) {
    const nums = Array.from(doc.querySelectorAll("a[href]"))
      .map((a) => { try { return new URL(a.href); } catch { return null; } })
      .filter((u) => u && u.hostname === hostname)
      .map((u) => parseInt(u.searchParams.get("page") ?? "0") || parseInt((u.pathname.match(/\/page\/(\d+)/) ?? [])[1] ?? "0"))
      .filter((n) => n > 0);
    return nums.length > 0 ? Math.max(...nums) : 1;
  }

  async function extractMaoVouchers() {
    // Page 1: use live DOM (works with JS-rendered content)
    setBanner(`Scanne Seite 1…`);
    let offers = extractOffersFromDoc(document);

    // Additional pages: fetch (server-rendered with ?page=N param)
    const maxPage = detectMaxPageFromDoc(document, location.hostname);
    const baseUrl = location.href.split("?")[0];

    for (let p = 2; p <= maxPage; p++) {
      setBanner(`Scanne Seite ${p}/${maxPage}…`);
      const doc = await fetchDoc(`${baseUrl}?page=${p}`);
      if (!doc) continue;
      offers = offers.concat(extractOffersFromDoc(doc));
    }

    // Deduplicate by offerPath
    const seenPaths = new Set();
    offers = offers.filter((o) => {
      if (seenPaths.has(o.offerPath)) return false;
      seenPaths.add(o.offerPath);
      return true;
    });

    const vouchers = [];
    const total = offers.length;
    const BATCH = 5;

    for (let i = 0; i < offers.length; i += BATCH) {
      setBanner(`Lade Details… (${Math.min(i + BATCH, total)}/${total})`);
      const results = await Promise.all(
        offers.slice(i, i + BATCH).map(async (offer) => {
          const doc = await fetchDoc(offer.offerPath);
          if (!doc) return null;

          const { providerUrl, code, conditions } = await processDetailDoc(doc);

          let providerDomain = null;
          if (providerUrl) {
            try { providerDomain = new URL(providerUrl).hostname.replace(/^www\./, ""); } catch {}
          }

          const discounts = [];
          if (offer.discountText) {
            discounts.push({ text: offer.discountText, code: code ?? null, conditions: conditions ?? null });
          } else if (code) {
            discounts.push({ text: "Gutschein", code, conditions });
          }

          if (discounts.length === 0 && !providerDomain) return null;

          return {
            provider: offer.provider,
            providerUrl,
            providerDomain,
            offerUrl: location.origin + offer.offerPath,
            discounts,
            extractedAt: Date.now(),
          };
        })
      );
      vouchers.push(...results.filter(Boolean));
    }

    return vouchers;
  }

  // --- Generic source page scraper (fallback) ---

  const DISCOUNT_SIGNAL = /(\d+[\.,]?\d*\s*%|\d+[\.,]?\d*\s*€|€\s*\d+[\.,]?\d*|gutschein|rabatt|voucher|cashback|bonus|sparen|vorteil|code\s*[:：]|deal)/i;
  const CODE_PATTERN = /\b([A-Z][A-Z0-9]{3,19})\b/;
  const CONDITION_PATTERN = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?)\s+[^,\n]{3,60}/i;

  function findDiscountContainer(el) {
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node) return null;
      if (DISCOUNT_SIGNAL.test(node.textContent)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function extractDiscounts(container) {
    const results = [];
    for (const line of (container.innerText || container.textContent).split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 4 && l.length < 250)) {
      if (!DISCOUNT_SIGNAL.test(line)) continue;
      results.push({ text: line, code: line.match(CODE_PATTERN)?.[1] ?? null, conditions: line.match(CONDITION_PATTERN)?.[0] ?? null });
      if (results.length >= 5) break;
    }
    return results;
  }

  function genericExtract() {
    const seen = new Set();
    const vouchers = [];

    for (const link of document.querySelectorAll("a[href]")) {
      let domain;
      try {
        const u = new URL(link.href);
        if (u.hostname === location.hostname || !u.protocol.startsWith("http")) continue;
        domain = u.hostname.replace(/^www\./, "");
      } catch { continue; }

      if (seen.has(domain)) continue;
      const container = findDiscountContainer(link);
      if (!container) continue;
      const discounts = extractDiscounts(container);
      if (discounts.length === 0) continue;

      const heading = container.querySelector("h1,h2,h3,h4,h5,strong,b,[class*='title'],[class*='name'],[class*='brand']");
      const provider = (heading?.textContent?.trim() || link.textContent?.trim())?.replace(/\s+/g, " ").slice(0, 100);
      if (!provider || provider.length < 2) continue;

      seen.add(domain);
      vouchers.push({ provider, providerUrl: link.href, providerDomain: domain, offerUrl: null, discounts, extractedAt: Date.now() });
    }

    return vouchers;
  }

  // --- Source extraction ---

  async function runMaoExtraction() {
    const { lastMaoScrape, maoScraping, maoScrapingStarted } = await chrome.storage.local.get(["lastMaoScrape", "maoScraping", "maoScrapingStarted"]);

    if (maoScraping && maoScrapingStarted && Date.now() - maoScrapingStarted > 10 * 60 * 1000) {
      await chrome.storage.local.remove(["maoScraping", "maoScrapingStarted"]);
    } else if (maoScraping) {
      setBanner("Scan läuft bereits…", true);
      return;
    }

    if (lastMaoScrape && Date.now() - lastMaoScrape < SCRAPE_COOLDOWN_MS) {
      setBanner("Vouchers sind aktuell ✓", true);
      return;
    }

    await chrome.storage.local.set({ maoScraping: true, maoScrapingStarted: Date.now() });

    try {
      const vouchers = await extractMaoVouchers();
      if (vouchers.length > 0) {
        await chrome.storage.local.set({ vouchers, lastMaoScrape: Date.now() });
        chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: vouchers.length });
        setBanner(`${vouchers.length} Anbieter importiert ✓`, true);
      } else {
        setBanner("Keine Angebote gefunden", true);
      }
    } finally {
      await chrome.storage.local.remove(["maoScraping", "maoScrapingStarted"]);
    }
  }

  async function runGenericExtraction() {
    const vouchers = genericExtract();
    if (vouchers.length === 0) return;
    await chrome.storage.local.set({ vouchers });
    chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: vouchers.length });
    setBanner(`${vouchers.length} Anbieter importiert ✓`, true);
  }

  // --- Badge injection ---

  async function getVouchers() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_VOUCHERS" }, (res) => {
        resolve(res?.vouchers ?? []);
      });
    });
  }

  function buildTooltip(voucher) {
    return voucher.discounts.map((d) => {
      let line = d.text;
      if (d.code) line += ` [Code: ${d.code}]`;
      if (d.conditions) line += ` (${d.conditions})`;
      return line;
    }).join("\n");
  }

  function injectBadge(el, voucher) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.title = buildTooltip(voucher);
    badge.style.cssText = `
      display:inline-flex;align-items:center;gap:4px;
      margin-left:6px;padding:2px 8px;border-radius:4px;
      background:#10b981;color:#fff;font-size:11px;font-weight:600;
      font-family:sans-serif;cursor:pointer;vertical-align:middle;
      white-space:nowrap;line-height:1.5;
    `;

    const firstCode = voucher.discounts.find((d) => d.code)?.code;
    badge.textContent = firstCode ? `🏷 ${firstCode}` : "🏷 Gutschein";

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      if (firstCode) {
        navigator.clipboard.writeText(firstCode).then(() => {
          badge.textContent = "✓ Kopiert!";
          setTimeout(() => (badge.textContent = `🏷 ${firstCode}`), 2000);
        });
      } else {
        badge.textContent = (voucher.discounts[0]?.text ?? "Gutschein").slice(0, 40);
        setTimeout(() => (badge.textContent = "🏷 Gutschein"), 3000);
      }
    });

    el.appendChild(badge);
  }

  function injectBadges(vouchers) {
    const index = new Map(vouchers.filter((v) => v.providerDomain).map((v) => [v.providerDomain, v]));
    if (index.size === 0) return;
    const injected = new Set();

    for (const link of document.querySelectorAll("a[href]")) {
      let domain;
      try { domain = new URL(link.href).hostname.replace(/^www\./, ""); } catch { continue; }

      const voucher = index.get(domain);
      if (!voucher || injected.has(domain)) continue;
      const target = link.closest("li,td,[class*='item'],[class*='card'],[class*='row'],[class*='result']") ?? link;
      if (target.querySelector(`.${BADGE_CLASS}`)) continue;
      injectBadge(target, voucher);
      injected.add(domain);
    }

    if (injected.size > 0) {
      chrome.runtime.sendMessage({ type: "VOUCHER_MATCH" });
    }
  }

  // --- Main ---

  async function main() {
    // On MAO listing page: scrape live DOM
    if (isOnMaoListingPage()) {
      runMaoExtraction();
      return;
    }

    // On MAO but wrong page: hint to navigate to listing
    if (isOnMaoSite()) {
      const { vouchers } = await chrome.storage.local.get("vouchers");
      if (!vouchers?.length) {
        setBanner("Navigiere zur Angebotsübersicht um Vouchers zu laden", true);
      }
      return;
    }

    // Generic configured source page
    const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
    if (sourceUrl && location.href.startsWith(sourceUrl)) {
      runGenericExtraction();
      return;
    }

    // Badge injection on all other pages
    const vouchers = await getVouchers();
    if (vouchers.length > 0) injectBadges(vouchers);
  }

  main();
})();
