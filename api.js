import { useMemo } from 'react';
import { toLocalXZ, boundingBoxSizeMeters } from '../lib/geo.js';

const DEG2RAD = Math.PI / 180;

// Fixed render scale so the house is always roughly single-story tall,
// independent of the API's absolute elevation values. Shared with the panel
// placement so panels and roof use the same reference.
export const WALL_HEIGHT = 3;

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

function RoofSegmentMesh({ segment, origin, heightBase }) {
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

  // Normalize to a sane, fixed scale. planeHeightAtCenterMeters can be an
  // absolute-ish elevation (tens of meters), which would build a skyscraper.
  // Subtracting the lowest segment and adding a fixed wall height keeps the
  // house roughly single-story regardless of the raw numbers.
  const rawHeight = segment.planeHeightAtCenterMeters ?? 0;
  const height = rawHeight - heightBase + WALL_HEIGHT;

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
    }

    if (!Number.isFinite(minX)) return null;

    // Walls reach just under the lowest roof plane (which sits at WALL_HEIGHT
    // after normalization), so the roof overhangs and never pokes through.
    const wallHeight = WALL_HEIGHT - 0.6;

    // Inset so the roof visibly overhangs the walls (eaves). Footprint is
    // clamped so a stray oversized bounding box can't balloon the house.
    const inset = 0.5;
    const width = Math.min(40, Math.max(3, maxX - minX - inset * 2));
    const depth = Math.min(40, Math.max(3, maxZ - minZ - inset * 2));

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
  // Shared height reference: the lowest segment. Everything renders relative
  // to this so absolute elevation values don't blow up the scale.
  const heightBase = useMemo(() => {
    const heights = segments
      .map((s) => s.planeHeightAtCenterMeters)
      .filter((h) => typeof h === 'number');
    return heights.length ? Math.min(...heights) : 0;
  }, [segments]);

  return (
    <group>
      <HouseBody segments={segments} origin={origin} />
      {segments.map((segment) => (
        <RoofSegmentMesh
          key={segment.segmentIndex}
          segment={segment}
          origin={origin}
          heightBase={heightBase}
        />
      ))}
    </group>
  );
}

export { orientToRoof };
