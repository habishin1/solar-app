import { useMemo } from 'react';
import * as THREE from 'three';
import { orientToRoof } from './HouseModel.jsx';
import { useSolarStore } from '../store/useSolarStore.js';

const PANEL_THICKNESS = 0.03;
const HOVER_OFFSET = 0.18;
const PANEL_Z = new THREE.Vector3(0, 0, 1);

const ACTIVE_COLOR = new THREE.Color('#1c3a52');
const INACTIVE_COLOR = new THREE.Color('#3a3f46');

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

  const hoverLift = isHovered ? HOVER_OFFSET : 0;
  const y = slot.y + hoverLift * (slot.normal ? slot.normal[1] : 1);

  // DSM mode orients to the measured surface normal; geometric mode uses
  // pitch/azimuth. Either way the panel lands flush on the roof.
  const applyOrientation = (mesh) => {
    if (slot.normal) {
      const n = new THREE.Vector3(slot.normal[0], slot.normal[1], slot.normal[2]);
      mesh.quaternion.setFromUnitVectors(PANEL_Z, n);
    } else {
      orientToRoof(mesh, slot.pitchDeg || 0, slot.azimuthDeg || 0);
    }
  };

  const color = useMemo(() => {
    if (!isActive) return INACTIVE_COLOR;
    if (heatmap) {
      const { lo, hi } = productionRange;
      const t = hi > lo ? ((panel.yearlyEnergyDcKwh ?? lo) - lo) / (hi - lo) : 0.5;
      return heatColor(t);
    }
    return ACTIVE_COLOR;
  }, [isActive, heatmap, productionRange, panel.yearlyEnergyDcKwh]);

  return (
    <mesh
      position={[slot.x, y, slot.z]}
      onUpdate={applyOrientation}
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

export default function SolarPanels({ panels, panelWidth, panelHeight, placements }) {
  const productionRange = useMemo(() => {
    const vals = panels
      .map((p) => p.yearlyEnergyDcKwh)
      .filter((v) => typeof v === 'number');
    if (!vals.length) return { lo: 0, hi: 1 };
    return { lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [panels]);

  if (!placements) return null;

  return (
    <group>
      {panels.map((panel, index) =>
        placements[index] ? (
          <PanelMesh
            key={index}
            index={index}
            panel={panel}
            slot={placements[index]}
            panelWidth={panelWidth}
            panelHeight={panelHeight}
            productionRange={productionRange}
          />
        ) : null
      )}
    </group>
  );
}
