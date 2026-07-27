import { useMemo } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;

// Fixed render scale + roof pitch so the house always looks like a tidy
// single-story home, independent of the API's absolute elevation numbers.
export const WALL_HEIGHT = 3;
export const ROOF_PITCH_RAD = 0.4; // ~23 degrees — a natural residential pitch

/**
 * Orient a flat panel/plane to a given pitch + azimuth. rotateY(azimuth)
 * first (while flat), then rotateX to tilt. Azimuth convention here:
 *   0 -> faces +Z, 90 -> +X, 180 -> -Z, 270 -> -X.
 */
export function orientToRoof(mesh, pitchDegrees, azimuthDegrees) {
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(azimuthDegrees * DEG2RAD);
  mesh.rotateX(-Math.PI / 2 + pitchDegrees * DEG2RAD);
}

/**
 * Derive a clean gable-roof house from the panel positions (which are far
 * more reliable than the API's roof-segment bounding boxes). Everything is
 * built relative to a fixed eave height so absolute elevations can't distort
 * the scale.
 */
export function computeHouseModel(panels, origin) {
  if (!panels?.length) return null;

  const pts = panels.map((p) =>
    toLocalXZ(p.center.latitude, p.center.longitude, origin.latitude, origin.longitude)
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const q of pts) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
  }
  if (!Number.isFinite(minX)) return null;

  const margin = 1.8; // breathing room beyond the array for eaves
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;

  const width = Math.max(4, maxX - minX);
  const depth = Math.max(4, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Ridge runs along the longer axis (looks natural, minimizes panel tilt).
  const ridgeAlongX = width >= depth;
  const crossSpan = ridgeAlongX ? depth : width;

  const eaveH = WALL_HEIGHT;
  const rise = (crossSpan / 2) * Math.tan(ROOF_PITCH_RAD);
  const ridgeH = eaveH + rise;

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
    pitchRad: ROOF_PITCH_RAD,
    pitchDeg: ROOF_PITCH_RAD / DEG2RAD,
  };
}

/**
 * Where a panel at (x, z) sits on the gable roof, and how it should tilt.
 * Panels on either side of the ridge lie flush on that slope.
 */
export function placePanelOnRoof(model, x, z, extraLift = 0) {
  const { cx, cz, ridgeAlongX, ridgeH, pitchRad, pitchDeg } = model;
  const cross = ridgeAlongX ? z - cz : x - cx;
  const side = cross >= 0 ? 1 : -1;
  const dist = Math.abs(cross);

  const y = ridgeH - dist * Math.tan(pitchRad);

  let azimuthDeg;
  if (ridgeAlongX) azimuthDeg = side > 0 ? 0 : 180;
  else azimuthDeg = side > 0 ? 90 : 270;

  return {
    y: y + (extraLift + 0.08) * Math.cos(pitchRad),
    azimuthDeg,
    pitchDeg,
  };
}

function RoofSlope({ model, side }) {
  const { cx, cz, width, depth, ridgeAlongX, eaveH, ridgeH, crossSpan } = model;
  const slopeLen = Math.sqrt((crossSpan / 2) ** 2 + (ridgeH - eaveH) ** 2) + 0.5;
  const midY = (eaveH + ridgeH) / 2;
  const overhang = (ridgeAlongX ? width : depth) + 0.8;

  const pos = ridgeAlongX
    ? [cx, midY, cz + side * (depth / 4)]
    : [cx + side * (width / 4), midY, cz];

  const azimuthDeg = ridgeAlongX ? (side > 0 ? 0 : 180) : side > 0 ? 90 : 270;
  // Local X always maps along the ridge after orientToRoof, so the
  // ridge-length dimension goes first for both orientations.
  const args = [overhang, slopeLen];

  return (
    <mesh
      position={pos}
      onUpdate={(m) => orientToRoof(m, model.pitchDeg, azimuthDeg)}
      receiveShadow
      castShadow
    >
      <planeGeometry args={args} />
      <meshStandardMaterial color="#7d6a5b" side={2} roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

// Triangular wall that fills the gap under the ridge at each end of the house.
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

  // Rotate the triangle to face outward at the building end.
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
  const bodyW = Math.max(2, width - 0.6);
  const bodyD = Math.max(2, depth - 0.6);

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
