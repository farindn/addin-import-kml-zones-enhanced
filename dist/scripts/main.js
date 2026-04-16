"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// app.js — AngularJS module bootstrap  (doc §6.1)
//
// Declares the "importKMLZones" Angular module and registers all components:
//   • modalDialog   — custom <modal-dialog> element directive
//   • clearService  — shared singleton that delegates to kml.clear()
//   • optionsController   — Options modal (zone types, colour, corridor width)
//   • parsedDataController — upload area and zone import table
//
// Called once during add-in initialise() via angularObj.initAngular().
// ─────────────────────────────────────────────────────────────────────────────
var angularObj = {
    app: null,
    initAngular: function () {
        let container = document.getElementById("importKmlZones");

        angularObj.app = angular.module("importKMLZones", []);

        // ─────────────────────────────────────────────────────────────────────
        // modalDialog directive
        // ─────────────────────────────────────────────────────────────────────
        // Custom element (<modal-dialog show="...">) for the Options modal.
        // Uses an isolated scope with two-way `show` binding so opening/closing
        // the modal is controlled from the parent optionsController.
        // Template content is transcluded from the parent, allowing the modal
        // body to live in the parent controller's scope.
        angularObj.app.directive("modalDialog", function () {
            return {
                restrict: "E",
                scope: {
                    show: "="  // two-way binding on modalShown from parent
                },
                replace: true,
                transclude: true, // modal content comes from parent scope
                link: function (scope, element, attrs) {
                    scope.dialogStyle = {};
                    if (attrs.width) {
                        scope.dialogStyle.width = attrs.width;
                    }
                    if (attrs.height) {
                        scope.dialogStyle.height = attrs.height;
                    }
                    scope.hideModal = function () {
                        scope.show = false;
                        container.style.overflow = "";
                        container.style.height = "auto";
                    };
                },
                template: "<div class='ng-modal' ng-show='show'>" +
                "<div class='ng-modal-overlay' ng-click='hideModal()'></div>" +
                "<div class='ng-modal-dialog' ng-style='dialogStyle'>" +
                "<div class='ng-modal-close' ng-click='hideModal()'>X</div>" +
                "<div class='ng-modal-dialog-content' ng-transclude></div></div></div>"
            };
        });

        // ─────────────────────────────────────────────────────────────────────
        // clearService
        // ─────────────────────────────────────────────────────────────────────
        // Shared singleton that delegates to kml.clear(). Injected into both
        // optionsController and parsedDataController so either can reset the
        // upload state without coupling the controllers to each other.
        angularObj.app.service("clearService", function () {
            var clearService = {};
            clearService.clear = function () {
                kml.clear();
            };
            return clearService;
        });

        // ─────────────────────────────────────────────────────────────────────
        // optionsController
        // ─────────────────────────────────────────────────────────────────────
        // Manages the Options modal. Owns zone type selection, colour picker
        // state, transparency slider, corridor-width validation, and the
        // apply / set-defaults actions. All responsibilities are consolidated
        // here because the MyGeotab add-in pattern uses a single controller
        // per HTML region rather than decomposed sub-controllers.
        angularObj.app.controller("optionsController", ["$scope", "clearService", function ($scope, clearService) {
            $scope.modalShown = false;

            // — Zone types ——————————————————————————————————————————————————
            $scope.toggleModal = function () {
                var showZoneTypes = function (zoneTypes) {
                    $scope.zoneTypeOptions = [];
                    kml.prevSelectedTypes = [];
                    zoneTypes.forEach(function (type) {
                        $scope.zoneTypeOptions.push({
                            id: type.id,
                            name: type.name,
                            isSystem: type.isSystem ? type.isSystem : false,
                            comment: type.comment ? type.comment : ""
                        });
                    });
                    $scope.$apply();
                    // Iterate with every() so we can break early — returning false
                    // stops the loop once the default type is pre-selected.
                    kml.options.zoneTypes.every(function (type, index) {
                        let typesSelect = container.querySelector("#typesSelect");
                        if (type === kml.defaultZoneType && typesSelect.selectedIndex === -1) {
                            typesSelect.selectedIndex = index;
                            return false; // break — every() stops on the first false
                        }
                        return true;
                    });
                };

                kml.api.call("Get", {typeName: "ZoneType"}, function (data) {
                    showZoneTypes(kml.addSystemZoneTypes(data, true));
                }, function () {
                    showZoneTypes(kml.addSystemZoneTypes([], true));
                });
                // — Color picker & transparency slider ————————————————————————
                // Sync the Angular model to the current picker state each time
                // the modal opens so the UI reflects any programmatic changes
                // made since the last open (e.g. setDefaultOptions).
                $scope.colorPickerValue = kml.colorPicker.getPicker().getHexValue();
                $scope.transparencySliderValue = $scope.transparencySliderValue ||
                    kml.colorPicker.getDefaultTransparencyValue();
                $scope.corridorWidthValue = $scope.corridorWidthValue || kml.options.corridorWidth || kml.defaultCorridorWidth;

                // Update the native range input when it is supported; the
                // vanillaSlider fallback manages its own state internally.
                if (kml.utils.inputTypeSupport("range", "a")) {
                    container.querySelector(".vanillaSlider").value = $scope.transparencySliderValue;
                }
                // Live-update the picker's alpha channel and the swatch preview
                // as the user drags the slider, keeping Angular in sync via $apply.
                angular.element(container.querySelector("input.vanillaSlider")).on("input", function (event) {
                    var val = event.target.value;
                    $scope.transparencySliderValue = Number(val);
                    kml.colorPicker.getTransparencyControl().set({a: val});
                    container.querySelector("#colorPickerField").style.opacity = ((100 - val) / 100);
                    $scope.$apply();
                });

                // — Color picker backend selection ————————————————————————————
                // inputTypeSupport("color", "hello world") returns false when
                // the browser does not natively support input[type=color] (e.g.
                // Internet Explorer). In that case jscolor is used instead and
                // requires manual show/hide management on focus/blur.
                var colorPickerField = container.querySelector("#colorPickerField");
                if (!kml.utils.inputTypeSupport("color", "hello world")) {
                    // jscolor fallback: open picker on focus, persist value on blur.
                    angular.element(colorPickerField).on("focus", function () {
                        kml.colorPicker.getPicker().originalPicker.showPicker(this);
                    });
                    angular.element(colorPickerField).on("blur", function () {
                        var value = kml.colorPicker.getPicker().originalPicker.valueElement.value;
                        if (kml.colorPicker.getPicker().originalPicker.pickerIsActive === false) {
                            kml.colorPicker.getPicker().originalPicker.hidePicker();
                        } else {
                            $scope.colorPickerValue = value;
                            this.value = value;
                            this.style.backgroundColor = value;
                            $scope.$apply();
                            this.focus();
                        }
                    });
                } else {
                    // Native input[type=color]: browser handles the picker UI;
                    // only the change event is needed to push the value to jscolor.
                    angular.element(colorPickerField).on("change", function () {
                        kml.colorPicker.getPicker().setValue(kml.utils.hexToRGBArray(this.value));
                    });
                }
                $scope.modalShown = !$scope.modalShown;
                if ($scope.modalShown === true) {
                    container.style.overflow = "hidden";
                    container.style.height = "100%";
                }
            };
            $scope.setQuickColor = function (event) {
                $scope.colorPickerValue = kml.colorPicker.setQuickColor(event);
            };
            $scope.changeZoneStop = function (event) {
                if (!event.target.checked) {
                    event.preventDefault();
                }
                var checkboxes = event.target.parentNode.querySelectorAll(".geotabSwitchButton");
                for (var i = 0; i < checkboxes.length; i++) {
                    if (checkboxes[i].id !== event.target.id) {
                        checkboxes[i].checked = false;
                    }
                }
                event.target.checked = true;
            };
            // — Corridor width validation ———————————————————————————————————
            // AngularJS stops updating $scope.corridorWidthValue when
            // input[type=number] violates its min/max attributes — the model
            // freezes at the last valid value. Reading the raw DOM value via
            // document.getElementById() returns what the user actually typed,
            // enabling real-time validation regardless of Angular model state.
            $scope.corridorWidthInvalid = function () {
                var input = document.getElementById('corridorWidth');
                var v = input ? parseFloat(input.value) : NaN;
                return isNaN(v) || v < 10 || v > 50;
            };
            $scope.applyOptions = function () {
                // Guard against invalid corridor width reaching kml.applyOptions()
                // even if ng-disabled is bypassed (e.g., programmatic form submit).
                if ($scope.corridorWidthInvalid()) { return; }
                kml.applyOptions();
                container.style.overflow = "";
                container.style.height = "auto";
                $scope.modalShown = false;
            };
            $scope.setDefaultOptions = function () {
                kml.setDefaultOptions();
                $scope.colorPickerValue = kml.colorPicker.getDefaultColorHex();
                $scope.transparencySliderValue = kml.colorPicker.getDefaultTransparencyValue();
                $scope.corridorWidthValue = kml.defaultCorridorWidth;
                if (kml.utils.inputTypeSupport("range", "a")) {
                    container.querySelector(".vanillaSlider").value = $scope.transparencySliderValue;
                }
            };
            $scope.clear = function () {
                clearService.clear();
            };
            // — Zone type multi-select ————————————————————————————————————————
            // The browser's default <select multiple> toggles the clicked item
            // before the mousedown handler fires, so prevSelectedTypes cannot be
            // reliably re-applied synchronously. setTimeout(fn, 0) defers the
            // restoration to the next event-loop tick, after the browser has
            // finished processing the click, so the full previous selection can
            // be restored and the toggle-off logic applied cleanly.
            $scope.selectType = function (event) {
                var i, unselect = null,
                    typesSelect = container.querySelector("#typesSelect");
                kml.prevSelectedTypes = kml.prevSelectedTypes || [];
                setTimeout(function () {
                    // Re-apply all previously selected options after the browser
                    // has processed the native click (deferred to next tick).
                    for (i = 0; i < kml.prevSelectedTypes.length; i++) {
                        typesSelect.options[kml.prevSelectedTypes[i]].selected = true;
                    }
                    // Deselect if the user clicked an already-selected item.
                    if (unselect !== null) {
                        typesSelect.options[unselect].selected = false;
                    }
                }, 0);
                kml.selectedTypes = typesSelect.selectedOptions || kml.utils.getSelectValues(typesSelect);
                for (i = 0; i < kml.selectedTypes.length; i++) {
                    if (kml.prevSelectedTypes.indexOf(kml.selectedTypes[i].index) === -1) {
                        kml.prevSelectedTypes.push(kml.selectedTypes[i].index);
                    }
                }
                // Track the clicked item's index so it can be deselected in
                // the deferred callback if it was already in prevSelectedTypes.
                if (event.target.selected) {
                    unselect = event.target.index;
                    kml.prevSelectedTypes.splice(kml.prevSelectedTypes.indexOf(unselect), 1);
                } else {
                    unselect = null;
                }
            };
        }]);
        // ─────────────────────────────────────────────────────────────────────
        // parsedDataController  (doc §6.1)
        // ─────────────────────────────────────────────────────────────────────
        // Manages the file-upload area and the parsed-zone result tables.
        // Thin delegation layer: every method forwards directly to the
        // corresponding kml.* function. Business logic lives in kml.js.
        angularObj.app.controller("parsedDataController", ["$scope", "clearService", function ($scope, clearService) {
            $scope.uploaderTitle = kml.isFormDataSupported ? "Drop your files here or click to select them" : "Click here to choose kml file";
            $scope.importSelectedZones = function () {
                kml.importZones();
            };
            $scope.hideImported = function (event) {
                kml.hideImported(event);
            };
            $scope.exportKML = function () {
                kml.exportKML();
            };
            $scope.selectAll = function (event) {
                kml.selectAll(event);
            };
            $scope.uploadFiles = function (event) {
                var files = event.target.files;
                // Clear any previous parse state before processing the new
                // selection so stale rows cannot coexist with new ones.
                clearService.clear();
                kml.parseFiles(files);
            };
        }]);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// kml.js — Core add-in logic  (doc §6.2)
//
// The kml object is the central state store and logic hub. It owns:
//   • KML file parsing and geometry conversion (Polygon, LineString, Point)
//   • The corridor-polygon algorithm (doc §7.3)
//   • Zone table population and per-row import lifecycle
//   • MyGeotab API batch-call orchestration
//   • Options apply / reset
//
// All sub-components (Uploader, ColorPicker, VanillaSlider, Waiting, Utils)
// are constructed in initVariables() and stored as kml.* properties so any
// function in the object can reference them without circular dependencies.
//
// Exposed as a global (kml) in add-in context; also supports CommonJS and
// AMD for unit-test environments.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";

    // ─────────────────────────────────────────────────────────────────────────
    // Module-level constants
    // ─────────────────────────────────────────────────────────────────────────
    // Degrees of latitude per metre, derived from the WGS-84 mean Earth radius.
    // Longitude is latitude-dependent and is scaled by cos(lat) at each use.
    // Accurate to better than 0.1% for distances under 1 km at mid-latitudes
    // (target deployment: Southeast Asia, ~±20°). See doc §10.3 for limits.
    var DEG_PER_METER_LAT = 1 / (Math.PI / 180 * 6371000); // ~8.9932e-6 °/m

    // ─────────────────────────────────────────────────────────────────────────
    // kml — central state store and logic hub
    // ─────────────────────────────────────────────────────────────────────────
    var kml = {
        // — Object state properties ——————————————————————————————————————————
        api: null,
        state: null,
        args: {},
        item: null,
        childCallback: {},
        minDate: new Date(Date.UTC(1986, 0, 1)),
        defaultZoneSize: 200,
        defaultCorridorWidth: 15, // half-width buffer in metres for LineString corridors (range: 10–50)
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
        // Deliberate batch cap: MyGeotab's multiCall API becomes unstable
        // above ~100 entities per call. 50 provides headroom for large KML files
        // while keeping each call well within server timeout limits.
        itemsPerCall: 50,
        defaultZoneType: "ZoneTypeCustomerId",
        // ─────────────────────────────────────────────────────────────────────
        // Initialization  (doc §6.2 → initVariables)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Wires all sub-components and sets initial option values.
         * Called once from the MyGeotab add-in initialize() callback.
         *
         * @param {Object} api   - MyGeotab API object (api.call, api.multiCall).
         * @param {Object} state - MyGeotab state object (state.getGroupFilter).
         */
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
            // Collect "extern" DOM elements by id into this.args so controllers
            // can reference them by name without repeated querySelectorAll calls.
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
                "zoneShape": false, // square by default — circle is not the common case
                "stoppedInsideZones": this.args.container.querySelector("#stoppedInsideZones").checked,
                "corridorWidth": this.defaultCorridorWidth
            };
        },
        NOOP: function () {
        },
        // ─────────────────────────────────────────────────────────────────────
        // Zone type utilities
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Converts a flat key–value array into a lookup object.
         * Throws if the array length is odd or if a key is duplicated.
         *
         * @param {Array<string>} data - Alternating [key, value, …] pairs.
         * @returns {Object} Lookup map: { key: value }.
         */
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
        /**
         * Ensures the four built-in Geotab zone types (Customer, Office, Home,
         * Address Lookup) are present in the zone-type list. If the API returns
         * them as plain ID strings they are normalised to { id, name, isSystem }
         * objects. If none were returned at all they are appended.
         *
         * @param {Array}   a                  - Zone type list from api.call Get ZoneType.
         * @param {boolean} ignoreAddressLookup - Omit Address Lookup from the result.
         * @returns {Array} Normalised zone type list with system types guaranteed.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Point zone shape factory  (doc §7.1 — Point geometry)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Returns a { getZonePoints } factory used to expand a KML Point
         * coordinate into a small area zone. Square is the default; circle uses
         * a polygon approximation with enough sides for a smooth appearance.
         *
         * @returns {{ getZonePoints: function(lat, lng, diameter, isCircle): Array }}
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // File parsing  (doc §6.2 → parseFiles / parseKML)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Reads each dropped or selected file sequentially using FileReader and
         * delegates to isFileDataValid() + populateZoneTables() on completion.
         * Sequential reads (not parallel) are used so the waiting spinner
         * correctly represents overall progress.
         *
         * @param {FileList} files - Files from a drop event or file input.
         */
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
        /**
         * Validates that the parsed DOM is a KML document with at least one
         * named Placemark of a supported geometry type. DOMParser silently
         * returns a document with a <parsererror> element on XML parse failure;
         * that case is caught by the tagName check below.
         *
         * @param {Document} kmlDoc  - Parsed XML document from DOMParser.
         * @param {string}   fileName - Used in user-visible error messages.
         * @returns {boolean} True if the document contains valid zone data.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Table population  (doc §6.2 → populateZoneTables)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Iterates parsed zones and appends one table row per zone — polygons
         * and corridors go to #polygonList, points to #pointList. Invalid zones
         * (empty name, bad coordinates) are rendered with class "error" and a
         * descriptive message; valid zones get a checked importCheckbox.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Geometry type detection  (doc §7.1)
        // ─────────────────────────────────────────────────────────────────────
        // Each predicate checks for the presence and structure of the relevant
        // KML element rather than relying on a type attribute, because KML
        // files from different sources do not use a consistent type field.
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
        // ─────────────────────────────────────────────────────────────────────
        // Corridor geometry helpers  (doc §7.3)
        // ─────────────────────────────────────────────────────────────────────
        // These four private methods implement the corridor-polygon algorithm.
        // They are prefixed with _ to signal internal use; they are not called
        // outside of lineStringToCorridorPolygon.

        /**
         * Returns the perpendicular distance from point to a line segment
         * (lineStart → lineEnd) in metres. Used by _simplifyCoords.
         *
         * @param {{lon, lat}} point
         * @param {{lon, lat}} lineStart
         * @param {{lon, lat}} lineEnd
         * @returns {number} Distance in metres.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Corridor polygon assembly  (doc §7.3)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Converts a LineString coordinate array into a closed corridor polygon
         * suitable for the MyGeotab Zone API. Algorithm steps:
         *   1. Simplify with Ramer–Douglas–Peucker (5 m tolerance).
         *   2. Compute perpendicular end-cap offsets at the first and last vertex.
         *   3. Compute miter-join offsets at each interior vertex (capped at 4×
         *      to prevent spikes at sharp turns < ~14°).
         *   4. Concatenate left side (forward) + right side (reversed) and close
         *      the ring by repeating the first point.
         *
         * @param {Array<{lon: number, lat: number}>} coords - At least 2 points.
         * @param {number} bufferMeters - Half-width of corridor in metres.
         * @returns {Array<{x: number, y: number}>} Closed polygon ring.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Zone metadata extraction  (doc §6.2 → getZoneParameters)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Extracts all Zone API fields from a <Placemark> element. Style lookup
         * follows the KML precedence: inline <Style> overrides a shared <Style>
         * resolved via <styleUrl>. If no PolyStyle color is found, the zone
         * color from the Options panel is used (colorFromOptions = true).
         *
         * KML encodes color in ABGR byte order (not standard RGBA). The bytes
         * are reversed here before constructing the Geotab color object.
         * Example: "7f0000ff" → alpha 0x7f (127), blue 0x00, green 0x00, red 0xff
         * → { r: 255, g: 0, b: 0, a: 127 } (semi-transparent red).
         *
         * @param {Element} zone - A KML <Placemark> DOM element.
         * @returns {Object} Zone parameters object for the MyGeotab Zone API.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Geometry extraction  (doc §6.2 → getPoints / doc §7.1, §10.2)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Routes geometry extraction to the appropriate handler based on the
         * Placemark element's geometry type.
         *
         * Donut polygon (outer + inner boundary): the inner boundary is stitched
         * to the outer ring by finding the minimum-distance outer–inner vertex
         * pair using a Haversine distance function. This is O(n × m) where n
         * and m are the outer and inner vertex counts. Acceptable for typical
         * Google My Maps exports (< 500 vertices per ring). See doc §10.2.
         *
         * @param {Element} placemark - A KML <Placemark> DOM element.
         * @returns {Array<{x: number, y: number}>} Point array for the Zone API.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // Row state management  (doc §9 — Import API errors)
        // ─────────────────────────────────────────────────────────────────────
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
        // ─────────────────────────────────────────────────────────────────────
        // Import — batch API calls  (doc §6.2 → importZones / saveZones)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Splits zonesToImport into sequential multiCall batches of at most
         * itemsPerCall (50) zones, sending the next batch only after the
         * previous one completes. Progress bar is updated proportionally.
         * Each batch result marks individual rows as imported or error.
         *
         * @param {Array<Object>} zonesToImport - Zone parameter objects including
         *   a rowId property for table row lookup.
         */
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
        /**
         * Flushes the importedInBG queue built up while the add-in container
         * was not in the DOM (e.g. the user navigated away during import).
         * Called on window focus so the UI is updated the next time the user
         * returns to the add-in.
         */
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
        // ─────────────────────────────────────────────────────────────────────
        // State reset  (doc §6.2 → clear)
        // ─────────────────────────────────────────────────────────────────────
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
        // ─────────────────────────────────────────────────────────────────────
        // Options management  (doc §8)
        // ─────────────────────────────────────────────────────────────────────
        /**
         * Reads all current values from the Options modal inputs and writes
         * them to kml.options. Also re-derives zoneParameters for every already-
         * parsed zone so color and type changes are reflected immediately in the
         * table without requiring a re-upload.
         */
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

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    // In the MyGeotab add-in (browser) the object is attached to window as
    // kml. CommonJS and AMD paths support unit testing outside the browser.
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = kml;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return kml; });
    } else {
        globals.kml = kml;
    }
}());

