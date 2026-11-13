# Signing certificate

HomeDock is signed with the author certificate `homedock_author` (CN=KrX Home), stored in the
repository secrets `TIZEN_AUTHOR_KEY` (base64 .p12) and `TIZEN_AUTHOR_KEY_PW`. The TV accepts an
update only if it carries the same author as the installed app. If the certificate is lost or
replaced, every installed TV needs an uninstall and a fresh install, and the app's settings are lost.

`.github/workflows/cert-expiry.yml` checks the secret every Monday and fails, which sends GitHub's
failure mail, when:

- the secret or the password is missing, or the .p12 does not open,
- the certificate is not the pinned one (SHA-256 `8F:3B:AD:BE:…:3F:F5:67`),
- the private key does not belong to the certificate,
- expiry is less than 120 days away.

An expiry you already know about can be acknowledged by setting the repository variable
`CERT_EXPIRY_ACK` to the date shown in the run (`YYYY-MM-DD`). After that, the run only warns.

## Known expiry: 2027-01-01

The author certificate expires on **2027-01-01 00:00 UTC**. So does the `Tizen Developers CA`
that issued it, which means Tizen Studio cannot issue a certificate from that CA that lasts longer.
TizenTube, TizenBrew and TizenBrewInstaller are signed by `Tizen Developers CA` certificates
with the same end date.

It is not yet known whether this TV checks the author certificate's expiry when it installs an
update. The distributor certificate in the same `.wgt` (Tizen Public Distributor) expired
on 2022-10-27 and installs still work, which suggests it does not, but that is unproven
for the author certificate. One way to test before the deadline is to set the TV clock by hand
to a date after 2027-01-01 and install the current release.

## Backup checklist

Keep these outside GitHub (a password manager entry plus an offline copy), and check them once a year:

- [ ] The original `.p12` file (`homedock_author`), not only the base64 secret. GitHub secrets
      cannot be read back, so if this file is lost the key is lost.
- [ ] Its password, stored separately from the file.
- [ ] The certificate's SHA-256 fingerprint and expiry date (the summary of the weekly run shows both).
- [ ] The Tizen Studio `profiles.xml` / certificate profile name, if the .p12 was made there.
- [ ] A test restore: decode the backup and open it with
      `openssl pkcs12 -legacy -in author.p12 -nokeys -clcerts | openssl x509 -noout -fingerprint -sha256 -enddate`
      and compare the fingerprint with `AUTHOR_SHA256` in the workflow.
- [ ] The same for each other app's author certificate (TizenTube, TizenBrew, TizenBrewInstaller).
      TizenBrew and TizenBrewInstaller share one certificate.

Scheduled workflows are switched off after 60 days without repository activity. If the repository goes
quiet, check that the run is still enabled under Actions.
