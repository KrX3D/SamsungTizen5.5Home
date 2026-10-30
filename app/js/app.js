/* HomeDock - minimal Apple-TV-style launcher for Samsung Tizen TVs.
   ES5 only: the Tizen 5.0 web engine is Chromium 63. */
(function () {
    "use strict";

    var SELF_ID = "krx3dLnch1.Home";
    var SELF_PKG = "krx3dLnch1";        // our own package: .Home and the .Boot service
    var ACCENT = "#ff5a4d";             // accent (second hand etc.); made configurable later
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
    // Bundled artwork, used only when the icon the TV reports does not load
    // (the built-in YouTube's did not on a UE75RU7099).
    var ICON_FALLBACK = {
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
    // Plain-colour backgrounds that never change. Soft radial gradients with a
    // faint vignette read nicer than flat white/black. `light` picks the dark-text
    // UI theme. Order here is the order shown in the wallpaper-mode picker.
    var SOLIDS = {
        light: { light: true,  bg: "radial-gradient(130% 120% at 22% 8%, #f7f9fc 0%, #e2e9f1 45%, #c7d3e1 100%)" },
        mist:  { light: true,  bg: "radial-gradient(130% 120% at 25% 10%, #eef3f2 0%, #d3dfe0 45%, #b4c6c9 100%)" },
        sand:  { light: true,  bg: "radial-gradient(130% 120% at 25% 10%, #f6f1e8 0%, #e7dcc8 50%, #d7c6a8 100%)" },
        dark:  { light: false, bg: "radial-gradient(130% 120% at 25% 12%, #2b313c 0%, #171b22 55%, #0b0e13 100%)" },
        dusk:  { light: false, bg: "linear-gradient(160deg, #2a2440 0%, #4a2f54 45%, #9c5a52 100%)" },
        ocean: { light: false, bg: "radial-gradient(130% 120% at 25% 12%, #16384a 0%, #0f2733 55%, #081620 100%)" }
    };
    var TILE = 170, TILE_STEP = 198;       // tile width, and width + 2 x 14px margin (updated by applyAppearance)
    // Accent and focus-ring colour swatches, and font stacks, for the Appearance group.
    var SWATCHES = ["#ff5a4d", "#ff9f0a", "#ffd60a", "#34c759", "#0a84ff", "#5e5ce6", "#bf5af2", "#ffffff"];
    var FONTS = {
        "default": '"SamsungOne", "Helvetica Neue", "Segoe UI", sans-serif',
        "modern": '"Helvetica Neue", Arial, sans-serif',
        "classic": 'Georgia, "Times New Roman", serif',
        "rounded": '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
        "mono": '"Consolas", "Courier New", monospace'
    };
    var DOCK_INSET = 23;                   // #dock padding-left + border
    var PICK_COLS = 7, PICK_ROW_H = 250;

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, RED: 403,
                IME_DONE: 65376, IME_CANCEL: 65385 };

    var t = window.I18N;
    var $ = function (id) { return document.getElementById(id); };

    var dock = [];          // [{id, name, icon}]
    var focus = 0;          // index into dock; dock.length = the "+" tile
    var mode = "dock";      // dock | sources | srcmenu | rename | move | menu | picker | settings | choice
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
        return { id: a.id, name: SYSTEM_APPS[a.id] || a.name, iconPath: a.iconPath || "",
                 icon: iconUrl(a.iconPath), fallback: ICON_FALLBACK[a.id] || "" };
    }
    function appInfo(id) {
        try { return describe(tizen.application.getAppInfo(id)); }
        catch (e) { return null; }    // not installed (or no tizen API in a desktop browser)
    }
    function isPickable(a) {
        // Hide our own components (krx3dLnch1.Home and the .Boot service).
        if (!a.show || a.id.indexOf(SELF_PKG + ".") === 0) return false;
        if (SYSTEM_APPS[a.id]) return true;
        var m = /^([A-Za-z0-9]{10})\.(.+)$/.exec(a.id);
        return !!m && !HIDDEN_PKG[m[1]] && !HIDDEN_SUFFIX.test(m[2]);
    }

    // Top-left pixel as a CSS colour; "" if it is transparent (keep the dark
    // tile), null if the browser refuses to read the image's pixels.
    function edgeColor(img) {
        try {
            var c = document.createElement("canvas");
            c.width = c.height = 16;
            var ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, 16, 16);
            var d = ctx.getImageData(0, 0, 1, 1).data;
            return d[3] < 200 ? "" : "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")";
        } catch (e) {
            return null;
        }
    }

    // .tile zooms and carries the focus ring; .in clips the artwork. Kept
    // apart because the clipping mask would also hide the ring.
    function tileEl(app) {
        var outer = document.createElement("div");
        outer.className = "tile";
        var el = document.createElement("div");
        el.className = "in";
        outer.appendChild(el);
        var fb = document.createElement("div");
        fb.className = "fb";
        fb.textContent = app.name;
        el.appendChild(fb);
        var sources = [app.icon, app.fallback].filter(function (s) { return s; });
        var img = new Image();
        img.onload = function () {
            var src = img.src;
            var ratio = img.naturalWidth / img.naturalHeight;
            if (Math.abs(ratio - 1) < 0.08) {
                img.className = "fill";
            } else {
                // Fill the tile with the artwork's own corner colour. Reading
                // pixels can be refused for another app's file; only then use
                // a blurred copy, which is slow to redraw and flickered.
                var edge = edgeColor(img);
                if (edge === null) {
                    var blur = document.createElement("div");
                    blur.className = "blur";
                    blur.style.backgroundImage = "url('" + src + "')";
                    el.appendChild(blur);
                } else if (edge) {
                    el.style.background = edge;
                }
                img.className = "fit";
            }
            fb.style.display = "none";
            el.appendChild(img);
        };
        img.onerror = function () { if (sources.length) img.src = sources.shift(); };
        if (sources.length) img.src = sources.shift();
        return outer;
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
        plus.innerHTML = '<div class="in"><div class="fb">+</div></div>';
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
        // Recently-used ordering: move the launched app to the front of the dock.
        if (settings.recentOrder) {
            for (var i = 0; i < dock.length; i++) {
                if (dock[i].id === app.id) {
                    if (i > 0) { dock.unshift(dock.splice(i, 1)[0]); saveDock(); }
                    break;
                }
            }
            focus = 0;
            renderDock();
        }
    }

    // ---------- hold-OK menu: move / remove ----------
    var MENU = ["move", "remove", "cancel"];
    var menuFocus = 0;

    function openMenu() {
        if (focus >= dock.length) return;
        mode = "menu";
        $("menuTitle").textContent = dock[focus].name;
        // What the TV reports for this app, to see why an icon does not show.
        $("menuInfo").textContent = dock[focus].id + "\n" + (dock[focus].iconPath || "-");
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
        // Swap the two tiles in place. Rebuilding the dock reloaded every
        // icon and made the whole row flicker on each step.
        var strip = $("strip"), from = strip.children[focus], to = strip.children[j];
        if (d > 0) strip.insertBefore(to, from);
        else strip.insertBefore(from, to);
        focus = j;
        saveDock();
        setFocus(j);
    }
    function endMove() {
        mode = "dock";
        setFocus(focus);
    }

    // ---------- app picker ----------
    // Two tabs: 0 = Apps (store, sideloaded, a few Samsung apps), 1 = System
    // (everything else the TV marks visible). Up from the first row reaches them.
    var pickAll = [], picks = [], pickFocus = 0, pickTab = 0, onTabs = false;

    function openPicker() {
        mode = "picker";
        $("picker").className = "overlay on";
        pickAll = [];
        pickTab = 0;
        onTabs = false;
        var done = function (list) {
            for (var i = 0; i < list.length; i++) {
                if (!list[i].show || list[i].id === SELF_ID) continue;
                var d = describe(list[i]);
                d.user = isPickable(list[i]);
                pickAll.push(d);
            }
            pickAll.sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });
            renderPicks();
        };
        renderPicks();
        try { tizen.application.getAppsInfo(done, function () { done([]); }); }
        catch (e) { done([]); }
    }

    function renderPicks() {
        var tabs = $("pickTabs").children;
        for (var k = 0; k < tabs.length; k++) {
            tabs[k].className = "tab" + (k === pickTab ? " on" : "") + (onTabs && k === pickTab ? " focus" : "");
        }
        var grid = $("pickGrid");
        grid.innerHTML = "";
        picks = pickAll.filter(function (p) { return p.user === (pickTab === 0); });
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
        grid.style.transform = "";
        if (!onTabs) setPickFocus(0);
    }

    function setTabs(on, tab) {
        onTabs = on;
        if (tab !== undefined && tab !== pickTab) { pickTab = tab; renderPicks(); return; }
        var tabs = $("pickTabs").children;
        for (var k = 0; k < tabs.length; k++) {
            tabs[k].className = "tab" + (k === pickTab ? " on" : "") + (onTabs && k === pickTab ? " focus" : "");
        }
        var cur = $("pickGrid").children[pickFocus];
        if (on && cur) cur.querySelector(".tile").className = "tile";
        else if (!on) setPickFocus(pickFocus);
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
        if (onTabs) { if (picks.length) setTabs(false); return; }
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

    // items: [{label, key}]; onBack runs on the Back key; the item whose key
    // equals `selected` starts focused.
    function openChoice(title, items, cols, onPick, onBack, selected) {
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
            if (items[i].thumb) {
                el.className = "opt thumb";
                var th = document.createElement("div");
                th.className = "othumb";
                th.style.backgroundImage = "url('" + items[i].thumb + "')";
                var lb = document.createElement("div");
                lb.className = "olabel";
                lb.textContent = items[i].label;
                el.appendChild(th);
                el.appendChild(lb);
            } else if (items[i].swatch) {
                el.className = "opt swatchopt";
                el.innerHTML = '<span class="swatch big" style="background:' + items[i].swatch + '"></span>' +
                    (items[i].label ? '<span class="olabel">' + items[i].label + "</span>" : "");
            } else {
                el.textContent = items[i].label;
                if (items[i].font) el.style.fontFamily = items[i].font;   // live font preview
            }
            grid.appendChild(el);
        }
        $("choice").className = "overlay on";
        var start = 0;
        for (var j = 0; j < items.length; j++) {
            if (selected !== undefined && selected !== null && items[j].key === selected) { start = j; break; }
        }
        choiceFocus = 0;
        setChoiceFocus(start);
    }
    function setChoiceFocus(i) {
        var els = $("choiceGrid").children;
        if (!els.length) return;
        i = Math.max(0, Math.min(els.length - 1, i));
        // Keep whatever classes the item carries (e.g. "thumb"); only toggle focus.
        if (els[choiceFocus]) els[choiceFocus].className = els[choiceFocus].className.replace(" focus", "");
        choiceFocus = i;
        els[i].className += " focus";
        var rowH = els[0].offsetHeight + 14;
        var row = Math.floor(i / choice.cols);
        $("choiceGrid").style.transform = "translateY(" + (-Math.max(0, row - 4) * rowH) + "px)";
    }

    // ---------- weather location ----------
    // Browsed as country > state > district > (first letter) > place, from
    // places/index.json plus one places/<CC>/<state>.json per state, loaded on
    // demand. The last pick's path is saved so the picker reopens there.
    var SEP = "  ›  ";
    var placeIndex = null, stateCache = {};

    function useLocation(city, place) {
        settings.city = city;
        settings.loc = { name: place.name, lat: place.lat, lon: place.lon };
        save(SETTINGS_KEY, settings);
        Weather.start(settings, noLocation);
        toast(t.t("locationSet", place.name));
    }
    function sortLabels(a, b) { return a.label.localeCompare(b.label, t.locale); }

    function getJSON(url, ok) {
        var x = new XMLHttpRequest();
        x.open("GET", url, true);
        x.onload = function () {
            // Files inside the app package answer with status 0.
            if (x.status !== 200 && x.status !== 0) { toast(t.t("loadFailed")); return; }
            try { ok(JSON.parse(x.responseText)); } catch (e) { toast(t.t("loadFailed")); }
        };
        x.onerror = function () { toast(t.t("loadFailed")); };
        x.send();
    }
    function country(cc) {
        for (var i = 0; i < placeIndex.length; i++) if (placeIndex[i].cc === cc) return placeIndex[i];
        return null;
    }
    function stateName(cc, st) {
        var s = country(cc).states;
        for (var i = 0; i < s.length; i++) if (s[i].code === st) return s[i].name;
        return st;
    }
    function withState(cc, st, cb) {
        var k = cc + "/" + st;
        if (stateCache[k]) { cb(stateCache[k]); return; }
        getJSON("places/" + k + ".json", function (j) { stateCache[k] = j.g; cb(j.g); });
    }
    function groupPlaces(cc, st, g) {
        var groups = stateCache[cc + "/" + st];
        for (var i = 0; i < groups.length; i++) if (groups[i][0] === g) return groups[i][1];
        return [];
    }
    function crumb(cc, st, g) { return stateName(cc, st) + (g ? SEP + g : ""); }

    function openLocation() {
        var go = function () {
            var p = settings.locPath;
            if (p && country(p.cc)) chooseTown(p.cc, p.st, p.g, p.letter, p.label);
            else chooseCountry();
        };
        if (placeIndex) go();
        else getJSON("places/index.json", function (j) { placeIndex = j; go(); });
    }
    function chooseCountry(sel) {
        var items = placeIndex.map(function (c) { return { label: c[t.lang] || c.en, key: c.cc }; }).sort(sortLabels);
        openChoice(t.t("chooseCountry"), items, 4, function (it) { chooseState(it.key); }, openSettings, sel);
    }
    function chooseState(cc, sel) {
        var c = country(cc);
        var items = c.states.map(function (s) { return { label: s.name, key: s.code }; });
        openChoice((c[t.lang] || c.en) + SEP + t.t("chooseState"), items, 4,
            function (it) { chooseDistrict(cc, it.key); },
            function () { chooseCountry(cc); }, sel);
    }
    function chooseDistrict(cc, st, sel) {
        withState(cc, st, function (groups) {
            if (groups.length === 1) { chooseLetter(cc, st, groups[0][0]); return; }
            var items = groups.map(function (g) { return { label: g[0] || "—", key: g[0] }; });
            openChoice(stateName(cc, st) + SEP + t.t("chooseDistrict"), items, 3,
                function (it) { chooseLetter(cc, st, it.key); },
                function () { chooseState(cc, st); }, sel);
        });
    }
    function backToDistrict(cc, st, g) {
        if (stateCache[cc + "/" + st].length === 1) chooseState(cc, st);
        else chooseDistrict(cc, st, g);
    }
    function chooseLetter(cc, st, g, sel) {
        var list = groupPlaces(cc, st, g);
        if (list.length <= 48) { chooseTown(cc, st, g, null); return; }
        var seen = {}, items = [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i][0].charAt(0).toUpperCase();
            if (!seen[c]) { seen[c] = true; items.push({ label: c, key: c }); }
        }
        items.sort(sortLabels);
        openChoice(crumb(cc, st, g) + SEP + t.t("chooseLetter"), items, 9,
            function (it) { chooseTown(cc, st, g, it.key); },
            function () { backToDistrict(cc, st, g); }, sel);
    }
    function chooseTown(cc, st, g, letter, sel) {
        withState(cc, st, function () {
            var items = groupPlaces(cc, st, g)
                .filter(function (p) { return !letter || p[0].charAt(0).toUpperCase() === letter; })
                .map(function (p) { return { label: p[0], key: p[0], place: p }; });
            openChoice(crumb(cc, st, g) + (letter ? SEP + letter : "") + SEP + t.t("chooseTown"), items, 3,
                function (it) {
                    closeOverlay();
                    var name = it.place[0].split(" · ")[0];     // "Hausen · Waldbrunn" -> "Hausen"
                    settings.locPath = { cc: cc, st: st, g: g, letter: letter, label: it.place[0] };
                    useLocation(name, { name: name, lat: it.place[1], lon: it.place[2] });
                },
                function () { if (letter) chooseLetter(cc, st, g, letter); else backToDistrict(cc, st, g); }, sel);
        });
    }

    // ---------- settings ----------
    var settingRows = [], setFocusIdx = 0, focusKey = "name";

    function show() { return settings.show || (settings.show = {}); }
    function wall() { return settings.wall || (settings.wall = { mode: "rotate" }); }
    function locLabel() { return settings.loc ? settings.loc.name : t.t("locationNone"); }
    function wallPhotoLabel() {
        var f = wall().file;
        for (var i = 0; i < walls.length; i++) if (walls[i].file === f) return (walls[i].credit || f).split(" · ")[0];
        return t.t("wall_rotate");
    }

    function buildSettingsRows() {
        var s = show(), rows = [];
        rows.push({ k: "hGeneral", type: "header", label: t.t("grpGeneral") });
        rows.push({ k: "name", type: "toggle", label: t.t("showName"), on: s.name !== false });
        if (s.name !== false) rows.push({ k: "nameText", type: "text", label: t.t("tvName"), val: settings.name || "" });
        rows.push({ k: "clock", type: "toggle", label: t.t("showClock"), on: s.clock !== false });
        if (s.clock !== false) {
            var analog = settings.clockStyle === "analog";
            rows.push({ k: "clockStyle", type: "value", label: t.t("clockStyle"), val: t.t("clock_" + (analog ? "analog" : "digital")) });
            if (!analog) rows.push({ k: "clockFormat", type: "value", label: t.t("clockFormat"), val: t.t("fmt_" + (settings.clockFormat || "auto")) });
            rows.push({ k: "seconds", type: "toggle", label: t.t(analog ? "showSecondHand" : "showSeconds"), on: s.seconds === true });
        }
        rows.push({ k: "greeting", type: "toggle", label: t.t("showGreeting"), on: s.greeting === true });
        rows.push({ k: "recentOrder", type: "toggle", label: t.t("recentOrder"), on: settings.recentOrder === true });

        rows.push({ k: "hWeather", type: "header", label: t.t("grpWeather") });
        rows.push({ k: "now", type: "toggle", label: t.t("showNow"), on: s.now !== false });
        rows.push({ k: "details", type: "toggle", label: t.t("showDetails"), on: s.details !== false });
        rows.push({ k: "hourly", type: "toggle", label: t.t("showHourly"), on: s.hourly !== false });
        rows.push({ k: "forecast", type: "toggle", label: t.t("showForecast"), on: s.forecast !== false });
        rows.push({ k: "units", type: "toggle", label: t.t("useFahrenheit"), on: settings.units === "imperial" });
        if (s.now !== false || s.details !== false || s.hourly !== false || s.forecast !== false) {
            rows.push({ k: "loc", type: "value", label: t.t("location"), val: locLabel() });
            rows.push({ k: "search", type: "text", label: t.t("orSearch"), val: "" });
        }

        rows.push({ k: "hWall", type: "header", label: t.t("grpWallpaper") });
        rows.push({ k: "wallMode", type: "value", label: t.t("wallpaper"), val: wallModeLabel() });
        if (wall().mode === "single") rows.push({ k: "wallPick", type: "value", label: t.t("wallpaperPhoto"), val: wallPhotoLabel() });
        if (!SOLIDS[wall().mode]) rows.push({ k: "credit", type: "toggle", label: t.t("showCredit"), on: s.credit !== false });

        if (srcList.length) {
            rows.push({ k: "hSources", type: "header", label: t.t("grpSources") });
            rows.push({ k: "sources", type: "toggle", label: t.t("showSources"), on: s.sources !== false });
            if (hasHiddenSources()) rows.push({ k: "srcReset", type: "action", label: t.t("resetSources") });
        }

        var a = appr();
        rows.push({ k: "hLook", type: "header", label: t.t("grpAppearance") });
        rows.push({ k: "accent", type: "value", label: t.t("accent"), swatch: a.accent || "#ff5a4d" });
        rows.push({ k: "focus", type: "value", label: t.t("focusColor"), swatch: (a.focus && a.focus.charAt(0) === "#") ? a.focus : "#ffffff" });
        rows.push({ k: "font", type: "value", label: t.t("font"), val: t.t("font_" + (a.font || "default")) });
        rows.push({ k: "tileShape", type: "value", label: t.t("tileShape"), val: t.t("shape_" + (a.tile || "rounded")) });
        rows.push({ k: "tileSize", type: "slider", label: t.t("tileSize"), val: a.tileSize || 170, min: 120, max: 210, step: 10, unit: "px" });
        rows.push({ k: "wallDim", type: "slider", label: t.t("wallDim"), val: a.dim || 0, min: 0, max: 60, step: 5, unit: "%" });

        rows.push({ k: "close", type: "action", label: t.t("close") });
        return rows;
    }

    function isFocusableRow(i) { return settingRows[i] && settingRows[i].type !== "header"; }
    function focusableFrom(i, dir) {
        for (var j = i; j >= 0 && j < settingRows.length; j += dir) if (isFocusableRow(j)) return j;
        for (var k = 0; k < settingRows.length; k++) if (isFocusableRow(k)) return k;
        return 0;
    }

    function renderSettings() {
        var list = $("setList");
        list.innerHTML = "";
        settingRows = buildSettingsRows();
        settingRows.forEach(function (r) {
            if (r.type === "header") {
                var h = document.createElement("div");
                h.className = "shead";
                h.textContent = r.label;
                list.appendChild(h);
                return;
            }
            var row = document.createElement("div");
            row.className = "srow" + (r.type === "action" ? " action" : "");
            var lab = document.createElement("div");
            lab.className = "slabel";
            lab.textContent = r.label;
            row.appendChild(lab);
            var val = document.createElement("div");
            if (r.type === "toggle") { val.className = "sval toggle" + (r.on ? " on" : ""); val.innerHTML = "<i></i>"; }
            else if (r.type === "text") {
                val.className = "sval";
                var inp = document.createElement("input");
                inp.type = "text"; inp.value = r.val;
                inp.onblur = (function (key) { return function () { onInputDone(key, this.value); }; })(r.k);
                val.appendChild(inp);
            } else if (r.type === "slider") {
                val.className = "sval slider";
                var pct = Math.round((r.val - r.min) / (r.max - r.min) * 100);
                val.innerHTML = '<span class="snum">' + r.val + (r.unit || "") + '</span><span class="sbar"><i style="width:' + pct + '%"></i></span>';
            } else if (r.type === "value" && r.swatch) {
                val.className = "sval"; val.innerHTML = '<span class="swatch" style="background:' + r.swatch + '"></span>  ›';
            } else { val.className = "sval"; if (r.type === "value") val.textContent = r.val + "  ›"; }
            row.appendChild(val);
            list.appendChild(row);
        });
        var keep = -1;
        for (var i = 0; i < settingRows.length; i++) if (settingRows[i].k === focusKey) keep = i;
        setSettingFocus(keep >= 0 ? keep : focusableFrom(0, 1));
    }

    function setSettingFocus(i) {
        var rows = $("setList").children;
        if (!rows.length) return;
        i = Math.max(0, Math.min(settingRows.length - 1, i));
        if (!isFocusableRow(i)) i = focusableFrom(i, 1);
        for (var k = 0; k < rows.length; k++) rows[k].className = rows[k].className.replace(" focus", "");
        setFocusIdx = i; focusKey = settingRows[i].k;
        var el = rows[i];
        el.className += " focus";
        var view = $("setView").clientHeight;
        var sc = Math.max(0, Math.min(el.offsetTop + el.offsetHeight / 2 - view / 2, $("setList").offsetHeight - view));
        $("setList").style.transform = "translateY(" + (-sc) + "px)";
    }

    function openSettings() {
        $("choice").className = "overlay";
        mode = "settings";
        $("settings").className = "overlay on";
        renderSettings();
    }

    function flip(r) {
        var s = show();
        if (r.k === "name") s.name = s.name === false;
        else if (r.k === "clock") s.clock = s.clock === false;
        else if (r.k === "seconds") s.seconds = !s.seconds;
        else if (r.k === "greeting") s.greeting = !s.greeting;
        else if (r.k === "recentOrder") settings.recentOrder = !settings.recentOrder;
        else if (r.k === "now") s.now = s.now === false;
        else if (r.k === "details") s.details = s.details === false;
        else if (r.k === "hourly") s.hourly = s.hourly === false;
        else if (r.k === "forecast") s.forecast = s.forecast === false;
        else if (r.k === "units") settings.units = settings.units === "imperial" ? "metric" : "imperial";
        else if (r.k === "credit") s.credit = s.credit === false;
        else if (r.k === "sources") s.sources = s.sources === false;
        save(SETTINGS_KEY, settings);
        applyDisplay();
        if (r.k === "seconds") scheduleTick(); else tick();
        if (r.k === "units") Weather.refresh(settings);
        renderSources();
        renderSettings();
    }

    function adjustSlider(r, dir) {
        var v = Math.max(r.min, Math.min(r.max, (r.val || 0) + dir * r.step));
        var a = appr();
        if (r.k === "tileSize") a.tileSize = v;
        else if (r.k === "wallDim") a.dim = v;
        save(SETTINGS_KEY, settings);
        applyAppearance();
        if (r.k === "tileSize") renderDock();
        renderSettings();
    }
    function chooseAccent(key, title) {
        var items = SWATCHES.map(function (c) { return { label: "", key: c, swatch: c }; });
        openChoice(title, items, 8, function (it) {
            appr()[key] = it.key; save(SETTINGS_KEY, settings); applyAppearance(); tick(); renderDock(); openSettings();
        }, openSettings, appr()[key]);
    }
    function chooseFont() {
        var keys = ["default", "modern", "classic", "rounded", "mono"];
        var items = keys.map(function (k) { return { label: t.t("font_" + k) + " — 12:45  Aa", key: k, font: FONTS[k] }; });
        openChoice(t.t("font"), items, 2, function (it) {
            appr().font = it.key; save(SETTINGS_KEY, settings); applyAppearance(); openSettings();
        }, openSettings, appr().font || "default");
    }
    function chooseTileShape() {
        var items = ["rounded", "square"].map(function (k) { return { label: t.t("shape_" + k), key: k }; });
        openChoice(t.t("tileShape"), items, 2, function (it) {
            appr().tile = it.key; save(SETTINGS_KEY, settings); applyAppearance(); renderDock(); openSettings();
        }, openSettings, appr().tile || "rounded");
    }

    function chooseClockStyle() {
        var items = ["digital", "analog"].map(function (k) { return { label: t.t("clock_" + k), key: k }; });
        openChoice(t.t("clockStyle"), items, 2, function (it) {
            settings.clockStyle = it.key; save(SETTINGS_KEY, settings); scheduleTick(); openSettings();
        }, openSettings, settings.clockStyle || "digital");
    }
    function chooseClockFormat() {
        var items = ["auto", "24", "12"].map(function (k) { return { label: t.t("fmt_" + k), key: k }; });
        openChoice(t.t("clockFormat"), items, 3, function (it) {
            settings.clockFormat = it.key; save(SETTINGS_KEY, settings); tick(); openSettings();
        }, openSettings, settings.clockFormat || "auto");
    }

    function onInputDone(key, value) {
        value = value.replace(/^\s+|\s+$/g, "");
        if (key === "nameText") { settings.name = value; save(SETTINGS_KEY, settings); applyName(); }
        else if (key === "search" && value) { searchCity(value); }
    }

    function searchCity(city) {
        Weather.geocode(city, function (list) {
            settings.locPath = null;
            if (list.length === 1) { useLocation(city, list[0]); return; }
            var items = list.map(function (p) { return { label: p.label, key: p.label, value: p }; });
            openChoice(t.t("chooseLocation"), items, 1, function (it) { closeOverlay(); useLocation(city, it.value); }, openSettings);
        }, function () { toast(t.t("locNotFound", city)); });
    }

    function wallModeLabel() { return t.t("wall_" + (wall().mode || "rotate")); }
    function chooseWallMode() {
        var keys = ["rotate", "single"];
        for (var k in SOLIDS) keys.push(k);
        var items = keys.map(function (m) { return { label: t.t("wall_" + m), key: m }; });
        openChoice(t.t("wallpaper"), items, 2, function (it) {
            if (it.key === "single" && !wall().file && walls.length) wall().file = walls[0].file;
            wall().mode = it.key; save(SETTINGS_KEY, settings); applyWallpaper(); openSettings();
        }, openSettings, wall().mode);
    }
    function chooseWallPhoto() {
        var items = walls.map(function (w) {
            return { label: (w.credit || w.file).split(" · ")[0], key: w.file, thumb: "assets/wallpapers/" + w.file };
        });
        openChoice(t.t("wallpaperPhoto"), items, 4, function (it) {
            wall().file = it.key; wall().mode = "single"; save(SETTINGS_KEY, settings); applyWallpaper(); openSettings();
        }, openSettings, wall().file);
    }

    function settingsChosen() {
        var r = settingRows[setFocusIdx];
        if (!r) return;
        if (r.type === "toggle") { flip(r); return; }
        if (r.type === "text") { var inp = $("setList").children[setFocusIdx].querySelector("input"); if (inp) inp.focus(); return; }
        if (r.k === "loc") openLocation();
        else if (r.k === "clockStyle") chooseClockStyle();
        else if (r.k === "clockFormat") chooseClockFormat();
        else if (r.k === "wallMode") chooseWallMode();
        else if (r.k === "wallPick") chooseWallPhoto();
        else if (r.k === "accent") chooseAccent("accent", t.t("accent"));
        else if (r.k === "focus") chooseAccent("focus", t.t("focusColor"));
        else if (r.k === "font") chooseFont();
        else if (r.k === "tileShape") chooseTileShape();
        else if (r.k === "srcReset") { srcCfg().hidden = {}; save(SETTINGS_KEY, settings); renderSources(); renderSettings(); }
        else if (r.k === "close") closeOverlay();
    }

    function applyName() { $("brandName").textContent = settings.name || "HomeDock"; }

    function applyDisplay() {
        var s = show();
        $("brand").style.display = s.name === false ? "none" : "";
        $("time").style.display = $("date").style.display = s.clock === false ? "none" : "";
        $("now").style.display = s.now === false ? "none" : "";
        $("wxextra").style.display = s.details === false ? "none" : "";
        $("hourly").style.display = s.hourly === false ? "none" : "";
        $("forecast").style.display = s.forecast === false ? "none" : "";
        $("credit").style.display = s.credit === false ? "none" : "";
    }

    function setTheme(light) { document.body.className = light ? "light" : ""; }

    function appr() { return settings.appearance || (settings.appearance = {}); }
    function applyAppearance() {
        var a = appr(), root = document.documentElement.style;
        ACCENT = a.accent || "#ff5a4d";
        root.setProperty("--accent", ACCENT);
        // The focus ring follows the accent colour unless a focus colour is set,
        // so picking an accent is visible straight away on the dock.
        root.setProperty("--focus", a.focus || a.accent || "rgba(255,255,255,0.95)");
        TILE = a.tileSize || 170;
        TILE_STEP = TILE + 28;
        root.setProperty("--tile", TILE + "px");
        root.setProperty("--radius", (a.tile === "square" ? 10 : Math.round(TILE * 0.18)) + "px");
        document.body.style.fontFamily = FONTS[a.font] || FONTS["default"];
        var dim = $("dim");
        if (dim) dim.style.background = "rgba(0,0,0," + ((a.dim || 0) / 100) + ")";
    }

    function noLocation() { if (show().now !== false) $("now").textContent = t.t("noLocation"); }

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

    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    function use24() {
        var f = settings.clockFormat || "auto";
        if (f === "24") return true;
        if (f === "12") return false;
        return t.lang === "de";
    }
    function greetingText(h) {
        if (h < 5) return t.t("greetNight");
        if (h < 12) return t.t("greetMorning");
        if (h < 18) return t.t("greetAfternoon");
        return t.t("greetEvening");
    }
    function analogClock(h, m, s, seconds) {
        var size = 142, c = size / 2, r = c - 6, i, a, x1, y1, x2, y2;
        function hand(angle, len, w, col) {
            var rad = (angle - 90) * Math.PI / 180;
            return '<line x1="' + c + '" y1="' + c + '" x2="' + (c + len * Math.cos(rad)) + '" y2="' + (c + len * Math.sin(rad)) +
                '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
        }
        var ticks = "";
        for (i = 0; i < 12; i++) {
            a = (i * 30 - 90) * Math.PI / 180;
            x1 = c + (r - 4) * Math.cos(a); y1 = c + (r - 4) * Math.sin(a);
            x2 = c + (r - 13) * Math.cos(a); y2 = c + (r - 13) * Math.sin(a);
            ticks += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="currentColor" stroke-width="' + (i % 3 === 0 ? 3 : 1.5) + '" opacity="0.7"/>';
        }
        return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
            '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="currentColor" stroke-width="2" opacity="0.45"/>' + ticks +
            hand(((h % 12) + m / 60) * 30, r * 0.52, 6, "currentColor") +
            hand(m * 6 + s * 0.1, r * 0.78, 4, "currentColor") +
            (seconds ? hand(s * 6, r * 0.85, 2, ACCENT) : "") +
            '<circle cx="' + c + '" cy="' + c + '" r="5" fill="currentColor"/></svg>';
    }

    // Cached last-rendered values: only write the DOM when something actually
    // changed, so the per-second timer does not reflow (and lag input) every tick.
    var lastClock = "", lastDate = "", lastGreet = "", tickTimer = null;
    function tick() {
        var d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
        var seconds = show().seconds === true;
        var cls, html;
        if ((settings.clockStyle || "digital") === "analog") {
            cls = "analog"; html = analogClock(h, m, s, seconds);
        } else {
            cls = "";
            var head, ap = "";
            if (use24()) head = pad2(h);
            else { head = (h % 12) || 12; ap = '<small>' + (h < 12 ? "am" : "pm") + "</small>"; }
            html = head + ":" + pad2(m) + (seconds ? '<span class="sec">:' + pad2(s) + "</span>" : "") + ap;
        }
        if (html !== lastClock) { var te = $("time"); te.className = cls; te.innerHTML = html; lastClock = html; }
        var ds = d.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" });
        if (ds !== lastDate) { $("date").textContent = ds; lastDate = ds; }
        var g = $("greeting");
        if (g) {
            var gt = show().greeting === true ? greetingText(h) : "\u0000off";
            if (gt !== lastGreet) {
                if (gt === "\u0000off") g.style.display = "none"; else { g.textContent = gt; g.style.display = ""; }
                lastGreet = gt;
            }
        }
    }
    function scheduleTick() {
        clearInterval(tickTimer);
        lastClock = "";                                  // force a redraw after a settings change
        tick();
        tickTimer = setInterval(tick, show().seconds === true ? 1000 : 10000);
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
    var wallTimer = null;
    function wallIndexOf(f) { for (var i = 0; i < walls.length; i++) if (walls[i].file === f) return i; return -1; }

    function applyWallpaper() {
        var w = wall();
        clearInterval(wallTimer); wallTimer = null;
        var a = $("bgA"), b = $("bgB");
        if (SOLIDS[w.mode]) {
            var sp = SOLIDS[w.mode];
            a.className = "bg"; b.className = "bg"; a.style.backgroundImage = ""; b.style.backgroundImage = "";
            $("shade").style.display = "none";
            $("credit").textContent = "";
            document.body.style.background = sp.bg;
            setTheme(sp.light);
            return;
        }
        $("shade").style.display = "";
        document.body.style.background = "#000";
        setTheme(false);
        if (!walls.length) return;
        if (w.mode === "single") {
            var i = wallIndexOf(w.file);
            wallIdx = i < 0 ? 0 : i;
            showWall(wallIdx);
            return;
        }
        wallIdx = Math.floor(Math.random() * walls.length);
        showWall(wallIdx);
        wallTimer = setInterval(function () { wallIdx = (wallIdx + 1) % walls.length; showWall(wallIdx); }, WALL_MS);
    }

    // ---------- external sources (HDMI) ----------
    var srcList = [], srcFocus = 0, srcMenuFocus = 0, srcMenuTarget = null, renameTarget = null;
    var SRC_MENU = ["rename", "hide", "cancel"];

    function srcCfg() { var c = settings.sources || (settings.sources = {}); c.hidden = c.hidden || {}; c.names = c.names || {}; return c; }
    function srcKey(s) { return s.type + s.number; }
    function srcName(s) { return srcCfg().names[srcKey(s)] || (s.type + " " + s.number); }
    function visibleSources() {
        if (show().sources === false) return [];
        var h = srcCfg().hidden;
        return srcList.filter(function (s) { return !h[srcKey(s)]; });
    }
    function hasHiddenSources() {
        var h = srcCfg().hidden;
        for (var i = 0; i < srcList.length; i++) if (h[srcKey(srcList[i])]) return true;
        return false;
    }

    function loadSources() {
        if (!window.Sources) return;
        Sources.list(function (all) { srcList = all; renderSources(); });
    }
    function srcTile(s) {
        var el = document.createElement("div");
        el.className = "src" + (s.connected ? "" : " off");
        el.innerHTML =
            '<div class="sin"><svg viewBox="0 0 24 24" width="40" height="40">' +
            '<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
            '<path d="M8 21h8M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
            '<span></span></div>';
        el.querySelector("span").textContent = srcName(s);
        return el;
    }
    function renderSources() {
        var row = $("srcRow");
        row.innerHTML = "";
        var vis = visibleSources();
        $("srcWrap").style.display = vis.length ? "" : "none";
        for (var i = 0; i < vis.length; i++) row.appendChild(srcTile(vis[i]));
        if (mode === "sources") setSrcFocus(Math.min(srcFocus, vis.length - 1));
    }
    function setSrcFocus(i) {
        var tiles = $("srcRow").children;
        if (!tiles.length) { mode = "dock"; setFocus(focus); return; }
        i = Math.max(0, Math.min(tiles.length - 1, i));
        for (var k = 0; k < tiles.length; k++) tiles[k].className = tiles[k].className.replace(" focus", "");
        srcFocus = i;
        tiles[i].className += " focus";
    }
    function enterSources() {
        var vis = visibleSources();
        if (!vis.length) return false;
        mode = "sources";
        var tiles = $("strip").children;
        for (var k = 0; k < tiles.length; k++) tiles[k].className = tiles[k].className.replace(/ (focus|moving)/g, "");
        $("label").textContent = "";
        setSrcFocus(Math.min(srcFocus, vis.length - 1));
        return true;
    }
    function leaveSources() { mode = "dock"; setFocus(focus); }
    function openSourceAt(i) {
        var s = visibleSources()[i];
        if (!s) return;
        toast(t.t("opening", srcName(s)));
        Sources.open(s.number, function () {}, function () { toast(t.t("notAvailable", srcName(s))); });
    }

    function openSrcMenu() {
        var s = visibleSources()[srcFocus];
        if (!s) return;
        srcMenuTarget = s; mode = "srcmenu";
        $("menuTitle").textContent = srcName(s);
        $("menuInfo").textContent = "";
        var list = $("menuList");
        list.innerHTML = "";
        for (var i = 0; i < SRC_MENU.length; i++) {
            var r = document.createElement("div");
            r.className = "opt";
            r.textContent = t.t(SRC_MENU[i]);
            list.appendChild(r);
        }
        $("menu").className = "overlay on";
        setSrcMenuFocus(0);
    }
    function setSrcMenuFocus(i) {
        var rows = $("menuList").children;
        srcMenuFocus = Math.max(0, Math.min(rows.length - 1, i));
        for (var k = 0; k < rows.length; k++) rows[k].className = "opt" + (k === srcMenuFocus ? " focus" : "");
    }
    function srcMenuChosen() {
        var action = SRC_MENU[srcMenuFocus], s = srcMenuTarget;
        $("menu").className = "overlay";
        if (action === "hide") {
            srcCfg().hidden[srcKey(s)] = true;
            save(SETTINGS_KEY, settings);
            renderSources();
            if (!enterSources()) leaveSources();
        } else if (action === "rename") {
            openRename(s);
        } else {
            enterSources();
        }
    }

    function openRename(s) {
        renameTarget = s;
        mode = "rename";
        $("renameTitle").textContent = srcName(s);
        var inp = $("renameInput");
        inp.value = srcCfg().names[srcKey(s)] || "";
        $("rename").className = "overlay on";
        setTimeout(function () { inp.focus(); }, 0);
    }
    function renameDone() {
        var s = renameTarget;
        if (s) {
            var v = $("renameInput").value.replace(/^\s+|\s+$/g, "");
            if (v) srcCfg().names[srcKey(s)] = v;
            else delete srcCfg().names[srcKey(s)];
            save(SETTINGS_KEY, settings);
        }
        $("rename").className = "overlay";
        renameTarget = null;
        renderSources();
        if (!enterSources()) leaveSources();
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
            } else if (mode === "sources") {
                okTimer = setTimeout(function () { okLong = true; openSrcMenu(); }, LONG_PRESS_MS);
            }
            return;
        }

        var handled = true;
        if (mode === "whatsnew") {
            if (k === KEY.BACK) closeWhatsNew();
            else handled = (k === KEY.OK);     // OK handled on keyup
        } else if (mode === "dock") {
            if (k === KEY.LEFT) setFocus(focus - 1);
            else if (k === KEY.RIGHT) setFocus(focus + 1);
            else if (k === KEY.DOWN) { if (!enterSources()) handled = false; }
            else if (k === KEY.RED) openSettings();
            else if (k === KEY.BACK) { try { tizen.application.getCurrentApplication().hide(); } catch (x) {} }
            else handled = false;
        } else if (mode === "sources") {
            if (k === KEY.LEFT) setSrcFocus(srcFocus - 1);
            else if (k === KEY.RIGHT) setSrcFocus(srcFocus + 1);
            else if (k === KEY.UP || k === KEY.BACK) leaveSources();
            else if (k === KEY.RED) { leaveSources(); openSettings(); }
            else handled = false;
        } else if (mode === "srcmenu") {
            if (k === KEY.UP) setSrcMenuFocus(srcMenuFocus - 1);
            else if (k === KEY.DOWN) setSrcMenuFocus(srcMenuFocus + 1);
            else if (k === KEY.BACK) { $("menu").className = "overlay"; enterSources(); }
            else handled = false;
        } else if (mode === "rename") {
            if (k === KEY.BACK) renameDone();
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
        } else if (mode === "picker" && onTabs) {
            if (k === KEY.LEFT) setTabs(true, 0);
            else if (k === KEY.RIGHT) setTabs(true, 1);
            else if (k === KEY.DOWN && picks.length) setTabs(false);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "picker") {
            if (k === KEY.LEFT) setPickFocus(pickFocus - 1);
            else if (k === KEY.RIGHT) setPickFocus(pickFocus + 1);
            else if (k === KEY.UP) { if (pickFocus < PICK_COLS) setTabs(true); else setPickFocus(pickFocus - PICK_COLS); }
            else if (k === KEY.DOWN) setPickFocus(pickFocus + PICK_COLS);
            else if (k === KEY.BACK) closeOverlay();
            else handled = false;
        } else if (mode === "settings") {
            if (k === KEY.UP) setSettingFocus(focusableFrom(setFocusIdx - 1, -1));
            else if (k === KEY.DOWN) setSettingFocus(focusableFrom(setFocusIdx + 1, 1));
            else if ((k === KEY.LEFT || k === KEY.RIGHT) && settingRows[setFocusIdx] && settingRows[setFocusIdx].type === "toggle") flip(settingRows[setFocusIdx]);
            else if ((k === KEY.LEFT || k === KEY.RIGHT) && settingRows[setFocusIdx] && settingRows[setFocusIdx].type === "slider") adjustSlider(settingRows[setFocusIdx], k === KEY.RIGHT ? 1 : -1);
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

    // ---------- what's new ----------
    function appVersion() {
        try { return tizen.application.getCurrentApplication().appInfo.version; }
        catch (e) { return (window.WHATSNEW && WHATSNEW.v) || "0"; }
    }
    function maybeShowWhatsNew() {
        if (!window.WHATSNEW) return;
        var seen = null;
        try { seen = localStorage.getItem("homedock.seenVersion"); } catch (e) {}
        var ver = appVersion();
        if (seen === ver) return;
        if (seen === null) { try { localStorage.setItem("homedock.seenVersion", ver); } catch (e) {} return; }  // first install: no "new"
        var items = WHATSNEW[t.lang] || WHATSNEW.en || [];
        if (!items.length) { try { localStorage.setItem("homedock.seenVersion", ver); } catch (e) {} return; }
        var list = $("wnList");
        list.innerHTML = "";
        for (var i = 0; i < items.length; i++) {
            var d = document.createElement("div");
            d.className = "wnItem";
            d.textContent = items[i];
            list.appendChild(d);
        }
        mode = "whatsnew";
        $("whatsnew").className = "overlay on";
    }
    function closeWhatsNew() {
        try { localStorage.setItem("homedock.seenVersion", appVersion()); } catch (e) {}
        $("whatsnew").className = "overlay";
        mode = "dock";
        setFocus(focus);
    }

    function onKeyUp(e) {
        if (e.keyCode !== KEY.OK || !okHeld) return;
        okHeld = false;
        clearTimeout(okTimer);
        if (okLong) return;                         // the long press already acted
        if (mode === "whatsnew") { closeWhatsNew(); return; }
        if (mode === "dock") {
            if (focus === dock.length) openPicker();
            else launch(dock[focus]);
        } else if (mode === "sources") openSourceAt(srcFocus);
        else if (mode === "srcmenu") srcMenuChosen();
        else if (mode === "move") endMove();
        else if (mode === "menu") menuChosen();
        else if (mode === "picker") pickChosen();
        else if (mode === "settings") settingsChosen();
        else if (mode === "choice") choice.onPick(choice.items[choiceFocus]);
    }

    // ---------- start ----------
    window.addEventListener("load", function () {
        t.apply();
        settings = load(SETTINGS_KEY, {});
        // Migrate the old single "weather" toggle to the split now/forecast ones.
        var sh = show();
        if (sh.weather === false) { sh.now = false; sh.details = false; sh.hourly = false; sh.forecast = false; }
        delete sh.weather;
        applyName();
        applyDisplay();
        applyAppearance();
        loadDock();
        renderDock();
        tick();
        scheduleTick();
        applyWallpaper();
        Weather.start(settings, noLocation);
        loadSources();
        var ri = $("renameInput");
        if (ri) ri.onblur = function () { if (mode === "rename") renameDone(); };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        try { tizen.tvinputdevice.registerKey("ColorF0Red"); } catch (x) {}
        maybeShowWhatsNew();
    });
})();
