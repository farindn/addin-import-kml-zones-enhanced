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
