import { useMemo } from 'react';
import { toLocalXZ, boundingBoxSizeMeters } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;

/**
 * Orienting a flat plane to match a roof segment's pitch/azimuth:
 *
 * 1. rotateY(azimuth) FIRST, while the plane is still flat and its local
 *    axes match world axes -- this spins it around the true vertical axis
 *    so its "downslope" direction points at the right compass bearing.
 * 2. rotateX(-90deg + pitch) SECOND -- at this point the object's local X
 *    axis is a horizontal line running along the new azimuth-rotated
 *    "ridge" direction, so tilting around it lifts the plane to the correct
 *    pitch without twisting the azimuth we just set.
 *
 * Order matters: doing this the other way around ties the tilt axis to the
 * wrong direction and the roof ends up facing the wrong way.
 */
function orientToRoof(mesh, pitchDegrees, azimuthDegrees) {
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(azimuthDegrees * DEG2RAD);
  mesh.rotateX(-Math.PI / 2 + pitchDegrees * DEG2RAD);
}

function RoofSegmentMesh({ segment, origin }) {
  const { x, z } = useMemo(
    () =>
      toLocalXZ(
        segment.center.latitude,
        segment.center.longitude,
        origin.latitude,
        origin.longitude
      ),
    [segment, origin]
  );

  const { width, depth } = useMemo(
    () => boundingBoxSizeMeters(segment.boundingBox),
    [segment]
  );

  const height = segment.planeHeightAtCenterMeters ?? 3;

  return (
    <mesh
      position={[x, height, z]}
      onUpdate={(mesh) =>
        orientToRoof(mesh, segment.pitchDegrees, segment.azimuthDegrees)
      }
      receiveShadow
      castShadow
    >
      <planeGeometry args={[width, depth]} />
      {/* Warm, mid-tone roof so it reads clearly against the dark viewport.
          The old near-black slate was effectively invisible in the scene. */}
      <meshStandardMaterial
        color="#8a7563"
        side={2}
        roughness={0.9}
        metalness={0.02}
      />
    </mesh>
  );
}

/**
 * The roof segments alone are just floating slabs -- without a solid mass
 * under them the render doesn't read as a building at all. This derives a
 * simple house body from the segments themselves (their combined footprint,
 * and the lowest roof plane as the eave line) so no extra data is needed.
 *
 * It's deliberately a simple block: Solar API gives bounding boxes rather
 * than true roof outlines, so a plain extruded footprint is the honest
 * level of detail here rather than faking architectural precision.
 */
function HouseBody({ segments, origin }) {
  const box = useMemo(() => {
    if (!segments.length) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minHeight = Infinity;

    for (const segment of segments) {
      const { x, z } = toLocalXZ(
        segment.center.latitude,
        segment.center.longitude,
        origin.latitude,
        origin.longitude
      );
      const { width, depth } = boundingBoxSizeMeters(segment.boundingBox);

      minX = Math.min(minX, x - width / 2);
      maxX = Math.max(maxX, x + width / 2);
      minZ = Math.min(minZ, z - depth / 2);
      maxZ = Math.max(maxZ, z + depth / 2);
      minHeight = Math.min(
        minHeight,
        segment.planeHeightAtCenterMeters ?? 3
      );
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minHeight)) return null;

    // Walls stop just below the lowest roof plane so the roof reads as
    // sitting on top with a small eave overhang.
    const wallHeight = Math.max(2.2, minHeight - 0.6);

    // Inset slightly so the roof visibly overhangs the walls.
    const inset = 0.35;
    const width = Math.max(2, maxX - minX - inset * 2);
    const depth = Math.max(2, maxZ - minZ - inset * 2);

    return {
      width,
      depth,
      wallHeight,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
    };
  }, [segments, origin]);

  if (!box) return null;

  return (
    <mesh
      position={[box.cx, box.wallHeight / 2, box.cz]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[box.width, box.wallHeight, box.depth]} />
      <meshStandardMaterial color="#d6cdbd" roughness={0.95} metalness={0} />
    </mesh>
  );
}

export default function RoofSegments({ segments, origin }) {
  return (
    <group>
      <HouseBody segments={segments} origin={origin} />
      {segments.map((segment) => (
        <RoofSegmentMesh
          key={segment.segmentIndex}
          segment={segment}
          origin={origin}
        />
      ))}
    </group>
  );
}

export { orientToRoof };
