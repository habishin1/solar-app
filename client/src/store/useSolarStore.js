import { create } from 'zustand';
import {
  geocodeAddress,
  fetchBuildingInsights,
  saveLead,
} from '../lib/api.js';
import { computeMetrics } from '../lib/solarMath.js';

export const useSolarStore = create((set, get) => ({
  status: 'idle', // idle | loading | ready | error
  error: null,

  address: '',
  formattedAddress: '',
  location: null, // { lat, lng }
  building: null, // raw buildingInsights response

  activePanelIndices: new Set(),
  hoveredPanel: null,
  heatmap: false,

  terrain: null,

  leadModalOpen: false,
  leadStatus: 'idle', // idle | saving | done | error
  leadError: null,

  async searchAddress(address, placeId) {
    set({ status: 'loading', error: null });
    try {
      const geo = await geocodeAddress(address, placeId);
      const building = await fetchBuildingInsights(geo.lat, geo.lng);

      // Start with the "max out the roof" design -- every panel Solar API
      // placed for the optimal layout is switched on. The user removes
      // panels from there.
      const panelCount = building?.solarPotential?.solarPanels?.length || 0;
      const activePanelIndices = new Set(
        Array.from({ length: panelCount }, (_, i) => i)
      );

      set({
        status: 'ready',
        formattedAddress: geo.formattedAddress,
        location: { lat: geo.lat, lng: geo.lng },
        building,
        activePanelIndices,
        terrain: null,
      });

      // NOTE: We intentionally render the clean modeled house (sharp-edged
      // body + tilted roof planes with panels resting flush on the slope)
      // rather than Google's raw height-map mesh. The height map comes from a
      // different dataset than the panel positions, so panels don't align to
      // it, and it includes trees/neighbors as noise. The terrain endpoint
      // and <TerrainModel> component remain available if you want to revisit
      // a photo-draped view later -- re-enable by fetching terrain here.
    } catch (err) {
      set({ status: 'error', error: err.message || 'Something went wrong.' });
    }
  },

  togglePanel(index) {
    const next = new Set(get().activePanelIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    set({ activePanelIndices: next });
  },

  setAllPanels(on) {
    const total = get().building?.solarPotential?.solarPanels?.length || 0;
    set({
      activePanelIndices: on
        ? new Set(Array.from({ length: total }, (_, i) => i))
        : new Set(),
    });
  },

  // Activate the N most productive panels and switch the rest off. Solar API
  // returns panels roughly best-first, but we sort by yearlyEnergyDcKwh
  // explicitly so this stays correct regardless of response ordering.
  keepBestN(n) {
    const panels = get().building?.solarPotential?.solarPanels || [];
    const ranked = panels
      .map((p, i) => ({ i, kwh: p.yearlyEnergyDcKwh ?? 0 }))
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, Math.max(0, Math.min(n, panels.length)))
      .map((p) => p.i);
    set({ activePanelIndices: new Set(ranked) });
  },

  toggleHeatmap() {
    set({ heatmap: !get().heatmap });
  },

  setHovered(index) {
    set({ hoveredPanel: index });
  },

  openLeadModal() {
    set({ leadModalOpen: true, leadStatus: 'idle', leadError: null });
  },

  closeLeadModal() {
    set({ leadModalOpen: false });
  },

  // Build the design context we attach to every lead. This is the system the
  // person just designed -- the reason the lead is worth following up on.
  buildDesignSnapshot() {
    const { building, formattedAddress, location, activePanelIndices } = get();
    if (!building?.solarPotential) return null;

    const metrics = computeMetrics({
      solarPotential: building.solarPotential,
      activePanelIndices,
    });

    return {
      address: formattedAddress || null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      panelCount: metrics.activeCount,
      maxPanelCount: metrics.maxCount,
      systemSizeKw: +(metrics.totalWatts / 1000).toFixed(2),
      yearlyKwh: Math.round(metrics.yearlyKwh),
      estYear1Savings: metrics.savings ? Math.round(metrics.savings.year1) : null,
      estYear20Savings: metrics.savings
        ? Math.round(metrics.savings.year20)
        : null,
      paybackYears: metrics.savings?.paybackYears ?? null,
    };
  },

  async submitLead({ contact, qualification }) {
    set({ leadStatus: 'saving', leadError: null });
    try {
      await saveLead({
        contact,
        qualification,
        design: get().buildDesignSnapshot(),
      });
      set({ leadStatus: 'done' });
    } catch (err) {
      set({ leadStatus: 'error', leadError: err.message || 'Could not save.' });
    }
  },
}));
