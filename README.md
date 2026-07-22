# Sunplan — address-to-solar-design scaffold

Type in a home address, see its actual roof rendered in 3D with Google's real
solar analysis, click panels on and off, and watch system size, yearly
production, savings, and carbon offset update live.

This is a working scaffold, not a finished product — see **Known
limitations** below before you show it to a customer.

## How it works

1. **Geocoding API** turns the typed address into `lat, lng`.
2. **Solar API** (`buildingInsights.findClosest`) takes those coordinates and
   returns the actual building: roof segments (pitch, azimuth, boundaries),
   a max panel layout, the lat/lng/orientation of every individual panel in
   that layout, several smaller panel-count configs, and financial estimates.
3. The **3D scene** (`react-three-fiber` / three.js) doesn't fetch a 3D
   model from anywhere — it builds one, procedurally, from the roof segment
   and panel data above. Each roof segment becomes a tilted plane; each
   panel becomes a small clickable box positioned at its real coordinates.
4. Clicking a panel toggles it in/out of a `Set` of "active" panel indices.
   The **metrics panel** recomputes watts, yearly kWh, savings, and carbon
   offset from whichever panels are currently active.

### Interactions

- **Click any panel** to switch it on/off; hover lifts and brightens it.
- **Keep best panels** slider activates the N highest-producing panels and
  drops the rest — a quick way to trim a design to a budget.
- **Production heatmap** recolors active panels blue→amber→red by their
  individual `yearlyEnergyDcKwh`, so the best roof real estate is obvious.
- **Max design / Clear all** reset to the full optimal layout or an empty roof.

### Lead capture

The "Get my full solar report" button opens a short, conversational,
multi-step form. The design follows the higher-converting patterns for
tools like this:

- **Results-first, not a gate.** Capture only fires *after* the person has
  designed a system and seen their savings — showing value before asking
  for contact info is what keeps completion rates high. There is no upfront
  email wall.
- **The design is auto-attached.** Address, system size, yearly kWh, and
  estimated savings ride along with every lead, so sales gets a qualified,
  context-rich lead instead of a bare email — and the person sees that
  summary in the form ("claim what you built"), not a blank questionnaire.
- **Least-sensitive fields first.** Step 1 asks only name + email (+ optional
  phone). Step 2's qualifying questions (homeowner, monthly bill, timeline)
  are all skippable so they never block a submission.
- **Confirmation screen** sets expectations for follow-up.

Leads `POST` to `/api/leads` and, in this scaffold, are appended to
`server/leads.json` (git-ignored — it holds personal data). `GET /api/leads`
lists them for development. **Before production:** swap the file store for a
POST into your CRM (HubSpot, Salesforce, Zoho) or a real database, and put
auth on the `GET` route.

There is no "3D building model" API involved because none exists at
per-house fidelity — the roof geometry Solar API gives you is the actual
data you need, and rendering it yourself is what makes the panels editable.

## Deployment

The app is two pieces that deploy to two places. **Your Google API key only
ever lives on the backend host — never in the frontend or the browser.**

1. **Push to GitHub.** From `solar-app/`: `git init && git add . &&
   git commit -m "initial"`, then push to a new GitHub repo.

2. **Backend → Render** (do this first — the frontend needs its URL).
   render.com → New → Web Service → pick your repo, then set:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `node index.js`
   - Instance type: Free
   - Under Advanced → Environment variables, add
     `GOOGLE_MAPS_API_KEY` = your real key.

   Render gives you a URL like `https://sunplan-backend.onrender.com`. Test
   it by visiting `<that-url>/api/leads` — you should see `[]`. Copy the URL.

3. **Frontend → Vercel.** vercel.com → Add New → Project → import the same
   repo, then set:
   - Root directory: `client` (click Edit and choose it)
   - Framework preset: Vite (auto-detected)
   - Environment variable: `VITE_API_BASE_URL` = your Render URL from step 2
     (no trailing slash).

   Deploy. Vercel gives you your live app URL.

