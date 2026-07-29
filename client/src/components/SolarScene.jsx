import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Sky } from '@react-three/drei';
import HouseModel, { computeHouseModel } from './HouseModel.jsx';
import { DsmMesh, computeDsmPlacements } from './DsmRoof.jsx';
import SolarPanels from './SolarPanels.jsx';
import { useSolarStore } from '../store/useSolarStore.js';

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#8ba36b" roughness={1} />
      </mesh>
      <Grid
        position={[0, -0.02, 0]}
        args={[80, 80]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#7d945f"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#6f854f"
        fadeDistance={70}
        fadeStrength={2}
        infiniteGrid
      />
    </group>
  );
}

function Scene({ building, origin, terrain }) {
  const solarPotential = building.solarPotential;
  const segments = solarPotential?.roofSegmentStats || [];
  const panels = solarPotential?.solarPanels || [];

  // Prefer Google's real measured roof (DSM). Fall back to the geometric
  // model if terrain isn't available for this address.
  const useDsm = !!terrain?.heights?.length;

  const geoModel = useMemo(
    () => (useDsm ? null : computeHouseModel(panels, segments, origin)),
    [useDsm, panels, segments, origin]
  );

  const placements = useMemo(() => {
    if (useDsm) return computeDsmPlacements(panels, terrain, origin);
    return geoModel?.placements || null;
  }, [useDsm, panels, terrain, origin, geoModel]);

  return (
    <>
      <Sky sunPosition={[40, 45, 25]} turbidity={5} rayleigh={1.1} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#dfeeff', '#6b7a52', 0.5]} />
      <directionalLight
        position={[35, 45, 25]}
        intensity={1.5}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />
      <Ground />

      {useDsm ? (
        <DsmMesh terrain={terrain} />
      ) : (
        <HouseModel model={geoModel} />
      )}

      <SolarPanels
        panels={panels}
        placements={placements}
        panelWidth={solarPotential?.panelWidthMeters ?? 1.0}
        panelHeight={solarPotential?.panelHeightMeters ?? 1.7}
      />

      <OrbitControls
        makeDefault
        minDistance={6}
        maxDistance={120}
        maxPolarAngle={Math.PI / 2 - 0.03}
        autoRotate
        autoRotateSpeed={0.3}
        target={[0, 3, 0]}
      />
    </>
  );
}

function EmptyState({ status, error }) {
  const isError = status === 'error';
  const isLoading = status === 'loading';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/20">
        {isLoading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
              stroke="#fff" strokeWidth="1.5" strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <p className="max-w-xs text-sm text-white/80">
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
  const terrain = useSolarStore((s) => s.terrain);
  const formattedAddress = useSolarStore((s) => s.formattedAddress);

  const ready = status === 'ready' && building?.solarPotential;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-viewportEdge shadow-lift"
      style={{ background: 'linear-gradient(180deg, #bcdcff 0%, #d9ecff 45%, #eaf4ff 100%)' }}
    >
      {ready ? (
        <>
          <Canvas shadows camera={{ position: [24, 20, 24], fov: 45 }} gl={{ antialias: true }}>
            <Scene
              building={building}
              terrain={terrain}
              origin={
                building.center || { latitude: location.lat, longitude: location.lng }
              }
            />
          </Canvas>

          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-black/10 bg-white/80 px-3 py-2 backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-ash">Analyzing</div>
            <div className="max-w-[240px] truncate font-num text-xs text-ink">{formattedAddress}</div>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 font-num text-[11px] text-ink/50">
            drag to orbit · scroll to zoom · click a panel to toggle
          </div>
        </>
      ) : (
        <div className="h-full w-full" style={{ background: 'linear-gradient(180deg,#0d1520,#0a1017)' }}>
          <EmptyState status={status} error={error} />
        </div>
      )}
    </div>
  );
}
