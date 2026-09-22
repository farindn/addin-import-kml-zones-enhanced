#!/usr/bin/env python3
"""Build the MyGeotab-uploadable ZIP archive.

The archive layout follows the known-working SampleAddins pattern:

    configuration.json
    importKmlZones-3.5.2/
        importKmlZones.html
        bundle-3.5.2.js
        styles-3.5.2.css
        images/icon.png
        assets/*
"""

import base64
import json
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).parent
DIST = ROOT / "dist"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
OUTPUT = ROOT / f"import-kml-zones-enhanced-{VERSION}.zip"
ADDIN_FOLDER = "importKmlZones"


def patch_html(html: str) -> str:
    """Keep the ZIP HTML paths flat like the known-working add-in layout."""
    html = re.sub(r'href="styles/main\.css"', 'href="styles.css"', html)
    html = re.sub(r'src="scripts/main\.js"', 'src="bundle.js"', html)
    return html


def main() -> None:
    config = json.loads((DIST / "config.json").read_text(encoding="utf-8"))
    icon_path = DIST / "images" / "icon.png"
    icon_data_uri = (
        "data:image/png;base64,"
        + base64.b64encode(icon_path.read_bytes()).decode("ascii")
    )

    config["items"] = [
        {
            **item,
            "version": config["version"],
            "url": f"/{ADDIN_FOLDER}/importKmlZones.html",
            "icon": icon_data_uri,
        }
        for item in config["items"]
    ]

    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("configuration.json", json.dumps(config, indent=2))
        archive.writestr(
            f"{ADDIN_FOLDER}/importKmlZones.html",
            patch_html((DIST / "importKmlZones.html").read_text(encoding="utf-8")),
        )
        bundle = next(DIST.glob("bundle-*.js"))
        styles = next(DIST.glob("styles-*.css"))
        archive.write(bundle, f"{ADDIN_FOLDER}/{bundle.name}")
        archive.write(styles, f"{ADDIN_FOLDER}/{styles.name}")
        archive.write(icon_path, f"{ADDIN_FOLDER}/images/icon.png")

        for asset in sorted((DIST / "assets").rglob("*")):
            if asset.is_file():
                archive.write(asset, f"{ADDIN_FOLDER}/assets/{asset.relative_to(DIST / 'assets')}")

    bundle_name = next(DIST.glob("bundle-*.js")).name
    styles_name = next(DIST.glob("styles-*.css")).name
    required = {
        "configuration.json",
        f"{ADDIN_FOLDER}/importKmlZones.html",
        f"{ADDIN_FOLDER}/{bundle_name}",
        f"{ADDIN_FOLDER}/{styles_name}",
        f"{ADDIN_FOLDER}/images/icon.png",
    }
    with zipfile.ZipFile(OUTPUT) as archive:
        names = set(archive.namelist())
        missing = required - names
        if missing:
            raise RuntimeError(f"ZIP is missing required entries: {sorted(missing)}")
        if any(name.endswith("/config.json") for name in names):
            raise RuntimeError("ZIP must not contain a nested config.json")
        html = archive.read(f"{ADDIN_FOLDER}/importKmlZones.html").decode("utf-8")
        if bundle_name not in html or styles_name not in html:
            raise RuntimeError("ZIP HTML does not reference its bundled JS/CSS files")

    print(f"Created: {OUTPUT}")
    print(f"Size: {OUTPUT.stat().st_size / 1024:.1f} KB")
    print("ZIP contents:")
    with zipfile.ZipFile(OUTPUT) as archive:
        for name in archive.namelist():
            print(f"  {name}")


if __name__ == "__main__":
    main()