4. **Lock down the key.** Google Cloud Console → APIs & Services →
   Credentials → your key → API restrictions → "Restrict key" → check only
   Geocoding API and Solar API. Save.

### Production caveats for deployment

- **Lead storage is ephemeral on Render's free tier.** `leads.json` is wiped
  on every restart/redeploy. Before relying on it: attach a Render
  persistent disk, move to a database (Render has free Postgres), or POST
  leads into your CRM.
- **Free backends sleep.** The first request after idle has a ~30s cold
  start. A paid instance or a keep-alive ping removes it.
- **Tighten CORS.** The backend currently allows all origins; restrict it to
  your Vercel domain for production.

## Design

The interface is a light "studio" workspace wrapped around a dark 3D
viewport — the way professional design tools (Figma, CAD) frame their
canvas. The split does double duty: the dark viewport makes the roof model
and glowing panels pop, while the light chrome keeps the controls and
readouts calm and legible.

- **Type:** Archivo (display/wordmark) for an engineered feel, Inter for UI,
  and IBM Plex Mono for every number — system size, kWh, dollars — so the
  metrics read like instrument readouts rather than body text.
- **Color:** one confident accent (solar amber) reserved for the brand mark,
  primary actions, active panels, and the savings block; everything else is
  neutral so the accent carries meaning instead of becoming wallpaper.
- **Viewport:** a CAD-style grid floor gives scale as the roof rotates, and
  an address chip overlays the top-left so it's always clear what's being
  analyzed.

## Project layout

```
solar-app/
├── server/     Express proxy — holds the API key, calls Google, caches
│               responses. The browser never talks to Google directly.
└── client/     Vite + React + react-three-fiber frontend
```

## Setup

### 1. Get a Google Maps Platform API key

- Create/select a project in the [Google Cloud Console](https://console.cloud.google.com/).
- Enable **Geocoding API** and **Solar API**.
- Set up billing (both APIs are billed per request past their free tier).
- Create an API key and restrict it to just those two APIs.
- Check the [Solar API supported countries/regions](https://developers.google.com/maps/documentation/solar/coverage)
  — coverage isn't global yet.

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
# edit .env and paste your key into GOOGLE_MAPS_API_KEY
npm run dev
```

Runs on `http://localhost:8787`.

### 3. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Opens on `http://localhost:5173` and proxies `/api/*` to the backend.

## Known limitations (read before demoing to a customer)

- **Roof geometry is approximated from bounding boxes.** Solar API gives
  each segment's lat/lng bounding box, not a precise polygon outline, so
  segments render as simple rectangles tilted to the right pitch/azimuth.
  Complex roofs (hips, dormers) will look blockier than the real thing.
- **Panel height is a per-segment constant**, not adjusted for exactly
  where on a sloped segment a panel sits. Fine visually; not survey-grade.
- **Savings figures are scaled, not quoted.** The Solar API only returns
  exact financial figures for a few "recommended" system sizes. For any
  panel count in between, this app scales the nearest one linearly — good
  for a live "what if I remove some panels" feel, not good enough to print
  on a customer proposal. Swap in a real financing/quoting integration
  before this touches a sales conversation.
- **`orientation` (portrait/landscape) handling is a best guess** — verify
  it against a live API response for your market and adjust
  `SolarPanels.jsx` if panels render rotated 90° from reality.
- **No auth, rate limiting, or persistence** — this is a local dev scaffold.

## Where to take it next

- Swap the plain ground plane for a **Photorealistic 3D Tiles** backdrop
  (Google Maps Tile API + CesiumJS or `3d-tiles-renderer`) so the house
  sits in real surrounding context — keep the procedural roof/panels as
  the interactive layer on top.
- Add a panel product picker (wattage/brand tiers) instead of the flat
  `panelCapacityWatts` Solar API assumes.
- Export a PDF proposal from the current panel selection.
- Persist designs per address (a database, not just in-memory state).
