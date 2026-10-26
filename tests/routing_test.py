import argparse
import concurrent.futures
import http.client
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

PORT, APP, RELAY = [free_port() for _ in range(3)]
http_maps = (ROOT / 'deploy/nginx-path-http.conf').read_text()
server = (ROOT / 'deploy/nginx-path-server.conf').read_text()
server += '\n' + (ROOT / 'deploy/nginx-cloudflared-server.conf').read_text()
server += '\n' + (ROOT / 'deploy/nginx-abuse.conf').read_text()
server = server.replace('include fastcgi_params;', f'include {NGINX_CONF_DIR.as_posix()}/fastcgi_params;')
server = server.replace('unix:/run/php/php-fpm.sock', f'127.0.0.1:{APP}')
server = server.replace('/var/log/nginx/highlion-path.log', (WORK / 'logs/security.log').as_posix())
server = server.replace('unix:/run/php/highlion-relay.sock', f'127.0.0.1:{RELAY}')
server = server.replace('/var/www/highlion/api/_relay.php', (PUBLIC / 'api/_relay.php').as_posix())
api = (ROOT / 'deploy/nginx-api.conf').read_text().replace('unix:/run/php/php-fpm.sock', f'127.0.0.1:{APP}')
api = api.replace('include fastcgi_params;', f'include {NGINX_CONF_DIR.as_posix()}/fastcgi_params;')
(WORK / 'http.conf').write_text(http_maps)
(WORK / 'server.conf').write_text(server)
(WORK / 'api.conf').write_text(api)
conf = f"""
worker_processes 1;
daemon off;
master_process off;
error_log {(WORK / 'logs/error.log').as_posix()} info;
pid {(WORK / 'nginx.pid').as_posix()};
events {{ worker_connections 512; }}
http {{
    include {NGINX_CONF_DIR.as_posix()}/mime.types;
    include {WORK.as_posix()}/http.conf;
    client_body_temp_path {WORK.as_posix()}/temp;
    fastcgi_temp_path {WORK.as_posix()}/temp;
    server {{
        listen 127.0.0.1:{PORT};
        server_name www.highlion.net;
        root {PUBLIC.as_posix()};
        index index.html;
        include {WORK.as_posix()}/server.conf;
        access_log {WORK.as_posix()}/logs/access.log;
        include {WORK.as_posix()}/api.conf;
        error_page 403 /403.html;
        error_page 404 /404.html;
        error_page 405 /405.html;
        location / {{
            if ($request_method !~ ^(GET|HEAD)$) {{ return 405; }}
            try_files $uri $uri.html $uri/ =404;
        }}
    }}
}}
"""
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

def request(target, method='GET', ip='192.0.2.1', headers=None, body=None, source=None):
    connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=6, source_address=(source, 0) if source else None)
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
        return body, headers

    # Every shipped static file, including fake shell passwd/shadow/resolv.conf,
    # HTML includes, CSS, JS, fonts, PDFs, MP4s and the hl8w cache query.
    for source in PUBLIC.rglob('*'):
        if source.is_file() and 'api' not in source.relative_to(PUBLIC).parts and source.name != 'alerts.jsonl':
            path = '/' + source.relative_to(PUBLIC).as_posix() + '?v=hl8y'
            body, _ = expect(path, [200])
            assert body == source.read_bytes(), path
    for page in ['/', '/about', '/projects', '/writeups', '/about.html?topic=etc/passwd', '/about.html?ref=https%3A%2F%2Fexample.org%2Fwp-login.php', '/%61bout.html', '/about.html?file=report.pdf', '/about.html?search=php://filter']:
        expect(page, [200])
    for method in ['HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH', 'TRACE', 'PROPFIND']:
        expect('/css/style.css', [200] if method == 'HEAD' else [405], method=method)
    expect('/about.html', [405], method='POST', body='x')
    expect('/contact.html', [403], headers={'CF-IPCountry': 'US'})
    # A nontrusted socket cannot claim IL or a different visitor IP.
    expect('/contact.html', [403], source='127.0.0.2')
    expect('/about.html', [200], source='127.0.0.2', headers={'User-Agent': 'Nikto sqlmap ../../etc/passwd', 'X-Original-URL': '/.env', 'X-Rewrite-URL': '/etc/passwd'})
    # Every API alias; real CSRF and benign JSON preserve form and shell flows.
    for name in ['csrf', 'ctf', 'thumb']:
        for suffix in ['', '.php', '/', '/index.php']:
            expect('/api/' + name + suffix, [200, 204])
    token_body, _ = expect('/api/csrf.php', [200], ip='192.0.2.10')
    token = json.loads(token_body)['token']
    for suffix in ['', '.php', '/', '/index.php']:
        expect('/api/contact' + suffix, [200], ip='192.0.2.10', method='POST', headers={'Content-Type': 'application/json', 'Origin': 'https://www.highlion.net', 'Cookie': 'hl_csrf=' + token}, body=json.dumps({'name':'Test Person', 'email':'test@example.org', 'message':'A real contact message mentioning /etc/passwd and php://filter.', 'token':token}))
    for name in ['shell-slot', 'shell-auth', 'ctf']:
        expect('/api/' + name + '.php', [200, 400, 401, 404], method='POST', headers={'Origin': 'https://www.highlion.net', 'Content-Type':'application/json'}, body='{}', ip='192.0.2.11')
    before = (PUBLIC / 'alerts.jsonl').read_text().count('\n')
    for target in ['/api/trap', '/api/trap.php', '/api/trap/', '/api/trap/index.php', '/api/_relay.php', '/api/_lib.php', '/api/csrf.php/anything', '/api/unknown.php', '/deploy/nginx-api.conf', '/tests/api_test.py', '/lab/', '/backup.sql', '/a.php.jpg']:
        expect(target, [404])
    assert (PUBLIC / 'alerts.jsonl').read_text().count('\n') == before
    scanner = ['/wp-login.php', '/PHPMyAdmin/index.php', '/%77p-login.php', '//wp-admin/', '/foo/actuator/env', '/cgi-bin/bash', '/server-status', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/manager/html', '/.DS_Store']
    for target in scanner: expect(target, [404])
    assert (PUBLIC / 'alerts.jsonl').read_text().count('\n') == before
    # First observation arrives at the internal pool with original URI/method.
    expect('/assets/../.env?probe=1', [403], method='POST', ip='198.51.100.1', body='ignored', headers={'User-Agent': 'probe\x7fagent'})
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
    expect('/about.html?v=hl8y', [200])
    expect('/api/csrf.php', [200])
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
