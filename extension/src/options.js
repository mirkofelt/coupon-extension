async function load() {
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
  if (sourceUrl) document.getElementById("source-url").value = sourceUrl;
  updateCount();
}

async function updateCount() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const el = document.getElementById("voucher-count");
  const count = vouchers?.length ?? 0;
  el.textContent = count > 0
    ? `${count} provider${count !== 1 ? "s" : ""} stored.`
    : "No vouchers stored yet.";
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const sourceUrl = document.getElementById("source-url").value.trim();
  await chrome.storage.sync.set({ sourceUrl });
  const status = document.getElementById("status");
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 2500);
});

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove("vouchers");
  updateCount();
  const status = document.getElementById("status");
  status.textContent = "Cleared";
  setTimeout(() => (status.textContent = ""), 2500);
});

load();
