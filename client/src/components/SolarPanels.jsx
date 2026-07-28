import { useMemo } from 'react';
import * as THREE from 'three';
import { orientToRoof } from './HouseModel.jsx';
import { useSolarStore } from '../store/useSolarStore.js';

const PANEL_THICKNESS = 0.03;
const HOVER_OFFSET = 0.18;

const ACTIVE_COLOR = new THREE.Color('#1c3a52');
const INACTIVE_COLOR = new THREE.Color('#3a3f46');

// Map a 0..1 production score to a blue->amber->red heat color.
function heatColor(t) {
  const c = new THREE.Color();
  c.setHSL((1 - t) * 0.62, 0.85, 0.5);
  return c;
}

function PanelMesh({ index, panel, slot, panelWidth, panelHeight, productionRange }) {
  const isActive = useSolarStore((s) => s.activePanelIndices.has(index));
  const isHovered = useSolarStore((s) => s.hoveredPanel === index);
  const heatmap = useSolarStore((s) => s.heatmap);
  const togglePanel = useSolarStore((s) => s.togglePanel);
  const setHovered = useSolarStore((s) => s.setHovered);

  const [w, h] =
    panel.orientation === 'PORTRAIT'
      ? [panelHeight, panelWidth]
      : [panelWidth, panelHeight];

  const y = slot.y + (isHovered ? HOVER_OFFSET * 0.92 : 0);

  const color = useMemo(() => {
    if (!isActive) return INACTIVE_COLOR;
    if (heatmap) {
      const { lo, hi } = productionRange;
      const t =
        hi > lo ? ((panel.yearlyEnergyDcKwh ?? lo) - lo) / (hi - lo) : 0.5;
      return heatColor(t);
    }
    return ACTIVE_COLOR;
  }, [isActive, heatmap, productionRange, panel.yearlyEnergyDcKwh]);

  return (
    <mesh
      position={[slot.x, y, slot.z]}
      onUpdate={(mesh) => orientToRoof(mesh, slot.pitchDeg, slot.azimuthDeg)}
      onClick={(e) => {
        e.stopPropagation();
        togglePanel(index);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(index);
      }}
      onPointerOut={() => setHovered(null)}
      castShadow
    >
      <boxGeometry args={[w, h, PANEL_THICKNESS]} />
      <meshStandardMaterial
        color={color}
        emissive={isActive ? color : new THREE.Color('#000000')}
        emissiveIntensity={isActive ? (isHovered ? 0.6 : 0.35) : 0}
        opacity={isActive ? 1 : 0.35}
        transparent
        roughness={0.3}
        metalness={0.6}
      />
    </mesh>
  );
}

export default function SolarPanels({ panels, panelWidth, panelHeight, houseModel }) {
  const productionRange = useMemo(() => {
    const vals = panels
      .map((p) => p.yearlyEnergyDcKwh)
      .filter((v) => typeof v === 'number');
    if (!vals.length) return { lo: 0, hi: 1 };
    return { lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [panels]);

  const slotForPanel = houseModel?.slotForPanel;
  if (!slotForPanel) return null;

  return (
    <group>
      {panels.map((panel, index) =>
        slotForPanel[index] ? (
          <PanelMesh
            key={index}
            index={index}
            panel={panel}
            slot={slotForPanel[index]}
            panelWidth={panelWidth}
            panelHeight={panelHeight}
            productionRange={productionRange}
          />
        ) : null
      )}
    </group>
  );
}
