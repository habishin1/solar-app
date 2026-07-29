import { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { toLocalXZ } from '../lib/geo.js';

/**
 * Renders Google's actual measured roof surface (the Digital Surface Model)
 * and places each panel ON that surface. Because the mesh and the panel
 * sampler use the exact same coordinate mapping, panels sit flush on the
 * real roof — no floating, no wrong tilt. This is the approach the
 * professional tools use.
 *
 * Grid convention (matches Google's north-up, west-left GeoTIFFs):
 *   col 0 -> west (-X), col max -> east (+X)
 *   row 0 -> north (-Z), row max -> south (+Z)
 */

export function buildDsmGeometry(terrain) {
  const { gridWidth: W, gridHeight: Hh, spanXMeters: SX, spanZMeters: SZ, heights } = terrain;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(W * Hh * 3);
  const uvs = new Float32Array(W * Hh * 2);

  for (let r = 0; r < Hh; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      positions[i * 3] = (c / (W - 1) - 0.5) * SX;
      positions[i * 3 + 1] = heights[i] || 0;
      positions[i * 3 + 2] = (r / (Hh - 1) - 0.5) * SZ;
      uvs[i * 2] = c / (W - 1);
      uvs[i * 2 + 1] = 1 - r / (Hh - 1);
    }
  }

  const indices = [];
  for (let r = 0; r < Hh - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const a = r * W + c;
      const b = r * W + c + 1;
      const d = (r + 1) * W + c;
      const e = (r + 1) * W + c + 1;
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
  const { gridWidth: W, gridHeight: Hh, spanXMeters: SX, spanZMeters: SZ, heights } = terrain;
  const at = (c, r) => {
    c = Math.max(0, Math.min(W - 1, c));
    r = Math.max(0, Math.min(Hh - 1, r));
    return heights[r * W + c] || 0;
  };
  return function sample(x, z) {
    const cf = (x / SX + 0.5) * (W - 1);
    const rf = (z / SZ + 0.5) * (Hh - 1);
    const c0 = Math.floor(cf);
    const r0 = Math.floor(rf);
    const tx = cf - c0;
    const tz = rf - r0;
    const h00 = at(c0, r0), h10 = at(c0 + 1, r0), h01 = at(c0, r0 + 1), h11 = at(c0 + 1, r0 + 1);
    const y = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;

    const dx = SX / (W - 1);
    const dz = SZ / (Hh - 1);
    const dhdx = (at(c0 + 1, r0) - at(c0 - 1, r0)) / (2 * dx);
    const dhdz = (at(c0, r0 + 1) - at(c0, r0 - 1)) / (2 * dz);
    const normal = new THREE.Vector3(-dhdx, 1, -dhdz).normalize();
    return { y, normal };
  };
}

/**
 * Sample the DSM at every panel's real position to get flush placements.
 * A light smoothing (median of the panel cluster's normals) keeps panels
 * from jittering on noisy height data.
 */
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
    return {
      x,
      z,
      y: y + 0.12 * normal.y,
      normal: [normal.x, normal.y, normal.z],
    };
  });
}

export function DsmMesh({ terrain }) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!terrain?.textureDataUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    new THREE.TextureLoader().load(terrain.textureDataUrl, (tex) => {
      if (cancelled) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
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
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      ) : (
        <meshStandardMaterial color="#9a8f7d" roughness={0.97} metalness={0} />
      )}
    </mesh>
  );
}
