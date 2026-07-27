import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { buildTerrainModel } from './solarLayers.js';
import { scoreLead, extractFeatures } from './leadScoring.js';

const app = express();
const PORT = process.env.PORT || 8787;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.warn(
    '[solar-app-server] GOOGLE_MAPS_API_KEY is not set. Copy .env.example to .env and add your key.'
  );
}

app.use(cors());
app.use(express.json());

// Very small in-memory caches so re-searching the same address/roof during
// dev (or a demo) doesn't burn a billed API call every time.
// Swap for Redis/a DB if this goes to production with real traffic.
const geocodeCache = new Map();
const insightsCache = new Map();

function roundKey(lat, lng) {
  // ~1m precision -- Building Insights snaps to the nearest known building
  // anyway, so over-precision here just hurts the cache hit rate.
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// GET /api/geocode?address=123 Main St, Springfield
// -> { lat, lng, formattedAddress }
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/autocomplete?q=123 Main&session=<uuid>
// -> { suggestions: [{ placeId, main, secondary }] }
//
// Powers the address dropdown. The `session` token groups keystrokes into a
// single billable autocomplete session -- without it Google bills per
// keystroke, which gets expensive fast. The client generates one token per
// search and discards it after a selection.
// ---------------------------------------------------------------------------
app.get('/api/autocomplete', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sessionToken = (req.query.session || '').toString() || undefined;

  // Below 3 characters the results are noise and it's just wasted spend.
  if (q.length < 3) return res.json({ suggestions: [] });

  async function call(withTypeFilter) {
    const body = { input: q, sessionToken };
    if (withTypeFilter) {
      // Only interested in things a house can be at.
      body.includedPrimaryTypes = ['street_address', 'premise', 'subpremise'];
    }
    return fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
      },
      body: JSON.stringify(body),
    });
  }

  try {
    // The type filter is the nicer experience, but if this Google project
    // rejects it for any reason, fall back to unfiltered rather than
    // showing the user a broken dropdown.
    let r = await call(true);
    if (r.status === 400) r = await call(false);

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn('[autocomplete]', err.error?.message || r.status);
      return res.json({ suggestions: [] });
    }

    const data = await r.json();
    const suggestions = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => ({
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
        full: p.text?.text || '',
      }));

    res.json({ suggestions });
  } catch (err) {
    // A failed dropdown should never block typing -- degrade to no
    // suggestions and let the person submit manually.
    console.warn('[autocomplete]', err.message);
    res.json({ suggestions: [] });
  }
});

app.get('/api/geocode', async (req, res) => {
  const address = (req.query.address || '').toString().trim();
  const placeId = (req.query.placeId || '').toString().trim();

  if (!address && !placeId) {
    return res.status(400).json({ error: 'Missing "address" or "placeId".' });
  }

  // A placeId is an exact reference, so it makes a better cache key and a
  // more accurate lookup than re-parsing free text.
  const cacheKey = placeId || address.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return res.json(geocodeCache.get(cacheKey));
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    if (placeId) {
      url.searchParams.set('place_id', placeId);
    } else {
      url.searchParams.set('address', address);
    }
    url.searchParams.set('key', API_KEY);

    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return res.status(404).json({
        error: `Geocoding failed: ${data.status}`,
        details: data.error_message || null,
      });
    }

    const top = data.results[0];
    const result = {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formattedAddress: top.formatted_address,
    };

    geocodeCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Geocoding request failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/building-insights?lat=..&lng=..
// -> raw Solar API buildingInsights payload (roof segments, panel configs,
//    per-panel positions, financial analyses)
// ---------------------------------------------------------------------------
app.get('/api/building-insights', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Missing/invalid lat or lng.' });
  }

  const cacheKey = roundKey(lat, lng);
  if (insightsCache.has(cacheKey)) {
    return res.json(insightsCache.get(cacheKey));
  }

  // Try progressively lower imagery quality requirements -- HIGH isn't
  // available everywhere, and a lower-quality match is better than a 404.
  const qualities = ['HIGH', 'MEDIUM', 'BASE'];

  for (const requiredQuality of qualities) {
    try {
      const url = new URL(
        'https://solar.googleapis.com/v1/buildingInsights:findClosest'
      );
      url.searchParams.set('location.latitude', lat);
      url.searchParams.set('location.longitude', lng);
      url.searchParams.set('requiredQuality', requiredQuality);
      url.searchParams.set('key', API_KEY);

      const r = await fetch(url);

      if (r.status === 404) {
        continue; // try the next quality tier
      }

      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        return res.status(r.status).json({
          error: 'Solar API request failed.',
          details: errBody.error?.message || null,
        });
      }

      const data = await r.json();
      insightsCache.set(cacheKey, data);
      return res.json(data);
    } catch (err) {
      console.error(err);
      return res.status(502).json({ error: 'Solar API request failed.' });
    }
  }

  res
    .status(404)
    .json({ error: 'No solar data available for this location yet.' });
});

