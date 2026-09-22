# Changelog

## 3.5.2 - 2026-09-22

- Versioned the uploaded JavaScript and CSS filenames to prevent stale MyGeotab browser-cache loads.

## 3.5.1 - 2026-09-22

- Corrected the self-hosted ZIP HTML shell to match the known-working MyGeotab add-in layout.
- Added the manifest item version and Zone menu path to the upload configuration.

## 3.5.0 - 2026-09-22

- Migrated the add-in UI from AngularJS/custom DOM controls to React 19 and Zenith 3.14.
- Preserved Point, Polygon, and LineString corridor parsing.
- Added accessible Zenith options dialog and mobile sheet behavior.
- Added production-bundle smoke coverage for upload, options, tables, and batched imports.
- Added domain and MyGeotab API contract tests.
- Corrected corridor-width copy to the implemented 15 m per-side default.
