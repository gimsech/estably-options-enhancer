const CACHE_TTL_MS = 60_000;
const priceCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || message.action !== "getPrice") {
    return false;
  }

  const ticker = String(message.ticker || "").trim().toUpperCase();

  if (!ticker) {
    respond({ ticker, error: "MISSING_TICKER" });
    return false;
  }

  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    respond({ ticker, price: cached.price, cached: true });
    return false;
  }

  fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose ?? null;

      if (typeof price !== "number" || !Number.isFinite(price)) {
        respond({ ticker, error: "PRICE_NOT_FOUND" });
        return;
      }

      priceCache.set(ticker, { price, timestamp: Date.now() });
      respond({ ticker, price, cached: false });
    })
    .catch((error) => {
      respond({ ticker, error: error?.message || "PRICE_REQUEST_FAILED" });
    });

  return true;
});
