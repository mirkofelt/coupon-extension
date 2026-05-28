async function init() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const { sources } = await chrome.storage.sync.get("sources");
  const enabledSources = (sources ?? []).filter((s) => s.enabled);

  const countRow = document.getElementById("count-row");
  const matchSection = document.getElementById("match-section");
  const noMatch = document.getElementById("no-match");
  const empty = document.getElementById("empty");
  const sourceLinksEl = document.getElementById("source-links");

  if (enabledSources.length > 0) {
    sourceLinksEl.innerHTML = enabledSources.map((s) =>
      `<a class="source-link-item" data-url="${s.url}">${s.label}</a>`
    ).join(", ");
    sourceLinksEl.querySelectorAll("[data-url]").forEach((a) => {
      a.href = a.dataset.url;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: a.dataset.url });
      });
    });
  }

  if (!vouchers || vouchers.length === 0) {
    empty.style.display = "block";
    return;
  }

  // Deduplicate by domain for the count row only
  const seen = new Set();
  const deduped = vouchers.filter((v) => {
    const key = v.providerDomain ?? v.provider;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  countRow.style.display = "block";
  countRow.innerHTML = `<strong>${deduped.length}</strong> voucher${deduped.length !== 1 ? "s" : ""} stored`;

  // Find ALL matches for current page from raw list (multiple sources may match)
  let currentDomain = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) currentDomain = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {}

  const matches = currentDomain
    ? vouchers.filter((v) => v.providerDomain === currentDomain)
    : [];

  if (matches.length > 0) {
    matchSection.style.display = "block";
    matches.forEach((m) => renderMatch(matchSection, m));
  } else {
    noMatch.style.display = "block";
  }
}

function renderMatch(container, voucher) {
  const card = document.createElement("div");
  card.className = "voucher-card";

  const titleEl = document.createElement("div");
  titleEl.className = "voucher-card-title";
  titleEl.textContent = voucher.providerDomain ?? voucher.provider;
  card.appendChild(titleEl);

  const provEl = document.createElement("div");
  provEl.className = "match-provider";
  provEl.textContent = voucher.provider;
  card.appendChild(provEl);

  for (const d of voucher.discounts) {
    const row = document.createElement("div");
    row.className = "discount-row";

    if (d.text) {
      const textEl = document.createElement("span");
      textEl.className = "discount-text";
      textEl.textContent = d.text;
      row.appendChild(textEl);
    }

    if (d.code) {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = d.code;
      btn.title = "Click to copy";
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(d.code).then(() => {
          btn.textContent = "✓";
          btn.classList.add("copied");
          setTimeout(() => { btn.textContent = d.code; btn.classList.remove("copied"); }, 2000);
        });
      });
      row.appendChild(btn);
    } else {
      const noCode = document.createElement("span");
      noCode.className = "no-code";
      noCode.textContent = "no code";
      row.appendChild(noCode);
    }

    card.appendChild(row);
  }

  if (voucher.offerUrl) {
    const link = document.createElement("a");
    link.className = "offer-link";
    link.textContent = "→ View on source page";
    link.href = voucher.offerUrl;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: voucher.offerUrl });
    });
    card.appendChild(link);
  }

  container.appendChild(card);
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
