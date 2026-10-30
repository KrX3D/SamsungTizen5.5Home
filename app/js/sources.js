/* External inputs via tizen.systeminfo VIDEOSOURCE + tizen.tvwindow.
   Same API path arn0-tv uses; needs the tv.window privilege. All of it is
   wrapped so the launcher still runs where the APIs are absent (desktop/mock).

   Beyond plain HDMI switching this also: reports the live-TV tuner, reads a
   connected device's name where the API exposes one (for auto-labelling), and
   can watch for a device being switched on and jump to that input. The last
   two depend on the TV's CEC support, so they are best-effort. */
(function () {
    "use strict";

    var watchTimer = null, lastConnected = null;

    function hasApi() {
        return typeof tizen !== "undefined" && tizen.systeminfo && tizen.tvwindow;
    }

    function deviceName(s) {
        return s.connectedDeviceName || s.deviceName || s.label || s.name || "";
    }

    // cb receives [{ type, number, connected, device }], TV + HDMI, sorted.
    function list(cb) {
        if (!hasApi()) { cb([]); return; }
        try {
            tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
                var out = [], seen = {};
                function add(arr, connected) {
                    (arr || []).forEach(function (s) {
                        if (s.type !== "HDMI" && s.type !== "TV") return;
                        var key = s.type + (s.number || 0);
                        if (seen[key]) return;
                        seen[key] = true;
                        out.push({ type: s.type, number: s.number || 0, connected: connected, device: deviceName(s) });
                    });
                }
                add(info.connected, true);
                add(info.disconnected, false);
                out.sort(function (a, b) {
                    if (a.type !== b.type) return a.type === "TV" ? -1 : 1;   // TV first
                    return a.number - b.number;
                });
                cb(out);
            }, function () { cb([]); });
        } catch (e) { cb([]); }
    }

    function open(type, number, ok, err) {
        if (!hasApi()) { err(); return; }
        try {
            tizen.tvwindow.setSource({ type: type, number: number }, function () {
                try {
                    tizen.tvwindow.show(function () { ok(); },
                        function () { err(); }, ["0px", "0px", "1920px", "1080px"], "MAIN");
                } catch (e2) { err(); }
            }, function () { err(); }, "MAIN");
        } catch (e) { err(); }
    }

    function hide() {
        if (!hasApi()) return;
        try { tizen.tvwindow.hide(function () {}, function () {}, "MAIN"); } catch (e) {}
    }

    // Poll for an HDMI input going disconnected -> connected (a device powered
    // on) and report its number, so the launcher can switch to it.
    function watch(enabled, onConnect) {
        clearInterval(watchTimer); watchTimer = null;
        lastConnected = null;
        if (!enabled || !hasApi()) return;
        function scan() {
            list(function (all) {
                var now = {};
                all.forEach(function (s) { if (s.type === "HDMI") now[s.number] = s.connected; });
                if (lastConnected) {
                    for (var n in now) {
                        if (now[n] && lastConnected[n] === false) { onConnect(parseInt(n, 10)); break; }
                    }
                }
                lastConnected = now;
            });
        }
        scan();
        watchTimer = setInterval(scan, 4000);
    }

    window.Sources = { available: hasApi, list: list, open: open, hide: hide, watch: watch };
})();
