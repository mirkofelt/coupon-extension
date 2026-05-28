import { scrapeAdac } from "./scrapers/adac.js";
import { scrapeMao } from "./scrapers/mao.js";
import { scrapeGeneric } from "./scrapers/generic.js";

const REFRESH_ALARM = "coupon-refresh";
const MAO_HOSTNAME = "mitarbeiterangebote.de";
const ADAC_HOSTNAME = "adac.de";

const DEFAULT_SOURCES = [
  {
    id: "adac_vorteilswelt",
    url: "https://www.adac.de/mitgliedschaft/vorteilswelt/vorteilssuche/",
    label: "ADAC Vorteilswelt",
    type: "adac",
    predefined: true,
    enabled: false,
  },
  {
    id: "corporate_benefits",
    url: "",
    label: "Corporate Benefits",
    type: "mao",
    predefined: true,
    requiresUrl: true,
    enabled: false,
  },
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

async function backgroundRefreshAll() {
  const { sources, refreshIntervalHours } = await chrome.storage.sync.get(["sources", "refreshIntervalHours"]);
  if (!sources) return;

  const intervalMs = (refreshIntervalHours ?? 24) * 60 * 60 * 1000;
  const now = Date.now();

  const stale = sources.filter((s) => s.enabled && (!s.lastRefreshed || now - s.lastRefreshed >= intervalMs));
  await Promise.all(stale.map((source) => refreshSource(source)));
}

async function refreshSource(source) {
  chrome.action.setBadgeText({ text: "↻" });
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

  let newVouchers = [];
  let scrapeError = null;
  try {
    if (source.url.includes(MAO_HOSTNAME)) {
      newVouchers = await scrapeMao(source.url);
    } else if (source.url.includes(ADAC_HOSTNAME)) {
      newVouchers = await scrapeAdac();
    } else {
      newVouchers = await scrapeGeneric(source.url);
    }
  } catch (err) {
    scrapeError = err.reason ?? "unknown";
    if (err.reason === "rate_limited") scrapeError = `rate_limited_${err.count}`;
    else if (err.reason === "http_error") scrapeError = `http_${err.status}_${err.count}`;
  }

  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });

  if (scrapeError || newVouchers.length === 0) {
    const reason = scrapeError ?? "no_results";
    if (reason === "not_logged_in") {
      chrome.notifications.create(`login_${source.id ?? source.url}`, {
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "CouponAlert",
        message: `Bitte bei "${source.label ?? source.url}" einloggen, um Vouchers zu laden.`,
      });
    }
    chrome.runtime.sendMessage({
      type: "SOURCE_ERROR",
      sourceUrl: source.url,
      reason,
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
