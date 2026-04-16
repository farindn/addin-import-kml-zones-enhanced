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