// ─────────────────────────────────────────────────────────────────────────────
// vanillaSlider.js — Transparency slider widget  (doc §6.5)
//
// Provides a slider() factory that returns either a native input[type=range]
// (modern browsers) or a custom drag-based slider (older browsers that do not
// support range inputs). The custom implementation uses touch or mouse events
// depending on the device.
//
// The vanilla IIFE object bundles lightweight DOM utilities (addClass, closest,
// offset, extend, etc.) used internally by the slider. Each slider instance
// registers its own event listeners — not event-delegated — which is acceptable
// given only one slider is ever created per add-in session.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";
    var VanillaSlider = function () {
        var svgNameSpace = "http://www.w3.org/2000/svg",
            svgElements = {
                "path": true,
                "circle": true,
                "svg": true,
                "rect": true,
                "text": true
            };

        return {
            // ─────────────────────────────────────────────────────────────────
            // vanilla — lightweight DOM utility object (IIFE, evaluated once)
            // ─────────────────────────────────────────────────────────────────
            vanilla: (function () {
                var classNameCtrl = function (el) {
                    var obj = typeof el.className === "string" ? el : el.className,
                        param = typeof el.className === "string" ? "className" : "baseVal";
                    return {
                        get: function () {
                            return obj[param];
                        },
                        set: function (text) {
                            obj[param] = text;
                        }
                    };
                },
                    hasClass = function (el, className) {
                        return classNameCtrl(el).get().indexOf(className) !== -1;
                    },
                    addClass = function (el, className) {
                        if (el.classList) {
                            el.classList.add(className);
                        } else {
                            var classCtrl = classNameCtrl(el);
                            if (classCtrl.get().indexOf(className) < 0) {
                                classCtrl.set(classCtrl.get() + (classCtrl.get() ? " " : "") + className);
                            }
                        }
                    },
                    isArray = function (arr) {
                        return Object.prototype.toString.call(arr).indexOf("Array") !== -1;
                    },
                    isUsualObject = function (obj) {
                        return Object.prototype.toString.call(obj).indexOf("Object") !== -1;
                    },
                    createElement = function (name) {
                        if (svgElements.hasOwnProperty(name.toLowerCase())) {
                            return document.createElementNS(svgNameSpace, name);
                        }
                        return document.createElement(name);
                    },
                    changeDisplay = function (element, newValue) {
                        element.style.display = newValue;
                        return element;
                    },
                    getRealDisplay = function (elem) {
                        var computedStyle;

                        if (elem.currentStyle) {
                            return elem.currentStyle.display;
                        } else if (window.getComputedStyle) {
                            computedStyle = window.getComputedStyle(elem, null);

                            return computedStyle.getPropertyValue("display");
                        }
                    },
                    show = function (el) {
                        var nodeName, body = document.body, testElem, display;

                        if (getRealDisplay(el) !== "none") {
                            return el;
                        }

                        changeDisplay(el, "");

                        if (getRealDisplay(el) === "none") {
                            nodeName = el.nodeName;

                            testElem = document.createElement(nodeName);
                            body.appendChild(testElem);
                            display = getRealDisplay(testElem);

                            if (display === "none") {
                                display = "block";
                            }

                            body.removeChild(testElem);

                            changeDisplay(el, display);
                        }

                        return el;
                    },
                    hide = function (element) {
                        return changeDisplay(element, "none");
                    },

                    vanilla = {
                        /**
                         * @param el {HTMLElement} Element for adding classes
                         * @param classes {String} string of classes separated by space
                         */
                        addClasses: function (el, classes) {
                            var classArr = classes.split(" "), i;

                            for (i = 0; i < classArr.length; i++) {
                                addClass(el, classArr[i]);
                            }
                        },
                        hasClass: hasClass,
                        /**
                         * @param el {HTMLElement} Element for adding styles
                         * @param cssValues {Object} Object with css rules
                         */
                        css: function (el, cssValues) {
                            var createIterator = function (element, values) {
                                return function (propertyName) {
                                    element.style[propertyName] = values[propertyName];
                                };
                            };
                            Object.keys(cssValues).forEach(createIterator(el, cssValues));
                        },
                        /**
                         * @param tagName {String} Tag name of HTML element
                         * @param attributes {Object} Object with attributes of the element
                         * @param css {Object} Object with css rules
                         * @return element {HTMLElement} A new HTMLElement with set attributes and css rules
                         */
                        create: function (tagName, attributes, css) {
                            var element = createElement((tagName || "").toUpperCase()),
                                createIterator = function (el, attrs) {
                                    return function (propertyName) {
                                        try {
                                            el.setAttribute(propertyName, attrs[propertyName]);
                                        } catch (e) {
                                            //try to catch 114827 error, should be removed when it will be fixed or will not happen in future
                                            throw new Error("Try to set " + propertyName +
                                                " attribute " + attrs[propertyName] + " to " + el.tagName +
                                                " (" + tagName + "). Connected with this error: " + e.message);
                                        }
                                    };
                                };
                            if (attributes) {
                                Object.keys(attributes).forEach(createIterator(element, attributes));
                            }
                            if (css) {
                                vanilla.css(element, css);
                            }
                            return element;
                        },
                        /**
                         * @return {Object} set of root elements
                         */
                        extend: function () {
                            var length = arguments.length,
                                src, srcKeys, srcAttr,
                                fullCopy = false,
                                resAttr,
                                res = arguments[0], i = 1, j;

                            if (typeof res === "boolean") {
                                fullCopy = res;
                                res = arguments[1];
                                i++;
                            }
                            while (i !== length) {
                                src = arguments[i];
                                srcKeys = Object.keys(src);
                                for (j = 0; j < srcKeys.length; j++) {
                                    srcAttr = src[srcKeys[j]];
                                    if (fullCopy && (isUsualObject(srcAttr) || isArray(srcAttr))) {
                                        resAttr = res[srcKeys[j]];
                                        resAttr = res[srcKeys[j]] = (isUsualObject(resAttr) || isArray(resAttr)) ?
                                            resAttr : (isArray(srcAttr) ? [] : {});
                                        vanilla.extend(fullCopy, resAttr, srcAttr);
                                    } else {
                                        res[srcKeys[j]] = src[srcKeys[j]];
                                    }
                                }
                                i++;
                            }
                            return res;
                        },
                        isArray: isArray,
                        show: show,
                        hide: hide,
                        /**
                         * Toggle a DOM elements display
                         * @param el {HTMLElement} DOM Element
                         * @param toggle {Boolean} true = show, false = hide
                         * */
                        toggle: function (el, toggle) {
                            if (toggle) {
                                this.show(el);
                            } else {
                                this.hide(el);
                            }
                        },
                        /**
                         * Polyfill for Element.closest() — IE 11 and early Edge do not
                         * implement closest() natively. Falls back to the vendor-prefixed
                         * matches() variants before traversing the parent chain manually.
                         *
                         * @param elem {HTMLElement} Starting element.
                         * @param selector {String} CSS selector to match.
                         * @returns {HTMLElement|false} Nearest matching ancestor, or false.
                         */
                        closest: function (elem, selector) {
                            var matchesSelector = elem && (elem.matches || elem.webkitMatchesSelector ||
                                elem.mozMatchesSelector || elem.msMatchesSelector);

                            if (matchesSelector) {
                                while (elem && elem !== document.body) {
                                    if (matchesSelector.bind(elem)(selector)) {
                                        return elem;
                                    } else {
                                        elem = elem.parentNode;
                                    }
                                }
                            }
                            return false;
                        },
                        offset: function (elem) {
                            var offsetLeft = 0,
                                tmp, offsetTop = 0,
                                result = {
                                    left: 0,
                                    top: 0
                                };

                            if (elem !== null) {
                                tmp = elem;
                                while (tmp !== null) {
                                    offsetLeft += tmp.offsetLeft;
                                    offsetTop += tmp.offsetTop;
                                    tmp = tmp.offsetParent;
                                }
                                result.left = offsetLeft;
                                result.top = offsetTop;
                            }
                            return result;
                        }
                    };
                return vanilla;
            })(),
            // ─────────────────────────────────────────────────────────────────
            // slider factory — returns a { getValue, setValue } interface
            // ─────────────────────────────────────────────────────────────────
            /**
             * Creates a slider widget inside elem. Automatically selects:
             *   • Native  input[type=range] when the browser supports it.
             *   • Custom  drag-based SPAN widget otherwise (IE 11 / old Edge).
             *
             * Touch or mouse handlers are chosen based on isBrowserSupportTouchEvents().
             *
             * @param {HTMLElement} elem          - Container element.
             * @param {Object}      customOptions - { min, max, step, value, onChange }.
             * @returns {{ getValue: function, setValue: function }|null}
             */
            slider: function (elem, customOptions) {
                var defaultOptions = {
                    max: 100,
                    min: 0,
                    step: 5,
                    value: 0
                },
                    body = window.document.body,
                    isTouch = kml.utils.isBrowserSupportTouchEvents(),
                    options = customOptions ? Object.keys(customOptions).reduce(function (result, key) {
                        result[key] = customOptions[key];
                        return result;
                    }, defaultOptions) : defaultOptions,
                    slider = (kml.utils.inputTypeSupport("range", "a") ? function (parent) {
                        var self = parent.appendChild(kml.vanillaSlider.vanilla.create("INPUT", {
                            "class": "vanillaSlider",
                            type: "range",
                            max: options.max,
                            min: options.min,
                            step: options.step,
                            value: options.value,
                            "ng-model": "sliderValue"
                        })),
                            change = kml.utils.NOOP;
                        kml.slider = self;

                        if (typeof options.onChange === "function") {
                            change = options.onChange;
                            self.addEventListener("change", function (e) {
                                change.call(this, this.value, e);
                            }, false);
                            self.addEventListener("input", function (e) {
                                change.call(this, this.value, e);
                            }, false);
                        }

                        return {
                            set: function (prop, val) {
                                self[prop] = val;
                            },
                            get: function (prop) {
                                return self[prop];
                            },
                            disable: function () {
                                self.setAttribute("disabled", "disabled");
                            },
                            enable: function () {
                                self.removeAttribute("disabled");
                            }
                        };
                    } : function (parent) {
                        var change = kml.utils.NOOP,
                            span = parent.appendChild(kml.vanillaSlider.vanilla.create("SPAN", {
                                "class": "vanillaSliderElement"
                            })),
                            halfScrollableWidth = span.offsetWidth / 2,
                            scrollerWidth = parent.offsetWidth,
                            currentPos = 0,
                            tempPos = 0,
                            max = options.max,
                            min = options.min,
                            step = options.step,
                            amp = max - min,
                            positions = amp / step,
                            posWidth = scrollerWidth / positions,
                            handlers,
                            getInteractionEvent = function (eventName) {
                                var evt = document.createEvent("Event");
                                evt.initEvent(eventName, true, false);
                                return evt;
                            },
                            move = function (delta, currPoint) {
                                var relativeLength = posWidth && Math.round((Math.abs(delta) / posWidth)) * step,
                                    startPoint = typeof currPoint === "number" ? currPoint : currentPos;
                                if (relativeLength) {
                                    if (delta < 0) {
                                        tempPos = Math.max(min, startPoint - relativeLength);
                                    } else {
                                        tempPos = Math.min(max, startPoint + relativeLength);
                                    }
                                    tempPos = Math.round(tempPos / step) * step;
                                    setValue(tempPos);
                                    change.call(span, tempPos);
                                }
                                return tempPos;
                            },
                            setValue = function (val) {
                                span.style.left = ((val - min) / amp) * 100 + "%";
                            },
                            events = {
                                start: isTouch ? "touchstart" : "mousedown",
                                move: isTouch ? "touchmove" : "mousemove",
                                end: isTouch ? "touchend" : "mouseup"
                            },
                            xStart = 0,
                            mousemove = function (e) {
                                move(e.pageX - xStart);
                            },
                            click = function (e) {
                                var bbox;
                                if (e.target !== span) {
                                    bbox = this.getBoundingClientRect();
                                    posWidth = bbox.width / positions;
                                    currentPos = move(e.pageX - bbox.left, 0);
                                }
                            },
                            eventHandler = function (e) {
                                var event;
                                if ("changedTouches" in e) {//firefox has this property in prototype
                                    if (e.changedTouches.length === 1) {
                                        event = e.changedTouches[0];
                                    } else {
                                        return true;
                                    }
                                } else {
                                    event = e;
                                }
                                return handlers[e.type].call(this, event, e);
                            },
                            mouseup = function () {
                                currentPos = tempPos;
                                span.dispatchEvent(getInteractionEvent("blur"));
                                body.removeEventListener(events.move, eventHandler, false);
                                body.removeEventListener(events.end, eventHandler, false);
                            },
                            mousedown = function (e, originalEvent) {
                                originalEvent.preventDefault();
                                xStart = e.pageX;
                                scrollerWidth = parent.offsetWidth;
                                posWidth = scrollerWidth / positions;
                                halfScrollableWidth = span.offsetWidth / 2;
                                span.dispatchEvent(getInteractionEvent("focus"));
                                body.addEventListener(events.move, eventHandler, false);
                                body.addEventListener(events.end, eventHandler, false);
                            };

                        handlers = {
                            mousedown: mousedown,
                            touchstart: mousedown,
                            mousemove: mousemove,
                            touchmove: mousemove,
                            mouseup: mouseup,
                            touchend: mouseup
                        };

                        kml.vanillaSlider.vanilla.addClasses(parent, "vanillaSlider");
                        span.addEventListener(events.start, eventHandler, false);
                        parent.addEventListener("click", click, false);
                        span.style.left = -halfScrollableWidth + "px";
                        if (typeof options.onChange === "function") {
                            change = options.onChange;
                        }
                        if (options.value) {
                            currentPos = Math.max(Math.min(options.value, max), min);
                            setValue(currentPos);
                        }

                        return {
                            set: function (prop, val) {
                                currentPos = Math.max(Math.min(val, max), min);
                                setValue(currentPos);
                                change.call(span, currentPos);
                            },
                            get: function () {
                                return currentPos;
                            },
                            disable: function () {
                                span.removeEventListener(events.start, eventHandler, false);
                                parent.removeEventListener("click", click, false);
                                mouseup();
                            },
                            enable: function () {
                                span.addEventListener(events.start, eventHandler, false);
                                parent.addEventListener("click", click, false);
                            }
                        };
                    })(elem),
                    disabled = false;

                return {
                    getValue: function () {
                        return slider.get("value");
                    },
                    setValue: function (val) {
                        if (val < options.min) {
                            val = options.min;
                        }
                        if (val > options.max) {
                            val = options.max;
                        }
                        slider.set("value", val);
                        return val;
                    },
                    disable: function () {
                        if (!disabled) {
                            slider.disable();
                            disabled = true;
                        }
                    },
                    enable: function () {
                        if (disabled) {
                            slider.enable();
                            disabled = false;
                        }
                    }
                };
            }
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = VanillaSlider;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return VanillaSlider; });
    } else {
        globals.VanillaSlider = VanillaSlider;
    }
}());

