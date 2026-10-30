/* Photo-frame screensaver. After the TV has been idle for the configured time,
   it fills the screen with the bundled wallpapers, slowly crossfading, with a
   small clock, and hides the rest of the UI. Any key returns to the launcher.
   Good against burn-in on a static home screen. */
(function () {
    "use strict";

    var cfg = { on: false, min: 5 };
    var idleTimer = null, slideTimer = null, clockTimer = null;
    var active = false, walls = [], idx = 0, layer = 0;

    function $(id) { return document.getElementById(id); }

    function show(i) {
        var w = walls[i];
        var next = $(layer ? "svA" : "svB"), cur = $(layer ? "svB" : "svA");
        var img = new Image();
        img.onload = function () {
            next.style.backgroundImage = "url('assets/wallpapers/" + w + "')";
            next.className = "sbg show";
            cur.className = "sbg";
            layer = 1 - layer;
        };
        img.src = "assets/wallpapers/" + w;
    }

    function tickClock() {
        var d = new Date(), h = d.getHours(), m = d.getMinutes();
        $("svClock").textContent = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }

    function activate() {
        if (active || !walls.length) return;
        active = true;
        idx = Math.floor(Math.random() * walls.length);
        show(idx);
        tickClock();
        $("saver").className = "on";
        slideTimer = setInterval(function () { idx = (idx + 1) % walls.length; show(idx); }, 25000);
        clockTimer = setInterval(tickClock, 20000);
        document.addEventListener("keydown", onKey, true);   // capture, to swallow the wake key
    }

    function deactivate() {
        if (!active) return;
        active = false;
        clearInterval(slideTimer);
        clearInterval(clockTimer);
        $("saver").className = "";
        document.removeEventListener("keydown", onKey, true);
    }

    function onKey(e) {
        e.stopPropagation();
        e.preventDefault();
        deactivate();
        armIdle();
    }

    function armIdle() {
        clearTimeout(idleTimer);
        if (cfg.on && walls.length) idleTimer = setTimeout(activate, cfg.min * 60000);
    }

    window.Screensaver = {
        start: function (settings) {
            var sv = settings.screensaver || {};
            cfg.on = sv.enabled === true;
            cfg.min = sv.minutes || 5;
            walls = (window.WALLPAPERS || []).map(function (w) { return w.file; });
            deactivate();
            armIdle();
        },
        // Called on any remote key while the launcher is in front: reset the idle timer.
        poke: function () { if (!active) armIdle(); }
    };
})();
