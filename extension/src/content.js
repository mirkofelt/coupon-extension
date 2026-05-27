(() => {
  const BADGE_CLASS = "coupon-alert-badge";
  const MAO_HOSTNAME = "mitarbeiterangebote.de";

  // --- Site-specific: mitarbeiterangebote.de ---

  function isMaoListingPage() {
    return (
      location.hostname.endsWith(MAO_HOSTNAME) &&
      document.querySelector(".cbg3-global-banner[data-id]") !== null
    );
  }

  async function fetchDetailDoc(path) {
    try {
      const res = await fetch(location.origin + path, { credentials: "include" });
      if (!res.ok) return null;
      const html = await res.text();
      return new DOMParser().parseFromString(html, "text/html");
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

  async function processDetailDoc(doc, discountText) {
    const extEl = doc.querySelector("[data-href^='http']");
    const providerUrl = extEl?.dataset?.href ?? null;

    let code = null;
    const couponBtn = doc.querySelector("[data-url*='/api/coupon']");
    if (couponBtn) {
      const ac = new URLSearchParams((couponBtn.dataset.url ?? "").split("?")[1]).get("ac");
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

  async function extractMaoVouchers() {
    const cards = Array.from(document.querySelectorAll(".cbg3-global-banner[data-id]"));

    const offers = cards.map((card) => ({
      provider: card.querySelector("h3")?.textContent?.trim() ?? null,
      discountText: card.querySelector(".cbg3-banner--discount p, .cbg3-banner--discount")?.textContent?.trim() ?? null,
      offerPath: card.querySelector("a[href*='/offer/']")?.getAttribute("href") ?? null,
    })).filter((o) => o.provider && o.offerPath);

    const vouchers = [];
    const BATCH = 5;

    for (let i = 0; i < offers.length; i += BATCH) {
      const results = await Promise.all(
        offers.slice(i, i + BATCH).map(async (offer) => {
          const doc = await fetchDetailDoc(offer.offerPath);
          if (!doc) return null;

          const { providerUrl, code, conditions } = await processDetailDoc(doc, offer.discountText);

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

          if (discounts.length === 0) return null;

          return { provider: offer.provider, providerUrl, providerDomain, discounts, extractedAt: Date.now() };
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
      vouchers.push({ provider, providerUrl: link.href, providerDomain: domain, discounts, extractedAt: Date.now() });
    }

    return vouchers;
  }

  // --- Source extraction ---

  async function runSourceExtraction() {
    const vouchers = isMaoListingPage() ? await extractMaoVouchers() : genericExtract();
    if (vouchers.length === 0) return;

    await chrome.storage.local.set({ vouchers });
    chrome.runtime.sendMessage({ type: "VOUCHERS_UPDATED", count: vouchers.length });
    showSourceBanner(vouchers.length);
  }

  function showSourceBanner(count) {
    if (document.getElementById("coupon-alert-source-banner")) return;
    const banner = document.createElement("div");
    banner.id = "coupon-alert-source-banner";
    banner.style.cssText = `
      position:fixed;top:16px;right:16px;z-index:2147483647;
      background:#1a1a2e;color:#fff;padding:10px 16px;border-radius:8px;
      font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.3);
      border-left:4px solid #10b981;
    `;
    banner.textContent = `CouponAlert: ${count} Anbieter importiert`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  }

  // --- Badge injection on comparison/shopping pages ---

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
  }

  // --- Main ---

  async function main() {
    const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");

    if ((sourceUrl && location.href.startsWith(sourceUrl)) || isMaoListingPage()) {
      runSourceExtraction();
      return;
    }

    const vouchers = await getVouchers();
    if (vouchers.length > 0) injectBadges(vouchers);
  }

  main();
})();
