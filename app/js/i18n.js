/* UI strings. Every key exists in both en and de. */
(function () {
    "use strict";

    var STRINGS = {
        en: {
            addApp: "Add app",
            addShortcut: "Add shortcut",
            tabApps: "Apps",
            tabSystem: "System",
            move: "Move",
            moveHint: "◀ ▶ to move, OK when done",
            remove: "Remove",
            cancel: "Cancel",
            save: "Save",
            settings: "Settings",
            location: "Weather location",
            orSearch: "Or search by name",
            tvName: "Name shown top left",
            opening: "Opening {0}…",
            notAvailable: "{0} is not available",
            added: "{0} added",
            removed: "{0} removed",
            noLocation: "Press the red button to set your weather location",
            locNotFound: "Location “{0}” not found",
            locationSet: "Weather location: {0}",
            locationNone: "Not set",
            chooseLocation: "Choose your location",
            chooseCountry: "Country",
            chooseState: "State",
            chooseLetter: "First letter",
            chooseTown: "Town",
            country_DE: "Germany",
            country_AT: "Austria",
            country_CH: "Switzerland",
            weatherCredit: "Weather: Open-Meteo",
            hi: "H",
            lo: "L",
            wc: {
                0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
                45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Drizzle",
                56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
                66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
                77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers",
                85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"
            }
        },
        de: {
            addApp: "App hinzufügen",
            addShortcut: "Verknüpfung hinzufügen",
            tabApps: "Apps",
            tabSystem: "System",
            move: "Verschieben",
            moveHint: "◀ ▶ zum Verschieben, OK zum Beenden",
            remove: "Entfernen",
            cancel: "Abbrechen",
            save: "Speichern",
            settings: "Einstellungen",
            location: "Wetter-Standort",
            orSearch: "Oder nach Namen suchen",
            tvName: "Name oben links",
            opening: "{0} wird geöffnet…",
            notAvailable: "{0} ist nicht verfügbar",
            added: "{0} hinzugefügt",
            removed: "{0} entfernt",
            noLocation: "Rote Taste drücken, um den Wetter-Standort festzulegen",
            locNotFound: "Standort „{0}“ nicht gefunden",
            locationSet: "Wetter-Standort: {0}",
            locationNone: "Nicht festgelegt",
            chooseLocation: "Standort auswählen",
            chooseCountry: "Land",
            chooseState: "Bundesland",
            chooseLetter: "Anfangsbuchstabe",
            chooseTown: "Ort",
            country_DE: "Deutschland",
            country_AT: "Österreich",
            country_CH: "Schweiz",
            weatherCredit: "Wetter: Open-Meteo",
            hi: "H",
            lo: "T",
            wc: {
                0: "Klar", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt",
                45: "Nebel", 48: "Nebel", 51: "Leichter Niesel", 53: "Niesel", 55: "Niesel",
                56: "Gefrierender Niesel", 57: "Gefrierender Niesel", 61: "Leichter Regen", 63: "Regen", 65: "Starker Regen",
                66: "Gefrierender Regen", 67: "Gefrierender Regen", 71: "Leichter Schnee", 73: "Schnee", 75: "Starker Schnee",
                77: "Schneegriesel", 80: "Schauer", 81: "Schauer", 82: "Starke Schauer",
                85: "Schneeschauer", 86: "Schneeschauer", 95: "Gewitter", 96: "Gewitter", 99: "Gewitter"
            }
        }
    };

    var lang = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (!STRINGS[lang]) lang = "en";

    window.I18N = {
        lang: lang,
        locale: lang === "de" ? "de-DE" : "en-GB",
        t: function (key, arg) {
            var s = STRINGS[lang][key] || STRINGS.en[key] || key;
            return arg === undefined ? s : String(s).replace("{0}", arg);
        },
        weather: function (code) {
            return STRINGS[lang].wc[code] || STRINGS.en.wc[code] || "";
        },
        apply: function () {
            var els = document.querySelectorAll("[data-i18n]");
            for (var i = 0; i < els.length; i++) els[i].textContent = this.t(els[i].getAttribute("data-i18n"));
        }
    };
})();
