(() => {
  const BADGE_CLASS = "coupon-alert-badge";
  const MAO_HOSTNAME = "mitarbeiterangebote.de";
  const SCRAPE_COOLDOWN_MS = 30 * 60 * 1000;
  const OFFER_CACHE_TTL = 4 * 60 * 60 * 1000;

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
    return isOnMaoSite() && document.querySelector(".cbg3-global-banner") !== null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let _httpErrors = { rateLimit: 0, other: {} };

  function _resetHttpErrors() { _httpErrors = { rateLimit: 0, other: {} }; }

  function _checkHttpErrors() {
    if (_httpErrors.rateLimit > 0) {
      throw Object.assign(new Error(), { reason: "rate_limited", count: _httpErrors.rateLimit });
    }
    const firstStatus = Object.keys(_httpErrors.other)[0];
    if (firstStatus) {
      throw Object.assign(new Error(), {
        reason: "http_error",
        status: parseInt(firstStatus),
        count: _httpErrors.other[firstStatus],
      });
    }
  }

  async function fetchDoc(urlOrPath, retries = 2) {
    const url = urlOrPath.startsWith("http") ? urlOrPath : location.origin + urlOrPath;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 429) {
          if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
          _httpErrors.rateLimit++;
          return null;
        }
        if (!res.ok) {
          _httpErrors.other[res.status] = (_httpErrors.other[res.status] ?? 0) + 1;
          return null;
        }
        return new DOMParser().parseFromString(await res.text(), "text/html");
      } catch {
        return null;
      }
    }
    return null;
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

  function extractListItemsFromDoc(doc) {
    return Array.from(doc.querySelectorAll(".cbg3-list-item[data-id]")).map((card) => {
      const href = card.querySelector("a[href*='/offer/']")?.getAttribute("href") ?? null;
      return {
        provider: card.querySelector("h3")?.textContent?.replace(/\s*[-–]\s*$/, "").trim() ?? null,
        discountText: card.querySelector(".cbg3-list-item--discount p")?.textContent?.trim() ?? null,
        offerPath: href ? href.replace(/\/cat\/\d+$/, "") : null,
      };
    }).filter((o) => o.provider && o.offerPath);
  }

  async function extractMaoVouchers(sourceUrl, offerCacheKey, cachedData) {
    _resetHttpErrors();

    let offers, resumeFrom, cacheTs;

    if (cachedData) {
      ({ offers, progress: resumeFrom = 0, ts: cacheTs } = cachedData);
      setBanner(`Weiter bei ${resumeFrom}/${offers.length}…`);
    } else {
      resumeFrom = 0;
      cacheTs = Date.now();
      setBanner("Erkunde Kategorien…");

      const homeDoc = await fetchDoc("/");
      if (!homeDoc) {
        _checkHttpErrors();
        throw Object.assign(new Error(), { reason: "network" });
      }

      const overviewUrls = (() => {
        const seen = new Set();
        return Array.from(homeDoc.querySelectorAll("a[href^='/overview/']"))
          .map((a) => a.getAttribute("href"))
          .filter((h) => h && !h.includes("#") && !seen.has(h) && seen.add(h));
      })();

      if (overviewUrls.length === 0) throw Object.assign(new Error(), { reason: "not_logged_in" });

      let rawOffers = [];
      for (let i = 0; i < overviewUrls.length; i++) {
        setBanner(`Scanne Kategorie ${i + 1}/${overviewUrls.length}…`);
        const doc = await fetchDoc(overviewUrls[i]);
        if (doc) rawOffers = rawOffers.concat(extractListItemsFromDoc(doc));
      }

      if (rawOffers.length === 0) {
        _checkHttpErrors();
        throw Object.assign(new Error(), { reason: "no_items" });
      }

      const seenPaths = new Set();
      offers = rawOffers.filter((o) => !seenPaths.has(o.offerPath) && seenPaths.add(o.offerPath));
      const seenProviders = new Set();
      offers = offers.filter((o) => {
        const key = o.provider?.toLowerCase().replace(/\s+/g, "") ?? o.offerPath;
        return !seenProviders.has(key) && seenProviders.add(key);
      });

      const { blockedKeywords } = await chrome.storage.sync.get("blockedKeywords");
      if (blockedKeywords?.length) {
        offers = offers.filter((o) => !blockedKeywords.some((kw) => (o.provider ?? "").toLowerCase().includes(kw)));
      }

      await chrome.storage.local.set({ [offerCacheKey]: { offers, ts: cacheTs, progress: 0 } });
    }

    const vouchers = [];
    const total = offers.length;
    const BATCH = 2;
    const BATCH_DELAY = 2000;
    const AVG_MS_PER_OFFER = 1200;

    for (let i = resumeFrom; i < offers.length; i += BATCH) {
      if (i > resumeFrom) await sleep(BATCH_DELAY);
      const remaining = offers.length - i;
      const estMs = Math.ceil(remaining / BATCH) * (BATCH_DELAY + BATCH * AVG_MS_PER_OFFER);
      const timeStr = estMs >= 60000 ? `~${Math.ceil(estMs / 60000)} min` : `~${Math.ceil(estMs / 1000)} s`;
      setBanner(`Lade Details… (${Math.min(i + BATCH, total)}/${total}) — noch ${timeStr}`);

      const results = await Promise.all(
        offers.slice(i, i + BATCH).map(async (offer) => {
          try {
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
              provider: offer.provider, providerUrl, providerDomain,
              offerUrl: location.origin + offer.offerPath, discounts, extractedAt: Date.now(),
            };
          } catch {
            return null;
          }
        })
      );

      const fresh = results.filter(Boolean);
      if (fresh.length > 0) {
        vouchers.push(...fresh);
        // Merge with other sources so we don't overwrite them
        const { vouchers: stored } = await chrome.storage.local.get("vouchers");
        const others = (stored ?? []).filter((v) => v.sourceUrl !== sourceUrl);
        await chrome.storage.local.set({ vouchers: [...others, ...vouchers.map((v) => ({ ...v, sourceUrl }))] });
        chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: vouchers.length }).catch(() => {});
      }

      await chrome.storage.local.set({
        [offerCacheKey]: { offers, ts: cacheTs, progress: Math.min(i + BATCH, offers.length) },
      });
    }

    _checkHttpErrors();
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

  async function runMaoExtraction(sourceUrl) {
    const lockKey = `maoScraping_${btoa(sourceUrl).slice(0, 12)}`;
    const cooldownKey = `lastMaoScrape_${btoa(sourceUrl).slice(0, 12)}`;
    const offerCacheKey = `maoOffers_${btoa(sourceUrl).slice(0, 12)}`;

    // sessionStorage is tab-scoped and clears on navigation — no stale locks after redirects
    if (sessionStorage.getItem(lockKey)) {
      setBanner("Scan läuft bereits…", true);
      return;
    }

    const { [cooldownKey]: lastScrape, [offerCacheKey]: offerCache } =
      await chrome.storage.local.get([cooldownKey, offerCacheKey]);

    const isResume = offerCache && Date.now() - offerCache.ts < OFFER_CACHE_TTL
      && offerCache.progress < offerCache.offers.length;

    if (!isResume && lastScrape && Date.now() - lastScrape < SCRAPE_COOLDOWN_MS) {
      setBanner("Vouchers sind aktuell ✓", true);
      return;
    }

    sessionStorage.setItem(lockKey, "1");

    try {
      await extractMaoVouchers(sourceUrl, offerCacheKey, isResume ? offerCache : null);

      const { vouchers: saved } = await chrome.storage.local.get("vouchers");
      const count = (saved ?? []).filter((v) => v.sourceUrl === sourceUrl).length;

      await chrome.storage.local.set({ [cooldownKey]: Date.now() });
      await chrome.storage.local.remove(offerCacheKey);

      if (count > 0) {
        setBanner(`${count} Anbieter importiert ✓`, true);
      } else {
        setBanner("Keine Codes gefunden (Angebote ohne Gutschein?)", true);
      }
    } catch (err) {
      // Keep offerCache on error so the scan can be resumed next visit
      if (err.reason === "not_logged_in") {
        setBanner("Nicht eingeloggt – bitte erst anmelden ✗", true);
      } else if (err.reason === "no_items") {
        setBanner("Keine Angebote – Seitenstruktur geändert? ✗", true);
      } else if (err.reason === "network") {
        setBanner("Verbindungsfehler ✗", true);
      } else if (err.reason === "rate_limited") {
        setBanner(`Rate Limit (429 ×${err.count}) – bitte später nochmal ✗`, true);
      } else if (err.reason === "http_error") {
        setBanner(`HTTP ${err.status} ×${err.count} ✗`, true);
      } else {
        setBanner("Fehler beim Laden ✗", true);
      }
    } finally {
      sessionStorage.removeItem(lockKey);
    }
  }

  async function runGenericExtraction(sourceUrl) {
    const freshVouchers = genericExtract();
    if (freshVouchers.length === 0) return;
    const tagged = freshVouchers.map((v) => ({ ...v, sourceUrl }));
    const { vouchers: existing } = await chrome.storage.local.get("vouchers");
    const kept = (existing ?? []).filter((v) => v.sourceUrl !== sourceUrl);
    const updated = [...kept, ...tagged];
    await chrome.storage.local.set({ vouchers: updated });
    chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: updated.length });
    setBanner(`${tagged.length} Anbieter importiert ✓`, true);
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
    const { sources } = await chrome.storage.sync.get("sources");
    const enabledSources = (sources ?? []).filter((s) => s.enabled);

    // Check if current page is a configured source
    for (const source of enabledSources) {
      if (!location.href.startsWith(source.url.replace(/\/$/, "").split("?")[0])) continue;
      if (source.type === "mao" || location.hostname.endsWith(MAO_HOSTNAME)) {
        runMaoExtraction(source.url);
      } else {
        runGenericExtraction(source.url);
      }
      return;
    }

    // MAO site not explicitly in sources but user is on it
    if (isOnMaoSite()) {
      const maoSource = enabledSources.find((s) => s.url.includes(MAO_HOSTNAME))
        ?? { url: location.origin + "/" };
      runMaoExtraction(maoSource.url);
      return;
    }

    // Badge injection on all other pages
    const vouchers = await getVouchers();
    if (vouchers.length > 0) injectBadges(vouchers);
  }

  main();
})();
