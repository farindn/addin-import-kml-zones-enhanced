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
                transclude: true // modal content comes from parent scope
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
