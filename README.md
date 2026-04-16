# Import KML Zones (Enhanced)

A MyGeotab add-in that extends the Geotab SDK's built-in zone importer with support for **Google My Maps route exports** (`<LineString>` KML geometry) and a modernised **Zenith UI**.

The original `addin-import-kml-zones` only accepts `<Point>` and `<Polygon>` geometry. When users export driving routes from Google My Maps the result is a `<LineString>` — which the original add-in rejects with *"must contain a point or polygon data."* This enhanced version converts LineString routes into **buffered corridor polygon zones**, unlocking workflows like: *"alert me when a vehicle leaves its designated route."*

---

## How It Works

```
KML file (Google My Maps export or any KML)
  │
  ├─ <Point> placemark        → Point zone (circular, configurable radius)
  ├─ <Polygon> placemark      → Polygon zone (as-is)
  └─ <LineString> placemark   → Corridor buffer algorithm
                                    │
                                    ├─ Parse coordinate sequence
                                    ├─ Compute perpendicular offsets
                                    │     end caps  : simple perpendicular at first/last vertex
                                    │     interior  : miter join (bisector of segment angles)
                                    │     miter cap : 4× to prevent spikes at sharp corners
                                    └─ Close polygon (left side forward + right side backward)
                                          │
                                          ▼
                                    Polygon zone (route corridor)
  │
  ▼
MyGeotab API
  └─ Set (Zone)  →  zone created in the database
```

The add-in runs entirely in the browser — no server or backend required. All KML parsing and geometry conversion happens client-side using the AngularJS controller and the corridor buffer algorithm in `kml.js`.

---

## Enhancements Over the Original

| Feature | Original | Enhanced |
|---|---|---|
| `<Point>` geometry | Yes | Yes |
| `<Polygon>` geometry | Yes | Yes |
| `<LineString>` geometry | No — rejected with error | **Yes — converted to corridor zone** |
| Corridor width control | — | **Configurable (default 15 m per side, range 10–50 m)** |
| UI design system | Legacy Checkmate CSS | **Zenith design tokens** |
| Upload area subtitle | None | **Descriptive hint text** |
| Polygon table label | "Polygon Zones" | **"Polygon & Route Corridor Zones"** |

---

## Prerequisites

- A MyGeotab account with **Zone management** access
- A `.kml` file — exported from Google My Maps or any mapping tool that supports KML
- No server infrastructure required

---

## Project Structure

```
addin-import-kml-zones-enhanced/
├── app/                          # Development source files
│   ├── importKmlZones.html       # Add-in page (development)
│   ├── config.json               # Add-in manifest
│   ├── example.kml               # Sample KML for smoke testing
│   ├── images/icon.svg           # Add-in menu icon
│   ├── scripts/
│   │   ├── app.js                # AngularJS controller
│   │   ├── kml.js                # KML parsing + corridor buffer algorithm
│   │   ├── utils.js              # Shared utilities (error display, helpers)
│   │   ├── uploader.js           # Drag-and-drop file handler
│   │   ├── colorPicker.js        # Zone colour picker widget
│   │   ├── vanillaSlider.js      # Transparency slider component
│   │   └── waiting.js            # Loading spinner
│   └── styles/style.css          # Zenith-aligned custom styles
├── dist/                         # Production build (served by GitHub Pages)
│   ├── importKmlZones.html       # Add-in entry point
│   ├── config.json               # Manifest with absolute GitHub Pages URL
│   ├── example.kml
│   ├── images/icon.svg
│   ├── scripts/
│   │   ├── main.js               # Concatenated app scripts
│   │   └── vendor.js             # AngularJS + third-party libraries
│   └── styles/main.css
└── .github/
    └── workflows/pages.yml       # GitHub Pages deployment
```

---

## Setup: Register in MyGeotab

### Step 1: Copy the add-in manifest

```json
{
  "name": "Import KML Zones (Enhanced)",
  "supportEmail": "farinnugraha@geotab.com",
  "version": "3.4.0",
  "isSigned": false,
  "items": [{
    "url": "https://farindn.github.io/addin-import-kml-zones-enhanced/importKmlZones.html",
    "category": "ZonesId",
    "menuName": { "en": "Import KML Zones" },
    "icon": "https://farindn.github.io/addin-import-kml-zones-enhanced/images/icon.svg"
  }]
}
```

### Step 2: Register in MyGeotab

1. Go to **Administration → System → System Settings → Add-Ins**
2. Click **New Add-In**
3. Paste the manifest above
4. Click **OK** → **Save**

The add-in appears under **Zones & Messages → Import KML Zones (Enhanced)**.

---

## Usage

### Importing zones from a KML file

1. Open **Import KML Zones (Enhanced)** from the sidebar
2. Drag and drop a `.kml` file onto the upload area (or click to browse)
3. *(Optional)* Click **Options** to configure:
   - **Types** — zone type (Customer, Home, Office, etc.)
   - **Color** — fill colour for imported zones
   - **Route Corridor Width** — buffer distance in metres applied to each side of a LineString route (default: 15 m per side = 30 m total corridor width, range: 10–50 m)
   - **Indicate stops within zone** — whether stops inside the zone are flagged
