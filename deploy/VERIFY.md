# Final deployment verification

Run after `sudo python3 /var/www/highlion/deploy/install-config.py` completes successfully. Production Telegram credentials remain in `/etc/highlion/honeypot.env`; none are printed or copied into the repository.

## Prove PHP sees the same public visitor IP

```sh
bash /var/www/highlion/deploy/verify-live.sh
curl -4 -fsS https://www.highlion.net/api/client-ip.php
```

Both `ip` and `remote_addr` must match Cloudflare's trace, `source` must be `cloudflared`, and `verified` must be true. Only `peer` should be loopback. This comparison fails loudly; a raw access-log header is not accepted as proof.

The same script then checks the installed nginx origin: `/contact` and
`/contact.html` must contain one document, one form and all five links, including
the two server-only profiles. It checks HEAD, country denial, direct fragment/JSON
denial, styled 404/405 responses, `Allow` headers and a query-preserving slash
redirect. These local checks do not submit messages or generate method alerts.

## Test an actual public HTTP alert

```sh
qa_id="hl-qa-$(date -u +%Y%m%dT%H%M%SZ)"
curl -4 -sS -o /dev/null -w 'Method alert: %{http_code}\n' -A "$qa_id" "https://www.highlion.net/api/contact.php?qa=$qa_id"
```

Expect 405 and a Telegram table headed **Unexpected HTTP method detected**, containing the verified caller IP, the QA user agent/query and a loopback proxy peer. This check does not add probe strikes. If the shared five-alert/minute budget was recently used, wait a minute.

A single positive path probe, if the current IP is not already banned, exercises the isolated relay:

```sh
curl -4 --path-as-is -sS -o /dev/null -w 'Traversal alert: %{http_code}\n' -A "$qa_id-path" "https://www.highlion.net/assets/../.env?qa=$qa_id"
```

Expect 403 and **Path traversal detected**, with the same visitor IP. This is a positive probe strike: use the disposable regression suite for repeated/ban tests. Cloudflare can reject hostile requests before they reach the origin; check origin logs to distinguish edge blocking from PHP notification delivery.

```sh
sudo tail -n 8 /var/tmp/highlion-honeypot.log | python3 -m json.tool --json-lines
sudo tail -n 8 /var/log/nginx/highlion-path.log | python3 -m json.tool --json-lines
```

`sudo php /var/www/highlion/deploy/test-alert.php` remains a **synthetic CLI formatting test**. Its TEST heading and loopback address are intentional; it cannot prove HTTP visitor identity.

## About and claim animations

Open `https://www.highlion.net/about.html?v=hl97`. There must be TWO thin animated code bands, like index: between the profile/source grid and terminal preview, and below the preview. They contain moving hex letters/code, not a static 01 badge. The source bay and reduced terminal preview remain. At 390px width both bands still paint without horizontal scrolling. Reduced motion shows static glyphs.

Open `https://www.highlion.net/?v=hl97`. In the simulated terminal, run `cat /home/kali/.secret_challenge1.hlctf`, close the challenge popup, then `claim HL8{modular_76}`. Verify success and the configured reward. Close reward windows before further commands. `score` and `trophies` must agree with FLAGS.

Submit `HL8{xor_29659}` through header FLAGS: confetti appears over the modal, it closes after about 900ms, and the reward popup follows. The dedicated canvas disappears within two seconds. Invalid `HL8{invalid_flag}` leaves an error and no confetti. To exercise a delegated trigger from the browser console:

```js
var qaButton = document.createElement('button');
qaButton.dataset.flagsOpen = '';
qaButton.textContent = 'QA FLAGS';
document.querySelector('main').prepend(qaButton);
qaButton.click();
```

Submit `HL8{route_34_445_ember}`, then remove the temporary button with `qaButton.remove()`.

## Disposable automated checks

```sh
node tests/shell.test.cjs
node tests/claims.test.cjs
python3 tests/api_test.py "$(command -v php)"
python3 tests/config_test.py
python3 tests/routing_test.py --php-dir /usr/bin --nginx /usr/sbin/nginx --nginx-conf-dir /etc/nginx
```

The last suite requires php-cgi and nginx with realip/auth_request. It launches temporary localhost services with captured Telegram delivery and disposable configuration/state. It does not change live bans, credentials or nginx configuration.
