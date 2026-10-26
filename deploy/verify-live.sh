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