// ─────────────────────────────────────────────────────────────────────────────
// utils.js — Shared utility functions  (doc §6.6)
//
// Instantiated as kml.utils in initVariables(). Provides color conversion,
// input-type feature detection, error message display, and HTML entity
// decoding used by kml.getZoneParameters() for zone name/description fields.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";
    var Utils = function () {
        // Cached at construction time — assumes #errorMessage is in the DOM
        // before new Utils() is called (guaranteed by kml.initVariables order).
        let errorMessageElement = kml.args.container.querySelector("#errorMessage");

        return {
            /**
             * Tests whether the browser natively supports a given input type.
             * Browsers that do not recognise the type silently fall back to
             * type="text", so a value that would be sanitised by the typed
             * input (e.g. "hello world" for type="color") is used as the probe.
             *
             * @param {string} type      - Input type to test (e.g. "color", "range").
             * @param {string} testValue - Value that a text input would preserve
             *                            but the typed input would sanitise.
             * @returns {boolean} True if the browser supports the typed input.
             */
            inputTypeSupport: function (type, testValue) {
                var testEl = document.createElement("input");

                testEl.setAttribute("type", type);
                testEl.setAttribute("value", testValue);
                return testEl.type === type && testEl.value !== testValue;
            },

            /**
             * Returns true if the browser supports touch events.
             * Used by vanillaSlider.js to choose touch vs mouse handlers.
             *
             * @returns {boolean}
             */
            isBrowserSupportTouchEvents: function () {
                var result = true;
                try {
                    document.createEvent("TouchEvent");
                } catch (e) {
                    result = false;
                }
                return result;
            },

            /**
             * Normalises a color value to an [R, G, B, A] array.
             * Accepts either an {r, g, b, a} object or an array passthrough.
             *
             * @param {{r,g,b,a}|Array} color
             * @returns {Array<number>} [R, G, B, A] in 0–255 range.
             */
            colorObjToArr: function (color) {
                if (!Array.isArray(color)) {
                    return [color.r, color.g, color.b, color.a];
                }
                return color;
            },

            /**
             * Converts RGB component values to a CSS hex color string (#RRGGBB).
             * Accepts either separate R, G, B arguments or a single {r,g,b} object.
             *
             * @param {number|Object} rgbaOrR - Red channel (0–255) or {r,g,b} object.
             * @param {number}        [G]     - Green channel (0–255).
             * @param {number}        [B]     - Blue channel (0–255).
             * @returns {string} CSS hex string e.g. "#ff0000".
             */
            rgbToHex: function (rgbaOrR, G, B) {
                if (typeof rgbaOrR === "object") {
                    return kml.rgbToHex.apply(this, [rgbaOrR.r, rgbaOrR.g, rgbaOrR.b]);
                }
                return "#" + [rgbaOrR, G, B].map(function (number) {
                    var hex = (number || 0).toString(16);
                    return hex.length < 2 ? "0" + hex : hex;
                }).join("");
            },

            /**
             * Converts a hex color string to an [R, G, B] array (0–255 each).
             * Leading "#" and shorthand 3-character hex are both handled via
             * normalizeHexColor().
             *
             * @param {string} hexColor - e.g. "#ff0000" or "f00".
             * @returns {Array<number>} [R, G, B].
             */
            hexToRGBArray: function (hexColor) {
                var normalizedColor = this.normalizeHexColor(hexColor),
                    hexToDec = offset => parseInt(normalizedColor.slice(offset, offset + 2), 16);
                return [
                    hexToDec(0),
                    hexToDec(2),
                    hexToDec(4)
                ];
            },

            /** Strips "#" and expands 3-character shorthand to 6 characters. */
            normalizeHexColor: hexColor => hexColor.replace("#", "").replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3"),

            // ─────────────────────────────────────────────────────────────────
            // Error message display
            // ─────────────────────────────────────────────────────────────────
            showError: function (message) {
                errorMessageElement.textContent = message;
                errorMessageElement.style.display = "";
            },
            hideError: function () {
                if (errorMessageElement.style.display !== "none") {
                    errorMessageElement.style.display = "none";
                }
            },

            /**
             * Cross-browser polyfill for HTMLSelectElement.selectedOptions.
             * IE 11 and early Edge do not implement selectedOptions on
             * multi-select elements; this returns an equivalent array.
             *
             * @param {HTMLSelectElement} select
             * @returns {Array<{value: string}>}
             */
            getSelectValues: function (select) {
                var result = [],
                    options = select && select.options,
                    opt;

                for (var i = 0, iLen = options.length; i < iLen; i++) {
                    opt = options[i];

                    if (opt.selected) {
                        result.push({ value: opt.value });
                    }
                }
                return result;
            },

            /**
             * Decodes HTML entities in KML name and description fields.
             *
             * Safety: assigning to innerHTML parses the string into DOM nodes,
             * but reading textContent returns only the text representation —
             * script tags are never executed and no XSS vector exists here
             * because the string never re-enters the DOM as markup.
             *
             * @param {string} str - Raw text possibly containing HTML entities.
             * @returns {string} Decoded plain text.
             */
            decodeHTMLEntities: function (str) {
                var a = document.createElement("a");
                if (str && typeof str === "string") {
                    str = str.replace(/&amp;nbsp;/g, "");
                }
                a.innerHTML = str;
                return a.textContent;
            }
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = Utils;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return Utils; });
    } else {
        globals.Utils = Utils;
    }
}());

