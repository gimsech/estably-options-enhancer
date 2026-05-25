(function attachParser(global) {
  function parseInstrumentName(name) {
    const clean = String(name || "").replace(/\s+/g, " ").trim();

    if (!clean) {
      return { isOption: false, isStock: false, ticker: null };
    }

    const optionMatch = clean.match(
      /(?:^|\b)([A-Z0-9.\-]+)\s+([A-Za-z]{3})(\d{1,2})'(\d{2})\s+(\d+(?:[.,]\d+)?)\s+(Put|Call)(?:\b|$)/i
    );

    if (!optionMatch) {
      return {
        isOption: false,
        isStock: true,
        ticker: clean.split(" ")[0].toUpperCase()
      };
    }

    const [, ticker, month, day, year, strikeRaw, type] = optionMatch;

    return {
      isOption: true,
      isStock: false,
      ticker: ticker.toUpperCase(),
      expiryRaw: `${month}${day}'${year}`,
      expiryYear: Number(`20${year}`),
      strike: Number(strikeRaw.replace(",", ".")),
      type: type.toLowerCase() === "put" ? "Put" : "Call"
    };
  }

  function parseLocalizedNumber(value) {
    if (value == null) {
      return null;
    }

    const cleaned = String(value)
      .replace(/\u2212/g, "-")
      .replace(/^C/i, "")
      .replace(/%/g, "")
      .replace(/[—–-]$/g, "")
      .replace(/^[—–]$/g, "")
      .trim();

    if (!cleaned) {
      return null;
    }

    const numericMatch = cleaned.replace(/\s/g, "").match(/[+-]?C?\d[\d.,]*/i);

    if (!numericMatch) {
      return null;
    }

    const numericValue = numericMatch[0].replace(/^C/i, "");
    const hasComma = numericValue.includes(",");
    const hasDot = numericValue.includes(".");
    let normalized = numericValue;

    if (hasComma && hasDot) {
      normalized = numericValue.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      normalized = numericValue.replace(",", ".");
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  global.EstablyOptionsParser = {
    parseInstrumentName,
    parseLocalizedNumber
  };
})(globalThis);
