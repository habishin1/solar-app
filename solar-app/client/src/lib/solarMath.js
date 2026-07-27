/**
 * Turns the raw Solar API `solarPotential` object plus the set of panels the
 * user has currently switched on into the numbers the metrics panel shows.
 *
 * IMPORTANT: the Solar API's `financialAnalyses` array only gives you exact
 * figures for a handful of "recommended system size" configurations (one per
 * assumed monthly bill), not for every arbitrary panel count a user might
 * click their way to. For any count in between, we find the nearest
 * recommended config and scale its savings linearly by panel count. That's a
 * reasonable approximation for a UI slider, but a production quoting tool
 * should get a real quote from an installer/financing partner rather than
 * relying on this scaling for the number shown to a customer.
 */

export function findNearestConfig(configs, targetCount) {
  if (!configs?.length) return null;
  return configs.reduce((best, cfg) =>
    Math.abs(cfg.panelsCount - targetCount) <
    Math.abs(best.panelsCount - targetCount)
      ? cfg
      : best
  );
}

function findFinancialForConfigIndex(financialAnalyses, configIndex) {
  if (!financialAnalyses?.length || configIndex == null) return null;
  return (
    financialAnalyses.find((f) => f.panelConfigIndex === configIndex) ||
    financialAnalyses[0]
  );
}

export function computeMetrics({ solarPotential, activePanelIndices }) {
  const panels = solarPotential?.solarPanels || [];
  const configs = solarPotential?.solarPanelConfigs || [];
  const financialAnalyses = solarPotential?.financialAnalyses || [];
  const panelCapacityWatts = solarPotential?.panelCapacityWatts || 400;
  const carbonFactor = solarPotential?.carbonOffsetFactorKgPerMwh || 0;

  const activeCount = activePanelIndices.size;
  const totalWatts = activeCount * panelCapacityWatts;

  // Prefer summing each active panel's own yearly production; fall back to
  // scaling the nearest matching config if individual panel figures are
  // missing from the response.
  let yearlyKwh = 0;
  let usedFallback = false;
  const hasPerPanelEnergy = panels.some((p) => typeof p.yearlyEnergyDcKwh === 'number');

  if (hasPerPanelEnergy) {
    for (const idx of activePanelIndices) {
      yearlyKwh += panels[idx]?.yearlyEnergyDcKwh || 0;
    }
  } else {
    usedFallback = true;
    const nearest = findNearestConfig(configs, activeCount);
    if (nearest && nearest.panelsCount > 0) {
      yearlyKwh = (nearest.yearlyEnergyDcKwh / nearest.panelsCount) * activeCount;
    }
  }

  const nearestConfig = findNearestConfig(configs, activeCount);
  const configIndex = configs.indexOf(nearestConfig);
  const financial = findFinancialForConfigIndex(financialAnalyses, configIndex);

  let scaledSavings = null;
  if (financial && nearestConfig?.panelsCount > 0) {
    const scale = activeCount / nearestConfig.panelsCount;
    const savings = financial.cashPurchaseSavings?.savings;
    if (savings) {
      scaledSavings = {
        year1: (savings.savingsYear1?.units ?? 0) * scale,
        year20: (savings.savingsYear20?.units ?? 0) * scale,
        paybackYears: financial.cashPurchaseSavings?.paybackYears ?? null,
        outOfPocketCost:
          (financial.cashPurchaseSavings?.outOfPocketCost?.units ?? 0) * scale,
      };
    }
  }

  const carbonOffsetKgPerYear = (yearlyKwh / 1000) * carbonFactor;

  return {
    activeCount,
    maxCount: panels.length || solarPotential?.maxArrayPanelsCount || 0,
    totalWatts,
    yearlyKwh,
    usedFallbackEstimate: usedFallback,
    savings: scaledSavings,
    carbonOffsetKgPerYear,
  };
}

export function formatWatts(watts) {
  if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
  return `${Math.round(watts)} W`;
}

export function formatKwh(kwh) {
  return `${Math.round(kwh).toLocaleString()} kWh/yr`;
}

export function formatCurrency(amount, currencyCode = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

export function formatCarbonOffset(kgPerYear) {
  const tonsPerYear = kgPerYear / 1000;
  return `${tonsPerYear.toFixed(1)} t CO₂/yr`;
}
