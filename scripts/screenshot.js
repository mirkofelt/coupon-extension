const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const EXTENSION_DIR = path.resolve(__dirname, "../extension");
const OUT_DIR = path.resolve(__dirname, "../docs/screenshots");

const MOCK_VOUCHERS = [
  {
    provider: "adidas",
    providerUrl: "https://www.adidas.de",
    providerDomain: "adidas.de",
    offerUrl: "https://example.com/offer/1001",
    discounts: [{ text: "15% Rabatt auf alles", code: "ADIDAS15", conditions: "ab 50 € MBW" }],
    extractedAt: Date.now(),
  },
  {
    provider: "IKEA",
    providerUrl: "https://www.ikea.com/de",
    providerDomain: "ikea.com",
    offerUrl: "https://example.com/offer/1002",
    discounts: [{ text: "10% auf Möbel & Wohnaccessoires", code: null, conditions: null }],
    extractedAt: Date.now(),
  },
  {
    provider: "Zalando",
    providerUrl: "https://www.zalando.de",
    providerDomain: "zalando.de",
    offerUrl: "https://example.com/offer/1003",
    discounts: [{ text: "20% Rabatt", code: "ZAL20CORP", conditions: "MBW 80 €" }],
    extractedAt: Date.now(),
  },
  {
    provider: "MediaMarkt",
    providerUrl: "https://www.mediamarkt.de",
    providerDomain: "mediamarkt.de",
    offerUrl: "https://example.com/offer/1004",
    discounts: [{ text: "5% auf Elektronik", code: "MM5CORP", conditions: null }],
    extractedAt: Date.now(),
  },
  {
    provider: "Nike",
    providerUrl: "https://www.nike.com/de",
    providerDomain: "nike.com",
    offerUrl: "https://example.com/offer/1005",
    discounts: [{ text: "20% auf reguläre Artikel", code: "NIKE20MA", conditions: null }],
    extractedAt: Date.now(),
  },
  {
    provider: "Apple",
    providerUrl: "https://www.apple.com/de",
    providerDomain: "apple.com",
    offerUrl: "https://example.com/offer/1006",
    discounts: [{ text: "Bildungsrabatt für Mitarbeiter", code: null, conditions: null }],
    extractedAt: Date.now(),
  },
];

function buildChromeMock(matchDomain) {
  return `
    window.chrome = {
      storage: {
        local: {
          get: () => Promise.resolve({
            vouchers: ${JSON.stringify(MOCK_VOUCHERS)},
            lastMaoScrape: ${Date.now() - 1000 * 60 * 5}
          }),
          set: () => Promise.resolve(),
          remove: () => Promise.resolve(),
        },
        sync: {
          get: () => Promise.resolve({ sourceUrl: "https://example.com/vouchers" }),
          set: () => Promise.resolve(),
        },
      },
      runtime: {
        sendMessage: () => {},
        openOptionsPage: () => {},
        onMessage: { addListener: () => {} },
      },
      tabs: {
        query: () => Promise.resolve([{ url: "https://www.${matchDomain}/" }]),
        create: () => {},
      },
      alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    };
  `;
}

async function screenshotToolbar(browser, outFile) {
  const iconB64 = fs.readFileSync(path.join(EXTENSION_DIR, "icons/icon-32.png")).toString("base64");
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", sans-serif; }
  body { background: #dee1e6; padding: 0; width: 680px; }
  .window { background: #dee1e6; border-radius: 10px 10px 0 0; overflow: hidden; }
  .titlebar {
    display: flex; align-items: center; gap: 0;
    background: #dee1e6; padding: 10px 12px 0;
    height: 36px;
  }
  .traffic-lights { display: flex; gap: 6px; margin-right: 12px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot-red { background: #ff5f57; }
  .dot-yellow { background: #febc2e; }
  .dot-green { background: #28c840; }
  .tab {
    background: #fff; border-radius: 8px 8px 0 0;
    padding: 7px 14px; font-size: 12px; color: #333;
    display: flex; align-items: center; gap: 6px;
    min-width: 160px; max-width: 220px;
    box-shadow: 0 -1px 3px rgba(0,0,0,.08);
    position: relative; top: 0;
  }
  .tab-favicon { width: 14px; height: 14px; border-radius: 2px; background: #10b981; }
  .tab-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tab-close { color: #999; font-size: 14px; cursor: pointer; margin-left: 4px; }
  .toolbar {
    background: #fff; padding: 8px 12px;
    display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid #e0e0e0;
  }
  .nav-btn {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #666; font-size: 16px; cursor: pointer;
  }
  .nav-btn:hover { background: #f0f0f0; }
  .addressbar {
    flex: 1; background: #f0f2f5; border-radius: 20px;
    padding: 6px 14px; font-size: 13px; color: #333;
    display: flex; align-items: center; gap: 6px;
  }
  .lock { color: #555; font-size: 12px; }
  .url { color: #333; }
  .extensions-area {
    display: flex; align-items: center; gap: 4px; padding-left: 4px;
  }
  .ext-icon {
    width: 28px; height: 28px; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; position: relative;
  }
  .ext-icon:hover { background: #f0f0f0; }
  .ext-icon img { width: 18px; height: 18px; }
  .badge {
    position: absolute; bottom: 2px; right: 2px;
    background: #10b981; color: #fff; font-size: 8px; font-weight: 700;
    border-radius: 6px; padding: 0px 3px; line-height: 12px;
    min-width: 12px; text-align: center;
  }
  .puzzle { color: #666; font-size: 18px; cursor: pointer; }
</style>
</head>
<body>
<div class="window">
  <div class="titlebar">
    <div class="traffic-lights">
      <div class="dot dot-red"></div>
      <div class="dot dot-yellow"></div>
      <div class="dot dot-green"></div>
    </div>
    <div class="tab">
      <div class="tab-favicon"></div>
      <span class="tab-title">adidas | Sale – Up to 50% off</span>
      <span class="tab-close">×</span>
    </div>
  </div>
  <div class="toolbar">
    <div class="nav-btn">←</div>
    <div class="nav-btn">→</div>
    <div class="nav-btn">↻</div>
    <div class="addressbar">
      <span class="lock">🔒</span>
      <span class="url">adidas.de/sale/shoes</span>
    </div>
    <div class="extensions-area">
      <div class="ext-icon">
        <img src="data:image/png;base64,${iconB64}" alt="CouponAlert">
        <span class="badge">6</span>
      </div>
      <span class="puzzle">⊞</span>
    </div>
  </div>
</div>
</body>
</html>`;

  const page = await browser.newPage();
  await page.setViewport({ width: 680, height: 80 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(OUT_DIR, outFile) });
  await page.close();
  console.log(`  ✓ ${outFile}`);
}

async function screenshot(browser, htmlFile, outFile, mockDomain, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(buildChromeMock(mockDomain));
  await page.goto(`file://${path.join(EXTENSION_DIR, htmlFile)}`);
  await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, outFile) });
  await page.close();
  console.log(`  ✓ ${outFile}`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  console.log("Taking screenshots…");

  await screenshotToolbar(browser, "browser-toolbar.png");
  await screenshot(browser, "popup.html", "popup-match.png", "adidas.de", { width: 340, height: 260 });
  await screenshot(browser, "popup.html", "popup-count.png", "other-site.de", { width: 340, height: 140 });
  await screenshot(browser, "options.html", "settings.png", "other-site.de", { width: 720, height: 560 });

  await browser.close();
  console.log("Done.");
})();
