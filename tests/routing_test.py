import argparse
import concurrent.futures
import http.client
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time

parser = argparse.ArgumentParser(description='Exercise real nginx/PHP routing using disposable local configuration, storage and a captured alert sender.')
parser.add_argument('--php-dir', type=Path, required=True, help='Directory containing php-cgi (or php-cgi.exe)')
parser.add_argument('--nginx', type=Path, required=True, help='nginx executable')
parser.add_argument('--nginx-conf-dir', type=Path, required=True, help='Directory containing mime.types and fastcgi_params')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / '.qa'
QA.mkdir(exist_ok=True)
WORK = QA / ('path-check-' + str(time.time_ns()))
WORK.mkdir(exist_ok=True)
PHP_DIR = args.php_dir.resolve()
NGINX_EXE = args.nginx.resolve()
NGINX_DIR = NGINX_EXE.parent
NGINX_CONF_DIR = args.nginx_conf_dir.resolve()
PUBLIC = WORK / 'public'
PUBLIC.mkdir(exist_ok=True)
for name in ['api', 'assets', 'css', 'js', 'components', 'writeups']:
    shutil.copytree(ROOT / name, PUBLIC / name, dirs_exist_ok=True)
for source in ROOT.glob('*.html'):
    shutil.copy2(source, PUBLIC / source.name)
for folder in ['state', 'config', 'sessions', 'logs', 'temp']:
    (WORK / folder).mkdir(exist_ok=True)
for source in (PUBLIC / 'api').rglob('*.php'):
    source.write_text(source.read_text().replace('/var/tmp', (WORK / 'state').as_posix()).replace('/etc/highlion', (WORK / 'config').as_posix()).replace('/var/lib/highlion', (WORK / 'state').as_posix()))
(WORK / 'state/abuse').mkdir()
# No real bot, credentials, config or external network are used in this fixture.
library = PUBLIC / 'api' / '_lib.php'
code = library.read_text()
begin = code.index('function hl_telegram(')
end = code.index('function hl_country()', begin)
code = code[:begin] + """function hl_telegram(string $path, string $text, bool $rich=false, int $timeout=8): bool {
    file_put_contents(__DIR__ . '/../alerts.jsonl', json_encode([$path,$text,$rich,$timeout]) . "\\n", FILE_APPEND|LOCK_EX);
    return true;
}

""" + code[end:]
library.write_text(code)
for path in [WORK / 'state/highlion-honeypot.log', PUBLIC / 'alerts.jsonl', WORK / 'logs/security.log', WORK / 'logs/error.log']:
    path.write_text('')

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

PORT, APP, RELAY, TOR, FALLBACK = [free_port() for _ in range(5)]


def expand_repo_includes(source):
    return re.sub(r'include /var/www/highlion/(deploy/[^;]+);',
                  lambda match: expand_repo_includes((ROOT / match[1]).read_text()), source)


# Exercise the COMPLETE shipped nginx.conf and virtual hosts, including their
# exact FastCGI parameters. Change only paths, ports and OS-specific process setup.
conf = (ROOT / 'deploy/nginx.conf').read_text()
conf = conf.replace('include /etc/nginx/sites-enabled/*;', (ROOT / 'deploy/highlion.conf').read_text())
conf = conf.replace('include /etc/nginx/modules-enabled/*.conf;', '').replace('include /etc/nginx/conf.d/*.conf;', '')
conf = expand_repo_includes(conf)
conf = conf.replace('include /etc/nginx/mime.types;', f'include {NGINX_CONF_DIR.as_posix()}/mime.types;')
conf = re.sub(r'^user [^;]+;', '', conf, flags=re.M)
if os.name == 'nt':
    # Windows nginx has no AF_UNIX support. Both settings trust no TCP peer.
    conf = conf.replace('set_real_ip_from unix:;', 'set_real_ip_from 0.0.0.0/32;')
