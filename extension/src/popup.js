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

  vouchers.forEach((v) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.overflow = "hidden";

    const provider = document.createElement("div");
    provider.className = "provider";
    provider.textContent = v.provider;

    const discount = document.createElement("div");
    discount.className = "discount";
    discount.textContent = [v.discount, v.expiry ? `until ${v.expiry}` : ""]
      .filter(Boolean)
      .join(" · ");

    info.append(provider, discount);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = v.code;
    btn.title = "Click to copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(v.code).then(() => {
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = v.code;
          btn.classList.remove("copied");
        }, 2000);
      });
    });

    li.append(info, btn);
    list.appendChild(li);
  });
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
