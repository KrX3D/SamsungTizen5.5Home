'use strict';

/* HomeDock boot service.
 *
 * A Tizen web service started at power-on (on-boot in config.xml). Its one job
 * is to open the launcher shortly after the TV comes up, so autostart works
 * without a PC on the network.
 *
 * Deliberately minimal: it launches HomeDock once per start and relies on the
 * service's own auto-restart. It does NOT poll or fight Samsung Home — that kind
 * of watcher needs per-model tuning (Frame Art Mode, the port-8001 API) and is
 * easy to get wrong, so it is left out. Pressing Home still shows Samsung Home;
 * this only covers "open HomeDock after boot".
 *
 * Whether on-boot services actually run is firmware-dependent on these TVs; on
 * some 5.x firmware they do not start at all, in which case the OS "Autorun Last
 * App" setting or a PC-side launch-on-wake watcher remain the fallbacks.
 */

var SELF = 'krx3dLnch1.Home';
var LAUNCH_DELAY_MS = 5000;   // let the TV's app framework settle before launching

function launchLauncher() {
    try {
        tizen.application.launch(SELF, function () {}, function () {});
    } catch (e) {
        // Nothing to recover to here; the service will be auto-restarted.
    }
}

module.exports.onStart = function () {
    setTimeout(launchLauncher, LAUNCH_DELAY_MS);
};

module.exports.onRequest = function () {};

module.exports.onExit = function () {};
