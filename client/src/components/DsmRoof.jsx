import { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

/**
 * Renders Google's actual measured roof surface (DSM) and places panels on
 * it. Improvements over the raw render:
 *  - crops tight to the building (drops the surrounding neighborhood clutter)
 *  - light smoothing to calm the noisy height data
 *  - drapes the aerial photo when available, clean neutral tone otherwise
 *
 * Grid convention (Google north-up, west-left GeoTIFFs):
 *   col 0 -> west (-X), col max -> east (+X); row 0 -> north (-Z), row max -> south (+Z)
 */

const CROP_RADIUS_M = 15; // half-extent of roof shown around the building

// Light 3x3 box blur to reduce spiky DSM noise. Returns a new terrain.
export function smoothTerrain(terrain, passes = 1) {
  if (!terrain?.heights) return terrain;
  const { gridWidth: W, gridHeight: H } = terrain;
  let h = Float32Array.from(terrain.heights);
  for (let p = 0; p < passes; p++) {
    const out = Float32Array.from(h);
    for (let r = 1; r < H - 1; r++) {
      for (let c = 1; c < W - 1; c++) {
        let s = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) s += h[(r + dr) * W + (c + dc)];
        out[r * W + c] = s / 9;
      }
    }
    h = out;
  }
  return { ...terrain, heights: h };
}

export function buildDsmGeometry(terrain) {
  const { gridWidth: W, gridHeight: H, spanXMeters: SX, spanZMeters: SZ, heights } = terrain;

  // Column/row window covering [-CROP, CROP] meters around center.
  const cCol = (W - 1) / 2;
  const cRow = (H - 1) / 2;
  const colsPerM = (W - 1) / SX;
  const rowsPerM = (H - 1) / SZ;
  const cMin = Math.max(0, Math.floor(cCol - CROP_RADIUS_M * colsPerM));
  const cMax = Math.min(W - 1, Math.ceil(cCol + CROP_RADIUS_M * colsPerM));
  const rMin = Math.max(0, Math.floor(cRow - CROP_RADIUS_M * rowsPerM));
  const rMax = Math.min(H - 1, Math.ceil(cRow + CROP_RADIUS_M * rowsPerM));

  const cw = cMax - cMin + 1;
  const rh = rMax - rMin + 1;

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(cw * rh * 3);
  const uvs = new Float32Array(cw * rh * 2);

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const li = (r - rMin) * cw + (c - cMin);
      positions[li * 3] = (c / (W - 1) - 0.5) * SX;
      positions[li * 3 + 1] = heights[r * W + c] || 0;
      positions[li * 3 + 2] = (r / (H - 1) - 0.5) * SZ;
      uvs[li * 2] = c / (W - 1);
      uvs[li * 2 + 1] = 1 - r / (H - 1);
    }
  }

  const indices = [];
  for (let r = 0; r < rh - 1; r++) {
    for (let c = 0; c < cw - 1; c++) {
      const a = r * cw + c;
      const b = r * cw + c + 1;
      const d = (r + 1) * cw + c;
      const e = (r + 1) * cw + c + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeSampler(terrain) {
  const { gridWidth: W, gridHeight: H, spanXMeters: SX, spanZMeters: SZ, heights } = terrain;
  const at = (c, r) => {
    c = Math.max(0, Math.min(W - 1, c));
    r = Math.max(0, Math.min(H - 1, r));
    return heights[r * W + c] || 0;
  };
  return function sample(x, z) {
    const cf = (x / SX + 0.5) * (W - 1);
    const rf = (z / SZ + 0.5) * (H - 1);
    const c0 = Math.floor(cf);
    const r0 = Math.floor(rf);
    const tx = cf - c0;
    const tz = rf - r0;
    const h00 = at(c0, r0), h10 = at(c0 + 1, r0), h01 = at(c0, r0 + 1), h11 = at(c0 + 1, r0 + 1);
    const y = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    const dx = SX / (W - 1);
    const dz = SZ / (H - 1);
    const dhdx = (at(c0 + 1, r0) - at(c0 - 1, r0)) / (2 * dx);
    const dhdz = (at(c0, r0 + 1) - at(c0, r0 - 1)) / (2 * dz);
    const normal = new THREE.Vector3(-dhdx, 1, -dhdz).normalize();
    return { y, normal };
  };
}

export function computeDsmPlacements(panels, terrain, origin) {
  const sample = makeSampler(terrain);
  return panels.map((p) => {
    const { x, z } = toLocalXZ(
      p.center.latitude,
      p.center.longitude,
      origin.latitude,
      origin.longitude
    );
    const { y, normal } = sample(x, z);
    return { x, z, y: y + 0.12 * normal.y, normal: [normal.x, normal.y, normal.z] };
  });
}

export function DsmMesh({ terrain }) {
  const [texture, setTexture] = useState(null);
  const [texFailed, setTexFailed] = useState(false);

  useEffect(() => {
    if (!terrain?.textureDataUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    new THREE.TextureLoader().load(
      terrain.textureDataUrl,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      },
      undefined,
      () => !cancelled && setTexFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [terrain?.textureDataUrl]);

  const geometry = useMemo(() => (terrain ? buildDsmGeometry(terrain) : null), [terrain]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.92} metalness={0} />
      ) : (
        <meshStandardMaterial color="#c7bfb0" roughness={0.95} metalness={0} flatShading={false} />
      )}
    </mesh>
  );
}
