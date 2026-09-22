const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DOMParser } = require('@xmldom/xmldom');

require('@babel/register')({
  extensions: ['.js', '.jsx'],
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react']
});

const {
  DEFAULT_OPTIONS,
  addSystemZoneTypes,
  applyOptionsToZone,
  lineStringToCorridorPolygon,
  parseKmlText,
  simplifyCoordinates
} = require('../src/app/scripts/domain/kmlParser');

const parse = (text, options = {}) => parseKmlText(text, {
  parser: new DOMParser(),
  options: { ...DEFAULT_OPTIONS, ...options },
  fileName: 'fixture.kml',
  groups: []
});

test('parses the supplied Google My Maps route fixture into one corridor and two points', () => {
  const fixture = fs.readFileSync(path.join(__dirname, '..', 'Route A.kml'), 'utf8');
  const zones = parse(fixture);

  assert.equal(zones.length, 3);
  assert.equal(zones[0].geometryType, 'LineString');
  assert.equal(zones[1].geometryType, 'Point');
  assert.equal(zones[2].geometryType, 'Point');
  assert.ok(zones[0].points.length > 4);
  assert.deepEqual(zones[0].points[0], zones[0].points[zones[0].points.length - 1]);
});

test('converts a polygon and preserves its coordinates', () => {
  const zones = parse(`
    <kml><Document><Placemark>
      <name>Yard</name>
      <description>Primary yard</description>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        100,1,0 101,1,0 101,2,0 100,2,0 100,1,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>
  `);

  assert.equal(zones[0].geometryType, 'Polygon');
  assert.equal(zones[0].comment, 'Primary yard');
  assert.deepEqual(zones[0].points[0], { x: 100, y: 1 });
  assert.equal(zones[0].points.length, 5);
});

test('rejects an open polygon ring before it reaches the Zone API', () => {
  const zones = parse(`
    <kml><Document><Placemark><name>Open yard</name><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        100,1,0 101,1,0 101,2,0 100,2,0
      </coordinates></LinearRing></outerBoundaryIs>
    </Polygon></Placemark></Document></kml>
  `);

  assert.match(zones[0].error, /enough distinct coordinates/);
  assert.equal(zones[0].selected, false);
});

test('rejects an open inner polygon ring', () => {
  const zones = parse(`
    <kml><Document><Placemark><name>Open hole</name><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        100,1,0 101,1,0 101,2,0 100,2,0 100,1,0
      </coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>
        100.2,1.2,0 100.8,1.2,0 100.8,1.8,0 100.2,1.8,0
      </coordinates></LinearRing></innerBoundaryIs>
    </Polygon></Placemark></Document></kml>
  `);

  assert.match(zones[0].error, /enough distinct coordinates/);
  assert.equal(zones[0].selected, false);
});

test('rejects KML without supported geometry', () => {
  assert.throws(
    () => parse('<kml><Document><Placemark><name>Unsupported</name><Model /></Placemark></Document></kml>'),
    /point, polygon, or route/
  );
});

test('marks unnamed geometry as invalid without hiding other valid placemarks', () => {
  const zones = parse(`
    <kml><Document>
      <Placemark><Point><coordinates>100,1,0</coordinates></Point></Placemark>
      <Placemark><name>Valid</name><Point><coordinates>101,2,0</coordinates></Point></Placemark>
    </Document></kml>
  `);

  assert.match(zones[0].error, /name/);
  assert.equal(zones[0].selected, false);
  assert.equal(zones[1].selected, true);
});

test('marks malformed coordinate tokens as invalid', () => {
  const zones = parse(`
    <kml><Document><Placemark><name>Broken polygon</name><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        100,1,0 101,1,0 not-a-coordinate 100,1,0
      </coordinates></LinearRing></outerBoundaryIs>
    </Polygon></Placemark></Document></kml>
  `);

  assert.match(zones[0].error, /invalid values/);
  assert.equal(zones[0].selected, false);
});

test('marks a LineString with no distinct points as invalid', () => {
  const zones = parse(`
    <kml><Document><Placemark><name>Stationary route</name><LineString>
      <coordinates>100,1,0 100,1,0 100,1,0</coordinates>
    </LineString></Placemark></Document></kml>
  `);

  assert.match(zones[0].error, /enough distinct coordinates/);
  assert.equal(zones[0].selected, false);
});

test('corridor width changes the generated polygon while keeping it closed', () => {
  const route = [{ lon: 100, lat: 1 }, { lon: 100.01, lat: 1 }];
  const narrow = lineStringToCorridorPolygon(route, 10);
  const wide = lineStringToCorridorPolygon(route, 20);

  assert.deepEqual(narrow[0], narrow[narrow.length - 1]);
  assert.deepEqual(wide[0], wide[wide.length - 1]);
  assert.ok(Math.abs(wide[0].y - wide[1].y) > Math.abs(narrow[0].y - narrow[1].y));
});

test('simplification keeps endpoints and removes a point within tolerance', () => {
  const simplified = simplifyCoordinates([
    { lon: 100, lat: 1 },
    { lon: 100.000001, lat: 1.000001 },
    { lon: 100.01, lat: 1 }
  ], 5);

  assert.equal(simplified.length, 2);
  assert.deepEqual(simplified[0], { lon: 100, lat: 1 });
  assert.deepEqual(simplified[1], { lon: 100.01, lat: 1 });
});

test('adds built-in zone types without duplicating API results', () => {
  const types = addSystemZoneTypes([
    { id: 'ZoneTypeCustomerId', name: 'Customer' },
    { id: 'custom', name: 'Route' }
  ]);

  assert.equal(types.filter((type) => type.id === 'ZoneTypeCustomerId').length, 1);
  assert.equal(types.filter((type) => type.id === 'ZoneTypeOfficeId').length, 1);
  assert.equal(types.find((type) => type.id === 'custom').name, 'Route');
});

test('reapplies corridor options without changing a KML-defined color', () => {
  const zones = parse(`
    <kml><Document><Style id="route"><PolyStyle><color>ff0000ff</color></PolyStyle></Style>
      <Placemark><name>Route</name><styleUrl>#route</styleUrl><LineString>
        <coordinates>100,1,0 100.01,1,0</coordinates>
      </LineString></Placemark>
    </Document></kml>
  `);
  const updated = applyOptionsToZone(zones[0], {
    ...DEFAULT_OPTIONS,
    corridorWidth: 30,
    zoneTypes: ['ZoneTypeOfficeId']
  });

  assert.equal(updated.fillColor.r, 255);
  assert.equal(updated.fillColor.g, 0);
  assert.equal(updated.zoneTypes[0], 'ZoneTypeOfficeId');
  assert.ok(updated.points.length > 4);
});
