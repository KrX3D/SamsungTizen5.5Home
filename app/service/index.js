'use strict';

/* HomeDock boot service + optional Home watcher.
 *
 * A Tizen web service started at power-on (on-boot in config.xml). It always:
 *   - opens the launcher a few seconds after the TV comes up (autostart, no PC),
 *   - exposes a tiny loopback control server the launcher talks to.
 *
 * When the "Home watcher" is enabled in the launcher's settings it also brings
 * HomeDock back whenever Samsung Home covers it: it polls the TV's local API
 * (127.0.0.1:8001) for HomeDock's visibility, and relaunches HomeDock when it is
 * hidden and the app the launcher last opened is not in front. The launcher tells
 * the service which app it opened (/watch) and whether the watcher is on
 * (/config), so the service stands aside while you actually use an app and only
 * reclaims the screen from Samsung Home.
 *
 * Whether on-boot services run and whether the 8001 API answers are both
 * firmware-dependent, so the watcher is best-effort and opt-in. Pressing Home
 * still flashes Samsung Home for a moment before HomeDock returns.
 */

var http = require('http');
var url = require('url');

var SELF = 'krx3dLnch1.Home';
var LAUNCH_DELAY_MS = 5000;
var POLL_MS = 2500;
var HIDDEN_GRACE_MS = 1500;
var LAST_LAUNCH_MIN_MS = 3000;

var state = { enabled: false, watched: null, hiddenSince: 0, lastLaunch: 0 };
var pollTimer = null, server = null;

function launchSelf() {
    if (Date.now() - state.lastLaunch < LAST_LAUNCH_MIN_MS) return;
    state.lastLaunch = Date.now();
    state.hiddenSince = 0;
    try { tizen.application.launch(SELF, function () {}, function () {}); } catch (e) {}
}

function get8001(path, cb) {
    var done = false;
    function finish(v) { if (!done) { done = true; cb(v); } }
    try {
        var req = http.get({ host: '127.0.0.1', port: 8001, path: path }, function (res) {
            var b = '';
            res.on('data', function (c) { b += c; if (b.length > 65536) { req.abort(); finish(null); } });
            res.on('end', function () { var v = null; try { v = JSON.parse(b); } catch (e) {} finish(v); });
            res.on('error', function () { finish(null); });
        });
        req.on('error', function () { finish(null); });
        req.setTimeout(1500, function () { req.abort(); finish(null); });
    } catch (e) { finish(null); }
}

function appState(id, cb) {
    get8001('/api/v2/applications/' + encodeURIComponent(id), function (v) {
        cb(v && typeof v.visible === 'boolean' ? v : null);
    });
}

function tick() {
    if (!state.enabled) return;
    appState(SELF, function (me) {
        if (!me) return;                       // state unknown: do nothing
        if (me.visible) { state.watched = null; state.hiddenSince = 0; return; }
        if (state.watched) {
            appState(state.watched, function (w) {
                if (w && (w.visible || w.running)) return;   // the user is in that app
                launchSelf();                                // it closed: come back to HomeDock
            });
            return;
        }
        if (!state.hiddenSince) state.hiddenSince = Date.now();
        if (Date.now() - state.hiddenSince >= HIDDEN_GRACE_MS) launchSelf();   // Samsung Home is up
    });
}

function control(req, res) {
    var p = url.parse(req.url, true).pathname;
    function reply(obj) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
    if (req.method === 'POST') {
        var body = '';
        req.on('data', function (c) { body += c; if (body.length > 2048) req.destroy(); });
        req.on('end', function () {
            var d = {}; try { d = JSON.parse(body); } catch (e) {}
            if (p === '/config') state.enabled = d.enabled === true;
            else if (p === '/watch') { state.watched = d.id || null; state.hiddenSince = 0; }
            else if (p === '/home') { state.watched = null; state.hiddenSince = 0; }
            reply({ ok: true });
        });
        return;
    }
    reply(state);
}

module.exports.onStart = function () {
    setTimeout(launchSelf, LAUNCH_DELAY_MS);
    try { server = http.createServer(control); server.listen(47800, '127.0.0.1'); } catch (e) {}
    pollTimer = setInterval(tick, POLL_MS);
};

module.exports.onRequest = function () {};

module.exports.onExit = function () {
    clearInterval(pollTimer);
    if (server) { try { server.close(); } catch (e) {} server = null; }
};