4. Review the parsed zones in the tables:
   - **Point Zones** — `<Point>` placemarks (e.g., start/end markers)
   - **Polygon & Route Corridor Zones** — `<Polygon>` shapes and `<LineString>` routes converted to corridor polygons
5. Select the zones to import and click **Import selected zones**

### Exporting a route from Google My Maps

1. Open your map at [mymaps.google.com](https://mymaps.google.com)
2. Click the three-dot menu next to your **layer** → **Download KML**
3. Select **Download as KML** (not `.kmz`)
4. Upload the downloaded file to this add-in

> Google My Maps exports driving routes as `<LineString>` geometry with one coordinate per route step. This add-in handles that geometry natively.

### Setting up a leave-route notification

After importing a corridor zone:

1. Go to **Rules & Groups → Exception Rules → Add Exception Rule**
2. Add condition: **Drives outside zone** → select your imported corridor zone
3. Add notification: email, push notification, or in-app alert
4. Assign the rule to the relevant vehicles or groups
5. **Save**

The fleet will now receive alerts whenever a vehicle deviates from the designated route corridor.

---

## Technical Details

### Corridor buffer algorithm

The buffer algorithm converts a sequence of `(lon, lat)` coordinates into a closed polygon:

| Step | Description |
|---|---|
| 1. Simplification | Ramer-Douglas-Peucker with 5 m tolerance removes redundant points (800+ point exports reduced to 50–100 waypoints) |
| 2. End cap (start) | Perpendicular offset at the first segment, ±`corridorWidth` metres |
| 3. Interior miter | At each interior vertex, bisect the two adjacent segments; scale offset by `1 / cos(θ/2)` |
| 4. Miter cap | Cap miter scale at 4× to limit spike height at sharp corners |
| 5. End cap (end) | Perpendicular offset at the last segment |
| 6. Close polygon | Left side (forward) + right side (reversed) + closing point |

**Coordinate conversion** uses the equirectangular approximation:

```
DEG_PER_METER_LAT = 1 / (π/180 × 6,371,000)   ≈ 8.9932×10⁻⁶ °/m
DEG_PER_METER_LON = DEG_PER_METER_LAT / cos(lat)
```

The result is accurate for small corridors (under 1 km) at mid-latitudes (target deployment: Southeast Asia, ~±20° latitude). For very long routes or high latitudes, accuracy decreases.

### Supported KML geometry

| Geometry tag | Behaviour |
|---|---|
| `<Point>` | Circular zone centred at the point coordinate |
| `<Polygon>` | Polygon zone using the `<outerBoundaryIs>` ring |
| `<LineString>` | Corridor polygon via buffer algorithm |

### Build

No build toolchain required. `dist/scripts/main.js` is a plain concatenation of `app/scripts/` in this order:

```
app.js → kml.js → vanillaSlider.js → utils.js → colorPicker.js → uploader.js → waiting.js
```

To rebuild after modifying `app/scripts/`:

```bash
cat app/scripts/app.js \
    app/scripts/kml.js \
    app/scripts/vanillaSlider.js \
    app/scripts/utils.js \
    app/scripts/colorPicker.js \
    app/scripts/uploader.js \
    app/scripts/waiting.js \
    > dist/scripts/main.js
```

---

## GitHub Pages Deployment

Every push to `main` triggers the GitHub Actions workflow at `.github/workflows/pages.yml`, which publishes the `dist/` folder to GitHub Pages.

**Hosted at:** `https://farindn.github.io/addin-import-kml-zones-enhanced/`

To deploy your own fork:

1. Fork this repository
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Update the `url` and `icon` fields in `dist/config.json` to your own Pages URL
4. Push to `main` — the workflow runs automatically

---

## Known Limitations

- **Equirectangular projection** — accurate for small corridors (under 1 km) at mid-latitudes. For very long routes or high latitudes, the approximation degrades and a proper geodesic library should be used instead.
- **Extreme hairpin turns** — the 4× miter cap limits spike height but does not resolve polygon self-intersections at U-turns. Visually distorted polygons may result for very sharp angles.
- **Altitude ignored** — `<LineString>` coordinates with a third (altitude) component are supported; the altitude value is silently ignored.
- **Partial KML styling** — fill colour is read from the KML `<PolyStyle>` element (ABGR format). Icon styles and stroke styles are not applied; zone colour can always be overridden via the Options panel.
- **AngularJS 1.x** — inherited from the original Geotab SDK sample. The add-in is not compatible with React or Vue frameworks without a full rewrite.
- **Single file upload per session** — uploading a second file replaces the first. Use **Clear** between uploads if needed.

---

## Credits

- Based on the original [addin-import-kml-zones](https://github.com/Geotab/sdk-addin-samples/tree/master/addin-import-kml-zones) from the Geotab SDK samples
- LineString corridor support and Zenith UI enhancements by Farin Nugraha, Solutions Engineering SEA, Geotab
- Zenith design tokens: [@geotab/zenith](https://www.npmjs.com/package/@geotab/zenith)
