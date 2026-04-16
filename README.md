# addin-enhanced-import-kml-zones

Enhanced version of the Geotab KML Zone importer with **LineString (route) support** and **Zenith UI design system**.

## Enhancements (v2.0.0)

### 1. LineString/Route Support
- **Accepts Google My Maps routes** exported as KML `<LineString>` geometry (previously rejected with "must contain point or polygon data")
- Converts route paths into **buffered corridor polygon zones** using a geometric buffer algorithm
- Configurable **corridor width** (default 100m per side = 200m total corridor)
- Miter joins with 4× cap at sharp corners (prevents spikes)
- Uses equirectangular projection for accurate distance-to-degrees conversion

### 2. Zenith UI Enhancements
- Modern Geotab design tokens: `zen-button`, `zen-input`, `zen-banner`, `zen-upload-area` classes
- Improved file upload area with descriptive subtitle and visual feedback
- Corridor width control in the Options modal
- Enhanced error and status messaging

### 3. Use Case: MODA Fleet Notification
Supports the partner workflow:
1. Export a driving route from Google My Maps as KML
2. Import the route as a corridor zone in MyGeotab
3. Create an Exception Rule: "Vehicle leaves zone" → receive notification
4. Zone covers the actual route path, not just start/end points

## Installation

### Step 1: Find Your Project ID
1. Go to `https://git.geotab.com/farinnugraha/addin-enhanced-import-kml/-/settings/general`
2. Look for **Project ID** near the top (e.g., `12345`)
3. Copy this ID

### Step 2: Wait for GitLab Pages to Deploy
1. Go to `https://git.geotab.com/farinnugraha/addin-enhanced-import-kml/-/pipelines`
2. Wait for the `pages` job to complete (shows green checkmark)
3. Once done, your add-in will be live at: `https://addin-enhanced-import-kml-65f7f6.geotabpages.com/importKmlZones.html`
   (Replace `PROJECT_ID` with your actual project ID from Step 1)

### Step 3: Register in MyGeotab
Go to `my.geotab.com/farindn` → **Administration → System → System Settings → Add-Ins** → **New Add-In**

Paste this configuration (replace `PROJECT_ID` with your actual project ID):

```json
{
  "name": "Import KML Zones (Enhanced)",
  "supportEmail": "farinnugraha@geotab.com",
  "version": "2.0.0",
  "items": [{
    "url": "https://addin-enhanced-import-kml-65f7f6.geotabpages.com/importKmlZones.html",
    "path": "ZoneAndMessagesLink/",
    "menuName": {
      "en": "Import KML Zones (Enhanced)"
    },
    "icon": "https://addin-enhanced-import-kml-65f7f6.geotabpages.com/images/icon.svg"
  }]
}
```

## How It Works (GitLab Pages Deployment)

The `.gitlab-ci.yml` file automatically:
1. Runs on every push to the `main` branch
2. Copies `dist/` files to the `public/` folder
3. Publishes to GitLab Pages at `https://addin-enhanced-import-kml-65f7f6.geotabpages.com/`
4. Your add-in is now accessible globally via HTTPS

This approach mirrors Felix's vehicle-availability-addin on git.geotab.com, which uses the same GitLab Pages pattern.

## Known Issues & Limitations

- **First deployment:** GitLab Pages may take 1-2 minutes to deploy after the first push
- **Private repo:** The repo can remain private; GitLab Pages serves files publicly even from private repos
- **CI/CD runner:** Requires `prod-docker-docker-autoscaler-runner` (Geotab production runners) to be enabled in project CI/CD settings

## Technical Details

### Buffer Algorithm
- Converts 2D linestring coordinates to corridor polygon using perpendicular offsets
- Handles interior vertices with miter joins (bisector of segment angles)
- End caps use simple perpendicular offset
- Miter length capped at 4× to prevent spikes at sharp turns
- Coordinate projection: equirectangular (valid for ~200km routes without significant error)

### Files Modified
- `app/scripts/kml.js` — LineString detection, buffer algorithm, zone parsing
- `app/scripts/app.js` — Corridor width option scope binding
- `app/importKmlZones.html` — Zenith CSS, corridor width input, upload area enhancements
- `app/styles/style.css` — Zenith-aligned styling
- `dist/` — Production build with bundled scripts and styles

## Test with MODA KML
```
File: "Directions from Griya Aqaba B13 ... to MODA.kml"
Contents: 1 LineString (803 coordinates), 2 Points (start/end)
Expected: 3 zones imported (2 Points, 1 Corridor)
```

---

**Contributors:** Farin Nugraha (FNUGR01), Solutions Engineering SEA  
**Original Source:** [Geotab SDK Samples](https://github.com/Geotab/sdk-addin-samples/tree/master/addin-import-kml-zones)  
**Deployment Pattern:** GitLab Pages (same as vehicle-availability-addin by Felix Meybugia)
