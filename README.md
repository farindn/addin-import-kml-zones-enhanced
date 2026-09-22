# Import KML Zones (Enhanced)

MyGeotab add-in for importing Point, Polygon, and Google My Maps LineString KML geometry as zones. LineString routes are converted into buffered corridor polygons in the browser before the resulting `Zone` entities are created in MyGeotab.

## Capabilities

- Imports Point, Polygon, and LineString placemarks.
- Converts LineString routes into closed corridor polygons.
- Supports KML-defined colors, zone type selection, transparency, corridor width, and stop indication.
- Reviews valid and invalid zones before import.
- Imports selected zones through MyGeotab `multiCall` batches of 50.
- Reports per-zone import success or failure and exports failed placemarks back to KML.
- Runs entirely in the browser. KML contents are not sent to an external service.

## Stack

- React 19
- `@geotab/zenith` 3.14
- webpack 5
- Self-contained production bundle for GitHub Pages

The add-in uses Zenith components for page chrome, feedback, buttons, options dialogs, progress, checkboxes, and tables. Native file, color, number, and range inputs remain only where Zenith does not provide a matching control.

## Quick Start

```bash
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run smoke
npm.cmd run package:upload
```

Build output is written to `dist/`:

```text
dist/
  config.json
  importKmlZones.html
  images/
  bundle.js
  styles.css
  assets/                 # Zenith fonts
```

The add-in technical identifier remains `importKmlZones`. Do not rename it in the manifest, HTML mount point, or lifecycle registration.

## MyGeotab Upload ZIP

Run:

```bash
npm.cmd run package:upload
```

This creates `import-kml-zones-enhanced-3.5.2.zip` in the repository root. Its upload layout is:

```text
configuration.json
importKmlZones/
  importKmlZones.html
  bundle-3.5.2.js
  styles-3.5.2.css
  images/icon.png
  assets/
```

Upload that ZIP from **Administration > System > System Settings > Add-Ins > New Add-In**.

## Development Structure

```text
src/
  config.json
  app/
    importKmlZones.html
    index.js
    scripts/
      main.js                    # MyGeotab initialize/focus/blur lifecycle
      components/                # React and Zenith UI
      contexts/Geotab.js         # API/state context
      domain/kmlParser.js        # Pure KML and corridor geometry logic
      hooks/useKmlImport.js      # Upload, options, selection, and import state
      services/importApi.js      # ZoneType lookup and batched Zone creation
      utils/logger.js
    styles/main.css
test/                            # Domain and API contract tests
tools/                           # Production-bundle browser smoke test
```

The old AngularJS source has been retired from the build. The original behavior is represented by the domain tests and the browser smoke fixture instead of a second runtime.

## MyGeotab API Contract

The UI relies on these platform contracts:

- `Get` with `{ typeName: "ZoneType" }` loads available zone types.
- `Add` with `{ typeName: "Zone", entity }` creates each imported zone.
- `api.multiCall` sends at most 50 `Add` calls per batch.
- `state.getGroupFilter()` supplies the current MyGeotab group filter for imported zones.
- Zone entities contain `activeFrom`, `activeTo`, `comment`, `displayed`, `externalReference`, `fillColor`, `groups`, `mustIdentifyStops`, `name`, `points`, `zoneSize`, `zoneShape`, and `zoneTypes`.

The exact entity shape is documented in [`docs/PRD.md`](docs/PRD.md).

## Deployment

The GitHub Pages workflow publishes `dist/` from the `main` branch. The existing public contract remains:

```text
https://farindn.github.io/addin-import-kml-zones-enhanced/importKmlZones.html
```

The version is `3.5.2`. Keep `src/config.json`, generated `dist/config.json`, and this documentation synchronized when releasing.

## Limitations

- Equirectangular corridor calculations are intended for small corridors at mid-latitudes.
- Very sharp hairpin turns can create self-intersections even with the 4x miter cap.
- KML altitude values are accepted but ignored.
- KML icon and line styles are not applied to zones; PolyStyle fill colors are supported.
- Imported zones are static polygons. Frequent route versioning, navigation, stop sequencing, and dispatch workflows may require a dedicated TMS.

## Related Documents

- [`docs/PRD.md`](docs/PRD.md): product goal, API objects, invariants, and acceptance criteria.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): implementation and delivery decisions.
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md): end-user installation and usage guide.
- [`CHANGELOG.md`](CHANGELOG.md): release history.
