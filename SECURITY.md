# Security Policy

## Supported Versions

Only the latest public release is supported.

## Reporting a Vulnerability

Please report security issues privately by emailing the repository owner or by opening a GitHub security advisory if available.

Do not include account numbers, login credentials, screenshots with personal data, portfolio values or broker documents in public issues.

## Data Handling

The extension does not use a custom backend. It processes visible table data locally in the browser and sends only ticker symbols to Yahoo Finance for price lookup.

Break-even overrides are stored locally in the browser with `chrome.storage.local`.

## Scope

Security reports are most useful when they relate to:

- accidental collection or exposure of sensitive data
- overly broad extension permissions
- unsafe DOM handling
- dependency or packaging issues
- behavior that could be mistaken for brokerage/order functionality
