#!/usr/bin/env bash
set -euo pipefail
# Both requests use the same address family and the public Cloudflare route.
expected_ip=$(curl -4 -fsS --max-time 20 https://www.highlion.net/cdn-cgi/trace | sed -n 's/^ip=//p')
identity=$(curl -4 -fsS --max-time 20 "https://www.highlion.net/api/client-ip.php?qa=$(date +%s)")
python3 - "$expected_ip" "$identity" <<'PY'
import ipaddress, json, sys
expected = ipaddress.ip_address(sys.argv[1].strip())
identity = json.loads(sys.argv[2])
if identity.get('source') != 'cloudflared' or not identity.get('verified') or ipaddress.ip_address(identity.get('ip', '0.0.0.0')) != expected or ipaddress.ip_address(identity.get('remote_addr', '0.0.0.0')) != expected:
    raise SystemExit('FAIL: Cloudflare and PHP identities differ: ' + json.dumps(identity))
print('PASS: Cloudflare and PHP both identify visitor ' + str(expected))
print('Proxy peer: ' + identity['peer'] + '; source: ' + identity['source'])
PY

# Exercise the installed origin rules without sending a contact message or alert.
python3 - <<'PY'
import http.client

def request(path, method='GET', country='IL'):
    connection = http.client.HTTPConnection('127.0.0.1', 80, timeout=10)
    connection.request(method, path, headers={
        'Host': 'www.highlion.net', 'CF-Connecting-IP': '198.51.100.77',
        'CF-IPCountry': country,
    })
    response = connection.getresponse()
    result = response.status, response.read(), dict(response.getheaders())
    connection.close()
    return result

for path in ['/contact', '/contact.html']:
    status, body, headers = request(path)
    assert status == 200, (path, status)
    assert body.lower().count(b'<!doctype html>') == 1, 'Contact contains a nested error page'
    assert body.count(b'id="contactForm"') == 1 and b'error-panel' not in body
    assert body.count(b'class="social-link"') == 5, 'Contact links are missing'
    assert b'linkedin.com/in/' in body and b'tryhackme.com/p/' in body, 'Server-only profiles are missing'
    assert b'<!--#' not in body, 'Contact SSI was not processed'
    assert headers.get('Cache-Control') == 'private, no-store'
    assert request(path, 'HEAD')[0:2] == (200, b'')
    assert request(path, country='US')[0] == 403
for path in ['/missing-page', '/403', '/404', '/405', '/403.html', '/404.html', '/405.html', '/assets/contact-links.inc.html', '/assets/contact-links.json']:
    status, body, headers = request(path)
    assert status == 404 and b'error-panel-404' in body, (path, status)
    assert headers.get('Cache-Control') == 'no-store'
for path, allowed in [('/contact.html', 'GET, HEAD'), ('/api/contact', 'POST'), ('/api/ctf.php', 'GET, HEAD, POST')]:
    status, body, headers = request(path, 'OPTIONS')
    assert status == 405 and b'error-panel-405' in body, (path, status)
    assert headers.get('Allow') == allowed, (path, headers.get('Allow'))
status, _, headers = request('/contact/?via=verify')
assert status == 308 and headers.get('Location') == '/contact.html?via=verify'
print('PASS: contact profiles, aliases, country gate, 403/404/405, HEAD, Allow and redirects')
PY
