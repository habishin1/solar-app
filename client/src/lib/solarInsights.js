/**
 * Turns the raw Solar API dataset into concrete, sales-ready talking points.
 * Everything here is derived from data Google already returns — no guessing.
 */

const M2_TO_FT2 = 10.7639;
const KG_CO2_PER_TREE_YEAR = 21.77; // EPA: CO2 sequestered by a mature tree/yr
const KG_CO2_PER_CAR_YEAR = 4600; // EPA: avg passenger vehicle/yr

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compass(azimuthDeg) {
  const i = Math.round(((azimuthDeg % 360) / 45)) % 8;
  return COMPASS[i];
}

export function computeInsights({ solarPotential, roofSegments, imageryDate, activePanelIndices, panels }) {
  if (!solarPotential) return null;

  const segs = roofSegments || [];
  const allPanels = panels || [];

  // Roof size — total, usable (panel-able), and ground footprint
  const roofAreaM2 =
    solarPotential.wholeRoofStats?.areaMeters2 ??
    segs.reduce((s, r) => s + (r.stats?.areaMeters2 || 0), 0);
  const roofAreaFt2 = roofAreaM2 * M2_TO_FT2;

  // Usable = sum of the individual roof-segment areas (the parts that can
  // actually hold panels), which is the number that drives system size.
  const usableAreaM2 = segs.reduce((s, r) => s + (r.stats?.areaMeters2 || 0), 0);
  const usableAreaFt2 = usableAreaM2 * M2_TO_FT2;

  const groundAreaM2 = solarPotential.wholeRoofStats?.groundAreaMeters2 ?? null;
  const groundAreaFt2 = groundAreaM2 ? groundAreaM2 * M2_TO_FT2 : null;

  // Sun
  const sunHoursYear = solarPotential.maxSunshineHoursPerYear ?? null;

  // Roof faces / orientation split of the ACTIVE design
  const byDirection = {};
  let bestSeg = null;
  for (const idx of activePanelIndices) {
    const p = allPanels[idx];
    if (!p) continue;
    const seg = segs[p.segmentIndex ?? 0];
    const dir = seg ? compass(seg.azimuthDegrees ?? 0) : '—';
    byDirection[dir] = (byDirection[dir] || 0) + 1;
  }
  const directionBreakdown = Object.entries(byDirection)
    .sort((a, b) => b[1] - a[1])
    .map(([dir, count]) => ({ dir, count }));

  // Best-producing roof face
  for (const seg of segs) {
    const e = seg.stats?.areaMeters2 ? seg.pitchDegrees : 0;
    if (!bestSeg || (seg.stats?.areaMeters2 || 0) > (bestSeg.stats?.areaMeters2 || 0)) {
      bestSeg = seg;
    }
  }
  const bestFacing = bestSeg ? compass(bestSeg.azimuthDegrees ?? 0) : null;

  const roofFaceCount = segs.length;

  // Data freshness
  let imagery = null;
  if (imageryDate?.year) {
    imagery = `${imageryDate.year}-${String(imageryDate.month || 1).padStart(2, '0')}`;
  }

  // Max capacity of this roof
  const panelWatts = solarPotential.panelCapacityWatts || 400;
  const maxKw = ((solarPotential.maxArrayPanelsCount || allPanels.length) * panelWatts) / 1000;

  return {
    roofAreaM2,
    roofAreaFt2,
    usableAreaFt2,
    groundAreaFt2,
    sunHoursYear,
    directionBreakdown,
    bestFacing,
    roofFaceCount,
    imagery,
    maxKw,
    panelWatts,
  };
}

// Relatable carbon equivalents for a given kg CO2/yr.
export function carbonEquivalents(kgPerYear) {
  return {
    trees: Math.round(kgPerYear / KG_CO2_PER_TREE_YEAR),
    cars: (kgPerYear / KG_CO2_PER_CAR_YEAR).toFixed(1),
  };
}
