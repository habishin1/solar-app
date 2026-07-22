import AddressSearch from './components/AddressSearch.jsx';
import SolarScene from './components/SolarScene.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import LeadCaptureModal from './components/LeadCaptureModal.jsx';

function SunMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="5" fill="#F59E0B" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 13 + Math.cos(a) * 8;
        const y1 = 13 + Math.sin(a) * 8;
        const x2 = 13 + Math.cos(a) * 11;
        const y2 = 13 + Math.sin(a) * 11;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#F59E0B"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-paper">
      <LeadCaptureModal />

      <header className="border-b border-hair bg-card/70 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <SunMark />
            <div>
              <div className="font-display text-lg font-bold tracking-tight text-ink">
                Sunplan
              </div>
              <div className="-mt-0.5 text-xs text-mist">
                Solar design studio
              </div>
            </div>
          </div>
          <AddressSearch />
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-5 p-5 lg:flex-row">
        <div className="min-h-[320px] flex-1">
          <SolarScene />
        </div>
        <div className="w-full lg:w-[360px]">
          <MetricsPanel />
        </div>
      </main>
    </div>
  );
}
