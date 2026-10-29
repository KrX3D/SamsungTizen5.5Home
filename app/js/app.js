/* HomeDock - minimal Apple-TV-style launcher for Samsung Tizen TVs.
   ES5 only: the Tizen 5.0 web engine is Chromium 63. */
(function () {
    "use strict";

    var SELF_ID = "krx3dLnch1.Home";
    var APPS_KEY = "homedock.apps";
    var SETTINGS_KEY = "homedock.settings";
    var DEFAULT_APPS = [
        "krx3dTtSt1.TizenTubeStandalone",   // TizenTube
        "com.samsung.tv.cobalt-yt",         // YouTube
        "xvvl3S1bvH.TizenBrewStandalone",   // TizenBrew
        "vYmY3ACVaa.emby",                  // Emby
        "cg2m3QSB89.7tv",                   // Joyn
        "Jz7aUrV2Q4.Twitch"                 // Twitch
    ];
    var WALL_MS = 45000;
    var LONG_PRESS_MS = 700;
    var PICK_COLS = 7, PICK_ROW_H = 250;

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, RED: 403,
                IME_DONE: 65376, IME_CANCEL: 65385 };

    var t = window.I18N;
    var $ = function (id) { return document.getElementById(id); };

    var dock = [];          // [{id, name, icon}]
    var focus = 0;          // index into dock; dock.length = the "+" tile
    var mode = "dock";      // dock | picker | confirm | settings | places
    var settings = {};

    // ---------- storage ----------
    function load(key, fallback) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; }
        catch (e) { return fallback; }
    }
    function save(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }

    // ---------- app info ----------
    function iconUrl(p) {
        if (!p) return "";
        return p.charAt(0) === "/" ? "file://" + p : p;
    }
    function appInfo(id) {
        try {
            var a = tizen.application.getAppInfo(id);
            return { id: a.id, name: a.name, icon: iconUrl(a.iconPath) };
        } catch (e) {
            return null;    // not installed (or no tizen API in a desktop browser)
        }
    }

    function tileEl(app) {
        var el = document.createElement("div");
        el.className = "tile";
        var fb = document.createElement("div");
        fb.className = "fb";
        fb.textContent = app.name;
        el.appendChild(fb);
        if (app.icon) {
            var img = document.createElement("img");
            img.onload = function () { fb.style.display = "none"; };
            img.onerror = function () { el.removeChild(img); };
            img.src = app.icon;
            el.appendChild(img);
        }
        return el;
    }

    // ---------- dock ----------
    function loadDock() {
        var ids = load(APPS_KEY, DEFAULT_APPS);
        dock = [];
        for (var i = 0; i < ids.length; i++) {
            var a = appInfo(ids[i]);
            if (a) dock.push(a);
        }
    }
    function saveDock() {
        save(APPS_KEY, dock.map(function (a) { return a.id; }));
    }

    function renderDock() {
        var strip = $("strip");
        strip.innerHTML = "";
        for (var i = 0; i < dock.length; i++) strip.appendChild(tileEl(dock[i]));
        var plus = document.createElement("div");
        plus.className = "tile plus";
        plus.innerHTML = '<div class="fb">+</div>';
        strip.appendChild(plus);
        setFocus(Math.min(focus, dock.length));
    }

    function setFocus(i) {
        var tiles = $("strip").children;
        if (i < 0) i = 0;
        if (i > tiles.length - 1) i = tiles.length - 1;
        for (var k = 0; k < tiles.length; k++) tiles[k].className = tiles[k].className.replace(" focus", "");
        focus = i;
        var tile = tiles[i];
        tile.className += " focus";

        // Keep the focused tile in view when the dock is wider than the screen.
        var strip = $("strip"), dockEl = $("dock");
        var view = dockEl.clientWidth - 44;
        var center = tile.offsetLeft - strip.offsetLeft + tile.offsetWidth / 2;
        var shift = 0;
        if (strip.scrollWidth > view) {
            shift = Math.max(0, Math.min(center - view / 2, strip.scrollWidth - view));
        }
        strip.style.transform = "translateX(" + (-shift) + "px)";

        var label = $("label");
        label.textContent = i === dock.length ? t.t("addShortcut") : dock[i].name;
        label.style.left = (strip.offsetLeft + center - shift) + "px";
    }

    function launch(app) {
        toast(t.t("opening", app.name));
        try {
            tizen.application.launch(app.id, function () {}, function () { toast(t.t("notAvailable", app.name)); });
        } catch (e) {
            toast(t.t("notAvailable", app.name));
        }
    }

    // ---------- picker ----------
    var picks = [], pickFocus = 0;

    function openPicker() {
        mode = "picker";
        $("picker").className = "overlay on";
        var grid = $("pickGrid");
        grid.innerHTML = "";
        picks = [];
        var done = function (list) {
            for (var i = 0; i < list.length; i++) {
                var a = list[i];
                if (!a.show || a.id === SELF_ID) continue;
                picks.push({ id: a.id, name: a.name, icon: iconUrl(a.iconPath) });
            }
            picks.sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });
            for (var j = 0; j < picks.length; j++) {
                var wrap = document.createElement("div");
                wrap.className = "pick" + (inDock(picks[j].id) ? " added" : "");
                wrap.appendChild(tileEl(picks[j]));
                var nm = document.createElement("div");
                nm.className = "nm";
                nm.textContent = picks[j].name;
                wrap.appendChild(nm);
                grid.appendChild(wrap);
            }
            setPickFocus(0);
        };
        try { tizen.application.getAppsInfo(done, function () { done([]); }); }
        catch (e) { done([]); }
    }

    function inDock(id) {
        for (var i = 0; i < dock.length; i++) if (dock[i].id === id) return true;
        return false;
    }

    function setPickFocus(i) {
        var items = $("pickGrid").children;
        if (!items.length) return;
        if (i < 0) i = 0;
        if (i > items.length - 1) i = items.length - 1;
        var old = items[pickFocus] && items[pickFocus].querySelector(".tile");
        if (old) old.className = old.className.replace(" focus", "");
        pickFocus = i;
        items[i].querySelector(".tile").className += " focus";
        var row = Math.floor(i / PICK_COLS);
        $("pickGrid").style.transform = "translateY(" + (-Math.max(0, row - 1) * PICK_ROW_H) + "px)";
    }

    function pickChosen() {
        var p = picks[pickFocus];
        if (!p) return;
        if (!inDock(p.id)) {
            dock.push(p);
            saveDock();
            toast(t.t("added", p.name));
        }
        closeOverlay();
        renderDock();
        setFocus(dock.length - 1);
    }

    // ---------- remove confirmation ----------
    var confirmFocus = 0;

    function openConfirm() {
        if (focus >= dock.length) return;
        mode = "confirm";
        $("confirmText").textContent = t.t("removeQ", dock[focus].name);
        $("confirm").className = "overlay on";
        setConfirmFocus(0);
    }
    function setConfirmFocus(i) {
        confirmFocus = i;
        $("btnRemove").className = "btn" + (i === 0 ? " focus" : "");
        $("btnCancel").className = "btn" + (i === 1 ? " focus" : "");
    }
    function confirmChosen() {
        if (confirmFocus === 0) {
            var gone = dock.splice(focus, 1)[0];
            saveDock();
            toast(t.t("removed", gone.name));
        }
        closeOverlay();
        renderDock();
    }

    // ---------- settings ----------
    var SET_ITEMS = ["setCity", "setName", "btnSave", "btnClose"];
    var setFocusIdx = 0;

    function openSettings() {
        mode = "settings";
        $("setCity").value = settings.city || "";
        $("setName").value = settings.name || "";
        $("settings").className = "overlay on";
        focusSetting(0);
    }
    function focusSetting(i) {
        setFocusIdx = i;
        for (var k = 0; k < SET_ITEMS.length; k++) {
            var el = $(SET_ITEMS[k]);
            var base = el.tagName === "INPUT" ? "" : "btn";
            el.className = base + (k === i ? (base ? " focus" : "focus") : "");
        }
    }
    function settingsChosen() {
        var id = SET_ITEMS[setFocusIdx];
        if (id === "setCity" || id === "setName") { $(id).focus(); return; }   // opens the TV keyboard
        if (id === "btnClose") { closeOverlay(); return; }

        var city = $("setCity").value.replace(/^\s+|\s+$/g, "");
        settings.name = $("setName").value.replace(/^\s+|\s+$/g, "");
        applyName();
        if (city && (city !== settings.city || !settings.loc)) {
            Weather.geocode(city, function (list) {
                if (list.length === 1) useLocation(city, list[0]);
                else openPlaces(city, list);
            }, function () { toast(t.t("locNotFound", city)); });
        } else if (!city) {
            settings.city = "";
            settings.loc = null;
            Weather.start(settings, noLocation);
        }
        save(SETTINGS_KEY, settings);
        closeOverlay();
    }
    function useLocation(city, place) {
        settings.city = city;
        settings.loc = { name: place.name, lat: place.lat, lon: place.lon };
        save(SETTINGS_KEY, settings);
        Weather.start(settings, noLocation);
    }

    // ---------- location matches ----------
    var places = [], placeCity = "", placeFocus = 0;

    function openPlaces(city, list) {
        mode = "places";
        places = list;
        placeCity = city;
        var box = $("placeList");
        box.innerHTML = "";
        for (var i = 0; i < list.length; i++) {
            var row = document.createElement("div");
            row.className = "place";
            row.textContent = list[i].label;
            box.appendChild(row);
        }
        $("places").className = "overlay on";
        setPlaceFocus(0);
    }
    function setPlaceFocus(i) {
        var rows = $("placeList").children;
        if (i < 0) i = 0;
        if (i > rows.length - 1) i = rows.length - 1;
        placeFocus = i;
        for (var k = 0; k < rows.length; k++) rows[k].className = "place" + (k === i ? " focus" : "");
    }
    function placeChosen() {
        var p = places[placeFocus];
        closeOverlay();
        if (p) useLocation(placeCity, p);
    }

    function applyName() { $("brandName").textContent = settings.name || "HomeDock"; }
    function noLocation() { $("now").textContent = t.t("noLocation"); }

    function closeOverlay() {
        mode = "dock";
        $("picker").className = "overlay";
        $("confirm").className = "overlay";
        $("settings").className = "overlay";
        $("places").className = "overlay";
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    // ---------- toast / clock / wallpapers ----------
    var toastTimer;
    function toast(msg) {
        var el = $("toast");
        el.textContent = msg;
        el.className = "on";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = ""; }, 2500);
    }

    function tick() {
        var d = new Date(), h = d.getHours(), m = d.getMinutes();
        var mm = (m < 10 ? "0" : "") + m;
        if (t.lang === "de") {
            $("time").textContent = (h < 10 ? "0" : "") + h + ":" + mm;
        } else {
            $("time").innerHTML = ((h % 12) || 12) + ":" + mm + "<small>" + (h < 12 ? "am" : "pm") + "</small>";
        }
        $("date").textContent = d.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" });
    }

    var walls = window.WALLPAPERS || [], wallIdx = 0, layer = 0;
    function showWall(i) {
        var w = walls[i];
        var next = $(layer ? "bgA" : "bgB"), cur = $(layer ? "bgB" : "bgA");
        var img = new Image();
        img.onload = function () {
            next.style.backgroundImage = "url('assets/wallpapers/" + w.file + "')";
            next.className = "bg";
            void next.offsetWidth;          // restart the slow zoom
            next.className = "bg show";
            cur.className = "bg";
            layer = 1 - layer;
            $("credit").textContent = w.credit || "";
        };
        img.src = "assets/wallpapers/" + w.file;
    }
    function startWalls() {
        if (!walls.length) return;
        wallIdx = Math.floor(Math.random() * walls.length);
        showWall(wallIdx);
        setInterval(function () { wallIdx = (wallIdx + 1) % walls.length; showWall(wallIdx); }, WALL_MS);
    }

    // ---------- keys ----------
    // OK acts on key *up*, so holding it can become a long press (remove)
    // without the release then also launching the app.
    var okHeld = false, okLong = false, okTimer = null;

    function onKeyDown(e) {
        var k = e.keyCode;
        var typing = document.activeElement && document.activeElement.tagName === "INPUT";
        if (typing) {
            if (k === KEY.OK || k === KEY.BACK || k === KEY.IME_DONE || k === KEY.IME_CANCEL) {
                document.activeElement.blur();
                e.preventDefault();
            }
            return;
        }

        if (k === KEY.OK) {
            e.preventDefault();
            if (okHeld) return;                     // auto-repeat while held
            okHeld = true;
            okLong = false;
            if (mode === "dock" && focus < dock.length) {
                okTimer = setTimeout(function () { okLong = true; openConfirm(); }, LONG_PRESS_MS);
            }
            return;
        }

        var handled = true;
        if (mode === "dock") {
            if (k === KEY.LEFT) setFocus(focus - 1);
            else if (k === KEY.RIGHT) setFocus(focus + 1);
            else if (k === KEY.RED) openSettings();
            else if (k === KEY.BACK) { try { tizen.application.getCurrentApplication().hide(); } catch (x) {} }
            else handled = false;
        } else if (mode === "picker") {
            if (k === KEY.LEFT) setPickFocus(pickFocus - 1);
            else if (k === KEY.RIGHT) setPickFocus(pickFocus + 1);
            else if (k === KEY.UP) setPickFocus(pickFocus - PICK_COLS);
            else if (k === KEY.DOWN) setPickFocus(pickFocus + PICK_COLS);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "confirm") {
            if (k === KEY.LEFT) setConfirmFocus(0);
            else if (k === KEY.RIGHT) setConfirmFocus(1);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "settings") {
            if (k === KEY.UP) focusSetting(setFocusIdx <= 2 ? Math.max(0, setFocusIdx - 1) : 1);
            else if (k === KEY.DOWN) focusSetting(Math.min(2, setFocusIdx + 1));
            else if (k === KEY.LEFT && setFocusIdx === 3) focusSetting(2);
            else if (k === KEY.RIGHT && setFocusIdx === 2) focusSetting(3);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "places") {
            if (k === KEY.UP) setPlaceFocus(placeFocus - 1);
            else if (k === KEY.DOWN) setPlaceFocus(placeFocus + 1);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        }
        if (handled) e.preventDefault();
    }

    function onKeyUp(e) {
        if (e.keyCode !== KEY.OK || !okHeld) return;
        okHeld = false;
        clearTimeout(okTimer);
        if (okLong) return;                         // the long press already acted
        if (mode === "dock") {
            if (focus === dock.length) openPicker();
            else launch(dock[focus]);
        } else if (mode === "picker") pickChosen();
        else if (mode === "confirm") confirmChosen();
        else if (mode === "settings") settingsChosen();
        else if (mode === "places") placeChosen();
    }

    // ---------- start ----------
    window.addEventListener("load", function () {
        t.apply();
        settings = load(SETTINGS_KEY, {});
        applyName();
        loadDock();
        renderDock();
        tick();
        setInterval(tick, 10000);
        startWalls();
        Weather.start(settings, noLocation);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        try { tizen.tvinputdevice.registerKey("ColorF0Red"); } catch (x) {}
    });
})();
