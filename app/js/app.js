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

    // Samsung's own apps worth offering in the picker. Every other system id
    // (org.tizen.*, com.samsung.*) is internal, even when marked visible.
    var SYSTEM_APPS = {
        "com.samsung.tv.cobalt-yt": "YouTube",
        "com.samsung.tv.cobalt-ytkids": "YouTube Kids",
        "org.tizen.netflix-app": "Netflix",
        "org.tizen.browser": "Internet"
    };
    // Bundled artwork for apps whose own icon the TV does not hand out.
    var ICON_OVERRIDE = {
        "com.samsung.tv.cobalt-yt": "img/youtube.svg",
        "com.samsung.tv.cobalt-ytkids": "img/youtube.svg"
    };
    // Store and sideloaded apps have ids like "Jz7aUrV2Q4.Twitch". These
    // suffixes are their background helpers, and 30IKH0OX8U is Samsung's
    // Aria video framework.
    var HIDDEN_SUFFIX = /(service|extension|weblauncher|cmswebapp|otapp|devicemanager)$/i;
    var HIDDEN_PKG = { "30IKH0OX8U": true };

    var WALL_MS = 45000;
    var LONG_PRESS_MS = 700;
    var TILE = 170, TILE_STEP = 198;       // tile width, and width + 2 x 14px margin
    var DOCK_INSET = 23;                   // #dock padding-left + border
    var PICK_COLS = 7, PICK_ROW_H = 250;

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, RED: 403,
                IME_DONE: 65376, IME_CANCEL: 65385 };

    var t = window.I18N;
    var $ = function (id) { return document.getElementById(id); };

    var dock = [];          // [{id, name, icon}]
    var focus = 0;          // index into dock; dock.length = the "+" tile
    var mode = "dock";      // dock | move | menu | picker | settings | choice
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
    function describe(a) {
        return { id: a.id, name: SYSTEM_APPS[a.id] || a.name, icon: ICON_OVERRIDE[a.id] || iconUrl(a.iconPath) };
    }
    function appInfo(id) {
        try { return describe(tizen.application.getAppInfo(id)); }
        catch (e) { return null; }    // not installed (or no tizen API in a desktop browser)
    }
    function isPickable(a) {
        if (!a.show || a.id === SELF_ID) return false;
        if (SYSTEM_APPS[a.id]) return true;
        var m = /^([A-Za-z0-9]{10})\.(.+)$/.exec(a.id);
        return !!m && !HIDDEN_PKG[m[1]] && !HIDDEN_SUFFIX.test(m[2]);
    }

    function tileEl(app) {
        var el = document.createElement("div");
        el.className = "tile";
        var fb = document.createElement("div");
        fb.className = "fb";
        fb.textContent = app.name;
        el.appendChild(fb);
        if (app.icon) {
            var img = new Image();
            img.onload = function () {
                var ratio = img.naturalWidth / img.naturalHeight;
                if (Math.abs(ratio - 1) < 0.08) {
                    img.className = "fill";
                } else {
                    var blur = document.createElement("div");
                    blur.className = "blur";
                    blur.style.backgroundImage = "url('" + app.icon + "')";
                    el.appendChild(blur);
                    img.className = "fit";
                }
                fb.style.display = "none";
                el.appendChild(img);
            };
            img.src = app.icon;
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
        for (var k = 0; k < tiles.length; k++) {
            tiles[k].className = tiles[k].className.replace(/ (focus|moving)/g, "");
        }
        focus = i;
        tiles[i].className += " focus" + (mode === "move" ? " moving" : "");

        // Positions come from the fixed tile spacing rather than offsetLeft,
        // which on this engine is measured from the transformed strip.
        var dockEl = $("dock");
        var view = dockEl.clientWidth - 44;
        var total = tiles.length * TILE_STEP;
        var center = i * TILE_STEP + (TILE_STEP - TILE) / 2 + TILE / 2;
        var shift = total > view ? Math.max(0, Math.min(center - view / 2, total - view)) : 0;
        $("strip").style.transform = "translateX(" + (-shift) + "px)";

        var label = $("label");
        var name = i === dock.length ? t.t("addShortcut") : dock[i].name;
        label.textContent = mode === "move" ? "◀  " + name + "  ▶" : name;
        label.style.left = (dockEl.offsetLeft + DOCK_INSET + center - shift) + "px";
    }

    function launch(app) {
        toast(t.t("opening", app.name));
        try {
            tizen.application.launch(app.id, function () {}, function () { toast(t.t("notAvailable", app.name)); });
        } catch (e) {
            toast(t.t("notAvailable", app.name));
        }
    }

    // ---------- hold-OK menu: move / remove ----------
    var MENU = ["move", "remove", "cancel"];
    var menuFocus = 0;

    function openMenu() {
        if (focus >= dock.length) return;
        mode = "menu";
        $("menuTitle").textContent = dock[focus].name;
        var list = $("menuList");
        list.innerHTML = "";
        for (var i = 0; i < MENU.length; i++) {
            var row = document.createElement("div");
            row.className = "opt";
            row.textContent = t.t(MENU[i]);
            list.appendChild(row);
        }
        $("menu").className = "overlay on";
        setMenuFocus(0);
    }
    function setMenuFocus(i) {
        var rows = $("menuList").children;
        menuFocus = Math.max(0, Math.min(rows.length - 1, i));
        for (var k = 0; k < rows.length; k++) rows[k].className = "opt" + (k === menuFocus ? " focus" : "");
    }
    function menuChosen() {
        var action = MENU[menuFocus];
        closeOverlay();
        if (action === "move") {
            mode = "move";
            setFocus(focus);
            toast(t.t("moveHint"));
        } else if (action === "remove") {
            var gone = dock.splice(focus, 1)[0];
            saveDock();
            renderDock();
            toast(t.t("removed", gone.name));
        }
    }

    function moveBy(d) {
        var j = focus + d;
        if (j < 0 || j >= dock.length) return;
        var a = dock[focus];
        dock[focus] = dock[j];
        dock[j] = a;
        focus = j;
        saveDock();
        renderDock();
    }
    function endMove() {
        mode = "dock";
        setFocus(focus);
    }

    // ---------- app picker ----------
    var picks = [], pickFocus = 0;

    function openPicker() {
        mode = "picker";
        $("picker").className = "overlay on";
        var grid = $("pickGrid");
        grid.innerHTML = "";
        picks = [];
        var done = function (list) {
            for (var i = 0; i < list.length; i++) {
                if (isPickable(list[i])) picks.push(describe(list[i]));
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
            pickFocus = 0;
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

    // ---------- generic list picker ----------
    var choice = null, choiceFocus = 0;

    // items: [{label, value}]; onBack runs on the Back key.
    function openChoice(title, items, cols, onPick, onBack) {
        $("settings").className = "overlay";
        mode = "choice";
        choice = { items: items, cols: cols, onPick: onPick, onBack: onBack };
        $("choiceTitle").textContent = title;
        var grid = $("choiceGrid");
        grid.innerHTML = "";
        var w = Math.floor(1660 / cols) - 16;
        for (var i = 0; i < items.length; i++) {
            var el = document.createElement("div");
            el.className = "opt";
            el.style.width = w + "px";
            el.textContent = items[i].label;
            grid.appendChild(el);
        }
        $("choice").className = "overlay on";
        choiceFocus = 0;
        setChoiceFocus(0);
    }
    function setChoiceFocus(i) {
        var els = $("choiceGrid").children;
        if (!els.length) return;
        i = Math.max(0, Math.min(els.length - 1, i));
        if (els[choiceFocus]) els[choiceFocus].className = "opt";
        choiceFocus = i;
        els[i].className = "opt focus";
        var rowH = els[0].offsetHeight + 14;
        var row = Math.floor(i / choice.cols);
        $("choiceGrid").style.transform = "translateY(" + (-Math.max(0, row - 4) * rowH) + "px)";
    }

    // ---------- weather location ----------
    function useLocation(city, place) {
        settings.city = city;
        settings.loc = { name: place.name, lat: place.lat, lon: place.lon };
        save(SETTINGS_KEY, settings);
        Weather.start(settings, noLocation);
        toast(t.t("locationSet", place.name));
    }
    function sortLabels(a, b) { return a.label.localeCompare(b.label, t.locale); }

    function chooseCountry() {
        var P = window.PLACES || {};
        var items = ["DE", "AT", "CH"].filter(function (c) { return P[c]; })
            .map(function (c) { return { label: t.t("country_" + c), value: c }; });
        openChoice(t.t("chooseCountry"), items, 3, function (it) { chooseState(it.value); }, openSettings);
    }
    function chooseState(cc) {
        var items = Object.keys(window.PLACES[cc]).map(function (s) { return { label: s, value: s }; }).sort(sortLabels);
        openChoice(t.t("country_" + cc) + "  ›  " + t.t("chooseState"), items, 4,
            function (it) { chooseLetter(cc, it.value); }, chooseCountry);
    }
    function chooseLetter(cc, st) {
        var list = window.PLACES[cc][st];
        if (list.length <= 48) { chooseTown(cc, st, null); return; }
        var seen = {}, items = [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i][0].charAt(0).toUpperCase();
            if (!seen[c]) { seen[c] = true; items.push({ label: c, value: c }); }
        }
        items.sort(sortLabels);
        openChoice(st + "  ›  " + t.t("chooseLetter"), items, 9,
            function (it) { chooseTown(cc, st, it.value); }, function () { chooseState(cc); });
    }
    function chooseTown(cc, st, letter) {
        var items = window.PLACES[cc][st]
            .filter(function (p) { return !letter || p[0].charAt(0).toUpperCase() === letter; })
            .map(function (p) { return { label: p[0], value: p }; });
        openChoice(st + (letter ? "  ›  " + letter : "") + "  ›  " + t.t("chooseTown"), items, 4,
            function (it) {
                closeOverlay();
                useLocation(it.value[0], { name: it.value[0], lat: it.value[1], lon: it.value[2] });
            },
            function () { if (letter) chooseLetter(cc, st); else chooseState(cc); });
    }

    // ---------- settings ----------
    var SET_ITEMS = ["btnLoc", "setCity", "setName", "btnSave", "btnClose"];
    var setFocusIdx = 0;

    function openSettings() {
        $("choice").className = "overlay";
        mode = "settings";
        $("btnLoc").textContent = (settings.loc ? settings.loc.name : t.t("locationNone")) + "  ›";
        $("setCity").value = "";
        $("setName").value = settings.name || "";
        $("settings").className = "overlay on";
        focusSetting(0);
    }
    function focusSetting(i) {
        setFocusIdx = i;
        for (var k = 0; k < SET_ITEMS.length; k++) {
            var el = $(SET_ITEMS[k]);
            var base = el.getAttribute("data-base") || (el.tagName === "INPUT" ? "" : "btn");
            el.className = (base + (k === i ? " focus" : "")).replace(/^\s+/, "");
        }
    }
    function settingsChosen() {
        var id = SET_ITEMS[setFocusIdx];
        if (id === "btnLoc") { chooseCountry(); return; }
        if (id === "setCity" || id === "setName") { $(id).focus(); return; }   // opens the TV keyboard
        if (id === "btnClose") { closeOverlay(); return; }

        settings.name = $("setName").value.replace(/^\s+|\s+$/g, "");
        save(SETTINGS_KEY, settings);
        applyName();
        closeOverlay();

        var city = $("setCity").value.replace(/^\s+|\s+$/g, "");
        if (!city) return;
        Weather.geocode(city, function (list) {
            if (list.length === 1) { useLocation(city, list[0]); return; }
            var items = list.map(function (p) { return { label: p.label, value: p }; });
            openChoice(t.t("chooseLocation"), items, 1, function (it) {
                closeOverlay();
                useLocation(city, it.value);
            }, closeOverlay);
        }, function () { toast(t.t("locNotFound", city)); });
    }
    function applyName() { $("brandName").textContent = settings.name || "HomeDock"; }
    function noLocation() { $("now").textContent = t.t("noLocation"); }

    function closeOverlay() {
        mode = "dock";
        var ids = ["picker", "menu", "settings", "choice"];
        for (var i = 0; i < ids.length; i++) $(ids[i]).className = "overlay";
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        setFocus(focus);
    }

    // ---------- toast / clock / wallpapers ----------
    var toastTimer;
    function toast(msg) {
        var el = $("toast");
        el.textContent = msg;
        el.className = "on";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = ""; }, 3000);
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
    // OK acts on key *up*, so holding it can become a long press (menu)
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
                okTimer = setTimeout(function () { okLong = true; openMenu(); }, LONG_PRESS_MS);
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
        } else if (mode === "move") {
            if (k === KEY.LEFT) moveBy(-1);
            else if (k === KEY.RIGHT) moveBy(1);
            else if (k === KEY.BACK) endMove();
            else handled = false;
        } else if (mode === "menu") {
            if (k === KEY.UP) setMenuFocus(menuFocus - 1);
            else if (k === KEY.DOWN) setMenuFocus(menuFocus + 1);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "picker") {
            if (k === KEY.LEFT) setPickFocus(pickFocus - 1);
            else if (k === KEY.RIGHT) setPickFocus(pickFocus + 1);
            else if (k === KEY.UP) setPickFocus(pickFocus - PICK_COLS);
            else if (k === KEY.DOWN) setPickFocus(pickFocus + PICK_COLS);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "settings") {
            if (k === KEY.UP) focusSetting(setFocusIdx >= 3 ? 2 : Math.max(0, setFocusIdx - 1));
            else if (k === KEY.DOWN) focusSetting(setFocusIdx >= 3 ? setFocusIdx : setFocusIdx + 1);
            else if (k === KEY.LEFT && setFocusIdx === 4) focusSetting(3);
            else if (k === KEY.RIGHT && setFocusIdx === 3) focusSetting(4);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "choice") {
            if (k === KEY.LEFT) setChoiceFocus(choiceFocus - 1);
            else if (k === KEY.RIGHT) setChoiceFocus(choiceFocus + 1);
            else if (k === KEY.UP) setChoiceFocus(choiceFocus - choice.cols);
            else if (k === KEY.DOWN) setChoiceFocus(choiceFocus + choice.cols);
            else if (k === KEY.BACK) choice.onBack();
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
        } else if (mode === "move") endMove();
        else if (mode === "menu") menuChosen();
        else if (mode === "picker") pickChosen();
        else if (mode === "settings") settingsChosen();
        else if (mode === "choice") choice.onPick(choice.items[choiceFocus]);
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
