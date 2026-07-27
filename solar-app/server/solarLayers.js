import { fromArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';

/**
 * Fetches Google Solar API "data layers" and turns them into something a
 * browser can render directly:
 *
 *   - DSM (digital surface model) -> a downsampled height grid, in meters
 *   - RGB aerial imagery          -> a PNG data URL to drape over that grid
 *
 * This is what upgrades the 3D view from "tilted rectangles" to the actual
 * shape of the roof. Everything here is best-effort: if any layer is
 * missing or unparseable we throw, and the caller falls back to the simpler
 * roof-segment rendering so the app never breaks.
 */

// Keep the mesh grid modest. ~160x160 is plenty of detail for one house and
// keeps the JSON payload (and Render's free-tier memory) reasonable.
const MAX_GRID = 160;

// GeoTIFF nodata sentinel used by the Solar API for "no reading here".
const NODATA_THRESHOLD = -9000;

async function fetchGeoTiff(url, apiKey) {
  // Layer URLs come back from the API without credentials attached.
  const signed = `${url}${url.includes('?') ? '&' : '?'}key=${apiKey}`;
  const res = await fetch(signed);
  if (!res.ok) {
    throw new Error(`Layer fetch failed (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return {
    width: image.getWidth(),
    height: image.getHeight(),
    rasters,
  };
}

/**
 * Reduce a full-resolution raster to at most MAX_GRID x MAX_GRID by
 * nearest-neighbour sampling. Good enough for terrain: we're not doing
 * measurement here, we're drawing a shape.
 */
function downsample(band, width, height, maxGrid) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / maxGrid));
  const outW = Math.floor(width / step);
  const outH = Math.floor(height / step);
  const out = new Float32Array(outW * outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      out[y * outW + x] = band[y * step * width + x * step];
    }
  }
  return { data: out, width: outW, height: outH, step };
}

function rgbToPngDataUrl(rasters, width, height) {
  const [r, g, b] = rasters;
  const png = new PNG({ width, height });

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    png.data[o] = r[i];
    png.data[o + 1] = g[i];
    png.data[o + 2] = b[i];
    png.data[o + 3] = 255;
  }

  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

export async function buildTerrainModel({
  lat,
  lng,
  apiKey,
  radiusMeters = 35,
  pixelSizeMeters = 0.25,
}) {
  const url = new URL('https://solar.googleapis.com/v1/dataLayers:get');
  url.searchParams.set('location.latitude', lat);
  url.searchParams.set('location.longitude', lng);
  url.searchParams.set('radiusMeters', radiusMeters);
  url.searchParams.set('view', 'FULL_LAYERS');
  url.searchParams.set('requiredQuality', 'LOW'); // accept whatever exists
  url.searchParams.set('pixelSizeMeters', pixelSizeMeters);
  url.searchParams.set('key', apiKey);

  const metaRes = await fetch(url);
  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({}));
    const err = new Error(body.error?.message || 'No data layers available.');
    err.status = metaRes.status;
    throw err;
  }

  const meta = await metaRes.json();
  if (!meta.dsmUrl) {
    const err = new Error('No elevation layer for this location.');
    err.status = 404;
    throw err;
  }

  // Height map is the essential part.
  const dsm = await fetchGeoTiff(meta.dsmUrl, apiKey);
  const dsmBand = dsm.rasters[0];
  const grid = downsample(dsmBand, dsm.width, dsm.height, MAX_GRID);

  // Normalize elevations so the lowest valid reading sits at y = 0. The
  // client then doesn't care whether these were sea-level elevations.
  let minH = Infinity;
  let maxH = -Infinity;
  for (const v of grid.data) {
    if (v > NODATA_THRESHOLD) {
      if (v < minH) minH = v;
      if (v > maxH) maxH = v;
    }
  }
  if (!Number.isFinite(minH)) {
    const err = new Error('Elevation layer had no usable readings.');
    err.status = 404;
    throw err;
  }

  const heights = Array.from(grid.data, (v) =>
    v > NODATA_THRESHOLD ? +(v - minH).toFixed(2) : 0
  );

  // Physical size of the sampled patch. Derived from pixel count x pixel
  // size, which avoids having to reproject the GeoTIFF's coordinate system.
  const spanX = grid.width * grid.step * pixelSizeMeters;
  const spanZ = grid.height * grid.step * pixelSizeMeters;

  // Aerial imagery is optional garnish -- a missing texture shouldn't sink
  // the whole model, so failures here are swallowed.
  let textureDataUrl = null;
  if (meta.rgbUrl) {
    try {
      const rgb = await fetchGeoTiff(meta.rgbUrl, apiKey);
      textureDataUrl = rgbToPngDataUrl(rgb.rasters, rgb.width, rgb.height);
    } catch {
      textureDataUrl = null;
    }
  }

  return {
    gridWidth: grid.width,
    gridHeight: grid.height,
    spanXMeters: +spanX.toFixed(2),
    spanZMeters: +spanZ.toFixed(2),
    baseElevationMeters: +minH.toFixed(2),
    maxRelativeHeightMeters: +(maxH - minH).toFixed(2),
    heights,
    textureDataUrl,
  };
}