conf = conf.replace('worker_processes auto;', 'worker_processes 1;\ndaemon off;\nmaster_process off;')
conf = conf.replace('/run/nginx.pid', (WORK / 'nginx.pid').as_posix())
conf = conf.replace('/var/log/nginx/error.log', (WORK / 'logs/error.log').as_posix())
conf = conf.replace('/var/log/nginx/access.log', (WORK / 'logs/access.log').as_posix())
conf = conf.replace('/var/log/nginx/highlion-path.log', (WORK / 'logs/security.log').as_posix())
conf = conf.replace('/var/www/highlion', PUBLIC.as_posix())
conf = conf.replace('unix:/run/php/php8.2-fpm.sock', f'127.0.0.1:{APP}')
conf = conf.replace('unix:/run/php/highlion-relay.sock', f'127.0.0.1:{RELAY}')
conf = conf.replace('127.0.0.1:8081', f'127.0.0.1:{TOR}')
conf = re.sub(r'(listen 127\.0\.0\.1:)80(?=[; ])', lambda match: match[1] + str(PORT), conf)
conf = conf.replace('http {', f'http {{\nclient_body_temp_path {WORK.as_posix()}/temp;\nfastcgi_temp_path {WORK.as_posix()}/temp;', 1)
# Also verify the canonical identity when realip substitution itself is absent.
fallback = f'\nserver {{ listen 127.0.0.1:{FALLBACK}; server_name www.highlion.net; set $hl_transport cloudflared; ' + expand_repo_includes((ROOT / 'deploy/nginx-site.conf').read_text()) + '\n}\n'
fallback = fallback.replace('/var/www/highlion', PUBLIC.as_posix()).replace('unix:/run/php/highlion-relay.sock', f'127.0.0.1:{RELAY}')
fallback = fallback.replace('/var/log/nginx/access.log', (WORK / 'logs/access.log').as_posix()).replace('/var/log/nginx/highlion-path.log', (WORK / 'logs/security.log').as_posix())
conf = conf.rsplit('}', 1)[0] + fallback + '}\n'
(WORK / 'nginx.conf').write_text(conf)
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
nginx = str(NGINX_EXE)
prefix = NGINX_DIR.as_posix() + '/'
subprocess.run([nginx, '-p', prefix, '-c', (WORK / 'nginx.conf').as_posix(), '-t'], check=True, creationflags=flags)
env = os.environ.copy()
env['PHP_CGI_MAX_REQUESTS'] = '0'
ini = WORK / 'php.ini'
ini.write_text(('extension_dir="' + (PHP_DIR / 'ext').as_posix() + '"\nextension=gd\n' if os.name == 'nt' else '') + 'expose_php=Off\ndisplay_errors=Off\nlog_errors=On\n')
env['PHPRC'] = str(ini)
procs, handles = [], []
def start(args, name):
    handle = (WORK / f'logs/{name}.log').open('w')
    handles.append(handle)
    proc = subprocess.Popen(args, env=env, stdout=handle, stderr=handle, creationflags=flags)
    procs.append(proc)
    return proc

def request(target, method='GET', ip='192.0.2.1', headers=None, body=None, source=None, port=None):
    connection = http.client.HTTPConnection('127.0.0.1', port or PORT, timeout=6, source_address=(source, 0) if source else None)
    values = {'Host': 'www.highlion.net', 'CF-Connecting-IP': ip, 'CF-IPCountry': 'IL'}
    if headers: values.update(headers)
    connection.request(method, target, body=body, headers=values)
    response = connection.getresponse()
    result = response.status, response.read(), dict(response.getheaders())
    connection.close()
    return result

