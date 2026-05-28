const PAGE_SIZE = 50;
let voucherData = [];
let currentPage = 1;
let searchQuery = "";

async function load() {
  const { sources, refreshIntervalHours, blockedKeywords } = await chrome.storage.sync.get(["sources", "refreshIntervalHours", "blockedKeywords"]);
  document.getElementById("interval-hours").value = refreshIntervalHours ?? 24;
  document.getElementById("blocked-keywords").value = (blockedKeywords ?? []).join("\n");
  renderSources(sources ?? []);
  renderVoucherList();
}

// --- Sources UI ---

function renderSources(sources) {
  const container = document.getElementById("source-list");
  container.innerHTML = "";

  const predefined = sources.filter((s) => s.predefined);
  const custom = sources.filter((s) => !s.predefined);

  const predHeader = document.createElement("div");
  predHeader.className = "source-group-label";
  predHeader.textContent = "Vordefinierte Quellen";
  container.appendChild(predHeader);

  if (predefined.length === 0) {
    container.insertAdjacentHTML("beforeend", '<p class="no-vouchers" style="margin-bottom:12px">Keine vordefinierten Quellen.</p>');
  } else {
    for (const source of predefined) container.appendChild(buildPredefinedItem(source));
  }

  const custHeader = document.createElement("div");
  custHeader.className = "source-group-label";
  custHeader.style.marginTop = "20px";
  custHeader.textContent = "Eigene Quellen";
  container.appendChild(custHeader);

  if (custom.length === 0) {
    container.insertAdjacentHTML("beforeend", '<p class="no-vouchers" style="margin-bottom:12px">Noch keine eigenen Quellen hinzugefügt.</p>');
  } else {
    for (const source of custom) container.appendChild(buildCustomItem(source));
  }
}

function buildLastStr(source) {
  if (source.lastError && source.lastErrorAt) {
    return `${errorLabel(source.lastError)} · ${new Date(source.lastErrorAt).toLocaleString()}`;
  } else if (source.lastRefreshed) {
    return `Zuletzt synchronisiert ${new Date(source.lastRefreshed).toLocaleString()}`;
  }
  return "Noch nicht synchronisiert";
}

function errorLabel(code) {
  if (!code) return "";
  if (code === "not_logged_in") return "⚠ Nicht eingeloggt";
  if (code === "no_items") return "⚠ Keine Einträge (Seitenstruktur geändert?)";
  if (code === "network") return "⚠ Netzwerkfehler";
  if (code === "no_results") return "⚠ Keine Ergebnisse";
  if (code.startsWith("rate_limited_")) return `⚠ Zu viele Anfragen (429 ×${code.split("_")[2]})`;
  if (code.startsWith("http_")) { const p = code.split("_"); return `⚠ HTTP ${p[1]} ×${p[2]}`; }
  return "⚠ Fehler";
}

function buildPredefinedItem(source) {
  const item = document.createElement("div");
  const needsUrl = source.requiresUrl && !source.url;
  item.className = "source-item" + (source.enabled ? "" : " disabled");

  item.innerHTML = `
    <label class="source-toggle">
      <input type="checkbox" ${source.enabled ? "checked" : ""} ${needsUrl ? "disabled" : ""} data-id="${source.id}">
      <span class="source-toggle-slider"></span>
    </label>
    <div class="source-info">
      <div class="source-label">${escHtml(source.label)}</div>
      ${source.requiresUrl
        ? `<input type="url" class="source-url-inline" placeholder="https://firma.mitarbeiterangebote.de" value="${escHtml(source.url ?? "")}" data-id="${source.id}">`
        : `<div class="source-url">${escHtml(source.url)}</div>`
      }
      <div class="source-last${source.lastError ? " source-error" : ""}">${buildLastStr(source)}</div>
    </div>
    <div class="source-actions">
      <button class="btn-icon btn-refresh" title="Jetzt aktualisieren" data-refresh="${source.id}"${needsUrl ? " disabled" : ""}>↻</button>
    </div>
  `;

  item.querySelector("input[type='checkbox']").addEventListener("change", async (e) => {
    await updateSource(source.id, { enabled: e.target.checked });
  });

  if (source.requiresUrl) {
    const urlInput = item.querySelector(".source-url-inline");
    urlInput.addEventListener("change", async () => {
      await updateSource(source.id, { url: urlInput.value.trim() });
    });
  }

  item.querySelector("[data-refresh]").addEventListener("click", async () => {
    const { sources } = await chrome.storage.sync.get("sources");
    const s = sources?.find((x) => x.id === source.id);
    if (!s || (s.requiresUrl && !s.url)) return;
    if (!confirm(`„${s.label}" jetzt aktualisieren?\nDabei werden die gespeicherten Coupons dieser Quelle gelöscht und neu geladen.`)) return;
    startRefreshTimer();
    chrome.runtime.sendMessage({ type: "REFRESH_SOURCE", source: s }, () => {
      stopRefreshTimer();
      load();
    });
  });

  return item;
}

