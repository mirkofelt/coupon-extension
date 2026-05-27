(() => {
  const BADGE_CLASS = "coupon-alert-badge";

  async function getSettings() {
    return chrome.storage.sync.get(["sourceUrl", "selectors"]);
  }

  async function getVouchers() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_VOUCHERS" }, (res) => {
        resolve(res?.vouchers ?? []);
      });
    });
  }

  // --- Source page: extract vouchers ---

  function extractVouchers(selectors) {
    const items = document.querySelectorAll(selectors.item);
    const vouchers = [];

    items.forEach((el) => {
      try {
        const provider = el.querySelector(selectors.provider)?.textContent?.trim();
        const code = el.querySelector(selectors.code)?.textContent?.trim();
        const discount = el.querySelector(selectors.discount)?.textContent?.trim() ?? "";
        const expiry = el.querySelector(selectors.expiry)?.textContent?.trim() ?? "";

        if (provider && code) {
          vouchers.push({ provider, code, discount, expiry, extractedAt: Date.now() });
        }
      } catch (_) {}
    });

    return vouchers;
  }

  async function runSourceExtraction(selectors) {
    if (!selectors?.item) return;

    const vouchers = extractVouchers(selectors);
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
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      background: #1a1a2e; color: #fff; padding: 10px 16px; border-radius: 8px;
      font-family: sans-serif; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,.3);
      border-left: 4px solid #10b981;
    `;
    banner.textContent = `CouponAlert: ${count} voucher${count !== 1 ? "s" : ""} saved`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  }

  // --- Comparison pages: inject badges ---

  function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function buildProviderIndex(vouchers) {
    const index = new Map();
    for (const v of vouchers) {
      index.set(normalizeName(v.provider), v);
    }
    return index;
  }

  function findTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement?.tagName;
        if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest(`.${BADGE_CLASS}`)) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim().length > 1
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function injectBadges(vouchers) {
    if (vouchers.length === 0) return;

    const index = buildProviderIndex(vouchers);
    const injected = new Set();
    const textNodes = findTextNodes(document.body);

    for (const node of textNodes) {
      const normalized = normalizeName(node.textContent);

      for (const [key, voucher] of index) {
        if (
          normalized.includes(key) &&
          key.length >= 3 &&
          !injected.has(node.parentElement)
        ) {
          injectBadge(node.parentElement, voucher);
          injected.add(node.parentElement);
          break;
        }
      }
    }
  }

  function injectBadge(el, voucher) {
    if (el.querySelector(`.${BADGE_CLASS}`)) return;

    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.title = `Code: ${voucher.code}${voucher.discount ? " — " + voucher.discount : ""}${voucher.expiry ? " (until " + voucher.expiry + ")" : ""}`;
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 4px;
      margin-left: 6px; padding: 2px 7px; border-radius: 4px;
      background: #10b981; color: #fff; font-size: 11px; font-weight: 600;
      font-family: sans-serif; cursor: pointer; vertical-align: middle;
      white-space: nowrap; line-height: 1.4;
    `;
    badge.textContent = "🏷 Coupon";

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(voucher.code).then(() => {
        badge.textContent = "✓ Copied!";
        setTimeout(() => (badge.textContent = "🏷 Coupon"), 2000);
      });
    });

    el.appendChild(badge);
  }

  // --- Main ---

  async function main() {
    const { sourceUrl, selectors } = await getSettings();
    const currentUrl = location.href;

    if (sourceUrl && currentUrl.startsWith(sourceUrl)) {
      runSourceExtraction(selectors ?? {});
      return;
    }

    const vouchers = await getVouchers();
    if (vouchers.length > 0) {
      injectBadges(vouchers);
    }
  }

  main();
})();
