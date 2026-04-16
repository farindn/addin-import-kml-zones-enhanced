(function () {
    "use strict";
    var DEG_PER_METER_LAT = 1 / (Math.PI / 180 * 6371000); // ~8.9932e-6 degrees per meter (constant at any latitude)
    var kml = {
        api: null,
        state: null,
        args: {},
        item: null,
        childCallback: {},
        minDate: new Date(Date.UTC(1986, 0, 1)),
        defaultZoneSize: 200,
        defaultCorridorWidth: 100, // meters — buffer on each side of a LineString route
        localInit: ["addressLookup", "Address Lookup", "customer", "Customer", "office", "Office", "home", "Home"],
        isFormDataSupported: !!window.FormData,
        fileReader: null,
        filter: null,
        colorPickerObj: null,
        zoneCreator: null,
        options: {},
        zonesData: { zones: [], commonStyles: [] },
        uploader: null,
        utils: null,
        colorPicker: null,
        vanillaSlider: null,
        waiting: null,
        importedInBG: [],
        itemsPerCall: 50,
        defaultZoneType: "ZoneTypeCustomerId",
        initVariables: function (api, state) {
            this.api = api;
            this.state = state;
            this.args.container = document.getElementById("importKmlZones");
            this.args.container.classList.remove("hidden");
            this.local = this.setupLocal(this.localInit);
            this.filter = state.getGroupFilter();
            this.utils = new Utils();
            this.fileReader = (typeof FileReader !== "undefined") ? new FileReader() : null;
            this.uploader = new Uploader();
            this.vanillaSlider = new VanillaSlider();
            this.waiting = new Waiting();
            Array.prototype.forEach.call(this.args.container.parentNode.getElementsByClassName("extern"),
                element => {
                    if (element.id) {
                        this.args[element.id] = element;
                    }
                });
            this.colorPicker = ColorPicker();
            this.colorPickerObj = this.colorPicker.formColorPicker();
            this.zoneCreator = this.zoneShapeCreator();
            this.options = {
                "zoneTypes": [this.defaultZoneType],
                "zoneSize": this.defaultZoneSize,
                "zoneColor": this.colorPickerObj.value(),
                "zoneShape": false, //is not circle === square by default
                "stoppedInsideZones": this.args.container.querySelector("#stoppedInsideZones").checked,
                "corridorWidth": this.defaultCorridorWidth
            };
        },
        NOOP: function () {
        },
        setupLocal: function (data) {
            var i, fixed = {}, item;
            if (data.length % 2 !== 0) {
                throw new Error("incorrect data items");
            }
            for (i = 0; i < data.length; i += 2) {
                item = data[i];
                if (fixed[item]) {
                    throw new Error(item + " already added");
                }
                fixed[item] = data[i + 1];
            }
            return fixed;
        },
        addSystemZoneTypes: function (a, ignoreAddressLookup) {
            var zoneTypes = {
                "ZoneTypeAddressLookupId": this.local.addressLookup,
                "ZoneTypeCustomerId": this.local.customer,
                "ZoneTypeOfficeId": this.local.office,
                "ZoneTypeHomeId": this.local.home
            },
                i, ii, tempKey, currentZoneType,
                systemZonesAdded = false;
            /*Loops through all types that the instance has and checks to see if the customer type exists. If it does it is assumed that office and home also exist.*/
            for (i = 0, ii = a.length; i < ii; i += 1) {
                currentZoneType = a[i];
                tempKey = currentZoneType.id || currentZoneType;
                if (!currentZoneType.id) {
                    if (ignoreAddressLookup && tempKey === "ZoneTypeAddressLookupId") {
                        a.splice(i, 1);
                        i -= 1;
                        ii -= 1;
                    } else {
                        systemZonesAdded = true;
                        a[i] = {
                            id: currentZoneType,
                            name: zoneTypes[tempKey],
                            isSystem: true //TODO: Hack, this should be removed when we change to stiring system types
                        };

                    }
                }
            }

            /*If customer was found it is assumed that home and office also exist and so they are not added again*/
            if (!systemZonesAdded) {
                for (var prop in zoneTypes) {
                    if (zoneTypes.hasOwnProperty(prop) && (!ignoreAddressLookup || prop !== "ZoneTypeAddressLookupId")) {
                        a.push({
                            id: prop,
                            name: zoneTypes[prop],
                            comment: this.localInit.systemAssignedComment,
                            isSystem: true
                        });
                    }
                }
            }
            return a;
        },
        zoneShapeCreator: function () {
            var squareZoneCreator = function (lat, lng, size) {
                var halfSide = (size / 2) || 0.0009,
                    method = [[1, 1], [-1, 1], [-1, -1], [1, -1]],
                    pointsForSaving = [], i;

                for (i = 0; i < method.length; i++) {
                    pointsForSaving.push({
                        x: lng + method[i][0] * halfSide,
                        y: lat + method[i][1] * halfSide / 1.5
                    });
                }

                return pointsForSaving;
            },
                circleZoneCreator = function (lat, lng, diameter) {
                    var size = diameter / 2,
                        degOfMaxDistance = 0.00008 / diameter,
                        triangleHeight = size - (degOfMaxDistance * diameter),
                        polygonSide = Math.sqrt(size * size - triangleHeight * triangleHeight) * 2,
                        amountOfSides = Math.ceil(Math.PI / Math.asin(polygonSide / (2 * size))),
                        amountOfPoints = amountOfSides < 20 ? 20 : amountOfSides + 1,
                        angle = 2 * Math.PI / (amountOfPoints - 1),
                        currentAngle = 0,
                        x, y,
                        points = [], i;

                    for (i = 0; i < amountOfPoints; i++) {
                        y = lat + (size * Math.cos(currentAngle));
                        x = lng + ((size * Math.sin(currentAngle)) / Math.abs(Math.cos(y * Math.PI / 180)));
                        points.push({
                            x: x,
                            y: y
                        });
                        currentAngle += angle;
                    }
                    return points;
                },
                metersToDegrees = distance => (360 * distance) / 40075000; //approximately because distance isn't big

            return {
                getZonePoints: function (lat, lng, diameter, isCircle) {
                    var degDiameter = diameter ? metersToDegrees(diameter) : 0.0018;
                    return isCircle ? circleZoneCreator(lat, lng, degDiameter) : squareZoneCreator(lat, lng, degDiameter);
                }
            };
        },
        parseFiles: function (files) {
            var filesCount = files.length,
                filesLoaded = 0;
            if (filesCount === 0) {
                return;
            }
            this.waiting.show();
            this.fileReader.onload = e => {
                var contents = e.target.result,
                    parser = new DOMParser(),
                    kmlDom = parser.parseFromString(contents, "text/xml"),
                    placemarks, commonStyles, i;
                if (this.isFileDataValid(kmlDom, files[filesLoaded].name)) {
                    placemarks = kmlDom.documentElement.querySelectorAll("Placemark");
                    commonStyles = kmlDom.documentElement.querySelectorAll("Style");
                    for (i = 0; i < placemarks.length; i++) {
                        this.zonesData.zones.push(placemarks[i]);
                    }
                    for (i = 0; i < commonStyles.length; i++) {
                        if (commonStyles[i].id) {
                            this.zonesData.commonStyles[commonStyles[i].id] = commonStyles[i];
                        }
                    }
                }
                filesLoaded++;
                if (filesLoaded < filesCount) {
                    this.fileReader.readAsText(files[filesLoaded]);
                } else if (filesLoaded === filesCount) {
                    this.populateZoneTables();
                }
                this.waiting.hide();
            };
            this.fileReader.readAsText(files[0]);
        },
        isFileDataValid: function (kmlDoc, fileName) {
            var placemark = kmlDoc.documentElement.querySelector("Placemark");
            if (kmlDoc.documentElement.tagName.toLowerCase() !== "kml" || !placemark) {
                this.utils.showError("File '" + fileName + "' content format is incorrect.");
                return false;
            } else if (placemark.getElementsByTagName("name").length === 0) {
                this.utils.showError("Name field required in " + fileName + ".");
                return false;
            } else if (!this.isPoint(placemark) && !this.isPolygon(placemark) && !this.isLineString(placemark)) {
                this.utils.showError(fileName + " must contain point, polygon, or route (LineString) data.");
                return false;
            }
            return true;
        },
        populateZoneTables: function () {
            var hasValidZones = false,
                isDataValid = function (data) {
                    var result = { valid: true, message: "" }, i,
                        inRange = (value, min, max) => !!(!isNaN(value) && (value >= min) && (value <= max));
                    if (data.name.length === 0) {
                        result.valid = false;
                        result.message += "Zone name can not be empty. ";
                    }
                    if (data.points.length === 0) {
                        result.valid = false;
                        result.message += "Zone coordinates can not be empty. ";
                    }
                    for (i = 0; i < data.points.length; i++) {
                        if (!inRange(data.points[i].y, -90, 90)) {
                            result.valid = false;
                            result.message += "Latitude coordinate value = " + data.points[i].y + " is incorrect. ";
                        }
                        if (!inRange(data.points[i].x, -180, 180)) {
                            result.valid = false;
                            result.message += "Longitude coordinate value = " + data.points[i].x + " is incorrect. ";
                        }
                    }
                    return result;
                };

            this.zonesData.zones.forEach((zone, index) => {
                zone.zoneParameters = this.getZoneParameters(zone);
                var table = (zone.zoneParameters.isPolygon || zone.zoneParameters.isLineString) ?
                    this.args.container.querySelector("#polygonList table") :
                    this.args.container.querySelector("#pointList table"),
                    tr, td, checkbox, isValid = isDataValid(zone.zoneParameters), colorDiv;

                if (table.parentNode.style.display === "none") {
                    table.parentNode.style.display = "";
                }

                tr = document.createElement("tr");
                tr.id = "row" + index;
                td = document.createElement("td");
                table.querySelector("tbody").appendChild(tr);
                //name column
                tr.appendChild(td);
                td.textContent = zone.zoneParameters.name;
                //description column
                td = td.cloneNode();
                td.textContent = zone.zoneParameters.comment || "-";
                tr.appendChild(td);
                //color column
                td = td.cloneNode();
                if (zone.zoneParameters.colorFromOptions) {
                    td.textContent = "Set by options.";
                } else {
                    colorDiv = document.createElement("div");
                    colorDiv.className = "colorDiv";
                    colorDiv.style.backgroundColor = this.utils.rgbToHex.apply(this.utils, this.utils.colorObjToArr(zone.zoneParameters.fillColor));
                    colorDiv.style.opacity = zone.zoneParameters.fillColor.a / 255;
                    td.appendChild(colorDiv);
                }
                tr.appendChild(td);
                //selection column
                td = td.cloneNode();
                if (isValid.valid === true) {
                    hasValidZones = true;
                    checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.id = index;
                    checkbox.className = "importCheckbox";
                    checkbox.checked = true;
                    td.appendChild(checkbox);
                } else {
                    tr.className = "error";
                    this.args.container.querySelector("#exportKML").style.display = "";
                    td.textContent = isValid.message;
                }
                tr.appendChild(td);
            });
            if (hasValidZones === true) {
                this.args.container.querySelector("#importButton").style.display = "";
                this.args.container.querySelector("#selectAll").checked = true;
                this.args.container.querySelector("#selectAllLabel").style.display = "";
            }
        },
        isPoint: function (placemark) {
            var point = placemark.getElementsByTagName("Point");
            return point.length > 0 && point[0].getElementsByTagName("coordinates").length > 0;
        },
        isPolygon: function (placemark) {
            var polygon = placemark.getElementsByTagName("Polygon"),
                oBoundary = (polygon.length > 0) ? polygon[0].getElementsByTagName("outerBoundaryIs") : [],
                linearRing = (oBoundary.length > 0) ? oBoundary[0].getElementsByTagName("LinearRing") : [];
            return polygon.length > 0 &&
                oBoundary.length > 0 &&
                linearRing.length > 0 &&
                linearRing[0].getElementsByTagName("coordinates").length > 0;
        },
        isLineString: function (placemark) {
            var lineString = placemark.getElementsByTagName("LineString");
            return lineString.length > 0 &&
                lineString[0].getElementsByTagName("coordinates").length > 0;
        },
        // Perpendicular distance from point to line segment (lineStart→lineEnd) in metres.
        _perpDistanceMeters: function (point, lineStart, lineEnd) {
            var lonScale = Math.cos(point.lat * Math.PI / 180);
            var ax = (lineEnd.lon - lineStart.lon) * lonScale;
            var ay = lineEnd.lat - lineStart.lat;
            var bx = (point.lon - lineStart.lon) * lonScale;
            var by = point.lat - lineStart.lat;
            var segLen2 = ax * ax + ay * ay;
            if (segLen2 === 0) { return Math.sqrt(bx * bx + by * by) / DEG_PER_METER_LAT; }
            var t = Math.max(0, Math.min(1, (bx * ax + by * ay) / segLen2));
            var rx = bx - t * ax, ry = by - t * ay;
            return Math.sqrt(rx * rx + ry * ry) / DEG_PER_METER_LAT;
        },
        // Ramer–Douglas–Peucker polyline simplification.
        // Removes points that deviate less than epsilonMeters from the simplified line.
        _simplifyCoords: function (coords, epsilonMeters) {
            if (coords.length <= 2) { return coords.slice(); }
            var first = coords[0], last = coords[coords.length - 1];
            var maxDist = 0, maxIdx = 0, dist, i;
            for (i = 1; i < coords.length - 1; i++) {
                dist = this._perpDistanceMeters(coords[i], first, last);
                if (dist > maxDist) { maxDist = dist; maxIdx = i; }
            }
            if (maxDist > epsilonMeters) {
                var left = this._simplifyCoords(coords.slice(0, maxIdx + 1), epsilonMeters);
                var right = this._simplifyCoords(coords.slice(maxIdx), epsilonMeters);
                return left.slice(0, left.length - 1).concat(right);
            }
            return [first, last];
        },
        // Returns perpendicular offset at a line endpoint (from → to defines direction).
        // coords are {lon, lat}; returns {dlon, dlat} in degrees.
        _endCapOffset: function (from, to, bufferMeters) {
            var lonScale = Math.cos(from.lat * Math.PI / 180);
            var dx = (to.lon - from.lon) * lonScale;
            var dy = to.lat - from.lat;
            var len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) { return { dlon: 0, dlat: 0 }; }
            var px = -dy / len, py = dx / len; // left perpendicular unit vector
            return {
                dlon: px * bufferMeters * DEG_PER_METER_LAT / lonScale,
                dlat: py * bufferMeters * DEG_PER_METER_LAT
            };
        },
        // Returns miter-join offset at interior vertex p1, between segments p0→p1 and p1→p2.
        // Caps miter length at 4× to prevent spikes at sharp turns.
        _miterOffset: function (p0, p1, p2, bufferMeters) {
            var lonScale = Math.cos(p1.lat * Math.PI / 180);
            var d1x = (p1.lon - p0.lon) * lonScale, d1y = p1.lat - p0.lat;
            var d2x = (p2.lon - p1.lon) * lonScale, d2y = p2.lat - p1.lat;
            var len1 = Math.sqrt(d1x * d1x + d1y * d1y);
            var len2 = Math.sqrt(d2x * d2x + d2y * d2y);
            if (len1 === 0 || len2 === 0) {
                return this._endCapOffset(len1 > 0 ? p0 : p1, len1 > 0 ? p1 : p2, bufferMeters);
            }
            var u1x = d1x / len1, u1y = d1y / len1;
            var u2x = d2x / len2, u2y = d2y / len2;
            // Left perpendiculars of each segment
            var lp1x = -u1y, lp1y = u1x;
            var lp2x = -u2y, lp2y = u2x;
            // Miter bisector
            var mx = lp1x + lp2x, my = lp1y + lp2y;
            var mlen = Math.sqrt(mx * mx + my * my);
            if (mlen < 1e-10) { mx = lp1x; my = lp1y; mlen = 1; }
            mx /= mlen; my /= mlen;
            // Miter correction factor (capped to prevent excessive spikes at sharp turns)
            var dot = mx * lp1x + my * lp1y;
            var miterLen = (Math.abs(dot) < 0.25) ? 4.0 : Math.min(4.0, 1.0 / dot);
            return {
                dlon: mx * bufferMeters * DEG_PER_METER_LAT / lonScale * miterLen,
                dlat: my * bufferMeters * DEG_PER_METER_LAT * miterLen
            };
        },
        // Converts an array of {lon, lat} LineString coordinates into a closed corridor polygon.
        // Returns [{x: lon, y: lat}] in the format expected by the MyGeotab Zone API.
        lineStringToCorridorPolygon: function (coords, bufferMeters) {
            if (coords.length < 2) { return []; }
            bufferMeters = bufferMeters || this.options.corridorWidth || 100;
            // Simplify before buffering: removes points within 5 m of the simplified line.
            // Reduces 800-point Google Maps exports to ~50-100 meaningful waypoints,
            // producing a much smoother corridor polygon.
            coords = this._simplifyCoords(coords, 5);
            var n = coords.length, i, offset, leftSide = [], rightSide = [];
            if (n < 2) { return []; }
            // Start cap — perpendicular from first segment only
            offset = this._endCapOffset(coords[0], coords[1], bufferMeters);
            leftSide.push({ x: coords[0].lon + offset.dlon, y: coords[0].lat + offset.dlat });
            rightSide.push({ x: coords[0].lon - offset.dlon, y: coords[0].lat - offset.dlat });
            // Interior miter joints
            for (i = 1; i < n - 1; i++) {
                offset = this._miterOffset(coords[i - 1], coords[i], coords[i + 1], bufferMeters);
                leftSide.push({ x: coords[i].lon + offset.dlon, y: coords[i].lat + offset.dlat });
                rightSide.push({ x: coords[i].lon - offset.dlon, y: coords[i].lat - offset.dlat });
            }
            // End cap — perpendicular from last segment (reversed direction)
            offset = this._endCapOffset(coords[n - 1], coords[n - 2], bufferMeters);
            leftSide.push({ x: coords[n - 1].lon + offset.dlon, y: coords[n - 1].lat + offset.dlat });
            rightSide.push({ x: coords[n - 1].lon - offset.dlon, y: coords[n - 1].lat - offset.dlat });
            // Build closed polygon: left side forward + right side reversed
            rightSide.reverse();
            var polygon = leftSide.concat(rightSide);
            polygon.push(polygon[0]); // close the ring
            return polygon;
        },
        getZoneParameters: function (zone) {
            var desc = zone.getElementsByTagName("description"),
                selfStyle = zone.getElementsByTagName("Style").length > 0 ? zone.getElementsByTagName("Style")[0] : null,
                commonStyleId = zone.getElementsByTagName("styleUrl").length > 0 ?
                    zone.getElementsByTagName("styleUrl")[0].textContent.replace("#", "") : null,
                commonStyle = commonStyleId ? this.zonesData.commonStyles[commonStyleId] : null,
                style = selfStyle || commonStyle, colorFromOptions = true, customColor;

            if (style) {
                var polyStyle = style.getElementsByTagName("PolyStyle"),
                    elColor = polyStyle && polyStyle.length > 0 ? polyStyle[0].querySelector("color") : null,
                    color = elColor ? elColor.textContent.replace("#", "").trim() : null;
                if (color) {
                    //kml colors are in abgr format
                    var hex = color.slice(-2) + color.slice(4, 6) + color.slice(2, 4),
                        alpha = color.slice(0, 2),
                        rgb = this.utils.hexToRGBArray(hex);
                    customColor = {
                        r: rgb[0],
                        g: rgb[1],
                        b: rgb[2],
                        a: (parseInt(alpha, 16))
                    };
                    colorFromOptions = false;
                }
            }

            return {
                activeFrom: this.minDate,
                activeTo: new Date(2050, 0, 1),
                comment: (desc.length > 0) ? this.utils.decodeHTMLEntities(desc[0].textContent) : "",
                displayed: true,
                externalReference: "",
                fillColor: colorFromOptions ? this.options.zoneColor : customColor,
                colorFromOptions: colorFromOptions,
                groups: this.filter,
                name: this.utils.decodeHTMLEntities(zone.getElementsByTagName("name")[0].textContent.trim()),
                points: this.getPoints(zone),
                zoneTypes: this.options.zoneTypes,
                zoneSize: this.options.zoneSize,
                zoneShape: this.options.zoneShape,
                mustIdentifyStops: this.options.stoppedInsideZones,
                isPolygon: this.isPolygon(zone),
                isPoint: this.isPoint(zone),
                isLineString: this.isLineString(zone)
            };
        },
        getPoints: function (placemark) {
            var coordinates = "",
                points = [],
                getDistance = function (sourceLat, sourceLon, targetLat, targetLon) {
                    var earthRadius = 6371, // Radius of the earth in km
                        degreeToRad = degree => degree * (Math.PI / 180),
                        dLat = degreeToRad(targetLat - sourceLat),
                        dLon = degreeToRad(targetLon - sourceLon),
                        a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                            Math.cos(degreeToRad(sourceLat)) * Math.cos(degreeToRad(targetLat)) *
                            Math.sin(dLon / 2) * Math.sin(dLon / 2),
                        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return earthRadius * c;
                };

            if (this.isPoint(placemark)) {
                coordinates = placemark.querySelector("coordinates").textContent;
                points = this.zoneCreator.getZonePoints(coordinates.split(",")[1] * 1, coordinates.split(",")[0] * 1,
                    this.options.zoneSize, this.options.zoneShape);
            } else if (this.isPolygon(placemark)) {
                var polygon = placemark.getElementsByTagName("Polygon")[0],
                    oBoundary = polygon.getElementsByTagName("outerBoundaryIs"),
                    iBoundary = polygon.getElementsByTagName("innerBoundaryIs");
                if (oBoundary.length > 0 && iBoundary.length > 0) {
                    var outerCoordinatesTag = oBoundary[0].querySelector("coordinates"),
                        innerCoodrdinatesTag = iBoundary[0].querySelector("coordinates"),
                        outerCoord = outerCoordinatesTag.textContent.trim().split(/\s/),
                        innerCoord = innerCoodrdinatesTag.textContent.trim().split(/\s/),
                        minDistance = null,
                        minDistanceOuterIndex = 0,
                        minDistanceInnerIndex = 0,
                        addPoints = function (start, end, coords) {
                            for (var i = start; i < end; i++) {
                                if (coords[i].length > 0) {
                                    points.push({ x: coords[i].split(",")[0], y: coords[i].split(",")[1] });
                                }
                            }
                        };
                    outerCoord.forEach(function (outer, outerIndex) {
                        if (outer.length > 0) {
                            outer = outer.split(",");
                            innerCoord.forEach(function (inner, innerIndex) {
                                if (inner.length > 0) {
                                    inner = inner.split(",");
                                    if (minDistance === null) {
                                        minDistance = getDistance(outer[0], outer[1], inner[0], inner[1]);
                                    } else if (minDistance > getDistance(outer[0], outer[1], inner[0], inner[1])) {
                                        minDistance = getDistance(outer[0], outer[1], inner[0], inner[1]);
                                        minDistanceOuterIndex = outerIndex;
                                        minDistanceInnerIndex = innerIndex;
                                    }
                                }
                            });
                        }
                    });
                    addPoints(0, minDistanceOuterIndex + 1, outerCoord);
                    addPoints(minDistanceInnerIndex, innerCoord.length, innerCoord);
                    addPoints(1, minDistanceInnerIndex + 1, innerCoord);
                    addPoints(minDistanceOuterIndex, outerCoord.length, outerCoord);
                } else if (oBoundary.length > 0 && iBoundary.length === 0) {
                    coordinates = oBoundary[0].querySelector("coordinates");
                    coordinates.textContent.trim().split(/\s/).forEach(function (coordPair) {
                        if (coordPair.length > 0) {
                            points.push({ x: coordPair.split(",")[0], y: coordPair.split(",")[1] });
                        }
                    });
                }
            } else if (this.isLineString(placemark)) {
                var lineString = placemark.getElementsByTagName("LineString")[0];
                var coordText = lineString.getElementsByTagName("coordinates")[0].textContent.trim();
                var rawCoords = coordText.split(/\s+/);
                var lineCoords = [];
                rawCoords.forEach(function (triplet) {
                    if (!triplet) { return; }
                    var parts = triplet.split(",");
                    var lon = parseFloat(parts[0]), lat = parseFloat(parts[1]);
                    if (!isNaN(lon) && !isNaN(lat)) {
                        lineCoords.push({ lon: lon, lat: lat });
                    }
                });
                points = kml.lineStringToCorridorPolygon(lineCoords, kml.options.corridorWidth);
            }
            return points;
        },
        markRowSuccess: function (rowId, zoneId) {
            var row = document.getElementById("row" + rowId),
                link = document.createElement("a"),
                showMapButton = document.createElement("button"),
                showMapImage = document.createElement("span");

            row.className = "imported";
            row.lastChild.textContent = "Zone successfully imported.";
            showMapImage.className = "geotabButtonIcons iconSearch";
            showMapButton.appendChild(showMapImage);
            showMapButton.style.float = "right";
            showMapButton.className = "geotabButton emptyButton";
            link.appendChild(showMapButton);
            link.href = "#map,zones:!((id:" + zoneId + "))";
            row.firstChild.appendChild(link);
        },
        markRowError: function (rowId, errorString) {
            var row = document.getElementById("row" + rowId);
            row.className = "error";
            row.lastChild.textContent = errorString;
        },
        updateControlsVisibility: function (enableImportButton) {
            if (!this.args.container) {
                return false;
            }
            var successRows = this.args.container.querySelectorAll(".imported"),
                errorRows = this.args.container.querySelectorAll(".error");

            if (successRows.length > 0) {
                this.args.container.querySelector("#hideImportedLabel").style.display = "";
            }
            if (errorRows.length > 0) {
                this.args.container.querySelector("#exportKML").style.display = "";
            }
            if (enableImportButton) {
                this.args.container.querySelector("#importButton").removeAttribute("disabled");
            }
            if (this.args.container.getElementsByClassName("importCheckbox").length === 0) {
                this.args.container.querySelector("#selectAllLabel").style.display = "none";
            }
        },
        saveZones: function (zonesToImport) {
            var calls = [], callsParts = [], pushedCalls = 0, sentParts = 0,
                doAfterCall = callLength => {
                    sentParts++;
                    this.waiting.updateProgressBar((callLength * 100) / zonesToImport.length);
                    if (sentParts === callsParts.length) {
                        this.waiting.hideProgressBar();
                        let importButton = this.args.container.querySelector("#importButton");
                        if (importButton) {
                            importButton.removeAttribute("disabled");
                        }
                    } else {
                        sendQuery(callsParts[sentParts]);
                    }
                    this.updateControlsVisibility();
                },
                sendQuery = call => {
                    this.api.multiCall(call, data => {
                        call.every((callData, index) => {
                            var zoneId = (typeof data === "string") ? data : data[index];
                            if (!this.args.container) {
                                this.importedInBG.push({ rowId: callData[1].entity.rowId, id: zoneId });
                            } else {
                                this.markRowSuccess(callData[1].entity.rowId, zoneId);
                            }
                            return true;
                        });
                        doAfterCall(call.length);
                    }, errorString => {
                        call.every(callData => {
                            if (!this.args.container) {
                                this.importedInBG.push({ rowId: callData[1].entity.rowId, message: errorString });
                            } else {
                                this.markRowError(callData[1].entity.rowId, errorString);
                            }
                            return true;
                        });
                        doAfterCall(call.length);
                    });
                };
            if (zonesToImport.length === 0) {
                alert("No selected zones to import.");
                return;
            }
            zonesToImport.every(zone => {
                if (pushedCalls < this.itemsPerCall) {
                    pushedCalls++;
                } else {
                    callsParts.push(calls);
                    calls = [];
                    pushedCalls = 1;
                }
                calls.push(["Add", { typeName: "Zone", entity: zone }]);
                return true;
            });
            if (calls.length > 0) {
                callsParts.push(calls);
            }
            this.args.container.querySelector("#importButton").setAttribute("disabled", "disabled");
            this.waiting.showProgressBar();
            sendQuery(callsParts[0]);
        },
        updateImportedInBG: function () {
            this.importedInBG.every(importedInBG => {
                if (importedInBG.id !== undefined) {
                    this.markRowSuccess(importedInBG.rowId, importedInBG.id);
                } else if (importedInBG.message !== undefined) {
                    this.markRowError(importedInBG.rowId, importedInBG.message);
                }
                return true;
            });
            this.updateControlsVisibility(true);
            this.importedInBG = [];
        },
        importZones: function () {
            var checkboxes = this.args.container.getElementsByClassName("importCheckbox"),
                zonesToImport = [];

            for (var i = 0; i < checkboxes.length; i++) {
                if (checkboxes[i].checked) {
                    zonesToImport.push(this.zonesData.zones[checkboxes[i].id].zoneParameters);
                    zonesToImport[zonesToImport.length - 1].rowId = checkboxes[i].id;
                }
            }
            this.saveZones(zonesToImport);
        },
        hideImported: function (event) {
            var rows = this.args.container.getElementsByClassName("imported"), i;
            if (event.currentTarget.checked === true) {
                for (i = 0; i < rows.length; i++) {
                    rows[i].style.display = "none";
                }
            } else {
                for (i = 0; i < rows.length; i++) {
                    rows[i].style.display = "";
                }
            }
        },
        exportKML: function () {
            var rows = this.args.container.querySelectorAll(".checkmateListTable .error"), i, zonesString = "",
                showSave,
                downloadAttributeSupport = "download" in document.createElement("a"),
                BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;

            for (i = 0; i < rows.length; i++) {
                var zone = this.zonesData.zones[rows[i].id.replace("row", "")];
                zonesString += new XMLSerializer().serializeToString(zone);
            }
            zonesString = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml>" + zonesString + "<\/kml>";

            navigator.saveBlob = navigator.saveBlob || navigator.msSaveBlob || navigator.mozSaveBlob || navigator.webkitSaveBlob;
            window.saveAs = window.saveAs || window.webkitSaveAs || window.mozSaveAs || window.msSaveAs;

            if (BlobBuilder && (window.saveAs || navigator.saveBlob)) {
                showSave = (data, name) => {
                    var builder = new BlobBuilder(),
                        blob;

                    builder.append(data);
                    blob = builder.getBlob("text/plain; charset=UTF-8" || "application/octet-stream");
                    if (window.saveAs) {
                        window.saveAs(blob, name);
                    } else {
                        navigator.saveBlob(blob, name);
                    }
                };
            } else if (downloadAttributeSupport) {
                showSave = (data, name) => {
                    var element = document.createElement("a");
                    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(zonesString));
                    element.setAttribute("download", name);
                    element.style.display = "none";
                    this.args.container.appendChild(element);
                    element.click();
                    this.args.container.removeChild(element);
                };
            }

            if (showSave) {
                showSave(zonesString, "not_imported.kml");
            } else {
                alert("Your browser does not support any method of saving JavaScript gnerated data to files.");
            }
        },
        selectAll: function (event) {
            var checkboxes = document.getElementsByClassName("importCheckbox"), i;
            for (i = 0; i < checkboxes.length; i++) {
                checkboxes[i].checked = (!!event.currentTarget.checked);
            }
        },
        clearDataTables: function () {
            var removeRows = tableId => {
                var table = this.args.container.querySelector("#" + tableId + " table"),
                    trs = table.querySelectorAll("tr");

                if (trs.length > 2) {
                    for (var i = 2; i < trs.length; i++) {
                        trs[i].parentNode.removeChild(trs[i]);
                    }
                }
                if (table.parentNode.style.display !== "none") {
                    table.parentNode.style.display = "none";
                    this.args.container.querySelector("#importButton").style.display = "none";
                    this.args.container.querySelector("#hideImportedLabel").style.display = "none";
                    this.args.container.querySelector("#progressContainer").style.display = "none";
                    this.args.container.querySelector("#exportKML").style.display = "none";
                }
            };
            removeRows("polygonList");
            removeRows("pointList");
            this.args.container.querySelector("#selectAll").checked = false;
            this.args.container.querySelector("#selectAllLabel").style.display = "none";
            this.utils.hideError();
        },
        applyOptions: function () {
            var selectedTypes = this.args.container.querySelector("#typesSelect").selectedOptions ||
                this.utils.getSelectValues(this.args.container.querySelector("#typesSelect")),
                types = [],
                controllerElement = this.args.container.querySelector("#optionsControllerElement"),
                allZoneTypesData = angular.element(controllerElement).scope().zoneTypeOptions;

            for (var i = 0;i < selectedTypes.length; i++) {
                allZoneTypesData.every(data => {
                    if (data.id === selectedTypes[i].value) {
                        types.push(data.isSystem === true ? data.id : data);
                        return false;
                    }
                    return true;
                });
            }

            this.options.zoneTypes = types;
            this.options.zoneColor = this.colorPickerObj.value();
            this.options.transparencyValue = this.colorPicker.getTransparencyControl().get();
            this.options.stoppedInsideZones = this.args.container.querySelector("#stoppedInsideZones").checked;

            var corridorWidthInput = this.args.container.querySelector("#corridorWidth");
            if (corridorWidthInput) {
                var parsed = parseInt(corridorWidthInput.value, 10);
                this.options.corridorWidth = (!isNaN(parsed) && parsed > 0) ? parsed : this.defaultCorridorWidth;
            }

            this.zonesData.zones.forEach(zone => {
                zone.zoneParameters = this.getZoneParameters(zone);
            });
        },
        setDefaultOptions: function () {
            var typesSelect = this.args.container.querySelector("#typesSelect"),
                colorPickerField = this.args.container.querySelector("#colorPickerField");
            for (var i = 0; i < typesSelect.options.length; i++) {
                typesSelect.options[i].selected = typesSelect.options[i].value === this.defaultZoneType ? true : false;
            }
            this.colorPicker.setDefaultColor();
            colorPickerField.value = this.colorPicker.getDefaultColorHex();
            colorPickerField.style.opacity = (this.colorPicker.getDefaultColor()[3]) / 255;
            this.args.container.querySelector("#stoppedInsideZonesNo").checked = false;
            this.args.container.querySelector("#stoppedInsideZones").checked = true;
        },
        clear: function () {
            this.uploader.clear();
            this.zonesData.zones = [];
            this.zonesData.commonStyles = [];
            this.clearDataTables();
        }
    };

    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = kml;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return kml; });
    } else {
        globals.kml = kml;
    }
}());
