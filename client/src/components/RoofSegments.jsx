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
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial
        color="#3a4552"
        side={2}
        roughness={0.85}
        metalness={0.05}
      />
    </mesh>
  );
}

export default function RoofSegments({ segments, origin }) {
  return (
    <group>
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