try:
    for port, name in [(APP, 'app'), (RELAY, 'relay')]:
        start([str(PHP_DIR / ('php-cgi.exe' if os.name == 'nt' else 'php-cgi')), '-d', 'session.save_path=' + (WORK / 'sessions').as_posix(), '-b', f'127.0.0.1:{port}'], name)
    start([nginx, '-p', prefix, '-c', (WORK / 'nginx.conf').as_posix()], 'nginx')
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', PORT), timeout=.1): break
        except OSError: time.sleep(.05)
    checks = 0
    def expect(target, expected, **kwargs):
        global checks
        status, body, headers = request(target, **kwargs)
        assert status in expected, (target, status, body[:100])
        assert status != 418, target
        checks += 1
        if status in [403, 404, 405] and kwargs.get('method', 'GET') != 'HEAD':
            assert body == (PUBLIC / f'{status}.html').read_bytes(), (target, status, 'unstyled error', body[:120])
            assert 'text/html' in headers.get('Content-Type', ''), (target, headers)
            assert headers.get('Cache-Control') == 'no-store', (target, headers)
            assert 'Content-Security-Policy' in headers, (target, 'error lost security headers')
        return body, headers

    # Every shipped static file, including fake shell passwd/shadow/resolv.conf,
    # HTML includes, CSS, JS, fonts, PDFs, MP4s and the unified cache query.
    for source in PUBLIC.rglob('*'):
        if source.is_file() and 'api' not in source.relative_to(PUBLIC).parts and source.name != 'alerts.jsonl':
            path = '/' + source.relative_to(PUBLIC).as_posix() + '?v=hl95'
            if source.name in ['403.html', '404.html', '405.html']:
                expect(path, [404])  # Error documents are internal-only in production.
            else:
                body, headers = expect(path, [200])
                assert body == source.read_bytes(), path
                assert 'Content-Security-Policy' in headers, path + ' lost security headers'
    for page in ['/', '/about', '/projects', '/writeups', '/about.html?topic=etc/passwd', '/about.html?ref=https%3A%2F%2Fexample.org%2Fwp-login.php', '/%61bout.html', '/about.html?file=report.pdf', '/about.html?search=php://filter']:
        expect(page, [200])
    for method in ['HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH', 'TRACE', 'PROPFIND']:
        expect('/css/style.css', [200] if method == 'HEAD' else [405], method=method)
    expect('/about.html', [405], method='POST', body='x')
    for contact in ['/contact', '/contact.html', '/%63ontact.html']:
        for country in ['US', '', 'XX', 'il', 'IL,US']:
            body, _ = expect(contact, [403], headers={'CF-IPCountry': country})
            assert b'id="contactForm"' in body and b'name="company"' in body
        body, _ = expect(contact, [200])
        assert body == (PUBLIC / 'contact.html').read_bytes(), contact
        expect(contact, [403], source='127.0.0.2')
    expect('/404.html', [404], method='HEAD')
    expect('/missing-page', [404], method='HEAD')
    expect('/403.html', [404], headers={'CF-IPCountry': ''})
    # A nontrusted socket cannot claim IL or a different visitor IP.
    expect('/contact.html', [403], source='127.0.0.2')
    expect('/about.html', [200], source='127.0.0.2', headers={'User-Agent': 'Nikto sqlmap ../../etc/passwd', 'X-Original-URL': '/.env', 'X-Rewrite-URL': '/etc/passwd'})
    # Every API alias; real CSRF and benign JSON preserve form and shell flows.
    for name in ['csrf', 'ctf', 'thumb', 'client-ip']:
        for suffix in ['', '.php', '/', '/index.php']:
            expect('/api/' + name + suffix, [200, 204])
    for origin_port in [PORT, FALLBACK]:
        for visitor in ['8.8.8.8', '2001:4860:4860::8888']:
            body, _ = expect('/api/client-ip.php', [200], ip=visitor, port=origin_port, headers={'HL-Client-IP': '9.9.9.9', 'X-Forwarded-For': '9.9.9.9'})
            identity = json.loads(body)
            assert identity['ip'] == identity['remote_addr'] == visitor
            assert identity['source'] == 'cloudflared' and identity['verified'] is True
            assert identity['peer'] == '127.0.0.1'
    body, _ = expect('/api/client-ip.php', [200], ip='8.8.8.8', source='127.0.0.2')
    identity = json.loads(body)
    assert identity['ip'] == identity['remote_addr'] == '127.0.0.2' and identity['source'] == 'socket' and identity['verified'] is False
    onion = 'hh7547je3hpb4hj7stuiorzwnwazamecatqn6saqkxamlmckztgr2lid.onion'
    for contact in ['/contact', '/contact.html']:
        expect(contact, [403], port=TOR, headers={'Host': onion, 'CF-IPCountry': 'IL'})
    body, _ = expect('/api/client-ip.php', [200], port=TOR, ip='8.8.8.8', headers={'Host': onion})
    identity = json.loads(body)
    assert identity['ip'] is None and identity['remote_addr'] == '127.0.0.1' and identity['source'] == 'tor' and identity['verified'] is False
    expect('/api/client-ip.php', [421], port=TOR)  # Forging www Host cannot cross listeners.
    expect('/', [421], headers={'Host': 'attacker.example'})
    _, headers = expect('/about.html?qa=https', [308], headers={'X-Forwarded-Proto': 'http'})
    assert headers['Location'] == 'https://www.highlion.net/about.html?qa=https'
    expect('/about.html', [200], port=TOR, headers={'Host': onion, 'X-Forwarded-Proto': 'http'})
    token_body, _ = expect('/api/csrf.php', [200], ip='192.0.2.10')
    token = json.loads(token_body)['token']
    for suffix in ['', '.php', '/', '/index.php']:
        expect('/api/contact' + suffix, [200], ip='192.0.2.10', method='POST', headers={'CF-IPCountry':'US', 'Content-Type': 'application/json', 'Origin': 'https://www.highlion.net', 'Cookie': 'hl_csrf=' + token}, body=json.dumps({'name':'Test Person', 'email':'test@example.org', 'message':'A real contact message mentioning /etc/passwd and php://filter.', 'token':token}))
    expect('/api/contact.php', [200], ip='192.0.2.12', method='POST', headers={'CF-IPCountry':'US', 'Content-Type':'application/x-www-form-urlencoded', 'Origin':'https://www.highlion.net', 'Cookie':'hl_csrf=' + token}, body='name=Test+Person&email=test%40example.org&message=A+form+encoded+contact+message.&token=' + token)
    for suffix in ['.php', '', '/']:
        expect('/api/contact' + suffix, [200], ip='192.0.2.13', method='POST', headers={'CF-IPCountry':'US', 'Content-Type':'application/x-www-form-urlencoded'}, body='company=bot&page=403')
    for name in ['shell-slot', 'shell-auth', 'ctf']:
        expect('/api/' + name + '.php', [200, 400, 401, 404], method='POST', headers={'Origin': 'https://www.highlion.net', 'Content-Type':'application/json'}, body='{}', ip='192.0.2.11')
    before = (PUBLIC / 'alerts.jsonl').read_text().count('\n')
    for target in ['/api/deny', '/api/deny.php', '/api/deny/', '/api/deny/index.php', '/api/_relay.php', '/api/_lib.php', '/api/csrf.php/anything', '/api/unknown.php', '/deploy/nginx-api.conf', '/tests/api_test.py', '/lab/', '/backup.sql', '/a.php.jpg']:
        expect(target, [404])
    assert (PUBLIC / 'alerts.jsonl').read_text().count('\n') == before
    scanner = ['/wp-login.php', '/PHPMyAdmin/index.php', '/%77p-login.php', '//wp-admin/', '/foo/actuator/env', '/cgi-bin/bash', '/server-status', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/manager/html', '/.DS_Store']
    for target in scanner: expect(target, [404])
    assert (PUBLIC / 'alerts.jsonl').read_text().count('\n') == before
    # First observation arrives at the internal pool with original URI/method.
    expect('/assets/../.env?probe=1', [403], method='POST', port=FALLBACK, ip='198.51.100.1', body='ignored', headers={'User-Agent': 'probe\x7fagent'})
    time.sleep(.1)
    rows = [json.loads(line) for line in (WORK / 'state/highlion-honeypot.log').read_text().splitlines()]
    row = rows[-1]
    assert row['uri'] == '/assets/../.env'
    assert row['query'] == 'probe=1'
    assert row['method'] == 'POST'
    assert row['ip'] == '198.51.100.1' and row['country'] == 'IL'
    assert row['peer'] == '127.0.0.1' and row['id']
    assert row['ua'] == 'probeagent'
    alerts = [json.loads(line) for line in (PUBLIC / 'alerts.jsonl').read_text().splitlines()]
    assert alerts[-1][0].endswith('/honeypot.env') and alerts[-1][2] is True and alerts[-1][3] == 2
    assert '<table bordered striped compact>' in alerts[-1][1]
    assert '<h3>Path traversal detected</h3>' in alerts[-1][1]
    expect('/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', [403], ip='198.51.100.2')
    time.sleep(.1)
    alerts = [json.loads(line) for line in (PUBLIC / 'alerts.jsonl').read_text().splitlines()]
    assert '<h3>XSS payload detected</h3>' in alerts[-1][1]
    assert '198.51.100.2' in alerts[-1][1]
    rows = [json.loads(line) for line in (WORK / 'state/highlion-honeypot.log').read_text().splitlines()]
    baseline = len(rows)
    # One request per IP/minute; global budget also bounds distributed scans.
    for i in range(20):
        expect('/.env', [403], ip='198.51.100.' + str(i + 1))
    rows = (WORK / 'state/highlion-honeypot.log').read_text().splitlines()
    assert len(rows) <= baseline + 1, len(rows)
    probes = ['/a/../index.html', '/a/.%2E/index.html', '/a/%2e./index.html', '/%2eenv', '/%2e%67%69%74/config', '/.GiT/config', '/.ENV.production', '/etc/passwd', '/proc/self/environ', '/windows/win.ini', '/wp-config.php.bak', '/web.config', '/api/csrf.php?file=../../etc/passwd', '/?template=php%3A%2F%2Ffilter', '/?path=%2Fetc%2Fshadow']
    for target in probes: expect(target, [403])
    # Native nginx rejection; these must not enter PHP even with a free budget.
    for target in ['/a%2fb', '/%252e%252e/', '/%25252e%25252e/', '/%5cetc%5cpasswd', '/foo\\bar', '/%00x', '/%c0%ae%c0%ae/', '/%GG', '/%u002e']:
        expect(target, [400, 403])
    expect('/api/_relay.php', [404], headers={'HL_ROUTE':'station','X-HL-Route':'station'})
    expect('/api/contact.php', [413], ip='192.0.2.80', method='POST', body='x' * 17000)
    for i in range(7):
        expect('/api/shell-auth' + ['','.php','/','/index.php'][i % 4], [401] if i < 5 else [429], ip='192.0.2.70', method='POST', headers={'Origin':'https://www.highlion.net'}, body='{}')
    # A scan, throttling and API gates must not impair healthy assets/endpoints.
    expect('/about.html?v=hl95', [200])
    expect('/api/csrf.php', [200])
    # Static auth subrequests and application requests must enforce the same IP.
    banned = WORK / 'state/abuse' / (hashlib.sha256(b'8.8.4.4').hexdigest() + '.json')
    banned.write_text(json.dumps({'strikes': 5, 'ban_until': int(time.time()) + 3600}))
    for origin_port in [PORT, FALLBACK]:
        expect('/about.html', [403], ip='8.8.4.4', port=origin_port)
        expect('/api/client-ip.php', [403], ip='8.8.4.4', port=origin_port)
    expect('/api/client-ip.php', [200], ip='8.8.4.4', port=TOR, headers={'Host': onion})
    expect('/api/contact.php', [405], ip='192.0.2.91')
    errors = (WORK / 'logs/error.log').read_text()
    assert 'redirection cycle' not in errors and 'rewrite or internal' not in errors, errors
    logged = [json.loads(line) for line in (WORK / 'logs/security.log').read_text().splitlines()]
    assert any(row['encoding'] for row in logged)
    assert any(row['scanner'] for row in logged)
    assert any(row['limit'] == 'REJECTED' for row in logged)
    print(f'Routing: {checks} requests passed, all static bytes preserved, no loops, isolated alerts and throttling verified.')
finally:
    for proc in reversed(procs):
        proc.terminate()
        proc.wait(timeout=5)
    for handle in handles: handle.close()
