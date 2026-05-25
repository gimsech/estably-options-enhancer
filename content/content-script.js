(function attachContentScript() {
  const ENHANCED_TABLE_ATTR = "data-estably-options-enhanced";
  const ENHANCER_CELL_ATTR = "data-estably-options-cell";
  const ENHANCER_TAB_ATTR = "data-estably-options-tab";
  const DEBOUNCE_MS = 350;
  const BREAK_EVEN_OVERRIDES_KEY = "establyOptionsBreakEvenOverrides";

  const { parseInstrumentName, parseLocalizedNumber } = globalThis.EstablyOptionsParser;
  const { buildAnalytics, summarizeAnalytics } = globalThis.EstablyOptionsCalculations;
  const { getLabels, formatCurrency, formatCurrencyNumber, formatNumber, formatPercent } = globalThis.EstablyOptionsFormatters;

  const labels = getLabels();
  let debounceTimer = null;
  let lastAnalyticsItems = [];
  let lastTableSignature = null;
  let lastSummarySignature = null;
  let isEnhancing = false;
  let pendingEnhancement = false;
  let observedTable = null;
  let tableObserver = null;
  let breakEvenOverrides = {};

  function findPositionsTable() {
    return (
      document.querySelector("#cp-ptf-positions-table0") ||
      document.querySelector('table[role="grid"][id^="cp-ptf-positions-table"]') ||
      document.querySelector('table[role="grid"]')
    );
  }

  function visibleText(element) {
    return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function buildColumnMap(table) {
    const headers = Array.from(table.querySelectorAll(`thead th:not([${ENHANCER_CELL_ATTR}])`));
    const map = {};

    headers.forEach((th, index) => {
      const label = visibleText(th).toLowerCase();

      if (map.instrument == null && label.includes("instrument")) {
        map.instrument = index;
      }
      if (map.position == null && label.includes("position")) {
        map.position = index;
      }
      if (map.avgPrice == null && (label.includes("ø-kurs") || label.includes("avg price") || label.includes("average price"))) {
        map.avgPrice = index;
      }
      if (map.last == null && (label.includes("letzt") || label.includes("last"))) {
        map.last = index;
      }
    });

    return {
      instrument: map.instrument ?? 1,
      position: map.position ?? 2,
      last: map.last ?? 3,
      avgPrice: map.avgPrice ?? 7
    };
  }

  function analyticsInsertIndex(columnMap) {
    return Number.isInteger(columnMap.avgPrice) ? columnMap.avgPrice + 1 : 8;
  }

  function tableCells(row) {
    return Array.from(row.children).filter((cell) => cell.matches?.("th, td"));
  }

  function nativeTableCells(row) {
    return tableCells(row).filter((cell) => !cell.hasAttribute(ENHANCER_CELL_ATTR));
  }

  function insertCellBeforeNative(row, nativeIndex, cell) {
    const target = nativeTableCells(row)[nativeIndex] || null;
    row.insertBefore(cell, target);
  }

  function isEnhancerCellInBlockPosition(row, nativeIndex, offset, total, cell) {
    const cells = tableCells(row);
    const target = nativeTableCells(row)[nativeIndex] || null;
    const targetIndex = target ? cells.indexOf(target) : cells.length;

    return cells[targetIndex - total + offset] === cell;
  }

  function createCell(tagName, text = "", className = "") {
    const cell = document.createElement(tagName);
    cell.setAttribute(ENHANCER_CELL_ATTR, "true");
    cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function getStorageArea() {
    return chrome?.storage?.local || null;
  }

  function loadBreakEvenOverrides() {
    const storage = getStorageArea();

    if (!storage) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      storage.get(BREAK_EVEN_OVERRIDES_KEY, (result) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }

        resolve(result?.[BREAK_EVEN_OVERRIDES_KEY] || {});
      });
    });
  }

  function saveBreakEvenOverrides(overrides) {
    const storage = getStorageArea();

    if (!storage) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      storage.set({ [BREAK_EVEN_OVERRIDES_KEY]: overrides }, resolve);
    });
  }

  function overrideKey(parsed) {
    return [parsed.ticker, parsed.expiryRaw, parsed.strike, parsed.type].join("|");
  }

  function ensureEnhancerColumns(table, columnMap) {
    const colgroup = table.querySelector("colgroup");
    if (!colgroup) {
      return;
    }

    const existingColumns = Array.from(colgroup.querySelectorAll(`col[${ENHANCER_CELL_ATTR}]`));
    const insertAt = analyticsInsertIndex(columnMap);
    const widths = ["120px", "120px", "180px", "190px"];

    widths.forEach((width, offset) => {
      let col = existingColumns[offset];

      if (!col) {
        col = document.createElement("col");
        col.setAttribute(ENHANCER_CELL_ATTR, "true");
      }

      if (col.style.width !== width) {
        col.style.width = width;
      }

      const nativeColumns = Array.from(colgroup.children).filter((candidate) => !candidate.hasAttribute(ENHANCER_CELL_ATTR));
      const target = nativeColumns[insertAt] || null;
      colgroup.insertBefore(col, target);
    });

    Array.from(colgroup.querySelectorAll(`col[${ENHANCER_CELL_ATTR}]`))
      .slice(widths.length)
      .forEach((col) => col.remove());
  }

  function setCellState(cell, text, className, title = "") {
    if (cell.textContent !== text) {
      cell.textContent = text;
    }
    if (cell.className !== className) {
      cell.className = className;
    }
    if (title) {
      if (cell.title !== title) {
        cell.title = title;
      }
    } else if (cell.hasAttribute("title")) {
      cell.removeAttribute("title");
    }
  }

  function setCurrencyCellState(cell, value, className, title = "", fallback = labels.notAvailable) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      setCellState(cell, fallback, className, title);
      return;
    }

    const amount = formatCurrencyNumber(value);
    const currentAmount = cell.querySelector(":scope > span")?.textContent;
    const currentCurrency = cell.querySelector(":scope > div")?.textContent;

    if (cell.className !== className) {
      cell.className = className;
    }

    if (currentAmount !== amount || currentCurrency !== "USD") {
      const amountElement = document.createElement("span");
      amountElement.textContent = amount;

      const currencyElement = document.createElement("div");
      currencyElement.className = "fs8 fg70 eoe-currency-label";
      currencyElement.textContent = "USD";

      cell.replaceChildren(amountElement, currencyElement);
    }

    if (title) {
      if (cell.title !== title) {
        cell.title = title;
      }
    } else if (cell.hasAttribute("title")) {
      cell.removeAttribute("title");
    }
  }

  function parsePromptNumber(value) {
    const parsed = parseLocalizedNumber(value);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  }

  function getUnderlyingStrikeClass(analytics, parsed) {
    if (
      !parsed.isOption ||
      typeof analytics.underlyingPrice !== "number" ||
      typeof parsed.strike !== "number" ||
      !analytics.strategy
    ) {
      return "eoe-price-neutral";
    }

    if (analytics.strategy === "shortPut" || analytics.strategy === "longCall") {
      return analytics.underlyingPrice >= parsed.strike ? "eoe-risk-comfortable" : "eoe-risk-at-risk";
    }

    if (analytics.strategy === "shortCall" || analytics.strategy === "longPut") {
      return analytics.underlyingPrice <= parsed.strike ? "eoe-risk-comfortable" : "eoe-risk-at-risk";
    }

    return "eoe-price-neutral";
  }

  function enhancerCells(row) {
    return tableCells(row).filter((cell) => cell.hasAttribute(ENHANCER_CELL_ATTR));
  }

  function removeExtraEnhancerCells(row, expectedCount) {
    enhancerCells(row)
      .slice(expectedCount)
      .forEach((cell) => cell.remove());
  }

  function ensureHeaders(table, columnMap) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) {
      return;
    }

    const insertAt = analyticsInsertIndex(columnMap);
    ensureEnhancerColumns(table, columnMap);
    const headerLabels = [
      labels.underlyingPrice,
      labels.breakEven,
      labels.buffer,
      labels.exposureRisk
    ];
    const existingEnhancerCells = enhancerCells(headerRow);

    headerLabels.forEach((label, offset) => {
      let cell = existingEnhancerCells[offset];

      if (!cell) {
        cell = createCell("th");
      }

      setCellState(cell, label, "eoe-header-cell");

      if (!isEnhancerCellInBlockPosition(headerRow, insertAt, offset, headerLabels.length, cell)) {
        insertCellBeforeNative(headerRow, insertAt, cell);
      }
    });

    removeExtraEnhancerCells(headerRow, headerLabels.length);
    table.setAttribute(ENHANCED_TABLE_ATTR, "true");
    const originalColumnCount = headerRow.querySelectorAll(`th:not([${ENHANCER_CELL_ATTR}])`).length;
    table.setAttribute("aria-colcount", String(originalColumnCount + 4));
  }

  function extractPositionFromRow(row, columnMap) {
    const cells = nativeTableCells(row);
    const instrumentCell = cells[columnMap.instrument] || cells[0];
    const positionCell = cells[columnMap.position];
    const avgPriceCell = cells[columnMap.avgPrice];
    const lastCell = cells[columnMap.last];
    const avgPrice =
      parseLocalizedNumber(visibleText(avgPriceCell)) ??
      parseLocalizedNumber(visibleText(cells[cells.length - 4]));

    return {
      instrument: visibleText(instrumentCell) || row.getAttribute("aria-label") || "",
      positionSize: parseLocalizedNumber(visibleText(positionCell)),
      avgPrice,
      last: parseLocalizedNumber(visibleText(lastCell))
    };
  }

  function getStockPrice(ticker) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getPrice", ticker }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ticker, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ticker, error: "NO_RESPONSE" });
      });
    });
  }

  function ensureRowAnalyticsCells(row, columnMap) {
    const insertAt = analyticsInsertIndex(columnMap);
    const cells = [];
    const existingEnhancerCells = enhancerCells(row);

    for (let index = 0; index < 4; index += 1) {
      let cell = existingEnhancerCells[index];

      if (!cell) {
        cell = createCell("td");
      }

      if (!isEnhancerCellInBlockPosition(row, insertAt, index, 4, cell)) {
        insertCellBeforeNative(row, insertAt, cell);
      }

      cells.push(cell);
    }

    removeExtraEnhancerCells(row, 4);
    return cells;
  }

  function attachBreakEvenOverrideHandler(cell, parsed, analytics) {
    if (!parsed.isOption) {
      cell.ondblclick = null;
      cell.removeAttribute("data-estably-options-adjustable");
      return;
    }

    cell.setAttribute("data-estably-options-adjustable", "true");
    cell.title = analytics.isAdjustedBreakEven
      ? "Doppelklick: angepassten Break-even ändern oder leeren"
      : "Doppelklick: angepassten Break-even für gerollte Option setzen";
    cell.ondblclick = (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentValue = analytics.isAdjustedBreakEven ? formatCurrencyNumber(analytics.breakEven) : "";
      const input = window.prompt(
        "Angepassten Break-even eingeben. Leer lassen, um die Anpassung zu löschen.",
        currentValue
      );

      if (input == null) {
        return;
      }

      const key = overrideKey(parsed);
      const nextOverrides = { ...breakEvenOverrides };

      if (!input.trim()) {
        delete nextOverrides[key];
      } else {
        const parsedInput = parsePromptNumber(input);

        if (parsedInput == null) {
          window.alert("Bitte eine gültige Zahl eingeben, z. B. 17,51.");
          return;
        }

        nextOverrides[key] = parsedInput;
      }

      saveBreakEvenOverrides(nextOverrides).then(() => {
        breakEvenOverrides = nextOverrides;
        lastTableSignature = null;
        scheduleEnhancement();
      });
    };
  }

  function injectAnalyticsCells(row, columnMap, analytics, priceResult, parsed) {
    const cells = ensureRowAnalyticsCells(row, columnMap);
    const strategyLabel = analytics.strategy ? labels[analytics.strategy] || analytics.strategy : "";
    const priceClass = priceResult?.error
      ? "eoe-cell eoe-number eoe-error"
      : `eoe-cell eoe-number eoe-price ${getUnderlyingStrikeClass(analytics, parsed)}`;
    const bufferClass = analytics.riskStatus
      ? `eoe-cell eoe-buffer eoe-risk-${analytics.riskStatus.key}`
      : "eoe-cell eoe-buffer";
    const bufferText = analytics.riskStatus
      ? `${formatPercent(analytics.bufferPercent)} · ${analytics.riskStatus.label}`
      : "—";

    if (priceResult?.error) {
      setCellState(cells[0], labels.notAvailable, priceClass, priceResult.error);
    } else {
      setCurrencyCellState(cells[0], analytics.underlyingPrice, priceClass, strategyLabel);
    }
    setCurrencyCellState(
      cells[1],
      analytics.breakEven,
      analytics.isAdjustedBreakEven ? "eoe-cell eoe-number eoe-adjusted-break-even" : "eoe-cell eoe-number",
      "",
      "—"
    );
    attachBreakEvenOverrideHandler(cells[1], parsed, analytics);
    setCellState(cells[2], bufferText, bufferClass);
    const exposureTitle = [strategyLabel, analytics.exposureLabelKey ? labels[analytics.exposureLabelKey] : ""]
      .filter(Boolean)
      .join(" · ");
    setCurrencyCellState(
      cells[3],
      analytics.assignmentExposure,
      "eoe-cell eoe-number",
      exposureTitle,
      "—"
    );
  }

  function buildTableSignature(rows, columnMap) {
    return rows
      .map((row) => {
        const position = extractPositionFromRow(row, columnMap);
        return [position.instrument, position.positionSize, position.avgPrice, position.last].join("::");
      })
      .join("||");
  }

  function buildSummarySignature(items) {
    const summary = summarizeAnalytics(items);
    return JSON.stringify(summary);
  }

  function hasCompleteEnhancement(table, rows) {
    const headerRow = table.querySelector("thead tr");
    const columnMap = buildColumnMap(table);
    const insertAt = analyticsInsertIndex(columnMap);

    return (
      enhancerCells(headerRow || document.createElement("tr")).length === 4 &&
      [headerRow, ...rows].every((row) => {
        if (!row) {
          return false;
        }

        const cells = enhancerCells(row);
        return (
          cells.length === 4 &&
          cells.every((cell, offset) => isEnhancerCellInBlockPosition(row, insertAt, offset, 4, cell))
        );
      })
    );
  }

  function analyticsKey(position) {
    return [position.instrument, position.positionSize, position.avgPrice, position.last].join("::");
  }

  function buildAnalyticsLookup(items) {
    return new Map(items.map((item) => [analyticsKey(item), item]));
  }

  async function enhancePositionsTable() {
    if (isEnhancing) {
      return;
    }

    const table = findPositionsTable();
    if (!table) {
      return;
    }

    isEnhancing = true;

    try {
      const columnMap = buildColumnMap(table);
      breakEvenOverrides = await loadBreakEvenOverrides();
      ensureHeaders(table, columnMap);

      const rows = Array.from(table.querySelectorAll("tbody tr")).filter((row) => row.children.length > 0);
      const tableSignature = buildTableSignature(rows, columnMap);

      if (tableSignature && tableSignature === lastTableSignature && hasCompleteEnhancement(table, rows)) {
        ensureAnalyticsTab();
        ensureTableObserver(table);
        return;
      }

      const canReuseAnalytics = tableSignature && tableSignature === lastTableSignature;
      const analyticsLookup = canReuseAnalytics ? buildAnalyticsLookup(lastAnalyticsItems) : null;
      const analyticsItems = [];

      for (const row of rows) {
        const rawPosition = extractPositionFromRow(row, columnMap);
        const parsed = parseInstrumentName(rawPosition.instrument);

        if (!parsed.ticker) {
          continue;
        }

        const reusableItem = analyticsLookup?.get(analyticsKey(rawPosition));
        const priceResult = reusableItem
          ? { ticker: parsed.ticker, price: reusableItem.analytics.underlyingPrice, cached: true }
          : await getStockPrice(parsed.ticker);
        const analytics =
          reusableItem?.analytics ||
          buildAnalytics(
            {
              ...rawPosition,
              ...parsed,
              breakEvenOverride: breakEvenOverrides[overrideKey(parsed)],
              underlyingPrice: priceResult?.price
            },
            labels
          );

        injectAnalyticsCells(row, columnMap, analytics, priceResult, parsed);
        analyticsItems.push({ ...rawPosition, ...parsed, analytics });
      }

      lastAnalyticsItems = analyticsItems;
      lastTableSignature = tableSignature;
      ensureAnalyticsTab();
      renderAnalyticsPanelIfNeeded();
      ensureTableObserver(table);
    } finally {
      isEnhancing = false;
      if (pendingEnhancement) {
        pendingEnhancement = false;
        scheduleEnhancement();
      }
    }
  }

  function findImpactLensTab() {
    const candidates = Array.from(document.querySelectorAll('[role="tab"], button, a, li, div, span'));
    return candidates.find((element) => visibleText(element).toLowerCase() === "impact lens");
  }

  function ensureAnalyticsTab() {
    if (document.querySelector(`[${ENHANCER_TAB_ATTR}]`)) {
      return;
    }

    const impactLensTab = findImpactLensTab();
    if (!impactLensTab || !impactLensTab.parentElement) {
      return;
    }

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = impactLensTab.className.replace(/\b_taba\b/g, "").trim() || "_tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute(ENHANCER_TAB_ATTR, "true");
    tab.setAttribute("aria-selected", "false");
    const label = document.createElement("span");
    label.textContent = labels.analyticsTab;
    tab.append(label);
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleAnalyticsPanel();
    });

    impactLensTab.parentElement.insertBefore(tab, impactLensTab.nextSibling);
  }

  function ensureAnalyticsPanelElement() {
    let panel = document.querySelector(".eoe-analytics-panel");
    if (panel) {
      return panel;
    }

    panel = document.createElement("section");
    panel.className = "eoe-analytics-panel";
    panel.hidden = true;
    document.body.appendChild(panel);
    return panel;
  }

  function renderAnalyticsPanel() {
    const summary = summarizeAnalytics(lastAnalyticsItems);
    const panel = ensureAnalyticsPanelElement();
    lastSummarySignature = JSON.stringify(summary);

    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "eoe-analytics-header";

    const title = document.createElement("h2");
    title.textContent = labels.analyticsTab;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "eoe-close-button";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
    });

    header.append(title, closeButton);
    panel.append(header);

    const list = document.createElement("dl");
    list.className = "eoe-summary-list";

    [
      [labels.totalAssignmentExposure, formatCurrency(summary.totalAssignmentExposure)],
      [labels.optionPositions, formatNumber(summary.optionPositions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })],
      [labels.criticalPositions, formatNumber(summary.critical, { minimumFractionDigits: 0, maximumFractionDigits: 0 })],
      [labels.watchPositions, formatNumber(summary.watch, { minimumFractionDigits: 0, maximumFractionDigits: 0 })],
      [labels.comfortablePositions, formatNumber(summary.comfortable, { minimumFractionDigits: 0, maximumFractionDigits: 0 })]
    ].forEach(([term, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      list.append(dt, dd);
    });

    panel.append(list);
  }

  function renderAnalyticsPanelIfNeeded() {
    const panel = document.querySelector(".eoe-analytics-panel");
    const summarySignature = buildSummarySignature(lastAnalyticsItems);

    if (summarySignature === lastSummarySignature && (!panel || panel.hidden)) {
      return;
    }

    if (panel && !panel.hidden) {
      renderAnalyticsPanel();
      return;
    }

    lastSummarySignature = summarySignature;
  }

  function toggleAnalyticsPanel() {
    const panel = ensureAnalyticsPanelElement();
    renderAnalyticsPanel();
    panel.hidden = !panel.hidden;
  }

  function scheduleEnhancement() {
    if (isEnhancing) {
      pendingEnhancement = true;
      return;
    }

    if (debounceTimer) {
      return;
    }

    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      enhancePositionsTable().catch((error) => {
        console.warn("[Estably Options Enhancer] Enhancement failed", error);
      });
    }, DEBOUNCE_MS);
  }

  function isOwnMutation(mutation) {
    const nodes = [mutation.target, ...mutation.addedNodes, ...mutation.removedNodes];

    return nodes.some((node) => {
      const element = node instanceof Element ? node : node.parentElement;

      if (!(element instanceof Element)) {
        return false;
      }

      return (
        element.hasAttribute?.(ENHANCER_CELL_ATTR) ||
        element.hasAttribute?.(ENHANCER_TAB_ATTR) ||
        element.closest?.(`[${ENHANCER_CELL_ATTR}], [${ENHANCER_TAB_ATTR}], .eoe-analytics-panel`)
      );
    });
  }

  function isRelevantTableMutation(mutation) {
    if (isOwnMutation(mutation)) {
      return false;
    }

    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest?.("tbody, thead") || target.matches?.("tbody, thead"));
  }

  function ensureTableObserver(table) {
    if (observedTable === table && tableObserver) {
      return;
    }

    if (tableObserver) {
      tableObserver.disconnect();
    }

    observedTable = table;
    tableObserver = new MutationObserver((mutations) => {
      if (mutations.some(isRelevantTableMutation)) {
        lastTableSignature = null;
        scheduleEnhancement();
      }
    });

    tableObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  const documentObserver = new MutationObserver((mutations) => {
    const table = findPositionsTable();

    if (table && table !== observedTable) {
      lastTableSignature = null;
      scheduleEnhancement();
      return;
    }

    if (!table && mutations.some((mutation) => !isOwnMutation(mutation))) {
      lastTableSignature = null;
      scheduleEnhancement();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleEnhancement();
    }
  });
  window.addEventListener("popstate", scheduleEnhancement);
  window.addEventListener("hashchange", scheduleEnhancement);

  documentObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  scheduleEnhancement();
})();
