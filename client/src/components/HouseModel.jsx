import { useMemo } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;

export const WALL_HEIGHT = 3;
const GAP = 1.06;
const EDGE_MARGIN = 0.6;
const RIDGE_GAP = 0.4;
const FLAT_PITCH_THRESHOLD = 7; // degrees; below this a roof face is "flat"

/**
 * Orient a flat panel/plane to a pitch + azimuth (LOCAL frame — the whole
 * building group is rotated to the real compass heading separately).
 *   azimuth 0 -> faces +Z, 180 -> -Z
 */
export function orientToRoof(mesh, pitchDegrees, azimuthDegrees) {
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(azimuthDegrees * DEG2RAD);
  mesh.rotateX(-Math.PI / 2 + pitchDegrees * DEG2RAD);
}

function circularWeightedAzimuth(segments) {
  // Weighted mean compass direction of the pitched faces (by panel count).
  let sx = 0;
  let sy = 0;
  for (const s of segments) {
    if ((s.pitchDegrees ?? 0) < FLAT_PITCH_THRESHOLD) continue;
    const w = s.panelsCount || s.stats?.areaMeters2 || 1;
    const a = (s.azimuthDegrees ?? 0) * DEG2RAD;
    sx += Math.cos(a) * w;
    sy += Math.sin(a) * w;
  }
  if (sx === 0 && sy === 0) return 180; // default south
  let deg = Math.atan2(sy, sx) / DEG2RAD;
  return (deg + 360) % 360;
}

/**
 * Build a clean building model from the REAL roof data:
 *  - flat roofs (all faces low-pitch) render flat, like a commercial building
 *  - pitched roofs get a gable oriented to the real dominant compass heading
 *  - panels are split across the two faces to match the real facing counts
 *  - everything is returned in a LOCAL frame; the scene rotates the group by
 *    `yaw` so the faces point the true way.
 */
export function computeHouseModel(panels, roofSegments, origin, panelWidth = 1.0, panelHeight = 1.7) {
  const n = panels?.length || 0;
  if (!n) return null;

  const segs = roofSegments || [];

  // Real array center + dominant heading.
  const pts = panels.map((p) =>
    toLocalXZ(p.center.latitude, p.center.longitude, origin.latitude, origin.longitude)
  );
  let ax = 0;
  let az = 0;
  for (const q of pts) {
    ax += q.x;
    az += q.z;
  }
  const worldCx = ax / n;
  const worldCz = az / n;

  const pitched = segs.filter((s) => (s.pitchDegrees ?? 0) >= FLAT_PITCH_THRESHOLD);
  const isFlat = segs.length > 0 && pitched.length === 0;

  const domAzimuth = circularWeightedAzimuth(segs);
  // Rotate the group so LOCAL +Z points toward the dominant compass heading.
  const yaw = Math.PI - domAzimuth * DEG2RAD;

  // Median pitch of pitched faces, clamped to a natural range.
  let pitchDeg = 23;
  if (pitched.length) {
    const ps = pitched.map((s) => s.pitchDegrees).sort((a, b) => a - b);
    pitchDeg = ps[Math.floor(ps.length / 2)];
  }
  pitchDeg = Math.max(10, Math.min(38, pitchDeg));
  const pitch = isFlat ? 0 : pitchDeg * DEG2RAD;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  // How many panels face each side (side A = dominant heading).
  let nA = 0;
  if (!isFlat) {
    const segByIdx = segs;
    for (const p of panels) {
      const s = segByIdx[p.segmentIndex ?? 0];
      const a = s?.azimuthDegrees ?? domAzimuth;
      let d = Math.abs(((a - domAzimuth + 540) % 360) - 180); // 0=same,180=opposite
      if (d < 90) nA += 1; // faces the dominant (sunny) heading -> side A
    }
  } else {
    nA = n;
  }
  const nB = n - nA;

  const stepU = panelWidth * GAP; // along the ridge
  const stepVh = panelHeight * cosP * GAP; // horizontal spacing across the slope

  // Column count for a roughly square footprint.
  const perSide = Math.max(nA, nB, Math.ceil(n / (isFlat ? 1 : 2)));
  let cols = Math.max(1, Math.round(Math.sqrt((perSide * stepVh) / stepU) * (isFlat ? 1.3 : 1)));
  cols = Math.max(cols, 2);

  const rowsA = Math.max(1, Math.ceil((isFlat ? n : nA) / cols));
  const rowsB = isFlat ? 0 : Math.max(1, Math.ceil(nB / cols));
  const rowsMax = Math.max(rowsA, rowsB);

  const alongLen = cols * stepU + EDGE_MARGIN * 2;
  const slopeSurfaceLen = rowsMax * (panelHeight * GAP) + RIDGE_GAP + 0.35;
  const crossHalf = slopeSurfaceLen * cosP; // horizontal half-span of one slope
  const eaveH = WALL_HEIGHT;
  const rise = isFlat ? 0 : crossHalf * Math.tan(pitch);
  const ridgeH = eaveH + rise;

  const halfAlong = (cols * stepU) / 2;

  // Build slots (local frame). Fill nearest-ridge first.
  const slots = [];
  function addSide(side, count) {
    let placed = 0;
    const rows = Math.ceil(count / cols);
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        const along = -halfAlong + (c + 0.5) * stepU;
        if (isFlat) {
          const across = -((rows * stepVh) / 2) + (r + 0.5) * stepVh;
          slots.push({ x: along, y: eaveH + 0.08, z: across, pitchDeg: 0, azimuthDeg: 0 });
        } else {
          const horiz = RIDGE_GAP + (r + 0.5) * stepVh;
          const y = ridgeH - horiz * Math.tan(pitch) + 0.08 * cosP;
          slots.push({
            x: along,
            y,
            z: side * horiz,
            pitchDeg,
            azimuthDeg: side > 0 ? 0 : 180,
          });
        }
      }
    }
  }
  if (isFlat) {
    addSide(1, n);
  } else {
    addSide(1, nA);
    addSide(-1, nB);
  }

  // Map panels -> slots, best-producing panels onto the best (side A, high)
  // slots so the heatmap clusters realistically.
  const order = panels
    .map((p, i) => ({ i, e: p.yearlyEnergyDcKwh ?? 0 }))
    .sort((a, b) => b.e - a.e);
  const slotForPanel = new Array(n);
  for (let k = 0; k < order.length && k < slots.length; k++) {
    slotForPanel[order[k].i] = slots[k];
  }

  const width = alongLen;
  const depth = isFlat ? rowsA * stepVh + EDGE_MARGIN * 2 : 2 * crossHalf + 0.6;

  return {
    isFlat,
    yaw,
    worldCx,
    worldCz,
    pitchDeg: isFlat ? 0 : pitchDeg,
    eaveH,
    ridgeH,
    rise,
    crossHalf,
    width,
    depth,
    slots,
    slotForPanel,
    domAzimuth,
    facing: { sideA: nA, sideB: nB },
  };
}

