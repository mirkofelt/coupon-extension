import { fetchDoc } from "./utils.js";

const DISCOUNT_SIGNAL = /(\d+[\.,]?\d*\s*%|\d+[\.,]?\d*\s*€|€\s*\d+[\.,]?\d*|gutschein|rabatt|voucher|cashback|bonus|sparen|vorteil|code\s*[:：]|deal)/i;
const CODE_PATTERN = /\b([A-Z][A-Z0-9]{3,19})\b/;
const CONDITION_PATTERN = /(?:ab|mindest(?:ens|\.?)|bei|gültig|nur|bis|max\.?)\s+[^,\n]{3,60}/i;

export async function scrapeGeneric(sourceUrl) {
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