// ─────────────────────────────────────────────────────────────────────────────
// colorPicker.js — Color picker abstraction  (doc §6.3)
//
// Wraps two color-input backends selected at runtime:
//   • Native  input[type=color] — modern browsers (Chrome, Firefox, Edge)
//   • jscolor — fallback for browsers without native color picker support
//
// Exposes a unified value() getter/setter and a transparency slider backed
// by vanillaSlider.js. Quick-color swatches are injected programmatically.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";
    let ColorPicker = () => {
        // ─────────────────────────────────────────────────────────────────────
        // Module-level defaults  (doc §6.3)
        // ─────────────────────────────────────────────────────────────────────
        // defaultColor: [R, G, B, A] in 0–255 range.
        // Alpha 64 / 255 ≈ 25% opacity → 75% transparency (defaultTransparencyValue).
        // The transparency slider uses the inverted percentage: 0 = fully opaque,
        // 100 = fully transparent.
        let quickColorsBox = null,
            transparencyControl = null,
            colorToInitWith = null,
            defaultColor = [0, 128, 0, 64],       // green, 75% transparent
            defaultColorHex = "#008000",
            arrDefaultColorRGBA = { r: 0, g: 128, b: 0, a: 64 },
            defaultTransparencyValue = 75,         // percentage (0=opaque, 100=transparent)
            picker = null,

        // ─────────────────────────────────────────────────────────────────────
        // DOM wiring
        // ─────────────────────────────────────────────────────────────────────
        // setVariables() is called once inside formColorPicker() after the
        // Angular container is ready. It caches DOM references and constructs
        // the transparency control, choosing slider vs button-set based on
        // which element is present in the DOM.
            setVariables = () => {
                quickColorsBox = kml.args.container.querySelector("#colorPicker").querySelectorAll(".quickColorsBox");
                colorToInitWith = kml.utils.colorObjToArr(arrDefaultColorRGBA || defaultColor);
                transparencyControl = (function (content) {
                    let sliderEl = content.getElementsByClassName("transparencySlider")[0],
                        buttonEls = content.getElementsByClassName("transparencyButtonSet")[0],
                        slider = () => {
                            let transparencySliderValue = content.getElementsByClassName("transparencySliderValue")[0],
                                transparencySlider = content.getElementsByClassName("transparencySliderControl")[0],
                                getValue = newVal => Math.round(100 - (newVal <= 1 ? newVal : newVal / 255) * 100),
                                sliderUI = kml.vanillaSlider.slider(transparencySlider, {
                                    min: 0,
                                    max: 100,
                                    step: 5,
                                    value: transparencySliderValue.textContent = getValue(colorToInitWith[3])
                                });

                            return {
                                // Returns alpha as 0–255 converted from the 0–100 slider percentage.
                                get: () => sliderUI ? Math.round((100 - sliderUI.getValue()) / 100 * 255) : 0,
                                // Accepts both {r,g,b,a} objects (a in 0–255) and [r,g,b,a] arrays
                                // so callers can pass either format without conversion.
                                set: function (val) {
                                    sliderUI.setValue((val.a ? val.a : val[3]) || 0);
                                }
                            };
                        },
                        chooseElement = function (useful, useless) {
                            useless.parentNode.removeChild(useless);
                            useful.style.display = "block";
                        },
                        control = slider();

                    chooseElement(sliderEl, buttonEls);
                    return control;
                })(kml.args.container.querySelector("#colorPicker"));
            };

        return {
            getDefaultColor: () => defaultColor,
            getDefaultColorHex: () => defaultColorHex,
            getTransparencyControl: () => transparencyControl,
            getDefaultTransparencyValue: () => defaultTransparencyValue,
            getPicker: () => picker,
            setVariables,
            // ─────────────────────────────────────────────────────────────────
            // Public API
            // ─────────────────────────────────────────────────────────────────
            /**
             * Initialises the color picker widget and injects quick-color swatches.
             * Called once from kml.initVariables(). Returns a { value, attachEvent }
             * interface used throughout kml.js and optionsController.
             *
             * @returns {{ value: function, attachEvent: function }}
             */
            formColorPicker: () => {
                setVariables();
                // Quick-color palette: orange-red, orange, green, yellow,
                // light-blue, blue, purple — matching the UI colour swatches.
                let quickColors = ["#ff4500", "#ffa500", "#008000", "#ffff00", "#ADD8E6", "#0000ff", "#800080"],
                    listeners = [],
                    getColorElement = () => kml.args.container.querySelector("#colorPicker INPUT:not([type='radio'])"),
                    customColorToInternal = function (customColor) {
                        let rgbColor = typeof customColor === "string" ? kml.utils.hexToRGBArray(customColor) : customColor,
                            color = kml.utils.colorObjToArr(rgbColor);
                        if (Math.max.apply(Math, color) > 1) {
                            color = color.map(value => (typeof value === "undefined") ? 1 : value / 255);
                        }
                        while (color.length < 4) {
                            color.push(0);
                        }
                        return color.slice();
                    },
                    fireChangeEvent = function (value) {
                        listeners.forEach(function (listener) {
                            if (listener.eventType === "change") {
                                listener.callback(value);
                            }
                        });
                    },
                    // Selects the native or jscolor backend at runtime via feature
                    // detection. Both return the same { setValue, getValue, getHexValue }
                    // interface so the rest of the module is backend-agnostic.
                    createColorPicker = () => {
                        let isSupportColor = kml.utils.inputTypeSupport("color", "hello world"),
                            nativeColorPicker = () => {
                                let elem = getColorElement();
                                elem.type = "color";
                                elem.addEventListener("change", () => {
                                    fireChangeEvent(this.value);
                                }, false);

                                return {
                                    setValue: function (val) {
                                        let newValue = kml.utils.rgbToHex.apply(kml, kml.utils.colorObjToArr(val));
                                        elem.value = newValue;
                                        elem.style.opacity = (kml.utils.colorObjToArr(val)[3]) / 255;
                                        fireChangeEvent(newValue);
                                    },
                                    getValue: () => kml.utils.hexToRGBArray(elem.value),
                                    getHexValue: () => elem.value
                                };
                            },
                            jqueryColorPicker = () => {
                                let elem = getColorElement(),
                                    Jscolor = jscolor,
                                    colorPicker = new Jscolor(elem);

                                colorPicker.valueElement.addEventListener("change", () => {
                                    fireChangeEvent("#" + this.value);
                                }, false);

                                return {
                                    setValue: function (val) {
                                        let newVal = val.length > 3 ? val.slice(0, 3) : val,
                                            aVal = val.length > 3 ? val.slice(3, 4) :
                                                (kml.utils.colorObjToArr(defaultColor)[3]) * 255,
                                            newValue = kml.utils.rgbToHex.apply(kml.utils, kml.utils.colorObjToArr(newVal));

                                        colorPicker.fromRGB.apply(colorPicker, customColorToInternal(newVal));
                                        getColorElement().style.opacity = aVal / 255;
                                        getColorElement().style.backgroundColor = newValue;

                                        fireChangeEvent(newValue);
                                    },
                                    getValue: () => (colorPicker.rgb || defaultColor).map(val => val * 255),
                                    getHexValue: () => elem.value,
                                    originalPicker: colorPicker
                                };
                            };

                        return (isSupportColor ? nativeColorPicker : jqueryColorPicker)();
                    },
                    attachEvent = function (eventType, callback) {
                        listeners.push({
                            eventType: eventType,
                            callback: callback
                        });
                    };
                picker = createColorPicker();
                picker.setValue(colorToInitWith);

                quickColors.forEach(function (value) {
                    let quickColor = document.createElement("div");
                    quickColor.className = "quickColor";
                    quickColor.setAttribute("ng-click", "setQuickColor($event)");
                    quickColor.style.backgroundColor = value;
                    quickColorsBox[0].appendChild(quickColor);
                });

                return {
                    /**
                     * Gets or sets current color and transparency
                     * @param {Array|object} value new color and transparency.
                     * The following values are all valid:
                     * @returns {object} rgba object with their values between 0 and 255
                     */
                    value: function (value) {
                        let rgb;
                        if (value) {
                            picker.setValue(value);
                            transparencyControl.set(value);
                            return value;
                        } else {
                            rgb = picker.getValue();
                            return {
                                r: rgb[0],
                                g: rgb[1],
                                b: rgb[2],
                                a: transparencyControl.get()
                            };
                        }
                    },
                    attachEvent: attachEvent
                };
            },
            /**
             * Sets the picker to the clicked quick-color swatch while preserving
             * the current transparency value.
             *
             * The rgb() regex branch assumes the browser serialises backgroundColor
             * as "rgb(R, G, B)" — this is true in all supported browsers. If a
             * future browser uses a different format, exec() will return null and
             * splice() will throw. Hex values skip the regex path entirely.
             *
             * @param {Event} e - The ng-click event from the swatch element.
             * @returns {string} The hex value of the selected color.
             */
            setQuickColor: function (e) {
                if (!e.target.style.backgroundColor) {//clicked on container
                    return;
                }

                let backgroundColor = e.target.style.backgroundColor,
                    matches = backgroundColor.indexOf("#") < 0 ?
                        /\brgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g.exec(backgroundColor).splice(1) :
                        kml.utils.hexToRGBArray(backgroundColor),
                    rgba = [];

                rgba.push(parseInt(matches[0], 10));
                rgba.push(parseInt(matches[1], 10));
                rgba.push(parseInt(matches[2], 10));
                rgba.push(transparencyControl.get());

                picker.setValue(rgba);
                kml.args.container.querySelector("#colorPickerField").value = picker.getHexValue();
            },

            setDefaultColor: () => {
                picker.setValue(defaultColor);
            }
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ColorPicker;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return ColorPicker; });
    } else {
        globals.ColorPicker = ColorPicker;
    }
}());

