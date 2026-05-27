async function init() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");

  const countRow = document.getElementById("count-row");
  const matchSection = document.getElementById("match-section");
  const noMatch = document.getElementById("no-match");
  const empty = document.getElementById("empty");
  const sourceLink = document.getElementById("source-link");

  if (sourceUrl) {
    sourceLink.href = sourceUrl;
    sourceLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: sourceUrl });
    });
  }

  if (!vouchers || vouchers.length === 0) {
    empty.style.display = "block";
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

  countRow.style.display = "block";
  countRow.innerHTML = `<strong>${deduped.length}</strong> voucher${deduped.length !== 1 ? "s" : ""} stored`;

  // Check if current page matches a stored voucher
  let currentDomain = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) currentDomain = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {}

  const match = currentDomain ? deduped.find((v) => v.providerDomain === currentDomain) : null;

  if (match) {
    matchSection.style.display = "block";
    renderMatch(matchSection, match);
  } else {
    noMatch.style.display = "block";
  }
}

function renderMatch(container, voucher) {
  const h2 = document.createElement("h2");
  h2.textContent = "Voucher for this site";
  container.appendChild(h2);

  const provEl = document.createElement("div");
  provEl.className = "match-provider";
  provEl.textContent = voucher.provider;
  container.appendChild(provEl);

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

    container.appendChild(row);
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
    container.appendChild(link);
  }
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
