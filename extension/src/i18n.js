const lang = (navigator.language ?? "en").startsWith("de") ? "de" : "en";

const MESSAGES = {
  en: {
    // Page
    optionsTitle: "CouponAlert Settings",
    // Section headers
    sourcesSection: "Sources",
    predefinedSources: "Predefined Sources",
    customSources: "Custom Sources",
    blockedSection: "Blocked Categories",
    intervalSection: "Auto-Refresh",
    vouchersSection: "Stored Vouchers",
    // Add form
    labelUrl: "URL",
    labelName: "Name",
    placeholderUrl: "https://example.com/vouchers",
    placeholderName: "My Portal",
    placeholderCbUrl: "https://company.mitarbeiterangebote.de",
    btnAdd: "Add",
    btnCancel: "Cancel",
    btnAddSource: "+ Add Custom Source",
    btnClearVouchers: "Clear All Vouchers",
    // Source states
    noPredefined: "No predefined sources.",
    noCustom: "No custom sources added yet.",
    neverSynced: "Never synced",
    lastSynced: "Last synced",
    // Error labels
    errNotLoggedIn: "⚠ Not logged in",
    errNoItems: "⚠ No items (site structure changed?)",
    errNetwork: "⚠ Network error",
    errNoResults: "⚠ No results",
    errRateLimited: "⚠ Rate limited (429 ×{n})",
    errHttp: "⚠ HTTP {s} ×{n}",
    errGeneric: "⚠ Error",
    // Refresh
    confirmRefresh: "Refresh \"{label}\" now?\nThis will delete and reload all stored coupons for this source.",
    refreshingTimer: "Loading… ({s}s)",
    refreshDone: "Done ✓",
    openedTab: "Tab opened — scraping starts when you're logged in ↗",
    // Status
    alreadyExists: "Already exists",
    sourceAdded: "Source added ✓",
    saved: "Saved ✓",
    cleared: "Cleared",
    // Blocked
    labelBlockedHint: "Skip providers matching these keywords (one per line, case-insensitive)",
    hintBlocked: "Providers whose name contains any of these words will be skipped during scraping.",
    btnSave: "Save",
    // Interval
    intervalBefore: "Refresh every",
    intervalAfter: "hours",
    hintInterval: "The extension refreshes all enabled sources in the background. Sources requiring login need valid session cookies.",
    // Vouchers table
    noVouchers: "No vouchers stored yet. Enable a source and wait for the next refresh, or visit the source page.",
    placeholderSearch: "Search providers…",
    colProvider: "Provider",
    colDomain: "Domain",
    colCode: "Code",
    colSource: "Source",
    clickToCopy: "Click to copy",
    copied: "✓ Copied",
    btnPrev: "← Prev",
    btnNext: "Next →",
    noDetails: "No discount details",
    scanned: "Scraped",
    // Popup
    popupNoMatch: "No voucher for this site.",
    popupEmpty: "No vouchers yet.",
    popupVisit: "Visit your",
    popupImport: "to import them.",
    noCode: "no code",
    viewSource: "→ View on source page",
    btnSettings: "Settings",
    popupCountSuffix: "vouchers stored",
  },
  de: {
    // Page
    optionsTitle: "CouponAlert Einstellungen",
    // Section headers
    sourcesSection: "Quellen",
    predefinedSources: "Vordefinierte Quellen",
    customSources: "Eigene Quellen",
    blockedSection: "Gesperrte Kategorien",
    intervalSection: "Automatische Aktualisierung",
    vouchersSection: "Gespeicherte Coupons",
    // Add form
    labelUrl: "URL",
    labelName: "Bezeichnung",
    placeholderUrl: "https://example.com/vouchers",
    placeholderName: "Mein Portal",
    placeholderCbUrl: "https://firma.mitarbeiterangebote.de",
    btnAdd: "Hinzufügen",
    btnCancel: "Abbrechen",
    btnAddSource: "+ Eigene Quelle hinzufügen",
    btnClearVouchers: "Alle Coupons löschen",
    // Source states
    noPredefined: "Keine vordefinierten Quellen.",
    noCustom: "Noch keine eigenen Quellen hinzugefügt.",
    neverSynced: "Noch nicht synchronisiert",
    lastSynced: "Zuletzt synchronisiert",
    // Error labels
    errNotLoggedIn: "⚠ Nicht eingeloggt",
    errNoItems: "⚠ Keine Einträge (Seitenstruktur geändert?)",
    errNetwork: "⚠ Netzwerkfehler",
    errNoResults: "⚠ Keine Ergebnisse",
    errRateLimited: "⚠ Zu viele Anfragen (429 ×{n})",
    errHttp: "⚠ HTTP {s} ×{n}",
    errGeneric: "⚠ Fehler",
    // Refresh
    confirmRefresh: "„{label}“ jetzt aktualisieren?\nDabei werden die gespeicherten Coupons dieser Quelle gelöscht und neu geladen.",
    refreshingTimer: "Lädt… ({s}s)",
    refreshDone: "Fertig ✓",
    openedTab: "Tab geöffnet — Scraping startet wenn du eingeloggt bist ↗",
    // Status
    alreadyExists: "Bereits vorhanden",
    sourceAdded: "Quelle hinzugefügt ✓",
    saved: "Gespeichert ✓",
    cleared: "Gelöscht",
    // Blocked
    labelBlockedHint: "Anbieter mit diesen Stichwörtern überspringen (eines pro Zeile, Groß-/Kleinschreibung egal)",
    hintBlocked: "Anbieter, deren Name eines dieser Wörter enthält, werden beim Scrapen übersprungen.",
    btnSave: "Speichern",
    // Interval
    intervalBefore: "Alle",
    intervalAfter: "Stunden aktualisieren",
    hintInterval: "Die Extension aktualisiert alle aktivierten Quellen im Hintergrund. Bei Quellen, die einen Login erfordern, muss der Browser aktive Session-Cookies haben.",
    // Vouchers table
    noVouchers: "Noch keine Coupons gespeichert. Aktiviere eine Quelle und warte auf die nächste Aktualisierung, oder besuche die Quell-Seite.",
    placeholderSearch: "Anbieter suchen…",
    colProvider: "Anbieter",
    colDomain: "Domain",
    colCode: "Code",
    colSource: "Quelle",
    clickToCopy: "Klicken zum Kopieren",
    copied: "✓ Kopiert",
    btnPrev: "← Zurück",
    btnNext: "Weiter →",
    noDetails: "Keine Details",
    scanned: "Gescannt",
    // Popup
    popupNoMatch: "Kein Gutschein für diese Seite.",
    popupEmpty: "Noch keine Coupons.",
    popupVisit: "Besuche",
    popupImport: "um sie zu importieren.",
    noCode: "kein Code",
    viewSource: "→ Auf Quell-Seite ansehen",
    btnSettings: "Einstellungen",
    popupCountSuffix: "Gutscheine gespeichert",
  },
};

export function t(key, vars = {}) {
  let msg = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) msg = msg.replace(`{${k}}`, v);
  return msg;
}

export function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
