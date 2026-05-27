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

  for (const v of vouchers) {
    const li = document.createElement("li");

    const nameEl = document.createElement("div");
    nameEl.className = "provider-name";
    nameEl.textContent = v.provider;
    li.appendChild(nameEl);

    const discountList = document.createElement("div");
    discountList.className = "discount-list";

    for (const d of v.discounts) {
      const row = document.createElement("div");
      row.className = "discount-row";

      const info = document.createElement("div");

      const textEl = document.createElement("div");
      textEl.className = "discount-text";
      textEl.textContent = d.text;
      info.appendChild(textEl);

      if (d.conditions) {
        const cond = document.createElement("div");
        cond.className = "conditions";
        cond.textContent = d.conditions;
        info.appendChild(cond);
      }

      row.appendChild(info);

      if (d.code) {
        const btn = document.createElement("button");
        btn.className = "copy-btn";
        btn.textContent = d.code;
        btn.title = "Click to copy";
        btn.addEventListener("click", () => {
          navigator.clipboard.writeText(d.code).then(() => {
            btn.textContent = "✓";
            btn.classList.add("copied");
            setTimeout(() => {
              btn.textContent = d.code;
              btn.classList.remove("copied");
            }, 2000);
          });
        });
        row.appendChild(btn);
      }

      discountList.appendChild(row);
    }

    li.appendChild(discountList);
    list.appendChild(li);
  }
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
