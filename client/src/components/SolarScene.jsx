import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import HouseModel, { computeHouseModel } from './HouseModel.jsx';
import SolarPanels from './SolarPanels.jsx';
import { useSolarStore } from '../store/useSolarStore.js';

function StudioFloor() {
  // CAD-style grid floor: reinforces the "design tool" feel and gives the
  // eye a sense of scale as the roof rotates.
  return (
    <Grid
      position={[0, -0.01, 0]}
      args={[60, 60]}
      cellSize={1}
      cellThickness={0.6}
      cellColor="#1c2b3a"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#26405a"
      fadeDistance={45}
      fadeStrength={1.5}
      infiniteGrid
    />
  );
}

function Scene({ building, origin, terrain }) {
  const solarPotential = building.solarPotential;
  const segments = solarPotential?.roofSegmentStats || [];
  const panels = solarPotential?.solarPanels || [];

  const houseModel = useMemo(
    () => computeHouseModel(panels, origin),
    [panels, origin]
  );

  return (
    <>
      <hemisphereLight args={['#bcd6ea', '#2a2622', 0.65]} />
      <directionalLight
        position={[20, 30, 12]}
        intensity={1.25}
        color="#fff3da"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <StudioFloor />
      <HouseModel model={houseModel} />
      <SolarPanels
        panels={panels}
        origin={origin}
        houseModel={houseModel}
        panelWidth={solarPotential?.panelWidthMeters ?? 1.0}
        panelHeight={solarPotential?.panelHeightMeters ?? 1.7}
      />
      <OrbitControls
        makeDefault
        minDistance={5}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2 - 0.02}
        autoRotate
        autoRotateSpeed={0.4}
      />
    </>
  );
}

function EmptyState({ status, error }) {
  const isError = status === 'error';
  const isLoading = status === 'loading';

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-viewportEdge">
        {isLoading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
              stroke="#F59E0B"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="3.5" stroke="#F59E0B" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <p className="max-w-xs text-sm text-slate-300">
        {isError
          ? error || 'No solar data available for that address yet.'
          : isLoading
          ? 'Fetching roof geometry and solar potential…'
          : 'Enter an address to load its roof and start designing.'}
      </p>
    </div>
  );
}

export default function SolarScene() {
  const status = useSolarStore((s) => s.status);
  const error = useSolarStore((s) => s.error);
  const building = useSolarStore((s) => s.building);
  const location = useSolarStore((s) => s.location);
  const formattedAddress = useSolarStore((s) => s.formattedAddress);
  const terrain = useSolarStore((s) => s.terrain);

  const ready = status === 'ready' && building?.solarPotential;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-viewportEdge shadow-lift"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 0%, #12202e 0%, #0d1520 60%, #0a1017 100%)',
      }}
    >
      {ready ? (
        <>
          <Canvas
            shadows
            camera={{ position: [18, 16, 18], fov: 45 }}
            gl={{ alpha: true, antialias: true }}
          >
            <Scene
              building={building}
              terrain={terrain}
              origin={
                building.center || {
                  latitude: location.lat,
                  longitude: location.lng,
                }
              }
            />
          </Canvas>

          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-viewportEdge bg-viewport/80 px-3 py-2 backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Analyzing
            </div>
            <div className="max-w-[240px] truncate font-num text-xs text-slate-100">
              {formattedAddress}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 font-num text-[11px] text-slate-500">
            drag to orbit · scroll to zoom · click a panel to toggle
          </div>
        </>
      ) : (
        <EmptyState status={status} error={error} />
      )}
    </div>
  );
}
