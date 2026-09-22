# Import KML Zones (Enhanced) User Guide

## Before You Start

- You need MyGeotab Zone management access.
- Prepare a `.kml` file from Google My Maps, Google Earth, or another KML-capable mapping tool.
- Google My Maps route exports should be downloaded as KML, not KMZ.

## Import Zones

1. Open **Import KML Zones** from the MyGeotab menu.
2. Drop one or more KML files into the upload area, or select them with **click to select**.
3. Open **Options** before importing if you need to change zone types, color, transparency, corridor width, or stop indication.
4. Review the **Polygon & Route Corridor Zones** and **Point Zones** sections.
5. Clear selections or select all as needed.
6. Click **Import selected zones**.
7. Wait for the progress bar and review the success or error state on each row.

## Route Corridor Width

LineString routes are converted into corridor polygons. The width is applied on each side of the route.

- Default: 15 m per side, 30 m total.
- Allowed range: 10-50 m per side.
- Point and Polygon geometry do not use this setting.

## Failed Imports

If a zone fails to import, correct the issue in MyGeotab or the source KML and use **Save not imported zones to KML** to download the failed placemarks.

## Route Deviation Workflow

1. Import the route as a corridor zone.
2. Open **Rules & Groups > Exception Rules**.
3. Add an **Exiting area** or equivalent zone-exit condition for the corridor zone.
4. Add the required email, push, or in-app notification.
5. Assign the rule to the relevant vehicles or groups.

## Support Scope

This is a sample add-in provided on an As-Is basis. It does not replace a full transportation management system for navigation, dynamic rerouting, stop sequencing, or regulatory workflows.
