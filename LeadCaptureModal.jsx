import AddressSearch from './components/AddressSearch.jsx';
import SolarScene from './components/SolarScene.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import LeadCaptureModal from './components/LeadCaptureModal.jsx';

function SunMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-dawn shadow-glow">
      <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="5" fill="#fff" />
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
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-paper">
      <LeadCaptureModal />

      <header className="relative z-50 border-b border-hair bg-card/70 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <SunMark />
            <div>
              <div className="bg-dawn bg-clip-text font-display text-lg font-bold tracking-tight text-transparent">
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

      <main className="relative z-0 mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-5 p-5 lg:flex-row">
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
