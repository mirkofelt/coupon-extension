(() => {
  const BADGE_CLASS = "coupon-alert-badge";

  const DISCOUNT_SIGNAL = /(\d+[\.,]?\d*\s*%|\d+[\.,]?\d*\s*€|€\s*\d+[\.,]?\d*|gutschein|rabatt|voucher|cashback|bonus|sparen|vorteil|code\s*[:：]|deal)/i;
  const CODE_PATTERN = /\b([A-Z][A-Z0-9]{3,19})\b/;
  const CONDITION_PATTERN = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?)\s+[^,\n]{3,60}/i;

  // --- Source page: auto-extract vouchers ---

  function getExternalLinks() {
    return Array.from(document.querySelectorAll("a[href]")).filter((a) => {
      try {
        const u = new URL(a.href);
        return u.hostname !== location.hostname && u.protocol.startsWith("http");
      } catch {
        return false;
      }
    });
  }

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
    const lines = (container.innerText || container.textContent)
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 4 && l.length < 250);

    const results = [];
    for (const line of lines) {
      if (!DISCOUNT_SIGNAL.test(line)) continue;

      const codeMatch = line.match(CODE_PATTERN);
      const condMatch = line.match(CONDITION_PATTERN);

      results.push({
        text: line,
        code: codeMatch?.[1] ?? null,
        conditions: condMatch?.[0] ?? null,
      });

      if (results.length >= 5) break;
    }
    return results;
  }

  function extractProviderName(container, linkEl) {
    const heading = container.querySelector(
      "h1,h2,h3,h4,h5,strong,b,[class*='title'],[class*='name'],[class*='brand']"
    );
    const candidate = heading?.textContent?.trim() || linkEl.textContent?.trim();
    return candidate?.replace(/\s+/g, " ").slice(0, 100) ?? null;
  }

  function autoExtract() {
    const links = getExternalLinks();
    const seen = new Set();
    const vouchers = [];

    for (const link of links) {
      let domain;
      try {
        domain = new URL(link.href).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      if (seen.has(domain)) continue;

      const container = findDiscountContainer(link);
      if (!container) continue;

      const discounts = extractDiscounts(container);
      if (discounts.length === 0) continue;

      const provider = extractProviderName(container, link);
      if (!provider || provider.length < 2) continue;

      seen.add(domain);
      vouchers.push({
        provider,
        providerUrl: link.href,
        providerDomain: domain,
        discounts,
        extractedAt: Date.now(),
      });
    }

    return vouchers;
  }

  async function runSourceExtraction() {
    const vouchers = autoExtract();
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

  // --- Comparison pages: domain-based badge injection ---

  async function getVouchers() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_VOUCHERS" }, (res) => {
        resolve(res?.vouchers ?? []);
      });
    });
  }

  function buildDomainIndex(vouchers) {
    const map = new Map();
    for (const v of vouchers) {
      if (v.providerDomain) map.set(v.providerDomain, v);
    }
    return map;
  }

  function injectBadges(vouchers) {
    const index = buildDomainIndex(vouchers);
    if (index.size === 0) return;

    const injected = new Set();

    for (const link of document.querySelectorAll("a[href]")) {
      let domain;
      try {
        domain = new URL(link.href).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      const voucher = index.get(domain);
      if (!voucher || injected.has(domain)) continue;

      const target =
        link.closest("li, td, [class*='item'], [class*='card'], [class*='row'], [class*='result']") ?? link;
      if (target.querySelector(`.${BADGE_CLASS}`)) continue;

      injectBadge(target, voucher);
      injected.add(domain);
    }
  }

  function buildTooltip(voucher) {
    return voucher.discounts
      .map((d) => {
        let line = d.text;
        if (d.code) line += ` [Code: ${d.code}]`;
        if (d.conditions) line += ` (${d.conditions})`;
        return line;
      })
      .join("\n");
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
        const text = voucher.discounts[0]?.text?.slice(0, 40) ?? "Gutschein";
        badge.textContent = text;
        setTimeout(() => (badge.textContent = "🏷 Gutschein"), 3000);
      }
    });

    el.appendChild(badge);
  }

  // --- Main ---

  async function main() {
    const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");

    if (sourceUrl && location.href.startsWith(sourceUrl)) {
      runSourceExtraction();
      return;
    }

    const vouchers = await getVouchers();
    if (vouchers.length > 0) injectBadges(vouchers);
  }

  main();
})();