// ─────────────────────────────────────────────────────────────────────────────
// uploader.js — Drag-and-drop file upload area  (doc §6.4)
//
// Initialises the .dragAndDropUploader container with drag-and-drop and
// click-to-browse behaviour. File-type and size validation are delegated to
// kml.parseFiles() — no validation is performed here.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";
    var Uploader = function () {
        var dragAndDropArea = null,
            defaultClass = null;

        return {
            /**
             * Registers drag-and-drop and click-to-select event handlers on the
             * upload area. Called once from kml.initVariables().
             */
            init: function () {
                dragAndDropArea = kml.args.container.getElementsByClassName("dragAndDropUploader")[0];
                defaultClass = dragAndDropArea.className;
                var inputFile = dragAndDropArea.getElementsByTagName("input")[0];

                // Intentional clear on drag-enter: any previous parse result is
                // discarded before the user drops a new file. This prevents stale
                // rows from a prior upload coexisting with the new parse output.
                dragAndDropArea.ondragover = function () {
                    angular.injector(["ng", "importKMLZones"]).get("clearService").clear();
                    dragAndDropArea.className = defaultClass + " hoverArea";
                    return false;
                };
                dragAndDropArea.ondragleave = function () {
                    dragAndDropArea.className = defaultClass;
                    return false;
                };
                dragAndDropArea.ondrop = function (event) {
                    event.preventDefault();
                    dragAndDropArea.className = defaultClass;

                    var files = event.dataTransfer.files;
                    kml.parseFiles(files);
                };
                // Programmatic click on the hidden file input (width: 0; height: 0;
                // overflow: hidden in CSS). Sizing the input to 0×0 prevents the
                // browser from firing a second file-picker dialog when the click
                // event propagates from the container down to the input element.
                dragAndDropArea.onclick = function () {
                    inputFile.click();
                };
            },
            clear: function () {
                dragAndDropArea.className = defaultClass;
            }
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = Uploader;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return Uploader; });
    } else {
        globals.Uploader = Uploader;
    }
}());