function buildCustomItem(source) {
  const item = document.createElement("div");
  item.className = "source-item" + (source.enabled ? "" : " disabled");

  item.innerHTML = `
    <label class="source-toggle">
      <input type="checkbox" ${source.enabled ? "checked" : ""} data-id="${source.id}">
      <span class="source-toggle-slider"></span>
    </label>
    <div class="source-info">
      <div class="source-label">${escHtml(source.label)}</div>
      <div class="source-url">${escHtml(source.url)}</div>
      <div class="source-last${source.lastError ? " source-error" : ""}">${buildLastStr(source)}</div>
    </div>
    <div class="source-actions">
      <button class="btn-icon btn-refresh" title="Jetzt aktualisieren" data-refresh="${source.id}">↻</button>
      <button class="btn-icon" title="Entfernen" data-remove="${source.id}">✕</button>
    </div>
  `;

  item.querySelector("input[type='checkbox']").addEventListener("change", async (e) => {
    await updateSource(source.id, { enabled: e.target.checked });
  });

  item.querySelector("[data-refresh]").addEventListener("click", async () => {
    const { sources } = await chrome.storage.sync.get("sources");
    const s = sources?.find((x) => x.id === source.id);
    if (!s) return;
    if (!confirm(`„${s.label}" jetzt aktualisieren?\nDabei werden die gespeicherten Coupons dieser Quelle gelöscht und neu geladen.`)) return;
    startRefreshTimer();
    chrome.runtime.sendMessage({ type: "REFRESH_SOURCE", source: s }, () => {
      stopRefreshTimer();
      load();
    });
  });

  item.querySelector("[data-remove]").addEventListener("click", async () => {
    await removeSource(source.id);
  });

  return item;
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

// --- Refresh timer ---

let _refreshTimer = null;
let _refreshElapsed = 0;

function startRefreshTimer() {
  _refreshElapsed = 0;
  setStatus("Lädt… (0s)");
  _refreshTimer = setInterval(() => {
    _refreshElapsed++;
    setStatus(`Lädt… (${_refreshElapsed}s)`);
  }, 1000);
}

function stopRefreshTimer() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  setStatus("Fertig ✓");
}

// --- Eigene Quelle hinzufügen ---

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
    setStatus("Bereits vorhanden");
    return;
  }

  const id = "custom_" + Date.now();
  const type = url.includes("mitarbeiterangebote.de") ? "mao" : url.includes("adac.de") ? "adac" : "generic";
  const newSource = { id, url, label, type, enabled: true };
  const updated = [...existing, newSource];
  await chrome.storage.sync.set({ sources: updated });

  document.getElementById("add-url").value = "";
  document.getElementById("add-label").value = "";
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display = "";
  renderSources(updated);
  setStatus("Quelle hinzugefügt ✓");
});

// --- Gesperrte Kategorien ---

document.getElementById("save-blocked-btn").addEventListener("click", async () => {
  const raw = document.getElementById("blocked-keywords").value;
  const keywords = raw.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  await chrome.storage.sync.set({ blockedKeywords: keywords });
  setStatus("Gespeichert ✓");
});

// --- Aktualisierungsintervall ---

document.getElementById("save-interval-btn").addEventListener("click", async () => {
  const hours = parseInt(document.getElementById("interval-hours").value) || 24;
  await chrome.storage.sync.set({ refreshIntervalHours: hours });
  setStatus("Gespeichert ✓");
});

// --- Alle Coupons löschen ---

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["vouchers"]);
  voucherData = [];
  currentPage = 1;
  searchQuery = "";
  renderVoucherList();
  setStatus("Gelöscht");
});

// --- Suche ---

document.getElementById("search").addEventListener("input", (e) => {
  searchQuery = e.target.value.toLowerCase();
  currentPage = 1;
  renderPage();
});

// --- Coupon-Liste ---

