# Import KML Zones (Enhanced) PRD

## Problem

The standard KML zone importer accepts Point and Polygon geometry but rejects Google My Maps route exports, which use LineString geometry. Fleet operators need to turn those routes into corridor zones so MyGeotab exception rules can detect route deviations.

## Users

- Fleet administrators with MyGeotab Zone management access.
- Geotab partners configuring fixed-route workflows.

## Invariants

1. KML parsing and corridor conversion remain client-side. No KML file is uploaded to an external service.
2. Existing Point and Polygon behavior remains available while LineString adds corridor support.
3. Every imported zone uses the current MyGeotab group filter and selected zone options.
4. A failed API response is associated with its source row and remains recoverable as a KML export.
5. A batch never contains more than 50 `Add Zone` calls.

## API Contract

- `Get(ZoneType)` loads system and custom zone types.
- `Add(Zone)` creates a zone through `api.multiCall`.
- `state.getGroupFilter()` provides the current group filter.
- `Zone` fields used by this add-in are `activeFrom`, `activeTo`, `comment`, `displayed`, `externalReference`, `fillColor`, `groups`, `mustIdentifyStops`, `name`, `points`, `zoneSize`, `zoneShape`, and `zoneTypes`.

## Functional Flow

1. User drops or selects one or more KML files.
2. The add-in parses supported placemarks and displays Point and Polygon/Route Corridor sections.
3. The user opens Options to select zone types, fill color, transparency, corridor width, and stop indication.
4. The user selects valid rows and starts the import.
5. The add-in imports in batches, reports row-level results, and allows failed rows to be saved as KML.

## Acceptance Criteria

- `Route A.kml` produces one LineString corridor and two Point zones.
- Polygon input remains supported.
- Invalid geometry, empty names, and invalid coordinates are visible before import.
- Corridor width defaults to 15 m per side and accepts 10-50 m in 5 m increments.
- Options reapply to parsed rows without requiring a second upload.
- The production bundle renders the Zenith page at desktop and mobile widths.
- `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run smoke` pass.