// ---------------------------------------------------------------------------
// GET /api/terrain?lat=..&lng=..
// -> height grid + aerial texture for the real 3D roof shape.
//
// This is strictly an enhancement: if it fails for any reason the client
// falls back to the simpler roof-segment rendering, so a failure here can
// never take the app down.
// ---------------------------------------------------------------------------
const terrainCache = new Map();

app.get('/api/terrain', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Missing/invalid lat or lng.' });
  }

  const cacheKey = roundKey(lat, lng);
  if (terrainCache.has(cacheKey)) {
    return res.json(terrainCache.get(cacheKey));
  }

  try {
    const model = await buildTerrainModel({ lat, lng, apiKey: API_KEY });
    // Cache is capped: these payloads are large and Render's free tier is
    // memory constrained.
    if (terrainCache.size > 12) {
      terrainCache.delete(terrainCache.keys().next().value);
    }
    terrainCache.set(cacheKey, model);
    res.json(model);
  } catch (err) {
    console.warn('[terrain]', err.message);
    res
      .status(err.status || 502)
      .json({ error: err.message || 'Terrain unavailable.' });
  }
});

// ---------------------------------------------------------------------------
// Lead capture
//
// For this scaffold, leads are appended to a JSON file on disk so you can see
// them immediately without standing up a database. For production you'd POST
// these straight into your CRM (HubSpot, Salesforce, Zoho, etc.) and/or a real
// database -- swap the readFile/writeFile calls below for that integration.
// The file contains personal data (names, emails, phones), so it is
// git-ignored and should never be committed.
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, 'leads.json');

async function readLeads() {
  try {
    const raw = await fs.readFile(LEADS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// POST /api/leads  -> { ok: true, id }
app.post('/api/leads', async (req, res) => {
  const { contact = {}, qualification = {}, design = {} } = req.body || {};

  // Minimal validation -- name + a valid email are the only hard requirements
  // so the form stays as short as the research recommends.
  if (!contact.name?.trim()) {
    return res.status(400).json({ error: 'Please include a name.' });
  }
  if (!isEmail(contact.email)) {
    return res.status(400).json({ error: 'Please include a valid email.' });
  }

  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'sunplan-web',
    contact: {
      name: contact.name.trim(),
      email: contact.email.trim(),
      phone: (contact.phone || '').trim() || null,
    },
    // Qualifying answers are all optional -- captured if given, never blocking.
    qualification: {
      homeowner: qualification.homeowner ?? null,
      monthlyBill: qualification.monthlyBill ?? null,
      timeline: qualification.timeline ?? null,
    },
    // The design snapshot is what makes this lead valuable: it's the system
    // the person just built, attached automatically.
    design: {
      address: design.address ?? null,
      lat: design.lat ?? null,
      lng: design.lng ?? null,
      panelCount: design.panelCount ?? null,
      systemSizeKw: design.systemSizeKw ?? null,
      yearlyKwh: design.yearlyKwh ?? null,
      estYear1Savings: design.estYear1Savings ?? null,
      estYear20Savings: design.estYear20Savings ?? null,
      paybackYears: design.paybackYears ?? null,
      maxPanelCount: design.maxPanelCount ?? null,
    },
  };

  // Priority scoring (rules-based today, model-ready later).
  const scored = scoreLead(lead);
  lead.score = scored.score;
  lead.tier = scored.tier;
  lead.scoreReasons = scored.reasons;

  // Numeric snapshot for future model training.
  lead.features = extractFeatures(lead);

  // Training label. Set to 1 (became a customer) or 0 (didn't) as deals
  // resolve -- see the UPGRADE PATH notes in leadScoring.js.
  lead.outcome = null;

  try {
    const leads = await readLeads();
    leads.push(lead);
    await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));
    res.status(201).json({ ok: true, id: lead.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save lead.' });
  }
});

// GET /api/leads  -> saved leads (DEV ONLY -- add auth before production)
app.get('/api/leads', async (_req, res) => {
  res.json(await readLeads());
});

app.listen(PORT, () => {
  console.log(`[solar-app-server] listening on http://localhost:${PORT}`);
});
