# Implementation Decisions

## 2026-09-22

- Migrate the runtime to React 19 and `@geotab/zenith` 3.14 instead of continuing the custom AngularJS UI.
- Keep the project in the existing `enablement` directory.
- Preserve the public GitHub Pages URL and the `importKmlZones` technical identifier.
- Keep the add-in browser-only and bundle Zenith assets locally because the MyGeotab iframe CSP blocks external runtime resources.
- Use 15 m per side as the corridor default. Existing mockup and tooltip references to 100 m were stale and are corrected.
- Use `config.json` in `dist/` for the existing Pages deployment rather than switching to the self-hosted ZIP manifest contract.
- Release the behavior-preserving migration as version 3.5.2 after correcting the self-hosted ZIP shell, cache-busting the uploaded assets, and matching the known-working stable ZIP folder/lifecycle pattern.
