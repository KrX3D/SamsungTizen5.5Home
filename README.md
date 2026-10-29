# HomeDock

A minimal, Apple-TV-style home screen for Samsung Tizen TVs.

- Rotating full-HD nature wallpapers (Wikimedia Commons, credited on screen)
- Clock, date, current weather and 7-day forecast ([Open-Meteo](https://open-meteo.com), no API key)
- A dock of your apps with their real icons
- English and German, following the TV's language

Tested target: Tizen 5.0 (2019 models). The code is ES5 and avoids CSS newer than Chromium 63.

## Remote

| Key | Action |
|---|---|
| Left / Right | Move through the dock |
| OK | Open the app, or open the app picker on **+** |
| Hold OK | Remove the focused app from the dock |
| Red | Settings: weather location and the name shown top left |
| Back | Leave HomeDock |

To have it open after the TV turns on, open HomeDock last and enable
**Settings > General > Smart Features > Autorun Last App**.

## Install

Add `KrX3D/HomeDock` under **Saved Repos** in TizenBrew Installer and install it from there.
Updates arrive the same way.

Or install a release by hand with Tizen's `sdb`:

```
sdb connect <tv-ip>
sdb -s <tv-ip>:26101 install HomeDock.wgt
```

Uninstall: `sdb -s <tv-ip>:26101 uninstall krx3dLnch1`

## Build

Every push to `main` that changes `app/` builds, signs and releases `HomeDock.wgt`
(`.github/workflows/build-release.yml`). It needs two repository secrets:

- `TIZEN_AUTHOR_KEY`: base64 of the author `.p12`
- `TIZEN_AUTHOR_KEY_PW`: its password

Always sign with the same author certificate. The TV rejects an update signed by a different author.

Wallpapers are refreshed with `python scripts/fetch-wallpapers.py app/assets/wallpapers app/js/wallpapers.js`.
