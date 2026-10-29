/* Weather from Open-Meteo (free, no API key). City name -> coordinates via
   its geocoding API, then current conditions, an hourly strip and a 7-day
   forecast. The last good result is cached so the panel still shows something
   while the network is down.

   What is drawn is controlled by the launcher's settings (settings.show.now /
   .details / .hourly / .forecast and settings.units); the elements themselves
   are shown/hidden by applyDisplay() in app.js. */
(function () {
    "use strict";

    var CACHE_KEY = "homedock.weather";
    var REFRESH_MS = 30 * 60 * 1000;
    var timer = null;
    var cfg = { loc: null, units: "metric" };
    var last = null;

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

    // ---- Weather icons (inline SVG, white) ----
    var SUN = '<circle cx="24" cy="24" r="8" fill="#ffd54a"/><g stroke="#ffd54a" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/></g>';
    var CLOUD = '<path d="M15 36h19a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 2 13z" fill="#e8ecf0"/>';
    var SMALL_SUN = '<circle cx="17" cy="17" r="7" fill="#ffd54a"/>';
    function drops(color) { return '<g stroke="' + color + '" stroke-width="3" stroke-linecap="round"><path d="M17 40l-2 5M25 40l-2 5M33 40l-2 5"/></g>'; }
    var FLAKES = '<g fill="#fff"><circle cx="16" cy="43" r="2.4"/><circle cx="24" cy="45" r="2.4"/><circle cx="32" cy="45" r="2.4"/></g>';
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

    // ---- Small glyphs for the details line ----
    var G = {
        wind: '<svg viewBox="0 0 24 24" width="26" height="26"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/></g></svg>',
        drop: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
        up:   '<svg viewBox="0 0 24 24" width="26" height="26"><g fill="none" stroke="#ffd54a" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="15" r="4"/><path d="M12 4v3M5 9l1.5 1.5M19 9l-1.5 1.5M3 20h18M12 4l-2.5 2.5M12 4l2.5 2.5"/></g></svg>',
        down: '<svg viewBox="0 0 24 24" width="26" height="26"><g fill="none" stroke="#ffb14a" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="15" r="4"/><path d="M12 7V4M5 9l1.5 1.5M19 9l-1.5 1.5M3 20h18M9.5 4.5L12 7l2.5-2.5"/></g></svg>'
    };

    function hhmm(iso, locale) {
        var d = new Date(iso);
        return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    }

    function render(w) {
        var t = window.I18N;
        var nowEl = document.getElementById("now");
        var exEl = document.getElementById("wxextra");
        var hrEl = document.getElementById("hourly");
        var fc = document.getElementById("forecast");
        if (!w) { nowEl.textContent = ""; exEl.innerHTML = ""; hrEl.className = "glass"; fc.className = "glass"; return; }

        var windUnit = cfg.units === "imperial" ? "mph" : "km/h";
        var c = w.current, d = w.daily;

        // One-liner
        nowEl.innerHTML =
            '<span style="vertical-align:-10px;margin-right:10px">' + icon(c.weather_code, 50) + '</span>' +
            '<b>' + Math.round(c.temperature_2m) + '°</b>' +
            t.weather(c.weather_code) +
            '<span class="hl">' + t.t("hi") + ' ' + Math.round(d.temperature_2m_max[0]) + '°  ' +
            t.t("lo") + ' ' + Math.round(d.temperature_2m_min[0]) + '°</span>';

        // Details line: wind, humidity, sunrise, sunset
        var parts = [];
        if (c.wind_speed_10m !== undefined) parts.push(G.wind + Math.round(c.wind_speed_10m) + ' ' + windUnit);
        if (c.relative_humidity_2m !== undefined) parts.push(G.drop + Math.round(c.relative_humidity_2m) + '%');
        if (d.sunrise) parts.push(G.up + hhmm(d.sunrise[0], t.locale));
        if (d.sunset) parts.push(G.down + hhmm(d.sunset[0], t.locale));
        exEl.innerHTML = parts.join('<span class="sep">·</span>');

        // Hourly strip: from the current hour, next 10 hours
        if (w.hourly && w.hourly.time) {
            var h = w.hourly, nowMs = Date.now(), start = 0;
            for (var k = 0; k < h.time.length; k++) {
                if (new Date(h.time[k]).getTime() >= nowMs - 3600000) { start = k; break; }
            }
            var hh = '<div class="hrs">';
            for (var j = start; j < start + 8 && j < h.time.length; j++) {
                hh += '<div class="hr">' +
                    '<div class="ht">' + hhmm(h.time[j], t.locale) + '</div>' +
                    '<div class="hi">' + icon(h.weather_code[j], 38) + '</div>' +
                    '<div class="hd">' + Math.round(h.temperature_2m[j]) + '°</div>' +
                    '</div>';
            }
            hh += '</div>';
            hrEl.innerHTML = hh;
            hrEl.className = "glass on";
        } else {
            hrEl.className = "glass";
        }

        // 7-day forecast
        var html = '<div class="days">';
        for (var i = 0; i < d.time.length && i < 7; i++) {
            var day = new Date(d.time[i] + "T12:00:00");
            var pp = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
            html += '<div class="day">' +
                '<div class="dn">' + day.toLocaleDateString(t.locale, { weekday: "short" }) + '</div>' +
                '<div class="ic">' + icon(d.weather_code[i], 42) + '</div>' +
                '<div class="t2"><span class="hi">' + Math.round(d.temperature_2m_max[i]) + '°</span> ' +
                '<span class="lo">' + Math.round(d.temperature_2m_min[i]) + '°</span></div>' +
                '<div class="pp">' + (pp === null || pp === undefined ? "" : pp + '%') + '</div>' +
                '</div>';
        }
        html += '</div><div class="foot"><span>' + escapeHtml(w.place) + '</span><span>' + t.t("weatherCredit") + '</span></div>';
        fc.innerHTML = html;
        fc.className = "glass on";
    }

    function escapeHtml(s) {
        return String(s || "").replace(/[&<>"]/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
        });
    }

    function fetchForecast(loc, done) {
        var imperial = cfg.units === "imperial";
        var url = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lon +
            "&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m" +
            "&hourly=temperature_2m,weather_code" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
            "&timezone=auto&forecast_days=7&forecast_hours=24" +
            (imperial ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "");
        get(url, function (j) {
            j.place = loc.name;
            j.units = cfg.units;
            last = j;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch (e) {}
            render(j);
            done && done(true);
        }, function () { done && done(false); });
    }

    function geocode(city, ok, fail) {
        var url = "https://geocoding-api.open-meteo.com/v1/search?count=6&language=" + window.I18N.lang +
            "&name=" + encodeURIComponent(city);
        get(url, function (j) {
            var list = [];
            var rs = j.results || [];
            for (var i = 0; i < rs.length; i++) {
                var r = rs[i];
                var where = [r.admin1, r.country].filter(function (x) { return x; }).join(", ");
                list.push({ name: r.name, label: r.name + (where ? ", " + where : ""), lat: r.latitude, lon: r.longitude });
            }
            if (!list.length) { fail(); return; }
            ok(list);
        }, fail);
    }

    function readCfg(settings) {
        cfg.loc = settings.loc || null;
        cfg.units = settings.units === "imperial" ? "imperial" : "metric";
    }

    window.Weather = {
        start: function (settings, onNeedLocation) {
            readCfg(settings);
            var cached = null;
            try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
            if (cached && cfg.loc && cached.place === cfg.loc.name) { last = cached; render(cached); }
            else render(null);

            clearInterval(timer);
            if (!cfg.loc) { onNeedLocation(); return; }
            fetchForecast(cfg.loc);
            timer = setInterval(function () { fetchForecast(cfg.loc); }, REFRESH_MS);
        },
        // Re-apply after a weather setting changed: re-fetch if the unit changed
        // (the API returns the chosen unit), otherwise just redraw the cache.
        refresh: function (settings) {
            var prevUnits = cfg.units;
            readCfg(settings);
            if (!cfg.loc) { render(null); return; }
            if (cfg.units !== prevUnits || !last) fetchForecast(cfg.loc);
            else render(last);
        },
        geocode: geocode
    };
})();
