const DEG_PER_METER_LAT = 1 / (Math.PI / 180 * 6371000);
const MIN_DATE = new Date(Date.UTC(1986, 0, 1));
const MAX_DATE = new Date(2050, 0, 1);

export const DEFAULT_OPTIONS = Object.freeze({
  zoneTypes: ['ZoneTypeCustomerId'],
  zoneSize: 200,
  zoneColor: { r: 0, g: 128, b: 0, a: 64 },
  zoneShape: false,
  stoppedInsideZones: true,
  corridorWidth: 15
});

export const SYSTEM_ZONE_TYPES = [
  { id: 'ZoneTypeCustomerId', name: 'Customer', isSystem: true },
  { id: 'ZoneTypeOfficeId', name: 'Office', isSystem: true },
  { id: 'ZoneTypeHomeId', name: 'Home', isSystem: true },
  { id: 'ZoneTypeAddressLookupId', name: 'Address Lookup', isSystem: true }
];

export class KmlParseError extends Error {
  constructor(message, fileName) {
    super(message);
    this.name = 'KmlParseError';
    this.fileName = fileName;
  }
}

const descendants = (element, name) => {
  if (!element) return [];
  const byTag = Array.from(element.getElementsByTagName(name));
  if (byTag.length) return byTag;
  return Array.from(element.getElementsByTagName('*')).filter(
    (candidate) => candidate.localName === name
  );
};

const firstDescendant = (element, name) => descendants(element, name)[0] || null;

const elementText = (element, name) => {
  const child = firstDescendant(element, name);
  return child ? child.textContent.trim() : '';
};

const decodeEntities = (value) => {
  if (!value) return '';
  return value
    .replace(/&amp;nbsp;/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
};

const cloneColor = (color) => ({
  r: Number(color.r) || 0,
  g: Number(color.g) || 0,
  b: Number(color.b) || 0,
  a: Number.isFinite(Number(color.a)) ? Number(color.a) : 255
});

const parseCoordinate = (value) => {
  const parts = value.trim().split(',');
  if (parts.length < 2 || parts.length > 3) return null;
  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  const altitudeIsValid = parts.length < 3 || parts[2] === '' || Number.isFinite(Number(parts[2]));
  if (!altitudeIsValid) return null;
  return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
};

const parseCoordinateList = (value) => {
  const tokens = value.trim() ? value.trim().split(/\s+/) : [];
  const coordinates = [];
  let invalidCount = 0;

  tokens.forEach((token) => {
    const coordinate = parseCoordinate(token);
    if (coordinate) coordinates.push(coordinate);
    else invalidCount += 1;
  });

  return { coordinates, invalidCount };
};

const metersToDegrees = (distance) => (360 * distance) / 40075000;

const squareZone = (lat, lon, size) => {
  const halfSide = (size / 2) || 0.0009;
  const method = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  return method.map(([x, y]) => ({
    x: lon + x * halfSide,
    y: lat + y * halfSide / 1.5
  }));
};

const circleZone = (lat, lon, diameter) => {
  const size = diameter / 2;
  const degrees = 0.00008 / diameter;
  const triangleHeight = size - degrees * diameter;
  const polygonSide = Math.sqrt(size * size - triangleHeight * triangleHeight) * 2;
  const sides = Math.ceil(Math.PI / Math.asin(polygonSide / (2 * size)));
  const pointCount = sides < 20 ? 20 : sides + 1;
  const angle = 2 * Math.PI / (pointCount - 1);
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    const currentAngle = index * angle;
    const y = lat + size * Math.cos(currentAngle);
    const x = lon + (size * Math.sin(currentAngle)) / Math.abs(Math.cos(y * Math.PI / 180));
    points.push({ x, y });
  }

  return points;
};

const pointZone = (lat, lon, diameter, isCircle) => {
  const degrees = diameter ? metersToDegrees(diameter) : 0.0018;
  return isCircle ? circleZone(lat, lon, degrees) : squareZone(lat, lon, degrees);
};

