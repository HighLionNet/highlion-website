# Release checks

Run server commands over SSH after the nginx configuration handoff has been applied and both nginx/FPM configuration tests pass. Telegram credentials must already exist in `/etc/highlion/honeypot.env`.

## Automated regression

From a checkout or deployed tree:

```sh
cd /var/www/highlion
node tests/shell.test.cjs
node tests/claims.test.cjs
python3 tests/api_test.py "$(command -v php)"
python3 tests/routing_test.py --php-dir /usr/bin --nginx /usr/sbin/nginx --nginx-conf-dir /etc/nginx
```

The routing test requires `php-cgi` and nginx with realip/auth_request. All test servers bind temporary localhost ports, all credentials/state are disposable, and Telegram delivery is captured locally. These tests do not send live alerts or change live bans.

## Live Telegram transport and visitor identity

```sh
sudo php /var/www/highlion/deploy/test-alert.php
```

Expect one parsed, striped two-column table. `<HTML & escaping>` must appear as text. This CLI test labels itself synthetic and correctly shows `127.0.0.1`; it does not add strikes.

Run the following **through the public domain**, from the computer whose IP you want to verify. Wait a minute if prior tests have used the five-alert/minute notification budget. Do not use `--resolve` to localhost or forge forwarding headers.

```sh
qa_id="hl-qa-$(date -u +%Y%m%dT%H%M%SZ)"
curl --fail --silent --show-error https://www.highlion.net/cdn-cgi/trace | sed -n 's/^ip=/Expected visitor IP: /p'
curl --silent --show-error -o /dev/null -w 'Bad-method alert: %{http_code}\n' -A "$qa_id-method" "https://www.highlion.net/api/contact.php?qa=$qa_id"
curl --silent --show-error -o /dev/null -w 'Honeypot form alert: %{http_code}\n' -A "$qa_id-form" --data-urlencode 'company=HighLion-QA' --data-urlencode 'page=403' "https://www.highlion.net/api/contact.php?qa=$qa_id"
curl --path-as-is --silent --show-error -o /dev/null -w 'Path alert: %{http_code}\n' -A "$qa_id-path" "https://www.highlion.net/.env?qa=$qa_id"
```

Expected statuses: **405, 200, 403**. Each table must show the same expected visitor IP, the correct method/URI/query and matching QA user agent. **Proxy peer** should be `127.0.0.1` or `::1` for cloudflared. A test IP already banned will receive 403 before normal handlers; use the disposable suite to test bans. Do not repeat the positive production probes five times.

On the server, inspect retained evidence without printing credentials:

```sh
sudo tail -n 8 /var/tmp/highlion-honeypot.log | python3 -m json.tool --json-lines
sudo tail -n 8 /var/log/nginx/highlion-path.log | python3 -m json.tool --json-lines
sudo journalctl -u php8.2-fpm -n 30 --no-pager
```

## Live challenge animations

Open `https://www.highlion.net/?v=hl8y`. In the **website's simulated terminal**, run:

```text
ls -a ~
cat /home/kali/.secret_challenge1.hlctf
```

The challenge window should open with moving characters and ambient code. Close it, then run:

```text
claim HL8{modular_76}
score
trophies
```

The terminal prints success (or `Already claimed.`); the celebration window shows the configured simulated-root reward. Its final punctuation must match the configuration. Close the reward window before typing subsequent commands. Use `su root` and enter the reward when prompted to check the simulated role. This does not authenticate to the host.

Click the **header FLAGS** button and submit `HL8{xor_29659}`. Confetti must visibly paint above the open dialog, which closes after about 900ms; then the animated reward window appears. The dedicated `#flag-fx` canvas must disappear within two seconds. Reopen FLAGS and verify the claim count/IDs persist across refresh and page navigation.

To exercise the delegated trigger in the browser developer console on the site:

```js
var qaButton = document.createElement('button');
qaButton.dataset.flagsOpen = '';
qaButton.textContent = 'QA FLAGS';
document.querySelector('main').prepend(qaButton);
qaButton.click();
```

Submit `HL8{route_34_445_ember}` and expect the same confetti/delay/reward sequence. Remove the temporary button with `qaButton.remove()`. An invalid value such as `HL8{invalid_flag}` must leave the dialog open with an error and create no confetti. The final valid fixture is `HL8{timeline_kestrel_051842}`.

Check About, Projects and Writeups at desktop width and around 390px: the numbered divider must be visible without horizontal overflow. The About source bay and terminal must remain. On Projects, select **Web** and then **All** to verify the CSP-safe filter. Enable reduced motion in browser rendering settings: the challenge remains usable with static artwork and the reward text.
