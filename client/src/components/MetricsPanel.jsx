import { useMemo } from 'react';
import { useSolarStore } from '../store/useSolarStore.js';
import {
  computeMetrics,
  formatCurrency,
} from '../lib/solarMath.js';

function Readout({ label, value, unit, accent }) {
  return (
    <div className="rounded-2xl border border-hair bg-cardSub p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-mist">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={`tabular font-num text-[22px] font-medium leading-none ${
            accent ? 'text-brandDeep' : 'text-ink'
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-ash">{unit}</span>}
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const status = useSolarStore((s) => s.status);
  const building = useSolarStore((s) => s.building);
  const activePanelIndices = useSolarStore((s) => s.activePanelIndices);
  const setAllPanels = useSolarStore((s) => s.setAllPanels);
  const keepBestN = useSolarStore((s) => s.keepBestN);
  const heatmap = useSolarStore((s) => s.heatmap);
  const toggleHeatmap = useSolarStore((s) => s.toggleHeatmap);
  const openLeadModal = useSolarStore((s) => s.openLeadModal);

  const metrics = useMemo(() => {
    if (status !== 'ready' || !building?.solarPotential) return null;
    return computeMetrics({
      solarPotential: building.solarPotential,
      activePanelIndices,
    });
  }, [status, building, activePanelIndices]);

  if (!metrics) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-hair bg-card p-6 shadow-card">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-mist">
          System metrics
        </h2>
        <div className="mt-6 flex flex-1 items-center justify-center">
          <p className="max-w-[220px] text-center text-sm text-ash">
            Analyze an address to see live system size, production, and savings
            here.
          </p>
        </div>
      </div>
    );
  }

  const currencyCode =
    building.solarPotential.financialAnalyses?.[0]?.monthlyBill?.currencyCode ||
    'USD';

  const pct = metrics.maxCount
    ? Math.round((metrics.activeCount / metrics.maxCount) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-hair bg-card p-5 shadow-card">
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-mist">
          System metrics
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Readout
          label="Panels"
          value={`${metrics.activeCount}`}
          unit={`/ ${metrics.maxCount}`}
        />
        <Readout
          label="Size"
          value={
            metrics.totalWatts >= 1000
              ? (metrics.totalWatts / 1000).toFixed(1)
              : `${Math.round(metrics.totalWatts)}`
          }
          unit={metrics.totalWatts >= 1000 ? 'kW' : 'W'}
        />
        <Readout
          label="Production"
          value={Math.round(metrics.yearlyKwh).toLocaleString()}
          unit="kWh/yr"
        />
        <Readout
          label="CO₂ offset"
          value={(metrics.carbonOffsetKgPerYear / 1000).toFixed(1)}
          unit="t/yr"
        />
      </div>

      {metrics.savings ? (
        <div className="rounded-xl border border-brand/30 bg-brandWash p-4">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-brand" />
            <div className="text-[11px] font-medium uppercase tracking-wider text-brandDeep">
              Estimated savings · cash purchase
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="tabular font-num text-lg font-medium text-ink">
                {formatCurrency(metrics.savings.year1, currencyCode)}
              </div>
              <div className="text-xs text-ash">Year 1</div>
            </div>
            <div>
              <div className="tabular font-num text-lg font-medium text-ink">
                {formatCurrency(metrics.savings.year20, currencyCode)}
              </div>
              <div className="text-xs text-ash">Over 20 years</div>
            </div>
          </div>
          {metrics.savings.paybackYears != null && (
            <div className="mt-3 border-t border-brand/20 pt-2.5 text-xs text-brandDeep">
              Pays for itself in ~{metrics.savings.paybackYears.toFixed(1)} years
            </div>
          )}
          <div className="mt-2 text-[11px] leading-snug text-ash">
            Scaled from Google's nearest recommended size — a ballpark, not a
            quote.
          </div>
        </div>
      ) : null}

      <button
        onClick={openLeadModal}
        className="w-full rounded-2xl bg-dawn px-4 py-3.5 font-display text-sm font-semibold
                   text-white shadow-glow transition hover:brightness-105 active:scale-[0.99]"
      >
        Get my full brand report →
      </button>

      <div className="rounded-xl border border-hair bg-cardSub p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-mist">
            Design
          </span>
          <span className="tabular font-num text-xs text-ash">
            {pct}% of roof
          </span>
        </div>

        <div className="mb-1.5 flex items-center justify-between text-xs text-ash">
          <span>Keep best panels</span>
          <span className="tabular font-num text-ink">
            {metrics.activeCount}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={metrics.maxCount}
          value={metrics.activeCount}
          onChange={(e) => keepBestN(Number(e.target.value))}
          className="w-full"
        />

        <button
          onClick={toggleHeatmap}
          className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm transition ${
            heatmap
              ? 'border-brand/50 bg-brandWash text-brandDeep'
              : 'border-hair bg-card text-ash hover:border-hairStrong'
          }`}
        >
          {heatmap ? 'Hide production heatmap' : 'Show production heatmap'}
        </button>

        {heatmap && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11px] text-ash">Low</span>
            <div
              className="h-1.5 flex-1 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #2563eb, #16a34a, #f59e0b, #ef4444)',
              }}
            />
            <span className="text-[11px] text-ash">High</span>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setAllPanels(true)}
            className="flex-1 rounded-lg border border-hair bg-card px-3 py-2 text-sm
                       text-ash transition hover:border-hairStrong"
          >
            Max design
          </button>
          <button
            onClick={() => setAllPanels(false)}
            className="flex-1 rounded-lg border border-hair bg-card px-3 py-2 text-sm
                       text-ash transition hover:border-hairStrong"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
