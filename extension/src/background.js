const REFRESH_ALARM = "coupon-refresh";
const REFRESH_INTERVAL_MINUTES = 60;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) notifyRefreshNeeded();
});

async function notifyRefreshNeeded() {
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
  if (!sourceUrl) return;
  const tabs = await chrome.tabs.query({ url: sourceUrl });
  if (tabs.length > 0) return;
  chrome.action.setBadgeText({ text: "↻" });
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
}

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
});