const perpendicularDistanceMeters = (point, lineStart, lineEnd) => {
  const lonScale = Math.cos(point.lat * Math.PI / 180);
  const ax = (lineEnd.lon - lineStart.lon) * lonScale;
  const ay = lineEnd.lat - lineStart.lat;
  const bx = (point.lon - lineStart.lon) * lonScale;
  const by = point.lat - lineStart.lat;
  const segmentLengthSquared = ax * ax + ay * ay;

  if (segmentLengthSquared === 0) {
    return Math.sqrt(bx * bx + by * by) / DEG_PER_METER_LAT;
  }

  const t = Math.max(0, Math.min(1, (bx * ax + by * ay) / segmentLengthSquared));
  const rx = bx - t * ax;
  const ry = by - t * ay;
  return Math.sqrt(rx * rx + ry * ry) / DEG_PER_METER_LAT;
};

export const simplifyCoordinates = (coords, epsilonMeters = 5) => {
  if (coords.length <= 2) return coords.slice();

  const first = coords[0];
  const last = coords[coords.length - 1];
  let maxDistance = 0;
  let maxIndex = 0;

  for (let index = 1; index < coords.length - 1; index += 1) {
    const distance = perpendicularDistanceMeters(coords[index], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance > epsilonMeters) {
    const left = simplifyCoordinates(coords.slice(0, maxIndex + 1), epsilonMeters);
    const right = simplifyCoordinates(coords.slice(maxIndex), epsilonMeters);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
};

const endCapOffset = (from, to, bufferMeters) => {
  const lonScale = Math.cos(from.lat * Math.PI / 180);
  const dx = (to.lon - from.lon) * lonScale;
  const dy = to.lat - from.lat;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { dlon: 0, dlat: 0 };

  const px = -dy / length;
  const py = dx / length;
  return {
    dlon: px * bufferMeters * DEG_PER_METER_LAT / lonScale,
    dlat: py * bufferMeters * DEG_PER_METER_LAT
  };
};

const miterOffset = (p0, p1, p2, bufferMeters) => {
  const lonScale = Math.cos(p1.lat * Math.PI / 180);
  const d1x = (p1.lon - p0.lon) * lonScale;
  const d1y = p1.lat - p0.lat;
  const d2x = (p2.lon - p1.lon) * lonScale;
  const d2y = p2.lat - p1.lat;
  const length1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const length2 = Math.sqrt(d2x * d2x + d2y * d2y);

  if (length1 === 0 || length2 === 0) {
    return endCapOffset(length1 > 0 ? p0 : p1, length1 > 0 ? p1 : p2, bufferMeters);
  }

  const u1x = d1x / length1;
  const u1y = d1y / length1;
  const u2x = d2x / length2;
  const u2y = d2y / length2;
  const lp1x = -u1y;
  const lp1y = u1x;
  const lp2x = -u2y;
  const lp2y = u2x;
  let mx = lp1x + lp2x;
  let my = lp1y + lp2y;
  const miterMagnitude = Math.sqrt(mx * mx + my * my);

  if (miterMagnitude < 1e-10) {
    mx = lp1x;
    my = lp1y;
  } else {
    mx /= miterMagnitude;
    my /= miterMagnitude;
  }

  const dot = mx * lp1x + my * lp1y;
  const miterLength = Math.abs(dot) < 0.25 ? 4 : Math.min(4, 1 / dot);
  return {
    dlon: mx * bufferMeters * DEG_PER_METER_LAT / lonScale * miterLength,
    dlat: my * bufferMeters * DEG_PER_METER_LAT * miterLength
  };
};

export const lineStringToCorridorPolygon = (coordinates, bufferMeters = 15) => {
  if (coordinates.length < 2) return [];
  const hasDistinctPoints = coordinates.some((coordinate, index) => index > 0 && (
    coordinate.lon !== coordinates[index - 1].lon || coordinate.lat !== coordinates[index - 1].lat
  ));
  if (!hasDistinctPoints) return [];

  const simplified = simplifyCoordinates(coordinates, 5);
  if (simplified.length < 2) return [];

  const leftSide = [];
  const rightSide = [];
  let offset = endCapOffset(simplified[0], simplified[1], bufferMeters);

  leftSide.push({ x: simplified[0].lon + offset.dlon, y: simplified[0].lat + offset.dlat });
  rightSide.push({ x: simplified[0].lon - offset.dlon, y: simplified[0].lat - offset.dlat });

  for (let index = 1; index < simplified.length - 1; index += 1) {
    offset = miterOffset(simplified[index - 1], simplified[index], simplified[index + 1], bufferMeters);
    leftSide.push({ x: simplified[index].lon + offset.dlon, y: simplified[index].lat + offset.dlat });
    rightSide.push({ x: simplified[index].lon - offset.dlon, y: simplified[index].lat - offset.dlat });
  }

  const last = simplified.length - 1;
  offset = endCapOffset(simplified[last], simplified[last - 1], bufferMeters);
  leftSide.push({ x: simplified[last].lon + offset.dlon, y: simplified[last].lat + offset.dlat });
  rightSide.push({ x: simplified[last].lon - offset.dlon, y: simplified[last].lat - offset.dlat });

  const polygon = leftSide.concat(rightSide.reverse());
  polygon.push(polygon[0]);
  return polygon;
};

const haversineKm = (sourceLat, sourceLon, targetLat, targetLon) => {
  const toRadians = (value) => value * (Math.PI / 180);
  const dLat = toRadians(targetLat - sourceLat);
  const dLon = toRadians(targetLon - sourceLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(sourceLat)) * Math.cos(toRadians(targetLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const polygonPoints = (polygon) => {
  const outerBoundary = firstDescendant(polygon, 'outerBoundaryIs');
  const innerBoundary = firstDescendant(polygon, 'innerBoundaryIs');
  const outerResult = outerBoundary
    ? parseCoordinateList(elementText(outerBoundary, 'coordinates'))
    : { coordinates: [], invalidCount: 0 };
  const outerCoordinates = outerResult.coordinates;
  const isClosed = (coordinates) => {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return Boolean(first && last)
      && first.lon === last.lon
      && first.lat === last.lat;
  };

  if (!innerBoundary) {
    return {
      points: outerCoordinates.map(({ lon, lat }) => ({ x: lon, y: lat })),
      invalidCount: outerResult.invalidCount,
      invalidGeometry: !isClosed(outerCoordinates)
    };
  }

  const innerResult = parseCoordinateList(elementText(innerBoundary, 'coordinates'));
  const innerCoordinates = innerResult.coordinates;
  if (!outerCoordinates.length || !innerCoordinates.length) {
    return {
      points: [],
      invalidCount: outerResult.invalidCount + innerResult.invalidCount,
      invalidGeometry: true
    };
  }

  let outerIndex = 0;
  let innerIndex = 0;
  let minimum = Number.POSITIVE_INFINITY;

  outerCoordinates.forEach((outer, currentOuterIndex) => {
    innerCoordinates.forEach((inner, currentInnerIndex) => {
      const distance = haversineKm(outer.lat, outer.lon, inner.lat, inner.lon);
      if (distance < minimum) {
        minimum = distance;
        outerIndex = currentOuterIndex;
        innerIndex = currentInnerIndex;
      }
    });
  });

  const points = [];
  const push = (items, start, end) => {
    for (let index = start; index < end; index += 1) {
      points.push({ x: items[index].lon, y: items[index].lat });
    }
  };

  push(outerCoordinates, 0, outerIndex + 1);
  push(innerCoordinates, innerIndex, innerCoordinates.length);
  push(innerCoordinates, 1, innerIndex + 1);
  push(outerCoordinates, outerIndex, outerCoordinates.length);
  return {
    points,
    invalidCount: outerResult.invalidCount + innerResult.invalidCount,
    invalidGeometry: !isClosed(outerCoordinates) || !isClosed(innerCoordinates)
  };
};

const geometryForPlacemark = (placemark, options) => {
  const point = firstDescendant(placemark, 'Point');
  const polygon = firstDescendant(placemark, 'Polygon');
  const lineString = firstDescendant(placemark, 'LineString');

  if (point) {
    const coordinate = parseCoordinate(elementText(point, 'coordinates'));
    return coordinate ? {
      type: 'Point',
      source: coordinate,
      points: pointZone(coordinate.lat, coordinate.lon, options.zoneSize, options.zoneShape),
      invalidCount: 0,
      invalidGeometry: false
    } : { type: 'Point', source: null, points: [], invalidCount: 1, invalidGeometry: true };
  }

  if (polygon) {
    const parsedPolygon = polygonPoints(polygon);
    const uniquePoints = new Set(parsedPolygon.points.map((point) => `${point.x},${point.y}`));
    const firstPoint = parsedPolygon.points[0];
    const lastPoint = parsedPolygon.points[parsedPolygon.points.length - 1];
    const isClosed = Boolean(firstPoint && lastPoint)
      && firstPoint.x === lastPoint.x
      && firstPoint.y === lastPoint.y;
    return {
      type: 'Polygon',
      source: parsedPolygon.points,
      points: parsedPolygon.points,
      invalidCount: parsedPolygon.invalidCount,
      invalidGeometry: parsedPolygon.invalidGeometry
        || parsedPolygon.points.length < 4
        || uniquePoints.size < 3
        || !isClosed
    };
  }

  if (lineString) {
    const parsedLine = parseCoordinateList(elementText(lineString, 'coordinates'));
    const source = parsedLine.coordinates;
    const hasDistinctPoints = source.some((coordinate, index) => index > 0 && (
      coordinate.lon !== source[index - 1].lon || coordinate.lat !== source[index - 1].lat
    ));
    return {
      type: 'LineString',
      source,
      points: lineStringToCorridorPolygon(source, options.corridorWidth),
      invalidCount: parsedLine.invalidCount,
      invalidGeometry: source.length < 2 || !hasDistinctPoints
    };
  }

  return null;
};

const colorFromStyle = (placemark, styles) => {
  const inlineStyle = firstDescendant(placemark, 'Style');
  const styleUrl = elementText(placemark, 'styleUrl').replace('#', '');
  const style = inlineStyle || (styleUrl ? styles[styleUrl] : null);
  const polyStyle = style ? firstDescendant(style, 'PolyStyle') : null;
  const rawColor = polyStyle ? elementText(polyStyle, 'color').replace('#', '') : '';

  if (rawColor.length < 6) return null;
  const padded = rawColor.length === 6 ? `ff${rawColor}` : rawColor;
  const rgb = [padded.slice(-2), padded.slice(4, 6), padded.slice(2, 4)].map((value) => parseInt(value, 16));
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: parseInt(padded.slice(0, 2), 16) };
};

const serializeElement = (element) => {
  if (typeof XMLSerializer === 'undefined') return '';
  return new XMLSerializer().serializeToString(element);
};

const zoneFromPlacemark = (placemark, index, styles, options, groups, fileName) => {
  const geometry = geometryForPlacemark(placemark, options);
  const name = decodeEntities(elementText(placemark, 'name'));
  const comment = decodeEntities(elementText(placemark, 'description'));
  const customColor = colorFromStyle(placemark, styles);
  const fillColor = customColor || cloneColor(options.zoneColor);
  const invalidMessages = [];

  if (!name) invalidMessages.push('Zone name can not be empty.');
  if (!geometry) invalidMessages.push('Zone must contain point, polygon, or route (LineString) data.');
  if (geometry && geometry.invalidCount > 0) invalidMessages.push('Zone coordinates contain invalid values.');
  if (geometry && geometry.invalidGeometry) invalidMessages.push('Zone geometry does not contain enough distinct coordinates.');
  if (geometry && geometry.points.length === 0) invalidMessages.push('Zone coordinates can not be empty.');

  if (geometry) {
    geometry.points.forEach((point) => {
      if (point.y < -90 || point.y > 90) invalidMessages.push(`Latitude coordinate value = ${point.y} is incorrect.`);
      if (point.x < -180 || point.x > 180) invalidMessages.push(`Longitude coordinate value = ${point.x} is incorrect.`);
    });
  }

  return {
    id: String(index),
    rowId: String(index),
    fileName,
    name,
    comment,
    geometryType: geometry ? geometry.type : 'Unknown',
    sourceGeometry: geometry ? geometry.source : null,
    points: geometry ? geometry.points : [],
    fillColor,
    colorFromOptions: !customColor,
    activeFrom: MIN_DATE,
    activeTo: MAX_DATE,
    displayed: true,
    externalReference: '',
    groups,
    zoneTypes: options.zoneTypes,
    zoneSize: options.zoneSize,
    zoneShape: options.zoneShape,
    mustIdentifyStops: options.stoppedInsideZones,
    selected: invalidMessages.length === 0,
    imported: false,
    importError: null,
    error: invalidMessages.join(' '),
    sourceXml: serializeElement(placemark)
  };
};

const parserFor = (parser) => {
  if (parser) return parser;
  if (typeof DOMParser === 'undefined') {
    throw new Error('This browser does not support XML parsing.');
  }
  return new DOMParser();
};

export const parseKmlText = (text, {
  fileName = 'file.kml',
  options = DEFAULT_OPTIONS,
  groups = [],
  parser
} = {}) => {
  const document = parserFor(parser).parseFromString(text, 'text/xml');
  const root = document && document.documentElement;
  const rootName = root && (root.localName || root.tagName || '').toLowerCase();

  if (!root || rootName !== 'kml' || descendants(document, 'parsererror').length) {
    throw new KmlParseError(`File '${fileName}' content format is incorrect.`, fileName);
  }

  const placemarks = descendants(root, 'Placemark');
  if (!placemarks.length) {
    throw new KmlParseError(`File '${fileName}' does not contain any named zones.`, fileName);
  }

  const styles = {};
  descendants(root, 'Style').forEach((style) => {
    if (style.getAttribute('id')) styles[style.getAttribute('id')] = style;
  });

  const zones = placemarks.map((placemark, index) => zoneFromPlacemark(
    placemark,
    index,
    styles,
    options,
    groups,
    fileName
  ));

  if (zones.every((zone) => zone.geometryType === 'Unknown')) {
    throw new KmlParseError(
      `${fileName} must contain point, polygon, or route (LineString) data.`,
      fileName
    );
  }

  return zones;
};

export const applyOptionsToZone = (zone, options, groups = zone.groups) => {
  let points = zone.points;

  if (zone.geometryType === 'Point' && zone.sourceGeometry) {
    points = pointZone(
      zone.sourceGeometry.lat,
      zone.sourceGeometry.lon,
      options.zoneSize,
      options.zoneShape
    );
  } else if (zone.geometryType === 'LineString' && zone.sourceGeometry) {
    points = lineStringToCorridorPolygon(zone.sourceGeometry, options.corridorWidth);
  }

  return {
    ...zone,
    points,
    groups,
    zoneTypes: options.zoneTypes,
    zoneSize: options.zoneSize,
    zoneShape: options.zoneShape,
    mustIdentifyStops: options.stoppedInsideZones,
    fillColor: zone.colorFromOptions ? cloneColor(options.zoneColor) : zone.fillColor,
    error: points.length === 0 ? 'Zone coordinates can not be empty.' : zone.error
  };
};

export const toZoneEntity = (zone) => ({
  activeFrom: zone.activeFrom,
  activeTo: zone.activeTo,
  comment: zone.comment,
  displayed: zone.displayed,
  externalReference: zone.externalReference,
  fillColor: zone.fillColor,
  groups: zone.groups,
  mustIdentifyStops: zone.mustIdentifyStops,
  name: zone.name,
  points: zone.points,
  zoneSize: zone.zoneSize,
  zoneShape: zone.zoneShape,
  zoneTypes: zone.zoneTypes,
  rowId: zone.rowId
});

export const addSystemZoneTypes = (items = []) => {
  const normalized = items.map((item) => {
    if (typeof item === 'string') {
      const known = SYSTEM_ZONE_TYPES.find((type) => type.id === item);
      return known || { id: item, name: item, isSystem: false };
    }
    return { ...item };
  });
  const existing = new Set(normalized.map((type) => type.id));
  return SYSTEM_ZONE_TYPES.filter((type) => !existing.has(type.id)).concat(normalized);
};

export const serializeFailedZones = (zones) => {
  const placemarks = zones
    .filter((zone) => (zone.error || zone.importError) && zone.sourceXml)
    .map((zone) => zone.sourceXml)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml>${placemarks}</kml>`;
};

export const isValidZone = (zone) => !zone.error && zone.points.length > 0;