// ─────────────────────────────────────────────────────────────────────────────
// waiting.js — Import progress overlay  (doc §6.7)
//
// Controls the #waiting full-screen overlay (shown during file parsing) and
// the #importProgress bar (shown during API batch calls). Uses spin.js to
// render a centred spinner. Exposed as kml.waiting and called from
// kml.saveZones() during each multiCall batch.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    "use strict";
    var Waiting = function () {
        var waitingElement = kml.args.container.querySelector("#waiting"),
            // ─────────────────────────────────────────────────────────────────
            // spin.js configuration — visual appearance of the overlay spinner
            // ─────────────────────────────────────────────────────────────────
            opts = {
                lines: 13 // The number of lines to draw
                , length: 24 // The length of each line
                , width: 14 // The line thickness
                , radius: 42 // The radius of the inner circle
                , scale: 1 // Scales overall size of the spinner
                , corners: 1 // Corner roundness (0..1)
                , color: "#000" // #rgb or #rrggbb or array of colors
                , opacity: 0.25 // Opacity of the lines
                , rotate: 0 // The rotation offset
                , direction: 1 // 1: clockwise, -1: counterclockwise
                , speed: 1 // Rounds per second
                , trail: 60 // Afterglow percentage
                , fps: 20 // Frames per second when using setTimeout() as a fallback for CSS
                , zIndex: 2e9 // The z-index (defaults to 2000000000)
                , className: "spinner" // The CSS class to assign to the spinner
                , top: "50%" // Top position relative to parent
                , left: "50%" // Left position relative to parent
                , shadow: false // Whether to render a shadow
                , hwaccel: false // Whether to use hardware acceleration
                , position: "absolute" // Element positioning
            },
            target = waitingElement,
            spinner = new Spinner(opts),
            progressBarContainer = kml.args.container.querySelector("#progressContainer"),
            progressBar = kml.args.container.querySelector("#importProgress");
        return {
            // ─────────────────────────────────────────────────────────────────
            // Overlay spinner — shown during file parsing
            // ─────────────────────────────────────────────────────────────────
            show: function () {
                waitingElement.style.display = "";
                spinner.spin(target);
            },
            hide: function () {
                waitingElement.style.display = "none";
                spinner.stop();
            },

            // ─────────────────────────────────────────────────────────────────
            // Progress bar — shown during API import batch calls
            // ─────────────────────────────────────────────────────────────────
            showProgressBar: function () {
                progressBarContainer.style.display = "";
                kml.args.container.style.overflow = "hidden";
                kml.args.container.style.height = "100%";
                progressBar.value = "0";
            },
            // The 400 ms delay intentionally keeps the bar visible at 100% for
            // a moment after the last batch completes, giving the user visual
            // confirmation that the import finished before the bar disappears.
            hideProgressBar: function () {
                setTimeout(function () {
                    if (progressBarContainer) {
                        progressBarContainer.style.display = "none";
                        kml.args.container.style.overflow = "";
                        kml.args.container.style.height = "auto";
                    }
                }, 400);
            },
            // Caller is responsible for ensuring cumulative values do not exceed
            // 100 — the <progress> element clamps visually but does not throw.
            // saveZones() computes each increment as (batchSize / totalZones) * 100.
            updateProgressBar: function (value) {
                if (progressBar) {
                    progressBar.value += value;
                }
            }
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UMD export — CommonJS / AMD / browser global
    // ─────────────────────────────────────────────────────────────────────────
    let globals = (function () { return this || (0, eval)("this"); }());

    if (typeof module !== "undefined" && module.exports) {
        module.exports = Waiting;
    } else if (typeof define === "function" && define.amd) {
        define(function () { return Waiting; });
    } else {
        globals.Waiting = Waiting;
    }
}());
