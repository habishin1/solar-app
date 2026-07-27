import { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Builds the actual shape of the property from the Solar API height map,
 * with the aerial photo draped over it. This is what makes the roof read as
 * a real house -- hips, dormers, chimneys and all -- rather than a set of
 * tilted rectangles.
 *
 * The mesh is a flat grid whose vertices are pushed up to the measured
 * elevation at each point. Straightforward, and it renders fast.
 */
export default function TerrainModel({ terrain }) {
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

  const geometry = useMemo(() => {
    if (!terrain) return null;

    const { gridWidth, gridHeight, spanXMeters, spanZMeters, heights } = terrain;

    const geo = new THREE.PlaneGeometry(
      spanXMeters,
      spanZMeters,
      gridWidth - 1,
      gridHeight - 1
    );

    // PlaneGeometry starts in the XY plane; displace along local Z, then lay
    // it flat below. Vertex order matches the row-major height grid.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count && i < heights.length; i++) {
      pos.setZ(i, heights[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }, [terrain]);

  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      castShadow
    >
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      ) : (
        <meshStandardMaterial color="#8d8377" roughness={0.95} metalness={0} />
      )}
    </mesh>
  );
}
