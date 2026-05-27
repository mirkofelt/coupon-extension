async function load() {
  const { sources, refreshIntervalHours } = await chrome.storage.sync.get(["sources", "refreshIntervalHours"]);
  document.getElementById("interval-hours").value = refreshIntervalHours ?? 24;
  renderSources(sources ?? []);
  renderVoucherList();
}

// --- Sources UI ---

function renderSources(sources) {
  const container = document.getElementById("source-list");
  container.innerHTML = "";

  if (sources.length === 0) {
    container.innerHTML = '<p class="no-vouchers">No sources configured. Add one below.</p>';
    return;
  }

  for (const source of sources) {
    const item = document.createElement("div");
    item.className = "source-item" + (source.enabled ? "" : " disabled");

    const lastStr = source.lastRefreshed
      ? `Last synced ${new Date(source.lastRefreshed).toLocaleString()}`
      : "Never synced";

    item.innerHTML = `
      <label class="source-toggle">
        <input type="checkbox" ${source.enabled ? "checked" : ""} data-id="${source.id}">
        <span class="source-toggle-slider"></span>
      </label>
      <div class="source-info">
        <div class="source-label">${escHtml(source.label)}</div>
        <div class="source-url">${escHtml(source.url)}</div>
        <div class="source-last">${lastStr}</div>
      </div>
      <div class="source-actions">
        <button class="btn-icon btn-refresh" title="Refresh now" data-refresh="${source.id}">↻</button>
        <button class="btn-icon" title="Remove" data-remove="${source.id}">✕</button>
      </div>
    `;

    item.querySelector("input[type='checkbox']").addEventListener("change", async (e) => {
      await updateSource(source.id, { enabled: e.target.checked });
    });

    item.querySelector("[data-refresh]").addEventListener("click", async () => {
      const { sources } = await chrome.storage.sync.get("sources");
      const s = sources?.find((x) => x.id === source.id);
      if (!s) return;
      setStatus("Refreshing…");
      chrome.runtime.sendMessage({ type: "REFRESH_SOURCE", source: s }, () => {
        setStatus("Done ✓");
        load();
      });
    });

    item.querySelector("[data-remove]").addEventListener("click", async () => {
      await removeSource(source.id);
    });

    container.appendChild(item);
  }
}

async function updateSource(id, patch) {
  const { sources } = await chrome.storage.sync.get("sources");
  const updated = (sources ?? []).map((s) => s.id === id ? { ...s, ...patch } : s);
  await chrome.storage.sync.set({ sources: updated });
  renderSources(updated);
}

async function removeSource(id) {
  const { sources } = await chrome.storage.sync.get("sources");
  const updated = (sources ?? []).filter((s) => s.id !== id);
  await chrome.storage.sync.set({ sources: updated });

  const url = sources?.find((s) => s.id === id)?.url;
  if (url) {
    const { vouchers } = await chrome.storage.local.get("vouchers");
    const kept = (vouchers ?? []).filter((v) => v.sourceUrl !== url);
    await chrome.storage.local.set({ vouchers: kept });
  }

  renderSources(updated);
  renderVoucherList();
}

// --- Add source form ---

document.getElementById("add-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "block";
  document.getElementById("add-btn").style.display = "none";
  document.getElementById("add-url").focus();
});

document.getElementById("add-cancel-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display = "";
});

document.getElementById("add-confirm-btn").addEventListener("click", async () => {
  const url = document.getElementById("add-url").value.trim();
  const label = document.getElementById("add-label").value.trim() || new URL(url).hostname;
  if (!url) return;

  const { sources } = await chrome.storage.sync.get("sources");
  const existing = sources ?? [];
  if (existing.some((s) => s.url === url)) {
    setStatus("Already exists");
    return;
  }

  const id = "custom_" + Date.now();
  const type = url.includes("mitarbeiterangebote.de") ? "mao" : "generic";
  const newSource = { id, url, label, type, enabled: true };
  const updated = [...existing, newSource];
  await chrome.storage.sync.set({ sources: updated });

  document.getElementById("add-url").value = "";
  document.getElementById("add-label").value = "";
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display = "";
  renderSources(updated);
  setStatus("Source added ✓");
});

// --- Interval ---

document.getElementById("save-interval-btn").addEventListener("click", async () => {
  const hours = parseInt(document.getElementById("interval-hours").value) || 24;
  await chrome.storage.sync.set({ refreshIntervalHours: hours });
  setStatus("Saved ✓");
});

// --- Clear ---

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["vouchers"]);
  renderVoucherList();
  setStatus("Cleared");
});

// --- Voucher list ---

async function renderVoucherList() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const meta = document.getElementById("voucher-meta");
  const container = document.getElementById("voucher-list");
  const searchInput = document.getElementById("search");

  if (!vouchers || vouchers.length === 0) {
    meta.textContent = "";
    searchInput.style.display = "none";
    container.innerHTML = '<p class="no-vouchers">No vouchers stored yet. Enable a source and wait for the next refresh, or visit the source page.</p>';
    return;
  }

  const seen = new Set();
  const deduped = vouchers.filter((v) => {
    const key = v.providerDomain ?? v.provider;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ts = vouchers.reduce((max, v) => Math.max(max, v.extractedAt ?? 0), 0);
  meta.textContent = `${deduped.length} provider${deduped.length !== 1 ? "s" : ""}` +
    (ts ? ` · last updated ${new Date(ts).toLocaleString()}` : "");

  searchInput.style.display = "block";

  const table = document.createElement("table");
  table.className = "voucher-table";
  table.innerHTML = `<thead><tr>
    <th>Provider</th><th>Domain</th><th>Code</th><th>Source</th>
  </tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const v of deduped) {
    const tr = document.createElement("tr");
    tr.dataset.search = `${v.provider} ${v.providerDomain ?? ""} ${v.sourceUrl ?? ""}`.toLowerCase();

    const tdName = document.createElement("td");
    tdName.className = "provider-cell";
    tdName.textContent = v.provider;

    const tdDomain = document.createElement("td");
    tdDomain.className = "domain-cell";
    if (v.providerDomain) {
      const a = document.createElement("a");
      a.href = `https://${v.providerDomain}`;
      a.textContent = v.providerDomain;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.color = "inherit";
      tdDomain.appendChild(a);
    } else {
      tdDomain.textContent = "—";
    }

    const tdCode = document.createElement("td");
    const firstCode = v.discounts?.find((d) => d.code)?.code;
    if (firstCode) {
      tdCode.className = "code-cell";
      tdCode.textContent = firstCode;
      tdCode.title = "Click to copy";
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

    const tdSource = document.createElement("td");
    tdSource.className = "source-cell";
    if (v.sourceUrl) {
      try { tdSource.textContent = new URL(v.sourceUrl).hostname; } catch { tdSource.textContent = v.sourceUrl; }
    } else {
      tdSource.textContent = "—";
    }

    tr.append(tdName, tdDomain, tdCode, tdSource);
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

// --- Helpers ---

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  setTimeout(() => (el.textContent = ""), 3000);
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

load();
