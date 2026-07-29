import { useMemo } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;
export const WALL_HEIGHT = 3;
const NORMAL_LIFT = 0.08;
const TILE_MARGIN = 0.5;

/**
 * Orient a flat plane/panel to a pitch + LOCAL azimuth (world frame).
 * Local azimuth O convention: 0 -> faces +Z, 90 -> +X, 180 -> -Z, 270 -> -X.
 */
export function orientToRoof(mesh, pitchDegrees, azimuthDegrees) {
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(azimuthDegrees * DEG2RAD);
  mesh.rotateX(-Math.PI / 2 + pitchDegrees * DEG2RAD);
}

// Google azimuth (0=N, 90=E, 180=S) -> our orientToRoof azimuth.
function googleToLocalAz(googleAz) {
  return ((180 - googleAz) % 360 + 360) % 360;
}

/**
 * Build a TRUE multi-face roof: every Google roof segment becomes its own
 * tilted face at its real pitch and compass heading, with that face's panels
 * resting on it. Heights are normalized to the lowest face so absolute
 * elevations can't blow up the scale.
 */
export function computeHouseModel(panels, roofSegments, origin) {
  const n = panels?.length || 0;
  if (!n) return null;
  const segs = roofSegments || [];

  const toXZ = (lat, lng) => toLocalXZ(lat, lng, origin.latitude, origin.longitude);

  // Lowest face height, for normalization.
  let minH = Infinity;
  for (const s of segs) {
    if (typeof s.planeHeightAtCenterMeters === 'number') {
      minH = Math.min(minH, s.planeHeightAtCenterMeters);
    }
  }
  if (!Number.isFinite(minH)) minH = 0;

  // Precompute per-segment geometry.
  const segInfo = segs.map((s) => {
    const pitchDeg = s.pitchDegrees ?? 0;
    const pitch = pitchDeg * DEG2RAD;
    const O = googleToLocalAz(s.azimuthDegrees ?? 0);
    const Or = O * DEG2RAD;
    const c = toXZ(s.center.latitude, s.center.longitude);
    const H0 = (s.planeHeightAtCenterMeters ?? minH) - minH + WALL_HEIGHT;
    // World normal of this face.
    const normal = new THREE.Vector3(
      Math.sin(pitch) * Math.sin(Or),
      Math.cos(pitch),
      Math.sin(pitch) * Math.cos(Or)
    ).normalize();
    // In-plane axes: r = ridge (horizontal), sVec = down-slope (in plane).
    const gAz = (s.azimuthDegrees ?? 0) * DEG2RAD;
    const dW = new THREE.Vector3(Math.sin(gAz), 0, -Math.cos(gAz)); // downslope horizontal
    const rVec = new THREE.Vector3(dW.z, 0, -dW.x).normalize(); // ridge (horizontal ⟂)
    const sVec = new THREE.Vector3(
      dW.x * Math.cos(pitch),
      -Math.sin(pitch),
      dW.z * Math.cos(pitch)
    ).normalize();
    return { pitchDeg, pitch, O, cx: c.x, cz: c.z, H0, normal, rVec, sVec };
  });

  function heightOnPlane(info, x, z) {
    const N = info.normal;
    if (Math.abs(N.y) < 1e-4) return info.H0;
    return info.H0 - (N.x * (x - info.cx) + N.z * (z - info.cz)) / N.y;
  }

  // Place each panel on its own segment's plane.
  const placements = new Array(n);
  const segExtent = segs.map(() => ({
    minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity, count: 0,
  }));

  let minPanelY = Infinity;
  let aMinX = Infinity, aMaxX = -Infinity, aMinZ = Infinity, aMaxZ = -Infinity;

  panels.forEach((p, i) => {
    const si = p.segmentIndex ?? 0;
    const info = segInfo[si] || segInfo[0];
    const c = toXZ(p.center.latitude, p.center.longitude);
    if (!info) {
      placements[i] = { x: c.x, y: WALL_HEIGHT, z: c.z, pitchDeg: 0, azimuthDeg: 0 };
      return;
    }
    const yPlane = heightOnPlane(info, c.x, c.z);
    const y = yPlane + NORMAL_LIFT * info.normal.y;
    placements[i] = { x: c.x, y, z: c.z, pitchDeg: info.pitchDeg, azimuthDeg: info.O };

    minPanelY = Math.min(minPanelY, y);
    aMinX = Math.min(aMinX, c.x); aMaxX = Math.max(aMaxX, c.x);
    aMinZ = Math.min(aMinZ, c.z); aMaxZ = Math.max(aMaxZ, c.z);

    // In-plane extent for this segment's roof tile.
    const ex = segExtent[si];
    if (ex) {
      const rel = new THREE.Vector3(c.x - info.cx, yPlane - info.H0, c.z - info.cz);
      const u = rel.dot(info.rVec);
      const v = rel.dot(info.sVec);
      ex.minU = Math.min(ex.minU, u); ex.maxU = Math.max(ex.maxU, u);
      ex.minV = Math.min(ex.minV, v); ex.maxV = Math.max(ex.maxV, v);
      ex.count++;
    }
  });

  // Build a roof tile per segment that has panels, sized to hug them.
  const tiles = [];
  let minEaveY = Infinity;
  segExtent.forEach((ex, si) => {
    if (!ex.count) return;
    const info = segInfo[si];
    const w = Math.max(1.5, ex.maxU - ex.minU + TILE_MARGIN * 2);
    const h = Math.max(1.5, ex.maxV - ex.minV + TILE_MARGIN * 2);
    const uc = (ex.minU + ex.maxU) / 2;
    const vc = (ex.minV + ex.maxV) / 2;
    const center = new THREE.Vector3(info.cx, info.H0, info.cz)
      .addScaledVector(info.rVec, uc)
      .addScaledVector(info.sVec, vc);
    tiles.push({
      x: center.x, y: center.y - 0.03, z: center.z,
      w, h, pitchDeg: info.pitchDeg, azimuthDeg: info.O,
    });
    // The face's lowest (eave) edge: half its slope-length below center.
    const eaveY = center.y - (h / 2) * Math.sin(info.pitch);
    minEaveY = Math.min(minEaveY, eaveY);
  });

  const bmargin = 1.2;
  const width = Math.max(3, aMaxX - aMinX + bmargin * 2);
  const depth = Math.max(3, aMaxZ - aMinZ + bmargin * 2);
  const cx = (aMinX + aMaxX) / 2;
  const cz = (aMinZ + aMaxZ) / 2;
  // Walls rise to the roof's lowest eave so the roof sits ON the house
  // instead of floating above it.
  const eave = Number.isFinite(minEaveY) ? minEaveY : WALL_HEIGHT;
  const wallTop = Math.max(1.8, eave + 0.05);

  return {
    placements,
    tiles,
    body: { cx, cz, width, depth, wallTop },
    faceCount: tiles.length,
  };
}

function RoofTile({ tile }) {
  return (
    <mesh
      position={[tile.x, tile.y, tile.z]}
      onUpdate={(m) => orientToRoof(m, tile.pitchDeg, tile.azimuthDeg)}
      receiveShadow
      castShadow
    >
      <planeGeometry args={[tile.w, tile.h]} />
      <meshStandardMaterial color="#8a7b6b" side={2} roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

export default function HouseModel({ model }) {
  if (!model) return null;
  const { body, tiles } = model;
  return (
    <group>
      <mesh position={[body.cx, body.wallTop / 2, body.cz]} castShadow receiveShadow>
        <boxGeometry args={[body.width, body.wallTop, body.depth]} />
        <meshStandardMaterial color="#dcd3c3" roughness={0.95} metalness={0} />
      </mesh>
      {tiles.map((t, i) => (
        <RoofTile key={i} tile={t} />
      ))}
    </group>
  );
}
