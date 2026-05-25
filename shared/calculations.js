(function attachCalculations(global) {
  function getRiskStatus(bufferPercent, labels) {
    if (bufferPercent == null || !Number.isFinite(bufferPercent)) {
      return null;
    }

    if (bufferPercent > 25) {
      return { key: "very-comfortable", label: labels.veryComfortable };
    }
    if (bufferPercent >= 10) {
      return { key: "comfortable", label: labels.comfortable };
    }
    if (bufferPercent >= 0) {
      return { key: "watch", label: labels.watch };
    }
    if (bufferPercent >= -10) {
      return { key: "critical", label: labels.critical };
    }

    return { key: "at-risk", label: labels.atRisk };
  }

  function getOptionSide(positionSize) {
    if (typeof positionSize !== "number" || positionSize === 0) {
      return null;
    }

    return positionSize < 0 ? "short" : "long";
  }

  function getOptionStrategy(position) {
    const side = getOptionSide(position.positionSize);

    if (!position.isOption || !side) {
      return null;
    }

    return `${side}${position.type}`;
  }

  function calculateBreakEven(position, strategy) {
    if (typeof position.breakEvenOverride === "number") {
      return position.breakEvenOverride;
    }

    if (typeof position.strike !== "number" || typeof position.avgPrice !== "number") {
      return null;
    }

    if (strategy === "shortPut" || strategy === "longPut") {
      return position.strike - Math.abs(position.avgPrice);
    }

    if (strategy === "shortCall" || strategy === "longCall") {
      return position.strike + Math.abs(position.avgPrice);
    }

    return null;
  }

  function calculateBufferPercent(underlyingPrice, breakEven, strategy) {
    if (typeof underlyingPrice !== "number" || typeof breakEven !== "number" || breakEven === 0) {
      return null;
    }

    const rawDistance = ((underlyingPrice - breakEven) / breakEven) * 100;

    if (strategy === "shortCall" || strategy === "longPut") {
      return rawDistance * -1;
    }

    return rawDistance;
  }

  function calculateExposure(position, strategy) {
    if (
      typeof position.strike !== "number" ||
      typeof position.positionSize !== "number"
    ) {
      return null;
    }

    const contracts = Math.abs(position.positionSize);

    if (strategy === "shortPut" || strategy === "shortCall") {
      return position.strike * 100 * contracts;
    }

    if (strategy === "longPut" || strategy === "longCall") {
      return typeof position.avgPrice === "number" ? Math.abs(position.avgPrice) * 100 * contracts : null;
    }

    return null;
  }

  function buildAnalytics(position, labels) {
    const underlyingPrice = position.underlyingPrice;
    const strategy = getOptionStrategy(position);

    if (!strategy) {
      return {
        underlyingPrice,
        breakEven: null,
        bufferPercent: null,
        assignmentExposure: null,
        exposureLabelKey: null,
        strategy: null,
        riskStatus: null
      };
    }

    const breakEven = calculateBreakEven(position, strategy);
    const bufferPercent = calculateBufferPercent(underlyingPrice, breakEven, strategy);
    const assignmentExposure = calculateExposure(position, strategy);
    const exposureLabelKey =
      strategy === "shortPut"
        ? "assignmentExposure"
        : strategy === "shortCall"
          ? "deliveryExposure"
          : "maxRisk";

    return {
      underlyingPrice,
      breakEven,
      bufferPercent,
      assignmentExposure,
      exposureLabelKey,
      strategy,
      isAdjustedBreakEven: typeof position.breakEvenOverride === "number",
      riskStatus: getRiskStatus(bufferPercent, labels)
    };
  }

  function summarizeAnalytics(items) {
    return items.reduce(
      (summary, item) => {
        if (item.isOption && item.analytics.strategy) {
          summary.optionPositions += 1;
          if (item.analytics.strategy === "shortPut") {
            summary.totalAssignmentExposure += item.analytics.assignmentExposure || 0;
          }

          const buffer = item.analytics.bufferPercent;
          if (typeof buffer === "number") {
            if (buffer < 0) {
              summary.critical += 1;
            } else if (buffer <= 10) {
              summary.watch += 1;
            } else {
              summary.comfortable += 1;
            }
          }
        }

        return summary;
      },
      {
        totalAssignmentExposure: 0,
        optionPositions: 0,
        critical: 0,
        watch: 0,
        comfortable: 0
      }
    );
  }

  global.EstablyOptionsCalculations = {
    buildAnalytics,
    getOptionStrategy,
    getRiskStatus,
    summarizeAnalytics
  };
})(globalThis);
