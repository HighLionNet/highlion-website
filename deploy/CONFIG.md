# Complete HighLion origin configuration

These replacements are based on the owner's supplied `/etc/nginx/nginx.conf` and `/etc/nginx/sites-enabled/highlion.conf`. They support the existing Cloudflare Tunnel and existing onion hostname. They are complete primary configuration files, not blocks to append to the old server.

## Install

After syncing the release into `/var/www/highlion`, run:

```sh
sudo python3 /var/www/highlion/deploy/install-config.py
bash /var/www/highlion/deploy/verify-live.sh
```

The installer detects the sole active application FPM socket/version, writes the two nginx files and bounded relay FPM pool, provisions persistent abuse state, backs up replaced configuration under `/var/backups/highlion/config-*`, and checks FPM/nginx/Tor syntax before reloading. A validation error restores the previous config files. It disables the old duplicated `conf.d/highlion-path.conf` and distribution default site if present, retaining them in the backup. Other virtual-host files are preserved; conflicting external configuration causes nginx validation to fail rather than silently activating it.

`deploy/nginx.conf` installs as `/etc/nginx/nginx.conf`. `deploy/highlion.conf` installs through the existing enabled-site path, preserving its sites-available symlink. The default FPM upstream in the template is `/run/php/php8.2-fpm.sock`; the installer substitutes the detected application socket.

## One IP through the entire request

The supplied old access log printed the raw CF-Connecting-IP header. That could look correct while nginx's socket REMOTE_ADDR was still loopback. The replacement defines `$hl_client_ip` from the CF header only for an exact loopback peer on the dedicated cloudflared transport. Every access log, nginx request bucket, application FastCGI route, ban subrequest and isolated alert relay uses that same value. PHP receives it both as REMOTE_ADDR and HL_CLIENT_IP, exactly once. The original peer remains a separate field.

`/api/client-ip.php` exposes only the caller's own identity and request ID, with no-cache JSON. `verify-live.sh` compares both PHP identity fields with Cloudflare's public trace over IPv4 and fails if either differs or the source is not verified cloudflared. It must pass before a deployment is considered complete.

## Tor isolation

Cloudflared remains on `127.0.0.1:80`. The onion service uses `127.0.0.1:8081`, without any IP forwarding-header trust, even if an unrelated global include defines proxy trust. Sharing the old trusted port would let a Tor client forge the Cloudflare header.

The installer locates the existing hidden service by its public hostname file and changes only its HTTP HiddenServicePort target to `127.0.0.1:8081`. It preserves the service directory and private keys. It supports torrc includes, validates Tor configuration, and reloads the active default Tor service. If the expected service cannot be identified, it stops before editing configuration. Tor does not expose visitors' actual IPs; alerts label them unavailable instead of inventing a public address.

## Security behavior

Only explicit API paths can run PHP. Helpers/deploy/tests/dotfiles/backups remain blocked. Unknown Host values return 421. HTML is revalidated; static assets retain the complete security headers and use versioned cache references (`hl8z`). The canonical apex redirect uses HTTPS; public www requests with a trusted Cloudflare HTTP scheme are also redirected to HTTPS, without redirecting the separate onion listener. Path traversal, sensitive file probes and executable XSS query payloads route to a separate, bounded relay; query/user-agent values are escaped before HTML output. Alert titles describe each observed event; the generic HighLion heading is reserved for TEST events.

The full shipped configuration is exercised by `tests/routing_test.py`, including PHP native REMOTE_ADDR, IPv4/IPv6, fallback without realip substitution, header spoofing, onion isolation, static and API bans, aliases, methods, headers, and absence of internal redirect loops. The PHP suite verifies event-specific headings and existing authentication/CSRF/reward behavior. The browser suite verifies that both About code-band canvases paint and move on desktop/mobile.

References: [nginx realip](https://nginx.org/en/docs/http/ngx_http_realip_module.html), [Cloudflare headers](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/), [Tor service target configuration](https://community.torproject.org/onion-services/setup/).
