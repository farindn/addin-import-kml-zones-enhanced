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
