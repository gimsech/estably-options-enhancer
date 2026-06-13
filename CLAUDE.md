# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Estably Options Enhancer** is a Chrome/Edge (Manifest V3) browser extension that augments the
Estably / Interactive Brokers (IBKR) Client Portal positions view at `https://www.clientam.com/portal/*`
with real-time options analytics. It parses option instruments from the positions table, fetches live
underlying prices from Yahoo Finance, and injects extra columns plus a floating summary panel.

It is **not affiliated** with Estably or IBKR. Output is purely informational — it does not compute
broker margin, tax treatment, or multi-leg strategy risk (see `DISCLAIMER.md` and `SECURITY.md`).

Current version: see `manifest.json` (`version` field).

## Tech Stack & Conventions

- **Plain ES6+ JavaScript, zero build step.** No bundler, no TypeScript, no transpilation, no
  minification. Files listed in `manifest.json` are loaded directly by the browser.
- **No `package.json`, no dependencies, no tests, no linter config.** Do not introduce a build
  toolchain unless explicitly asked — the design goal is auditable, unbundled source.
- **Module pattern:** each shared module is an IIFE that attaches a single namespace to
  `globalThis` (e.g. `globalThis.EstablyOptionsParser`). The content script consumes these globals;
  there is no `import`/`export` / module system.
- **Naming:** `camelCase` for functions/variables, `SNAKE_CASE` for constants
  (`CACHE_TTL_MS`, `DEBOUNCE_MS`, `ENHANCED_TABLE_ATTR`). CSS classes are prefixed `eoe-`; injected
  DOM markers use `data-estably-options-*` attributes. 2-space indentation.
- **Defensive DOM code:** null checks, `Number.isFinite()`, `instanceof Element` guards throughout,
  because the host page DOM is third-party and changes without notice.

## Architecture

```
manifest.json              # MV3 manifest — permissions, content scripts, service worker
background/
  service-worker.js        # MV3 service worker: price fetch + 60s in-memory cache
content/
  content-script.js        # Main orchestration: parse table, inject columns + panel
  content-style.css        # Styles for injected cells, risk colors, floating panel
shared/                    # Pure logic, loaded as globals before the content script
  parser.js                # EstablyOptionsParser — parse instrument names & localized numbers
  calculations.js          # EstablyOptionsCalculations — strategy, break-even, buffer, exposure
  formatters.js            # EstablyOptionsFormatters — i18n labels + Intl number/currency/percent
i18n/
  en.json / de.json        # Reference message catalogs (see i18n note below)
icons/                     # icon-16.png, icon-48.png, icon-128.png
```

### Manifest (MV3)

- **`permissions`:** `storage` (persists break-even overrides to `chrome.storage.local`).
- **`host_permissions`:** `https://www.clientam.com/*`, `https://query1.finance.yahoo.com/*`,
  `https://query2.finance.yahoo.com/*`.
- **`content_scripts`** match `https://www.clientam.com/portal/*`, run at `document_idle`. Load order
  matters: `shared/parser.js` → `shared/calculations.js` → `shared/formatters.js` →
  `content/content-script.js` (the shared globals must exist before the content script runs).
- **`background.service_worker`:** `background/service-worker.js`.

### Data flow

1. The content script locates the positions table (`findPositionsTable`), maps native columns by
   header text (`buildColumnMap`), and parses each row (`extractPositionFromRow`).
2. For each option it requests the underlying price by sending
   `chrome.runtime.sendMessage({ action: "getPrice", ticker })` to the service worker.
3. The service worker checks its 60-second in-memory `Map` cache, otherwise fetches Yahoo Finance
   (`regularMarketPrice` / `previousClose`) and responds `{ ticker, price, cached?, error? }`.
   Error codes: `MISSING_TICKER`, `PRICE_NOT_FOUND`, `PRICE_REQUEST_FAILED`.
4. `buildAnalytics` (in `calculations.js`) computes per-position metrics; the content script injects
   5 columns — **Underlying Price, Days to Expiry, Break-even, Buffer (%), Risk/Exposure** — and
   renders a floating summary panel (`renderAnalyticsPanel`) with portfolio-wide totals.
5. Re-enhancement is debounced (≈350ms) and driven by `MutationObserver`s on the table and document;
   a table "signature" skips redundant price fetches when nothing relevant changed.

### Key domain logic (`shared/`)

- **`parser.js`** — `parseInstrumentName()` regex-parses `"TICKER Mon Day'YY Strike Put/Call"` into
  `{ isOption, isStock, ticker, expiry…, strike, type }`; `parseLocalizedNumber()` handles
  comma/dot decimals, Unicode minus, `%`/`C` prefixes, trailing dashes.
- **`calculations.js`** — `getOptionStrategy()` → `shortPut` / `longPut` / `shortCall` / `longCall`
  (from position sign + option type); then `calculateBreakEven`, `calculateBufferPercent`,
  `calculateExposure`, `calculateDaysToExpiry`, `getRiskStatus`, and `summarizeAnalytics` for totals.
- **`formatters.js`** — `getLanguage()` returns `de` for `navigator.language` `de`/`de-*`, else `en`;
  `getLabels()` returns the localized label set; plus `Intl`-based number/currency/percent helpers.

### Storage & overrides

Manual break-even overrides (for rolled options) are entered via double-click on the break-even cell
and persisted to `chrome.storage.local`. Keys are pipe-delimited `"ticker|expiryRaw|strike|type"`.

### Risk buckets

Buffer % maps to: `very-comfortable` (>25%), `comfortable` (≥10%), `watch` (≥0%),
`critical` (≥-10%), `at-risk` (<-10%) — each with a matching `eoe-risk-*` CSS color class.

## i18n

The extension is bilingual (German / English). **The authoritative label sets live inline in
`shared/formatters.js`** (`labelSets.de` / `labelSets.en`). The `i18n/en.json` and `i18n/de.json`
files are reference catalogs and are **not** loaded at runtime — when changing UI strings, update
`formatters.js` and keep the JSON files in sync.

## Development

There is no build or test command. To run the extension:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this repository folder.
4. Visit `https://www.clientam.com/portal/*` (requires an Estably/IBKR login) and open the positions
   view; the extra columns and "Options Analytics" panel appear when the table is present.
5. Use DevTools console for logs/errors. After editing source, click the reload icon on the
   extension card — the content script detects "extension context invalidated" and disables its
   observers gracefully.

Distribution is an unpacked-folder `.zip` snapshot (`estably-options-enhancer-v*.zip`); bump
`version` in `manifest.json` for a release.

## Common gotchas

- The host DOM (clientam.com) is third-party — column detection is by **header text**, so be
  defensive and avoid hard-coded indices where possible.
- Keep the content-script load order in `manifest.json` intact; the shared globals must load first.
- Respect the existing `host_permissions`; adding new network calls means adding hosts there.
- Don't add a bundler/framework. Keep modules as `globalThis`-attached IIFEs.
