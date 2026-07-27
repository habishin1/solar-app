/**
 * Thin wrappers around our own backend proxy (see /server). The browser
 * never calls Google directly and never sees an API key.
 *
 * In local dev, API_BASE is empty and Vite proxies /api to localhost:8787.
 * In production the frontend and backend live on different domains, so set
 * VITE_API_BASE_URL (e.g. https://your-backend.onrender.com) at build time.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function geocodeAddress(address, placeId) {
  const params = new URLSearchParams();
  if (placeId) params.set('placeId', placeId);
  if (address) params.set('address', address);
  return handle(await fetch(`${API_BASE}/api/geocode?${params}`));
}

export async function fetchAddressSuggestions(query, sessionToken) {
  const params = new URLSearchParams({ q: query });
  if (sessionToken) params.set('session', sessionToken);
  const res = await fetch(`${API_BASE}/api/autocomplete?${params}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.suggestions || [];
}

export async function fetchBuildingInsights(lat, lng) {
  const url = `${API_BASE}/api/building-insights?lat=${lat}&lng=${lng}`;
  return handle(await fetch(url));
}

export async function saveLead(payload) {
  return handle(
    await fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
}

export async function fetchTerrain(lat, lng) {
  return handle(await fetch(`${API_BASE}/api/terrain?lat=${lat}&lng=${lng}`));
}
