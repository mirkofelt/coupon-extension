const fields = {
  sourceUrl: document.getElementById("source-url"),
  selItem: document.getElementById("sel-item"),
  selProvider: document.getElementById("sel-provider"),
  selCode: document.getElementById("sel-code"),
  selDiscount: document.getElementById("sel-discount"),
  selExpiry: document.getElementById("sel-expiry"),
};

async function load() {
  const { sourceUrl, selectors } = await chrome.storage.sync.get(["sourceUrl", "selectors"]);
  if (sourceUrl) fields.sourceUrl.value = sourceUrl;
  if (selectors) {
    if (selectors.item) fields.selItem.value = selectors.item;
    if (selectors.provider) fields.selProvider.value = selectors.provider;
    if (selectors.code) fields.selCode.value = selectors.code;
    if (selectors.discount) fields.selDiscount.value = selectors.discount;
    if (selectors.expiry) fields.selExpiry.value = selectors.expiry;
  }
  updateCount();
}

async function updateCount() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const el = document.getElementById("voucher-count");
  const count = vouchers?.length ?? 0;
  el.textContent = count > 0
    ? `${count} voucher${count !== 1 ? "s" : ""} currently stored.`
    : "No vouchers stored yet.";
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const sourceUrl = fields.sourceUrl.value.trim();
  const selectors = {
    item: fields.selItem.value.trim(),
    provider: fields.selProvider.value.trim(),
    code: fields.selCode.value.trim(),
    discount: fields.selDiscount.value.trim(),
    expiry: fields.selExpiry.value.trim(),
  };

  await chrome.storage.sync.set({ sourceUrl, selectors });

  const status = document.getElementById("status");
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 2500);
});

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove("vouchers");
  updateCount();
  const status = document.getElementById("status");
  status.textContent = "Vouchers cleared";
  setTimeout(() => (status.textContent = ""), 2500);
});

load();
