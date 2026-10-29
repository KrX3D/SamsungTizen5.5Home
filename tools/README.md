# tools

PC-side helpers. These run on the computer over SDB, not inside the app, so they
are not part of the `.wgt` and never trigger a build.

## Probe-Home.ps1 — read-only Home / autostart check

Reports whether a native Home-button or startup remap is even reachable on your
TV, **without changing anything**. No settings are written, nothing is installed,
launched or removed.

```powershell
.\Probe-Home.ps1 -TvIp 192.168.70.115
# optional: -Sdb "C:\tizen-studio\tools\sdb.exe"
```

Developer Mode must be on with this PC set as the Host IP (and the TV
power-cycled after setting it), the same as for installing the app.

It connects, runs a fixed set of read-only SDB queries, prints each result as
`READABLE` / `REFUSED-EMPTY` / `UNSUPPORTED`, and saves a timestamped report
under `tools/home-reports/`.

### What the result means

On retail Tizen firmware `sdb shell` is closed and root is disabled, so the
privileged Home/startup values (`home_appid`, `startup_appid`, the owner of the
`main` operation, `.../auto_start`) usually come back `REFUSED-EMPTY`. That tells
you a native Home remap is **not** reachable from the plain SDB surface on this
model — it would need the signed uid-901 native helper that arn0-tv / AeroTizen
use, which is model-specific and writes to the TV.

If those keys do read back, the report says a remap *may* be possible — but this
script still only reads; writing is out of scope here on purpose.

For autostart without touching those settings, see the on-boot service and the
`prelaunch`/`app-control main` manifest entries in the app.
