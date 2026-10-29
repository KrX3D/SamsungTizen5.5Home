<#
.SYNOPSIS
    Read-only probe of a Samsung Tizen TV's Home / startup assignment over SDB.

.DESCRIPTION
    Connects over SDB and runs only read commands. It changes NOTHING on the TV:
    no settings are written, no app is installed, launched or removed. It reports
    what this firmware actually exposes, so you can tell whether a native Home or
    autostart remap is even reachable before trying anything that writes.

    Background: on retail Tizen TVs `sdb shell` is closed and root is disabled, so
    the privileged Home settings (home_appid, startup_appid, the owner of the
    "main" operation, db/menu/.../auto_start) can only be read through a signed
    native helper staged as SDK uid 901 (the approach arn0-tv / AeroTizen use).
    This script does not ship that helper; it probes the plain SDB surface and
    says clearly which reads the firmware refuses.

.PARAMETER TvIp
    The TV's LAN IP. Developer Mode must be on with this PC set as the Host IP.

.PARAMETER Sdb
    Path to sdb.exe. If omitted, common locations and PATH are searched.

.EXAMPLE
    .\Probe-Home.ps1 -TvIp 192.168.70.115
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$TvIp,
    [string]$Sdb
)

$ErrorActionPreference = 'Stop'

function Find-Sdb {
    param([string]$Explicit)
    if ($Explicit) {
        if (Test-Path $Explicit) { return (Resolve-Path $Explicit).Path }
        throw "sdb not found at -Sdb path: $Explicit"
    }
    $cmd = Get-Command sdb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:USERPROFILE\tizen-studio\tools\sdb.exe",
        "C:\tizen-studio\tools\sdb.exe",
        "$PSScriptRoot\..\..\TV-Debloat\tools\sdb-pkg\data\tools\sdb.exe",
        "$env:USERPROFILE\Desktop\Project\TV-Debloat\tools\sdb-pkg\data\tools\sdb.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return (Resolve-Path $c).Path } }
    throw "Could not find sdb.exe. Pass -Sdb <path> (e.g. Tizen Studio's tools\sdb.exe)."
}

$sdbExe = Find-Sdb -Explicit $Sdb
$serial = "${TvIp}:26101"
Write-Host "sdb:    $sdbExe"
Write-Host "target: $serial`n"

& $sdbExe connect $TvIp | Out-Null
Start-Sleep -Milliseconds 800
$devices = & $sdbExe devices
if ($devices -notmatch [regex]::Escape($serial)) {
    throw "Not connected to $serial. Check Developer Mode is on and this PC is the Host IP, then power-cycle the TV."
}

# Each probe is read-only. 'cmd' is passed to `sdb -s <serial> shell 0 <cmd>`,
# except entries whose 'raw' is set, which are run as `sdb -s <serial> <raw>`.
$probes = @(
    @{ name = 'Device capability';        raw = 'capability' }
    @{ name = 'Installed app list';       cmd = 'applist' }
    @{ name = 'Home app id (vconf)';      cmd = 'vconftool get db/menu/system/.../home_appid' }
    @{ name = 'Startup app id (vconf)';   cmd = 'vconftool get db/menu/system/.../startup_appid' }
    @{ name = 'Smart Hub auto start';     cmd = 'vconftool get db/menu/smart_hub/ontvsetting/auto_start' }
    @{ name = 'Package manager list';     cmd = 'pkgcmd -l' }
    @{ name = 'App manager info';         cmd = 'appinfo' }
)

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $PSScriptRoot 'home-reports'
New-Item -ItemType Directory -Force $outDir | Out-Null
$report = Join-Path $outDir "home-probe-$($TvIp.Replace('.','-'))-$stamp.txt"

$lines = @("HomeDock read-only Home probe", "TV: $TvIp", "When: $(Get-Date -Format s)", ("=" * 60))
$summary = @{}

foreach ($p in $probes) {
    $argList = if ($p.raw) { @('-s', $serial) + ($p.raw -split ' ') }
               else { @('-s', $serial, 'shell', '0') + ($p.cmd -split ' ') }
    $out = (& $sdbExe @argList 2>&1 | Out-String).Trim()
    $state = if ($out -eq 'closed' -or $out -eq '') { 'REFUSED/EMPTY' }
             elseif ($out -match 'not supported|unknown|failed') { 'UNSUPPORTED' }
             else { 'READABLE' }
    $summary[$p.name] = $state
    $shown = if ($p.raw) { $p.raw } else { "shell 0 $($p.cmd)" }
    Write-Host ("{0,-24} {1}" -f $p.name, $state)
    $lines += @("", "## $($p.name)  [$state]", "`$ sdb $shown", $out, ("-" * 60))
}

$lines += @("", "SUMMARY")
$lines += ($summary.GetEnumerator() | ForEach-Object { "  {0,-24} {1}" -f $_.Key, $_.Value })
$readable = ($summary.Values | Where-Object { $_ -eq 'READABLE' }).Count

if ($summary['Home app id (vconf)'] -eq 'READABLE') {
    $interpretation = @(
        "  The Home/startup vconf keys are readable here. A native Home remap MAY be"
        "  possible on this firmware. Still back up before any write, and note that"
        "  writing these needs a privileged helper, not this script."
    )
} else {
    $interpretation = @(
        "  The Home/startup settings are NOT readable over plain SDB on this firmware"
        "  (shell is closed, root disabled). A native Home-button remap is therefore"
        "  not reachable here without the signed uid-901 helper that arn0-tv/AeroTizen"
        "  use, and even that is model-specific and writes to the TV. For autostart,"
        "  prefer the on-boot service or a PC-side launch-on-wake watcher instead."
    )
}
$lines += @("", "INTERPRETATION") + $interpretation

$lines -join "`r`n" | Out-File $report -Encoding utf8
Write-Host "`nReport written to: $report"
Write-Host "Readable probes: $readable of $($probes.Count). Nothing on the TV was changed."
