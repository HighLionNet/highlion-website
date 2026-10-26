# HighLion configuration handoff

The owner will supply the full live nginx and PHP configuration. Review that configuration before drafting a replacement; this repository does not contain the complete live virtual host. Do not replace TLS, redirects, security headers, Tor configuration or unrelated virtual hosts from a template.

## Confirmed deployment

- Live document root: `/var/www/highlion`.
- Cloudflare Tunnel (`cloudflared`) connects to nginx on localhost. This is why an unconfigured origin reports `127.0.0.1` as the visitor.
- PHP-FPM is believed to be 8.2. Confirm the active service and application socket, commonly `/run/php/php8.2-fpm.sock`; do not assume the template's `/run/php/php-fpm.sock` exists.
- Current `nginx -T` fails: `"autoindex" directive is duplicate in /var/www/highlion/deploy/nginx-api.conf:1`. The new API include no longer declares `autoindex`.
- Code is consolidated on GitHub `main`. The full Kali userspace, hidden challenge windows/rewards, structured alerts, persistent bans, source bay and latest claim/confetti/divider fixes are included. Asset cache version is `hl8y`.

## Required configuration changes

1. Include `deploy/nginx-path-http.conf` exactly once in **http context** (either an http include pointing to the repo, or an installed copy in `/etc/nginx/conf.d/highlion-path.conf`, never both). It owns the maps, `geo`, zones and `hl_path` log format. Do not put it in `server {}`.
2. On the **tunnel origin server only**, bind listeners to `127.0.0.1` and/or `[::1]` on the port configured in cloudflared. Include `deploy/nginx-path-server.conf`, then `deploy/nginx-cloudflared-server.conf`. Real IP uses `CF-Connecting-IP`; loopback trust belongs only to this loopback-bound server. Never trust `0.0.0.0/0`, `::/0`, all private networks or browser-supplied X-Forwarded-For. Public listeners must not inherit loopback tunnel trust.
3. The path server include owns `server_tokens`, `autoindex`, `merge_slashes`, body/header/send timeouts, ranges and the probe dispatcher. Remove duplicate declarations from the surrounding **same server context**. Preserve unrelated headers and existing error pages. Remove old trap rewrite/return blocks which forward probes back over HTTP or route to `/api/trap.php`; those lose visitor identity or conflict with the new dispatcher.
4. Include `deploy/nginx-api.conf` once in that server. Set its application FastCGI socket to the confirmed existing PHP-FPM socket. It permits only explicit endpoints and aliases; `/api/_*.php`, `/api/ban-check.php` and legacy `/api/trap*` remain inaccessible publicly. Remove the obsolete `nginx-shell-slot.conf` include; the API allowlist handles all shell-slot aliases.
5. Install `deploy/php-relay-pool.conf` into the active FPM `pool.d` directory. Its **separate** `highlion-relay` pool listens at `/run/php/highlion-relay.sock`, has two workers and bounded timeouts, reads only its allowed paths, and receives no request body, cookies, credentials or arbitrary headers. It needs `/var/lib/highlion/abuse` in open_basedir. Keep `/api/_relay.php` internal and reached only by `@hl_station`.
6. Include `deploy/nginx-abuse.conf` once in the server, using the same **application** FastCGI socket as the API include. Requires `http_auth_request_module`. Its `/_hl-ban-check` is internal-only and has `auth_request off`. Use the matching new HTTP maps: they exempt this subrequest from path dispatch and allow inherited POST methods. Older maps plus the ban include cause valid API POSTs and error pages to return 500.
7. Every relevant FastCGI route explicitly passes `HL_CLIENT_IP=$remote_addr`, `HL_PEER_IP=$realip_remote_addr` and the request ID. PHP uses only these server parameters or REMOTE_ADDR, never HTTP forwarding headers. This preserves the **visitor** across internal routing and separately records the loopback **proxy peer**. The tunnel country map also requires a loopback listener and exact loopback peer.
8. Keep `/lab/`, dotfiles, deployment files, tests, source backups and private PHP helpers blocked. Do not let a broad PHP regex or `^~` static location bypass the guards. Retain the local simulated machine files under `/js/shell/image/`, including its fake passwd/shadow/resolv.conf.
9. Retain `deploy/nginx-headers.conf` or equivalent headers. The projects filter is now external JavaScript, so the CSP does not need unsafe-inline scripts or unsafe-eval. Retain 403/404/405 pages and ordinary static/API behavior.
10. Keep normal access logs when adding the conditional `highlion-path.log`: defining a server-level access_log overrides inherited access logs. Install `deploy/logrotate-path.conf` without duplicating an existing nginx `*.log` rotation rule.

## State and credentials

- Existing `/etc/highlion/honeypot.env` and `letterbox.env` contain server-only Telegram credentials; never print or commit them. Alerts use Telegram `sendRichMessage` with JSON-encoded `rich_message.html`, escaped HTML, and entity auto-detection disabled. Contact letters retain the existing plain `sendMessage` transport.
- `sudo php /var/www/highlion/deploy/hl8x-setup.php` verifies the existing simulated CTF root password and provisions `/var/lib/highlion/abuse` for `www-data`. It preserves password hashes/operator credentials. Use the actual FPM user if different. It stores the reward only in `/etc/highlion/shell.env`, never the public image.
- Five positive sensitive-path/honeypot events in a rolling 30 days create a 270-day public-IP ban. Ordinary bad-method, CSRF and rate errors are logged without probe strikes. Local/private addresses are excluded. Do not repeatedly trigger real production probes as a ban test; the disposable test suite exercises that behavior.
- Every PHP-observed event is retained as a structured JSON log. Telegram notifications have a shared global budget of five/minute; path relay admission is additionally bounded. nginx logs even probes that are rejected before PHP or throttled.

## Application verification already covered locally

- Full shell and claim suites with the complete shipped userspace; no network attack tools gain real network access.
- Real PHP role/cookie/CSRF, flag/reward, payload, ban and escaped Telegram envelope tests using disposable credentials.
- Real nginx + two PHP backends with the actual path/API/ban/tunnel includes: static bytes, aliases, original visitor IP, untrusted-header spoofing, isolated relay, throttling, method rules and absence of internal redirect loops.
- Browser checks with the actual CSP: terminal claims, hidden challenge windows, rewards, both FLAGS triggers, confetti above the open modal, 900ms delay, cleanup, responsive dividers and project filtering. Full shell remains index-only; About retains its source bay and a reduced terminal preview linking to home.

## After reviewing the complete live config

Check the new FPM pool using the installed version's FPM config test, then `sudo nginx -t`. Reload PHP-FPM and nginx only after both pass. Confirm cloudflared points to the loopback listener. Public-domain alert tests must report the caller's public visitor IP, with the loopback address only in **Proxy peer**. A CLI or direct-localhost transport test correctly reports loopback and cannot prove public visitor restoration. Follow `deploy/VERIFY.md` for exact live checks.

References: [nginx realip](https://nginx.org/en/docs/http/ngx_http_realip_module.html), [Telegram rich messages](https://core.telegram.org/bots/api#sendrichmessage), [Cloudflare address ranges](https://www.cloudflare.com/ips/).
