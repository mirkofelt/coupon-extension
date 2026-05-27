async function init() {
  const { vouchers } = await chrome.storage.local.get("vouchers");
  const { sourceUrl } = await chrome.storage.sync.get("sourceUrl");
  const list = document.getElementById("voucher-list");
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

  // Deduplicate by providerDomain — keep first occurrence per domain
  const seen = new Set();
  const deduped = vouchers.filter((v) => {
    const key = v.providerDomain ?? v.provider;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const v of deduped) {
    const li = document.createElement("li");

    const nameEl = document.createElement("div");
    nameEl.className = "provider-name";
    nameEl.textContent = v.provider;
    nameEl.title = v.provider;
    li.appendChild(nameEl);

    const inline = document.createElement("div");
    inline.className = "discounts-inline";

    for (const d of v.discounts) {
      // Skip text that would just repeat the code
      const textIsCode = d.code && d.text?.trim() === d.code.trim();
      if (d.text && !textIsCode) {
        const label = document.createElement("span");
        label.className = "discount-label";
        label.textContent = d.text;
        inline.appendChild(label);
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
        inline.appendChild(btn);
      }
    }

    li.appendChild(inline);
    list.appendChild(li);
  }
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
