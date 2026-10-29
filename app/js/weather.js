/* Weather from Open-Meteo (free, no API key). City name -> coordinates via
   its geocoding API, then current + 7-day forecast. The last good result is
   cached so the panel still shows something while the network is down. */
(function () {
    "use strict";

    var CACHE_KEY = "homedock.weather";
    var REFRESH_MS = 30 * 60 * 1000;
    var timer = null;

    function get(url, ok, fail) {
        var x = new XMLHttpRequest();
        x.open("GET", url, true);
        x.timeout = 15000;
        x.onload = function () {
            if (x.status !== 200) { fail(); return; }
            try { ok(JSON.parse(x.responseText)); } catch (e) { fail(); }
        };
        x.onerror = x.ontimeout = fail;
        x.send();
    }

    // ---- Icons (inline SVG, white) ----
    var SUN = '<circle cx="24" cy="24" r="8" fill="#ffd54a"/><g stroke="#ffd54a" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/></g>';
    var CLOUD = '<path d="M15 36h19a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 2 13z" fill="#e8ecf0"/>';
    var SMALL_SUN = '<circle cx="17" cy="17" r="7" fill="#ffd54a"/>';
    function drops(color) { return '<g stroke="' + color + '" stroke-width="3" stroke-linecap="round"><path d="M17 40l-2 5M25 40l-2 5M33 40l-2 5"/></g>'; }
    var FLAKES = '<g fill="#fff"><circle cx="16" cy="43" r="2.4"/><circle cx="24" cy="45" r="2.4"/><circle cx="32" cy="43" r="2.4"/></g>';
    var BOLT = '<path d="M25 37l-5 8h5l-3 6 8-10h-5l3-4z" fill="#ffd54a"/>';
    var FOG = '<g stroke="#e8ecf0" stroke-width="3" stroke-linecap="round"><path d="M9 20h30M6 27h36M11 34h26"/></g>';

    function icon(code, size) {
        var body;
        if (code === 0) body = SUN;
        else if (code <= 2) body = SMALL_SUN + CLOUD;
        else if (code === 3) body = CLOUD;
        else if (code === 45 || code === 48) body = FOG;
        else if (code >= 71 && code <= 77 || code === 85 || code === 86) body = CLOUD + FLAKES;
        else if (code >= 95) body = CLOUD + BOLT;
        else body = CLOUD + drops("#8ec5ff");
        return '<svg viewBox="0 0 48 52" width="' + size + '" height="' + size + '">' + body + '</svg>';
    }

    function render(w) {
        var t = window.I18N;
        var nowEl = document.getElementById("now");
        var fc = document.getElementById("forecast");
        if (!w) { nowEl.textContent = ""; fc.className = "glass"; return; }

        var d = w.daily;
        nowEl.innerHTML =
            '<span style="vertical-align:-10px;margin-right:10px">' + icon(w.current.weather_code, 50) + '</span>' +
            '<b>' + Math.round(w.current.temperature_2m) + '°</b>' +
            t.weather(w.current.weather_code) +
            '<span class="hl">' + t.t("hi") + ' ' + Math.round(d.temperature_2m_max[0]) + '°  ' +
            t.t("lo") + ' ' + Math.round(d.temperature_2m_min[0]) + '°</span>';

        var html = '<div class="days">';
        for (var i = 0; i < d.time.length && i < 7; i++) {
            var day = new Date(d.time[i] + "T12:00:00");
            var pp = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
            html += '<div class="day">' +
                '<div class="dn">' + day.toLocaleDateString(t.locale, { weekday: "short" }) + '</div>' +
                '<div class="ic">' + icon(d.weather_code[i], 46) + '</div>' +
                '<div class="hi">' + Math.round(d.temperature_2m_max[i]) + '°</div>' +
                '<div class="lo">' + Math.round(d.temperature_2m_min[i]) + '°</div>' +
                '<div class="pp">' + (pp === null || pp === undefined ? "" : pp + '%') + '</div>' +
                '</div>';
        }
        html += '</div><div class="foot"><span>' + escapeHtml(w.place) + '</span><span>' + t.t("weatherCredit") + '</span></div>';
        fc.innerHTML = html;
        fc.className = "glass on";
    }

    function escapeHtml(s) {
        return String(s || "").replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    function fetchForecast(loc, done) {
        var url = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lon +
            "&current=temperature_2m,weather_code" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            "&timezone=auto&forecast_days=7";
        get(url, function (j) {
            j.place = loc.name;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch (e) {}
            render(j);
            done && done(true);
        }, function () { done && done(false); });
    }

    // Resolves a city name once and remembers the coordinates in settings.
    function geocode(city, ok, fail) {
        var url = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=" + window.I18N.lang +
            "&name=" + encodeURIComponent(city);
        get(url, function (j) {
            var r = j.results && j.results[0];
            if (!r) { fail(); return; }
            ok({ name: r.name, lat: r.latitude, lon: r.longitude });
        }, fail);
    }

    window.Weather = {
        start: function (settings, onNeedLocation) {
            var cached = null;
            try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
            if (cached && settings.loc && cached.place === settings.loc.name) render(cached);
            else render(null);

            clearInterval(timer);
            if (!settings.loc) { onNeedLocation(); return; }
            fetchForecast(settings.loc);
            timer = setInterval(function () { fetchForecast(settings.loc); }, REFRESH_MS);
        },
        geocode: geocode
    };
})();
