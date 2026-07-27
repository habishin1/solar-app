// Small-area equirectangular approximation. Good to a few centimeters of
// error over the footprint of a single building -- nowhere near enough
// error to matter for placing roof segments and panels in the 3D scene.

const EARTH_RADIUS_M = 6378137;

/**
 * Convert a lat/lng into local scene coordinates (meters) relative to an
 * origin point, using the three.js convention we use throughout this app:
 *   +X = east, +Z = south, +Y = up.
 * So north is -Z, west is -X.
 */
export function toLocalXZ(lat, lng, originLat, originLng) {
  const latRad = (originLat * Math.PI) / 180;
  const dLatRad = ((lat - originLat) * Math.PI) / 180;
  const dLngRad = ((lng - originLng) * Math.PI) / 180;

  const northMeters = dLatRad * EARTH_RADIUS_M;
  const eastMeters = dLngRad * EARTH_RADIUS_M * Math.cos(latRad);

  return {
    x: eastMeters,
    z: -northMeters, // north is negative Z
  };
}

/**
 * Width (east-west) and depth (north-south) in meters of a lat/lng
 * bounding box, e.g. a roof segment's boundingBox from the Solar API.
 */
export function boundingBoxSizeMeters(boundingBox) {
  if (!boundingBox?.sw || !boundingBox?.ne) return { width: 4, depth: 4 };

  const { sw, ne } = boundingBox;
  const swXZ = toLocalXZ(sw.latitude, sw.longitude, sw.latitude, sw.longitude);
  const neXZ = toLocalXZ(ne.latitude, ne.longitude, sw.latitude, sw.longitude);

  return {
    width: Math.abs(neXZ.x - swXZ.x) || 4,
    depth: Math.abs(neXZ.z - swXZ.z) || 4,
  };
}

export function boundingBoxCenter(boundingBox) {
  if (!boundingBox?.sw || !boundingBox?.ne) return null;
  return {
    latitude: (boundingBox.sw.latitude + boundingBox.ne.latitude) / 2,
    longitude: (boundingBox.sw.longitude + boundingBox.ne.longitude) / 2,
  };
}
