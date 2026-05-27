# CouponAlert

A browser extension that automatically extracts discount vouchers from a configurable source page and highlights matching providers on comparison and shopping websites.

## Features

- **Zero-config scraping**: Visit your configured source page — the extension automatically detects all providers, their websites, and all available discounts (no CSS selectors needed)
- **Multiple discounts per provider**: Captures all offers per company including conditions
- **Domain-based badge injection**: On comparison and shopping sites, any provider with a stored voucher gets a badge — matched by domain, not fragile text matching
- **One-click copy**: Click the badge to copy the code to your clipboard
- **Popup overview**: Lists all stored providers with their discounts and copy buttons

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

If the converter crashes with a plug-in or CoreSimulator error, complete the Xcode first-launch setup first (requires admin password, takes a few minutes):

```bash
sudo xcodebuild -runFirstLaunch
```

Then convert and build once:

```bash
xcrun safari-web-extension-converter extension/ --project-location ~/Desktop
```

Open the generated Xcode project, build and run it, then enable the extension in Safari Settings → Extensions.

## Configuration

Open the extension options page (click ⚙ in the popup or via the browser extension settings).

Set the URL of your voucher source page. That's it — no CSS selectors, no manual mapping. The extension automatically detects the page structure and extracts all providers, their websites, discounts, codes, and conditions on every visit.

## How it works

1. When you visit the configured source URL, the content script scans the page using your selectors and saves all found vouchers to local extension storage.
2. On every other page, the content script scans visible text for provider names matching stored vouchers and injects a badge next to matching elements.
3. The background service worker sets a reminder badge on the extension icon after 60 minutes, prompting you to revisit the source page to refresh vouchers.

## Privacy

All data stays local. No analytics, no external requests, no data leaves your browser.
