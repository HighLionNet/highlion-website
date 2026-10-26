https://www.highlion.net is the official HighLion project website.
The site features a collection of cybersecurity related services, including news, live session stats, a Debian terminal to explore, and more.

My other projects are featured in the site as well, see /projects and /about to find out more.
A letterbox can be found at /contact, your words are welcome.

HLv8 checks

Run the shell regression suite with `node tests/shell.test.cjs`.
Run the endpoint suite with `python tests/api_test.py /path/to/php` (PHP 8+).
The endpoint suite uses disposable credentials, sessions, and storage under the ignored `.qa/` directory. It never reads production configuration.

The existing root hash keys authenticate `admin`, which also requires the operator cookie. The existing admin hash keys authenticate the simulated `root` account. Keep their values in the server environment file.
Authenticated developers can run `sessionctl help` for session controls.

HL8x deployment

Extract the feature-branch archive into the website document root. Run `sudo php deploy/hl8x-setup.php` from that directory over SSH. Enter the existing CTF root password when prompted: the helper verifies the existing hash, adds `HL_CTF_ROOT_PASSWORD` only to `/etc/highlion/shell.env`, and provisions `/var/lib/highlion/abuse` for the PHP pool (`www-data` by default). It does not change authentication hashes or Telegram credentials. The popup displays the password exactly as configured, including its final punctuation.

Apply the updated `deploy/nginx-api.conf` routes to the existing site, and include `deploy/nginx-abuse.conf` once inside the active `server {}` block for site-wide persistent bans. Run `sudo nginx -t` before reloading nginx. Reuse the site's existing PHP socket if it differs from the template. API bans are also enforced inside PHP. Five positive trap events in thirty days ban a public IP for 270 days; localhost, private and reserved addresses are ignored. CSRF failures and ordinary rate limits are logged but do not cause long-term bans. Abuse records persist across reboot; honeypot JSON logs retain each event even when outbound alerts are throttled. Remove the corresponding IP hash JSON file from the abuse directory to lift a ban.

Request identity uses nginx's `REMOTE_ADDR`, including normalization of IPv4-mapped IPv6. When a trusted reverse proxy is used, configure nginx `real_ip` for that proxy's verified source ranges first; never trust visitor-supplied forwarding headers. The existing `CF-IPCountry` field is a country hint supplied by the edge, not an identity or ban input.

Telegram alerts use the current Bot API `sendRichMessage` HTML table support, with all nine headers and escaped request values. Credentials remain in `/etc/highlion/honeypot.env`; letterbox messages retain their existing transport. Live Telegram delivery requires those server-only credentials and cannot be verified with disposable local configuration.
