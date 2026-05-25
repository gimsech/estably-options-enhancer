(function attachFormatters(global) {
  function getLanguage() {
    const language = (navigator.language || "en").toLowerCase();
    return language === "de" || language.startsWith("de-") ? "de" : "en";
  }

  const labelSets = {
    de: {
      underlyingPrice: "Aktienkurs",
      daysToExpiry: "Tage bis Ablauf",
      breakEven: "Break-even",
      buffer: "Abstand",
      assignmentExposure: "Andienungswert",
      exposureRisk: "Risiko / Exposure",
      deliveryExposure: "Lieferpflicht",
      maxRisk: "Max. Risiko",
      shortPut: "Short Put",
      longPut: "Long Put",
      shortCall: "Short Call",
      longCall: "Long Call",
      refresh: "Aktualisieren",
      analyticsTab: "Optionsanalyse",
      totalAssignmentExposure: "Gesamt gebunden bei Andienung",
      optionPositions: "Optionspositionen",
      criticalPositions: "Kritisch",
      watchPositions: "Beobachten",
      comfortablePositions: "Komfortabel",
      veryComfortable: "Sehr komfortabel",
      comfortable: "Komfortabel",
      watch: "Beobachten",
      critical: "Kritisch",
      atRisk: "Gefährdet",
      notAvailable: "n/a"
    },
    en: {
      underlyingPrice: "Underlying Price",
      daysToExpiry: "Days to Expiry",
      breakEven: "Break-even",
      buffer: "Buffer",
      assignmentExposure: "Assignment Value",
      exposureRisk: "Risk / Exposure",
      deliveryExposure: "Delivery Obligation",
      maxRisk: "Max Risk",
      shortPut: "Short Put",
      longPut: "Long Put",
      shortCall: "Short Call",
      longCall: "Long Call",
      refresh: "Refresh",
      analyticsTab: "Options Analytics",
      totalAssignmentExposure: "Total Assignment Exposure",
      optionPositions: "Option Positions",
      criticalPositions: "Critical",
      watchPositions: "Watch",
      comfortablePositions: "Comfortable",
      veryComfortable: "Very comfortable",
      comfortable: "Comfortable",
      watch: "Watch",
      critical: "Critical",
      atRisk: "At risk",
      notAvailable: "n/a"
    }
  };

  function getLabels() {
    return labelSets[getLanguage()] || labelSets.en;
  }

  function formatNumber(value, options = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return options.fallback || getLabels().notAvailable;
    }

    return new Intl.NumberFormat(getLanguage(), {
      minimumFractionDigits: options.minimumFractionDigits ?? 2,
      maximumFractionDigits: options.maximumFractionDigits ?? 2
    }).format(value);
  }

  function formatCurrency(value, currency = "USD") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return getLabels().notAvailable;
    }

    return new Intl.NumberFormat(getLanguage(), {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatCurrencyNumber(value) {
    return formatNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatPercent(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "—";
    }

    const sign = value > 0 ? "+" : "";
    return `${sign}${formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  global.EstablyOptionsFormatters = {
    getLanguage,
    getLabels,
    formatNumber,
    formatCurrency,
    formatCurrencyNumber,
    formatPercent
  };
})(globalThis);
