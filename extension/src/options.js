async function load() {
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
  if (sourceUrl) document.getElementById("source-url").value = sourceUrl;
  renderVoucherList();
}

async function renderVoucherList() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const meta = document.getElementById("voucher-meta");
  const container = document.getElementById("voucher-list");
  const searchInput = document.getElementById("search");

  if (!vouchers || vouchers.length === 0) {
    meta.textContent = "";
    searchInput.style.display = "none";
    container.innerHTML = '<p class="no-vouchers">No vouchers stored yet. Visit your source page to import them.</p>';
    return;
  }

  // Deduplicate by domain
  const seen = new Set();
  const deduped = vouchers.filter((v) => {
    const key = v.providerDomain ?? v.provider;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ts = vouchers[0]?.extractedAt;
  meta.textContent = `${deduped.length} provider${deduped.length !== 1 ? "s" : ""}` +
    (ts ? ` · last updated ${new Date(ts).toLocaleString()}` : "");

  searchInput.style.display = "block";

  const table = document.createElement("table");
  table.className = "voucher-table";
  table.innerHTML = `<thead><tr>
    <th>Provider</th>
    <th>Domain</th>
    <th>Code</th>
  </tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const v of deduped) {
    const tr = document.createElement("tr");
    tr.dataset.search = `${v.provider} ${v.providerDomain ?? ""}`.toLowerCase();

    const tdName = document.createElement("td");
    tdName.className = "provider-cell";
    tdName.textContent = v.provider;
    tr.appendChild(tdName);

    const tdDomain = document.createElement("td");
    tdDomain.className = "domain-cell";
    tdDomain.textContent = v.providerDomain ?? "—";
    tr.appendChild(tdDomain);

    const tdCode = document.createElement("td");
    const firstCode = v.discounts?.find((d) => d.code)?.code;
    if (firstCode) {
      tdCode.className = "code-cell";
      tdCode.textContent = firstCode;
      tdCode.title = "Click to copy";
      tdCode.style.cursor = "pointer";
      tdCode.addEventListener("click", () => {
        navigator.clipboard.writeText(firstCode).then(() => {
          const orig = tdCode.textContent;
          tdCode.textContent = "✓ Copied";
          setTimeout(() => (tdCode.textContent = orig), 2000);
        });
      });
    } else {
      tdCode.className = "nocode-cell";
      tdCode.textContent = "—";
    }
    tr.appendChild(tdCode);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  searchInput.value = "";
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    for (const row of tbody.querySelectorAll("tr")) {
      row.hidden = q.length > 0 && !row.dataset.search.includes(q);
    }
  });
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const sourceUrl = document.getElementById("source-url").value.trim();
  await chrome.storage.sync.set({ sourceUrl });
  const status = document.getElementById("status");
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 2500);
});

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["vouchers", "lastMaoScrape", "maoScraping"]);
  renderVoucherList();
  const status = document.getElementById("status");
  status.textContent = "Cleared";
  setTimeout(() => (status.textContent = ""), 2500);
});

document.getElementById("rescan-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["lastMaoScrape", "maoScraping", "maoScrapingStarted"]);
  const status = document.getElementById("status");
  status.textContent = "Reset — visit source page to rescan";
  setTimeout(() => (status.textContent = ""), 4000);
});

load();
