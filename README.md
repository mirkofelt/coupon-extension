# CouponAlert

A browser extension that automatically extracts discount vouchers from a configurable source page and highlights matching providers on comparison and shopping websites.

## Features

- **Auto-extraction**: Visit your configured voucher source page — the extension detects and stores all voucher codes automatically
- **Badge injection**: On any website, providers with a stored voucher get a green "🏷 Coupon" badge injected inline
- **One-click copy**: Click the badge to copy the code to your clipboard
- **Popup overview**: Extension popup lists all stored vouchers with copy buttons
- **Configurable**: Source URL and CSS selectors are set via the options page — nothing is hardcoded

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Open the extension options and configure the source URL and CSS selectors

### Safari (macOS)

Requires the full **Xcode** app (not just Command Line Tools). If Xcode is not installed yet, get it from the Mac App Store (free, ~7 GB): [Xcode on the App Store](https://apps.apple.com/app/xcode/id497799835). If you get `unable to find utility "safari-web-extension-converter"` or `invalid developer directory`, run this first:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Then convert and build once:

```bash
xcrun safari-web-extension-converter /path/to/coupon-extension/extension --project-location ~/Desktop
```

Open the generated Xcode project, build and run it, then enable the extension in Safari Settings → Extensions.

## Configuration

Open the extension options page (click ⚙ in the popup or via the browser extension settings).

### Source Page

Set the full URL of the page listing your available vouchers. The extension will run on that page and extract vouchers automatically whenever you visit it.

### CSS Selectors

Inspect your source page with browser DevTools to find the right selectors:

| Field | Description | Example |
|---|---|---|
| Voucher container | Repeating wrapper element per voucher | `.offer-tile` |
| Provider name | Element containing the company/brand name | `.offer-title` |
| Voucher code | Element containing the code string | `.voucher-code` |
| Discount info | Optional — description of the deal | `.offer-description` |
| Expiry date | Optional — validity date | `.offer-validity` |

## How it works

1. When you visit the configured source URL, the content script scans the page using your selectors and saves all found vouchers to local extension storage.
2. On every other page, the content script scans visible text for provider names matching stored vouchers and injects a badge next to matching elements.
3. The background service worker sets a reminder badge on the extension icon after 60 minutes, prompting you to revisit the source page to refresh vouchers.

## Privacy

All data stays local. No analytics, no external requests, no data leaves your browser.
