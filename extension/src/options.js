async function load() {
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
  if (sourceUrl) document.getElementById("source-url").value = sourceUrl;
  renderVoucherList();
}

async function renderVoucherList() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const meta = document.getElementById("voucher-meta");
  const container = document.getElementById("voucher-list");

  if (!vouchers || vouchers.length === 0) {
    meta.textContent = "";
    container.innerHTML = '<p class="no-vouchers">No vouchers stored yet. Visit your source page to import them.</p>';
    return;
  }

  const ts = vouchers[0]?.extractedAt;
  meta.textContent = `${vouchers.length} provider${vouchers.length !== 1 ? "s" : ""}` +
    (ts ? ` · last updated ${new Date(ts).toLocaleString()}` : "");

  const table = document.createElement("table");
  table.className = "voucher-table";
  table.innerHTML = `<thead><tr>
    <th>Provider</th>
    <th>Domain</th>
    <th>Discounts &amp; Codes</th>
  </tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const v of vouchers) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "provider-cell";
    tdName.textContent = v.provider;
    tr.appendChild(tdName);

    const tdDomain = document.createElement("td");
    tdDomain.className = "domain-cell";
    tdDomain.textContent = v.providerDomain ?? "—";
    tr.appendChild(tdDomain);

    const tdDiscounts = document.createElement("td");
    for (const d of v.discounts) {
      if (d.text) {
        const chip = document.createElement("span");
        chip.className = "discount-chip";
        chip.textContent = d.text;
        tdDiscounts.appendChild(chip);
      }
      if (d.code) {
        const chip = document.createElement("span");
        chip.className = "code-chip";
        chip.textContent = d.code;
        chip.title = "Click to copy";
        chip.addEventListener("click", () => {
          navigator.clipboard.writeText(d.code).then(() => {
            chip.classList.add("copied");
            chip.textContent = "✓ Copied";
            setTimeout(() => { chip.classList.remove("copied"); chip.textContent = d.code; }, 2000);
          });
        });
        tdDiscounts.appendChild(chip);
      }
    }
    tr.appendChild(tdDiscounts);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
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
  renderVoucherList();
  const status = document.getElementById("status");
  status.textContent = "Cleared";
  setTimeout(() => (status.textContent = ""), 2500);
});

load();