function RoofSlope({ model, side }) {
  const { width, eaveH, ridgeH, crossHalf, pitchDeg } = model;
  const slopeLen = Math.sqrt(crossHalf ** 2 + (ridgeH - eaveH) ** 2) + 0.4;
  const midY = (eaveH + ridgeH) / 2;
  const overhang = width + 0.6;
  return (
    <mesh
      position={[0, midY, side * (crossHalf / 2 + 0.0)]}
      onUpdate={(m) => orientToRoof(m, pitchDeg, side > 0 ? 0 : 180)}
      receiveShadow
      castShadow
    >
      <planeGeometry args={[overhang, slopeLen]} />
      <meshStandardMaterial color="#8a7b6b" side={2} roughness={0.85} metalness={0.03} />
    </mesh>
  );
}

function FlatRoof({ model }) {
  const { width, depth, eaveH } = model;
  return (
    <mesh position={[0, eaveH + 0.02, 0]} receiveShadow castShadow>
      <boxGeometry args={[width + 0.4, 0.12, depth + 0.4]} />
      <meshStandardMaterial color="#8a8377" roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

function GableEnd({ model, side }) {
  const { width, eaveH, rise, crossHalf } = model;
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-crossHalf, 0);
    shape.lineTo(crossHalf, 0);
    shape.lineTo(0, rise);
    shape.lineTo(-crossHalf, 0);
    return new THREE.ShapeGeometry(shape);
  }, [crossHalf, rise]);
  return (
    <mesh
      geometry={geometry}
      position={[side * (width / 2), eaveH, 0]}
      rotation={[0, side * (Math.PI / 2), 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#cdc3b2" side={2} roughness={0.92} />
    </mesh>
  );
}

// Renders the building. Must be placed inside a group rotated by model.yaw.
export default function HouseModel({ model }) {
  if (!model) return null;
  const { width, depth, eaveH, isFlat } = model;
  const bodyW = Math.max(2, width - 0.4);
  const bodyD = Math.max(2, depth - 0.4);

  return (
    <group>
      <mesh position={[0, eaveH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, eaveH, bodyD]} />
        <meshStandardMaterial color="#dcd3c3" roughness={0.95} metalness={0} />
      </mesh>

      {isFlat ? (
        <FlatRoof model={model} />
      ) : (
        <>
          <RoofSlope model={model} side={1} />
          <RoofSlope model={model} side={-1} />
          <GableEnd model={model} side={1} />
          <GableEnd model={model} side={-1} />
        </>
      )}
    </group>
  );
}
