# Estably Options Enhancer

Browser extension for the Estably / IBKR Client Portal positions view. It adds option-related analytics directly to the existing positions table and provides a compact options analytics panel.

## Disclaimer

This project is provided for informational purposes only. Use it at your own risk.

It is not financial advice, tax advice, legal advice or investment advice. The extension can display incorrect or stale data, and option analytics may be incomplete, especially for rolled positions, complex strategies or broker-specific margin treatment. Always verify all values manually before making investment decisions.

The project is not affiliated with, endorsed by or sponsored by Estably, Interactive Brokers, IBKR or Yahoo Finance.

## Features

- Detects the Estably positions table on `https://www.clientam.com/portal/*`
- Adds columns for underlying price, days to expiry, break-even, buffer and risk / exposure
- Parses put and call instruments such as `XYZ Jun18'26 21 Put`
- Distinguishes long and short options from the position quantity
- Leaves stock positions visible and only adds the current underlying price
- Fetches prices through Yahoo Finance's chart API
- Uses a 60-second ticker cache in the MV3 background service worker
- Selects German for `de`, `de-DE`, `de-AT`, `de-CH`; English otherwise
- Adds an `Optionsanalyse` / `Options Analytics` tab-style entry next to `Impact Lens` when that tab exists
- Supports local break-even overrides for rolled options by double-clicking the break-even cell

## Install Locally in Chrome, Edge, Brave or Opera

### From a GitHub Release

1. Download the latest `estably-options-enhancer-v*.zip` file from the latest GitHub release.
2. Unzip the file.
3. Open `chrome://extensions`.
4. Enable developer mode.
5. Choose "Load unpacked".
6. Select the unzipped extension folder.
7. Open the Estably / IBKR Client Portal positions page.

### From Source

1. Open `chrome://extensions`.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select the cloned project folder.
5. Open the Estably / IBKR Client Portal positions page.

For Edge use `edge://extensions`. Brave and Opera provide the same unpacked-extension workflow in their extensions pages.

Firefox is not officially supported yet and needs a separate compatibility pass.

## Usage

1. Install the extension as an unpacked extension.
2. Open `https://www.clientam.com/portal/*`.
3. Go to Dashboard -> Positionen / Positions.
4. The extension adds five columns after the average-price column:
   - Underlying price
   - Days to expiry
   - Break-even
   - Buffer
   - Risk / Exposure
5. For rolled options, double-click the Break-even cell and enter your manually adjusted break-even. Leave the prompt empty to delete the override.

## Supported Analytics

The extension detects the option type from the instrument name and long/short direction from the position quantity.

| Type | Break-even | Buffer is favorable when | Risk / Exposure |
| --- | --- | --- | --- |
| Short Put | Strike - premium | Underlying is above break-even | Assignment value |
| Long Put | Strike - premium | Underlying is below break-even | Max risk |
| Short Call | Strike + premium | Underlying is below break-even | Delivery value |
| Long Call | Strike + premium | Underlying is above break-even | Max risk |

## Privacy

The extension has no backend. It reads visible table data locally in the browser and sends only ticker symbols, such as `XYZ` or `ABC`, to Yahoo Finance for price lookup. It does not store account numbers, orders, login data, portfolio history or personal data.

## Known Limitations

- Firefox is currently unsupported.
- Yahoo Finance data may be delayed, unavailable, rate-limited or incorrect.
- Rolled options require manual break-even overrides.
- Broker margin, tax treatment, assignment probability and multi-leg strategy risk are not calculated.
- The extension depends on the current Estably / IBKR Client Portal DOM structure, which can change without notice.
- Chrome Web Store publication has not been completed; local unpacked installation is the supported installation path for now.

## Notes

Short-put assignment value and short-call delivery value are calculated as `strike * 100 * abs(contracts)`. Long-option max risk is calculated as `premium * 100 * abs(contracts)`. These values are not broker margin and are intentionally not labeled as margin.

Break-even overrides are stored locally in the browser with `chrome.storage.local`.
