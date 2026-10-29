/* External inputs (HDMI) via tizen.systeminfo VIDEOSOURCE + tizen.tvwindow.
   Same API path arn0-tv uses; needs the tv.window privilege. All of it is
   wrapped so the launcher still runs where the APIs are absent (desktop/mock). */
(function () {
    "use strict";

    function hasApi() {
        return typeof tizen !== "undefined" && tizen.systeminfo && tizen.tvwindow;
    }

    // cb receives [{ type:"HDMI", number:1, connected:true }], HDMI only, sorted.
    function list(cb) {
        if (!hasApi()) { cb([]); return; }
        try {
            tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
                var out = [], seen = {};
                function add(arr, connected) {
                    (arr || []).forEach(function (s) {
                        if (s.type !== "HDMI") return;
                        var key = s.type + s.number;
                        if (seen[key]) return;
                        seen[key] = true;
                        out.push({ type: s.type, number: s.number, connected: connected });
                    });
                }
                add(info.connected, true);
                add(info.disconnected, false);
                out.sort(function (a, b) { return a.number - b.number; });
                cb(out);
            }, function () { cb([]); });
        } catch (e) { cb([]); }
    }

    function find(number, cb, err) {
        list(function (all) {
            for (var i = 0; i < all.length; i++) if (all[i].number === number) { cb(all[i]); return; }
            err();
        });
    }

    // Switch the TV's main window to an HDMI input and show it full screen.
    function open(number, ok, err) {
        if (!hasApi()) { err(); return; }
        find(number, function (src) {
            try {
                tizen.tvwindow.setSource({ type: src.type, number: src.number }, function () {
                    try {
                        tizen.tvwindow.show(function () { ok(); },
                            function () { err(); }, ["0px", "0px", "1920px", "1080px"], "MAIN");
                    } catch (e2) { err(); }
                }, function () { err(); }, "MAIN");
            } catch (e) { err(); }
        }, err);
    }

    function hide() {
        if (!hasApi()) return;
        try { tizen.tvwindow.hide(function () {}, function () {}, "MAIN"); } catch (e) {}
    }

    window.Sources = { available: hasApi, list: list, open: open, hide: hide };
})();