async function renderVoucherList() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const meta = document.getElementById("voucher-meta");
  const container = document.getElementById("voucher-list");
  const searchInput = document.getElementById("search");

  if (!vouchers || vouchers.length === 0) {
    meta.textContent = "";
    searchInput.style.display = "none";
    container.innerHTML = '<p class="no-vouchers">Noch keine Coupons gespeichert. Aktiviere eine Quelle und warte auf die nächste Aktualisierung, oder besuche die Quell-Seite.</p>';
    document.getElementById("pagination").innerHTML = "";
    voucherData = [];
    return;
  }

  const seen = new Set();
  voucherData = vouchers.filter((v) => {
    const key = v.providerDomain ?? v.provider;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ts = vouchers.reduce((max, v) => Math.max(max, v.extractedAt ?? 0), 0);
  meta.textContent = `${voucherData.length} Anbieter` +
    (ts ? ` · Zuletzt aktualisiert ${new Date(ts).toLocaleString()}` : "");

  searchInput.style.display = "block";
  searchQuery = "";
  searchInput.value = "";
  currentPage = 1;
  renderPage();
}

function renderPage() {
  const container = document.getElementById("voucher-list");

  const filtered = searchQuery
    ? voucherData.filter((v) =>
        `${v.provider} ${v.providerDomain ?? ""} ${v.sourceUrl ?? ""}`.toLowerCase().includes(searchQuery)
      )
    : voucherData;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  const table = document.createElement("table");
  table.className = "voucher-table";
  table.innerHTML = `<thead><tr>
    <th>Anbieter</th><th>Domain</th><th>Code</th><th>Quelle</th>
  </tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const v of slice) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "provider-cell";
    if (v.offerUrl) {
      const a = document.createElement("a");
      a.href = v.offerUrl;
      a.textContent = v.provider;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.cssText = "color:inherit;text-decoration:underline dotted;text-underline-offset:3px;";
      tdName.appendChild(a);
    } else {
      tdName.textContent = v.provider;
    }

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
      tdCode.title = "Klicken zum Kopieren";
      tdCode.addEventListener("click", () => {
        navigator.clipboard.writeText(firstCode).then(() => {
          const orig = tdCode.textContent;
          tdCode.textContent = "✓ Kopiert";
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
    tr.addEventListener("mouseenter", (e) => showTooltip(e, v));
    tr.addEventListener("mousemove", moveTooltip);
    tr.addEventListener("mouseleave", hideTooltip);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  renderPagination(filtered.length, totalPages);
}

function renderPagination(total, totalPages) {
  const el = document.getElementById("pagination");
  el.innerHTML = "";
  if (totalPages <= 1) return;

  const prev = document.createElement("button");
  prev.className = "btn-secondary";
  prev.textContent = "← Zurück";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => { currentPage--; renderPage(); });

  const info = document.createElement("span");
  info.className = "page-info";
  info.textContent = `Seite ${currentPage} von ${totalPages} (${total})`;

  const next = document.createElement("button");
  next.className = "btn-secondary";
  next.textContent = "Weiter →";
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => { currentPage++; renderPage(); });

  el.append(prev, info, next);
}

// --- Tooltip ---

const tooltip = document.getElementById("voucher-tooltip");

function showTooltip(e, v) {
  const parts = (v.discounts ?? []).map((d) => {
    let html = `<div class="tip-discount"><div class="tip-text">${escHtml(d.text)}</div>`;
    if (d.code) html += `<div class="tip-code">${escHtml(d.code)}</div>`;
    if (d.conditions) html += `<div class="tip-cond">${escHtml(d.conditions)}</div>`;
    return html + `</div>`;
  });
  if (!parts.length) parts.push(`<div class="tip-text" style="color:#475569">Keine Details</div>`);
  if (v.extractedAt) parts.push(`<div class="tip-footer">Gescannt ${new Date(v.extractedAt).toLocaleString()}</div>`);
  tooltip.innerHTML = parts.join("");
  tooltip.classList.add("visible");
  moveTooltip(e);
}

function moveTooltip(e) {
  const pad = 14;
  tooltip.style.left = "0";
  tooltip.style.top = "0";
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  const x = e.clientX + pad + tw > window.innerWidth ? e.clientX - tw - pad : e.clientX + pad;
  const y = e.clientY + pad + th > window.innerHeight ? e.clientY - th - pad : e.clientY + pad;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideTooltip() { tooltip.classList.remove("visible"); }

// --- Hilfsfunktionen ---

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  if (!msg.startsWith("Lädt")) setTimeout(() => (el.textContent = ""), 3000);
}

function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

load();
