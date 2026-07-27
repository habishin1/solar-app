import { useMemo } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;

export const WALL_HEIGHT = 3;
export const ROOF_PITCH_RAD = 0.4; // ~23 degrees

const GAP = 1.06; // 6% spacing between panels
const EDGE_MARGIN = 0.6; // meters of clear roof around the array
const RIDGE_GAP = 0.35; // clear strip along the ridge
const EAVE_GAP = 0.35; // clear strip along the eave

/**
 * Orient a flat panel/plane to a pitch + azimuth.
 *   azimuth 0 -> faces +Z, 90 -> +X, 180 -> -Z, 270 -> -X
 */
export function orientToRoof(mesh, pitchDegrees, azimuthDegrees) {
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(azimuthDegrees * DEG2RAD);
  mesh.rotateX(-Math.PI / 2 + pitchDegrees * DEG2RAD);
}

/**
 * Build a clean gable house AND a tidy, clipped grid of panel slots sized to
 * the panel count. Panels are snapped to this grid rather than dropped at
 * their raw GPS positions, so nothing hangs off the eaves or overlaps.
 *
 * The house is centered on the real array location, but its dimensions come
 * from the grid so the roof always fully contains the panels.
 */
export function computeHouseModel(panels, origin, panelWidth = 1.0, panelHeight = 1.7) {
  const n = panels?.length || 0;
  if (!n) return null;

  // Real array center (so the house sits where the roof actually is).
  const pts = panels.map((p) =>
    toLocalXZ(p.center.latitude, p.center.longitude, origin.latitude, origin.longitude)
  );
  let sx = 0;
  let sz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const q of pts) {
    sx += q.x;
    sz += q.z;
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
  }
  const cx = sx / n;
  const cz = sz / n;

  // Ridge runs along whichever way the real array is wider — keeps the house
  // proportioned like the actual roof.
  const ridgeAlongX = maxX - minX >= maxZ - minZ;

  const pitch = ROOF_PITCH_RAD;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  // Panels laid landscape: width along the ridge, height up the slope.
  const stepAlong = panelWidth * GAP; // along the ridge
  const stepUp = panelHeight * GAP; // up the slope surface

  const perSlope = Math.ceil(n / 2);

  // Choose column/row counts that give a roughly square ground footprint.
  let cols = Math.max(
    1,
    Math.round(Math.sqrt((2 * perSlope * stepUp * cosP) / stepAlong))
  );
  let rows = Math.ceil(perSlope / cols);

  // Roof surface dimensions from the grid (+ margins).
  const alongLen = cols * stepAlong + EDGE_MARGIN * 2;
  const slopeLen = rows * stepUp + RIDGE_GAP + EAVE_GAP;

  const crossSpan = 2 * slopeLen * cosP; // horizontal span across both slopes
  const rise = slopeLen * sinP;
  const eaveH = WALL_HEIGHT;
  const ridgeH = eaveH + rise;

  const width = ridgeAlongX ? alongLen : crossSpan;
  const depth = ridgeAlongX ? crossSpan : alongLen;

  // --- Generate the panel slots, filling from the ridge downward ---
  const slots = [];
  const halfAlong = (cols * stepAlong) / 2;

  function pushSlot(side, row, col) {
    // Position along the ridge.
    const along = -halfAlong + (col + 0.5) * stepAlong;
    // Distance up the slope surface from the eave (row 0 nearest ridge).
    const tFromRidge = RIDGE_GAP + (row + 0.5) * stepUp;
    const horiz = tFromRidge * cosP; // horizontal distance from ridge
    const y = ridgeH - tFromRidge * sinP + 0.08 * cosP;

    let x;
    let z;
    let azimuthDeg;
    if (ridgeAlongX) {
      x = cx + along;
      z = cz + side * horiz;
      azimuthDeg = side > 0 ? 0 : 180;
    } else {
      z = cz + along;
      x = cx + side * horiz;
      azimuthDeg = side > 0 ? 90 : 270;
    }
    slots.push({ x, y, z, azimuthDeg, pitchDeg: pitch / DEG2RAD });
  }

  // Interleave the two slopes row by row so both fill evenly.
  let placed = 0;
  for (let row = 0; row < rows && placed < n; row++) {
    for (const side of [1, -1]) {
      for (let col = 0; col < cols && placed < n; col++) {
        pushSlot(side, row, col);
        placed++;
      }
    }
  }

  return {
    cx,
    cz,
    width,
    depth,
    ridgeAlongX,
    eaveH,
    ridgeH,
    rise,
    crossSpan,
    pitchRad: pitch,
    pitchDeg: pitch / DEG2RAD,
    slots,
  };
}

function RoofSlope({ model, side }) {
  const { cx, cz, width, depth, ridgeAlongX, eaveH, ridgeH, crossSpan } = model;
  const slopeLen = Math.sqrt((crossSpan / 2) ** 2 + (ridgeH - eaveH) ** 2) + 0.4;
  const midY = (eaveH + ridgeH) / 2;
  const overhang = (ridgeAlongX ? width : depth) + 0.6;

  const pos = ridgeAlongX
    ? [cx, midY, cz + side * (depth / 4)]
    : [cx + side * (width / 4), midY, cz];

  const azimuthDeg = ridgeAlongX ? (side > 0 ? 0 : 180) : side > 0 ? 90 : 270;

  return (
    <mesh
      position={pos}
      onUpdate={(m) => orientToRoof(m, model.pitchDeg, azimuthDeg)}
      receiveShadow
      castShadow
    >
      <planeGeometry args={[overhang, slopeLen]} />
      <meshStandardMaterial color="#6f5d50" side={2} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function GableEnd({ model, side }) {
  const { cx, cz, width, depth, ridgeAlongX, eaveH, rise, crossSpan } = model;
  const half = crossSpan / 2;

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, rise);
    shape.lineTo(-half, 0);
    return new THREE.ShapeGeometry(shape);
  }, [half, rise]);

  const pos = ridgeAlongX
    ? [cx + side * (width / 2), eaveH, cz]
    : [cx, eaveH, cz + side * (depth / 2)];
  const rotY = ridgeAlongX ? side * (Math.PI / 2) : side > 0 ? 0 : Math.PI;

  return (
    <mesh geometry={geometry} position={pos} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#cabfa9" side={2} roughness={0.92} />
    </mesh>
  );
}

export default function HouseModel({ model }) {
  if (!model) return null;
  const { cx, cz, width, depth, eaveH } = model;
  const bodyW = Math.max(2, width - 0.4);
  const bodyD = Math.max(2, depth - 0.4);

  return (
    <group>
      <mesh position={[cx, eaveH / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, eaveH, bodyD]} />
        <meshStandardMaterial color="#d6cdbd" roughness={0.95} metalness={0} />
      </mesh>
      <RoofSlope model={model} side={1} />
      <RoofSlope model={model} side={-1} />
      <GableEnd model={model} side={1} />
      <GableEnd model={model} side={-1} />
    </group>
  );
}
