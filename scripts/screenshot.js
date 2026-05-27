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

  await screenshot(browser, "popup.html", "popup-match.png", "adidas.de", { width: 340, height: 260 });
  await screenshot(browser, "popup.html", "popup-count.png", "other-site.de", { width: 340, height: 140 });
  await screenshot(browser, "options.html", "settings.png", "other-site.de", { width: 720, height: 560 });

  await browser.close();
  console.log("Done.");
})();
