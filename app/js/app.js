/* HomeDock - minimal Apple-TV-style launcher for Samsung Tizen TVs.
   ES5 only: the Tizen 5.0 web engine is Chromium 63. */
(function () {
    "use strict";

    var SELF_ID = "krx3dLnch1.Home";
    var SELF_PKG = "krx3dLnch1";        // our own package: .Home and the .Boot service
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
    var TILE = 170, TILE_STEP = 198;       // tile width, and width + 2 x 14px margin
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
            } else {
                el.textContent = items[i].label;
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
        rows.push({ k: "name", type: "toggle", label: t.t("showName"), on: s.name !== false });
        if (s.name !== false) rows.push({ k: "nameText", type: "text", label: t.t("tvName"), val: settings.name || "" });
        rows.push({ k: "clock", type: "toggle", label: t.t("showClock"), on: s.clock !== false });
        rows.push({ k: "weather", type: "toggle", label: t.t("showWeather"), on: s.weather !== false });
        if (s.weather !== false) {
            rows.push({ k: "loc", type: "value", label: t.t("location"), val: locLabel() });
            rows.push({ k: "search", type: "text", label: t.t("orSearch"), val: "" });
        }
        rows.push({ k: "wallMode", type: "value", label: t.t("wallpaper"), val: t.t("wall_" + (wall().mode || "rotate")) });
        if (wall().mode === "single") rows.push({ k: "wallPick", type: "value", label: t.t("wallpaperPhoto"), val: wallPhotoLabel() });
        if (srcList.length) {
            rows.push({ k: "sources", type: "toggle", label: t.t("showSources"), on: s.sources !== false });
            if (hasHiddenSources()) rows.push({ k: "srcReset", type: "action", label: t.t("resetSources") });
        }
        rows.push({ k: "close", type: "action", label: t.t("close") });
        return rows;
    }

    function renderSettings() {
        var list = $("setList");
        list.innerHTML = "";
        settingRows = buildSettingsRows();
        settingRows.forEach(function (r) {
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
            } else { val.className = "sval"; if (r.type === "value") val.textContent = r.val + "  ›"; }
            row.appendChild(val);
            list.appendChild(row);
        });
        var keep = -1;
        for (var i = 0; i < settingRows.length; i++) if (settingRows[i].k === focusKey) keep = i;
        setSettingFocus(keep >= 0 ? keep : Math.min(setFocusIdx, settingRows.length - 1));
    }

    function setSettingFocus(i) {
        var rows = $("setList").children;
        if (!rows.length) return;
        i = Math.max(0, Math.min(rows.length - 1, i));
        for (var k = 0; k < rows.length; k++) rows[k].className = rows[k].className.replace(" focus", "");
        setFocusIdx = i; focusKey = settingRows[i].k;
        rows[i].className += " focus";
        var rowH = rows[0].offsetHeight + 12, view = $("setView").clientHeight;
        var sc = Math.max(0, Math.min(i * rowH - view / 2, rows.length * rowH - view));
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
        else if (r.k === "weather") s.weather = s.weather === false;
        else if (r.k === "sources") s.sources = s.sources === false;
        save(SETTINGS_KEY, settings);
        applyDisplay();
        renderSources();
        renderSettings();
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

    function chooseWallMode() {
        var items = ["rotate", "single", "light", "dark"].map(function (m) { return { label: t.t("wall_" + m), key: m }; });
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
        else if (r.k === "wallMode") chooseWallMode();
        else if (r.k === "wallPick") chooseWallPhoto();
        else if (r.k === "srcReset") { srcCfg().hidden = {}; save(SETTINGS_KEY, settings); renderSources(); renderSettings(); }
        else if (r.k === "close") closeOverlay();
    }

    function applyName() { $("brandName").textContent = settings.name || "HomeDock"; }

    function applyDisplay() {
        var s = show();
        $("brand").style.display = s.name === false ? "none" : "";
        $("time").style.display = $("date").style.display = s.clock === false ? "none" : "";
        var wOff = s.weather === false;
        $("now").style.display = wOff ? "none" : "";
        $("forecast").style.display = wOff ? "none" : "";
    }

    function setTheme(light) { document.body.className = light ? "light" : ""; }

    function noLocation() { if (show().weather !== false) $("now").textContent = t.t("noLocation"); }

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
    var wallTimer = null;
    function wallIndexOf(f) { for (var i = 0; i < walls.length; i++) if (walls[i].file === f) return i; return -1; }

    function applyWallpaper() {
        var w = wall();
        clearInterval(wallTimer); wallTimer = null;
        var a = $("bgA"), b = $("bgB");
        if (w.mode === "light" || w.mode === "dark") {
            a.className = "bg"; b.className = "bg"; a.style.backgroundImage = ""; b.style.backgroundImage = "";
            $("shade").style.display = "none";
            $("credit").textContent = "";
            document.body.style.background = w.mode === "light"
                ? "linear-gradient(160deg,#eef2f6 0%,#d4dde7 100%)"
                : "linear-gradient(160deg,#181b20 0%,#0b0d10 100%)";
            setTheme(w.mode === "light");
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
        if (mode === "dock") {
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
            if (k === KEY.UP) setSettingFocus(setFocusIdx - 1);
            else if (k === KEY.DOWN) setSettingFocus(setFocusIdx + 1);
            else if ((k === KEY.LEFT || k === KEY.RIGHT) && settingRows[setFocusIdx] && settingRows[setFocusIdx].type === "toggle") flip(settingRows[setFocusIdx]);
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
        applyName();
        applyDisplay();
        loadDock();
        renderDock();
        tick();
        setInterval(tick, 10000);
        applyWallpaper();
        Weather.start(settings, noLocation);
        loadSources();
        var ri = $("renameInput");
        if (ri) ri.onblur = function () { if (mode === "rename") renameDone(); };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        try { tizen.tvinputdevice.registerKey("ColorF0Red"); } catch (x) {}
    });
})();
