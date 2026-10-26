# HighLion website

The HLv8 site at https://www.highlion.net, with a simulated Kali userspace, hidden challenges, a source bay, and server-side contact and security alerts. `main` is the single authoritative branch. Asset cache version: `hl8y`.

Run the local regressions from the repository root:

```sh
node tests/shell.test.cjs
node tests/claims.test.cjs
python3 tests/api_test.py "$(command -v php)"
python3 tests/routing_test.py --php-dir /usr/bin --nginx /usr/sbin/nginx --nginx-conf-dir /etc/nginx
```

PHP tests use disposable credentials and state under ignored `.qa/`. The routing suite requires nginx with realip/auth_request and php-cgi; it launches disposable localhost services and captures Telegram delivery locally. It never modifies live nginx configuration, sends live alerts or reads production credentials.

Deployment and server configuration are separate. Extract a release archive outside `/var/www/highlion`, then run `sudo bash deploy/sync-site.sh /absolute/extracted/repository`. The script mirrors release files, backs up replaced/deleted files outside the webroot, preserves server secrets, and refreshes the sole active PHP-FPM service. It does not change or reload nginx configuration.

See [the complete nginx/PHP handoff](deploy/GROK-HANDOFF.md) before configuring the confirmed Cloudflare Tunnel origin, and [the exact live checks](deploy/VERIFY.md) after configuration validation. The origin must restore a visitor IP only from the trusted local tunnel; PHP never trusts browser forwarding headers. Telegram alerts use escaped `sendRichMessage` HTML tables.

Existing root hash keys authenticate the cookie-gated `admin` developer role; existing admin hash keys authenticate the simulated CTF `root`. Keep values in `/etc/highlion/shell.env`. `sudo php deploy/hl8x-setup.php` verifies the existing CTF password, configures its reward and provisions persistent abuse state without changing those hashes or Telegram credentials. Authenticated developers can use `sessionctl help`; all shell filesystem and network commands remain simulated.
