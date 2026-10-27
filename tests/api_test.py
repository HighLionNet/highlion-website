"""Exercise real PHP endpoints with disposable users, cookies and storage."""
import concurrent.futures
import base64
import http.client
import json
import hashlib
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[1]
PHP = str(Path(sys.argv[1]).resolve()) if len(sys.argv) > 1 else 'php'


def run():
    qa = (REPO / '.qa').resolve()
    qa.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='highlion-api-', dir=qa) as directory:
        temporary = Path(directory).resolve()
        assert temporary.is_relative_to(qa)
        public = temporary / 'public'
        api = public / 'api'
        state = temporary / 'state'
        config = temporary / 'config'
        sessions = temporary / 'sessions'
        for folder in [api, state, config, sessions]:
            folder.mkdir(parents=True, exist_ok=True)
        (public / '403.html').write_bytes((REPO / '403.html').read_bytes())
        for source in (REPO / 'api').rglob('*.php'):
            target = api / source.relative_to(REPO / 'api')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source.read_text(encoding='utf-8').replace('/var/tmp', state.as_posix()).replace('/etc/highlion', config.as_posix()).replace('/var/lib/highlion', state.as_posix()), encoding='utf-8')
        (state / 'abuse').mkdir()
        passwords = [secrets.token_urlsafe(24) for _ in range(2)]
        cookie = secrets.token_hex(32)
        code = '<?php $values=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map(fn($v)=>password_hash($v,PASSWORD_BCRYPT),$values));'
        hashes = json.loads(subprocess.check_output([PHP, '-r', code[6:]], input=json.dumps(passwords).encode()))
        (config / 'shell.env').write_text(f'HL_ROOT_PW_HASH={hashes[0]}\nHL_ADMIN_PW_HASH={hashes[1]}\nHL_OP_COOKIE={cookie}\nHL_SHELL_SLOTS=8\nHL_CTF_ROOT_PASSWORD={passwords[1]}\n', encoding='utf-8')
        router = temporary / 'router.php'
        router.write_text("<?php $_SERVER['REMOTE_ADDR']=$_SERVER['HTTP_X_TEST_IP'] ?? '127.0.0.1'; return false;", encoding='utf-8')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        log = (temporary / 'server.log').open('w', encoding='utf-8')
        server = subprocess.Popen([PHP, '-d', 'session.save_path=' + sessions.as_posix(), '-S', f'127.0.0.1:{port}', '-t', str(public), str(router)], stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=0.1): break
                except OSError: time.sleep(0.03)
            checks = 0

            class Client:
                serial = 0

                def __init__(self, operator=False):
                    Client.serial += 1
                    self.ip = f'192.0.2.{Client.serial}'
                    self.cookies = {'hl_op': cookie} if operator else {}
                    self.id = ''

                def request(self, endpoint, payload=None, extra=None, raw=None):
                    headers = {'Origin': 'https://www.highlion.net', 'Content-Type': 'application/json', 'X-Test-IP': self.ip, 'User-Agent': 'HL8x-QA / accurate UA <&>'}
                    if self.cookies: headers['Cookie'] = '; '.join(f'{key}={value}' for key, value in self.cookies.items())
                    if extra: headers.update(extra)
                    body = raw if raw is not None else json.dumps(payload) if payload is not None else None
                    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                    resource, separator, query = endpoint.partition('?')
                    target = '/api/' + resource + '.php' + ('?' + query if separator else '')
                    connection.request('POST' if body is not None else 'GET', target, body, headers)
                    response = connection.getresponse()
                    status = response.status
                    for key, value in response.getheaders():
                        if key.lower() == 'set-cookie':
                            name, val = value.split(';', 1)[0].split('=', 1)
                            self.cookies[name] = val
                            assert all(flag in value.lower() for flag in ['secure', 'httponly', 'samesite=lax', 'path=/'])
                            assert 'domain=' not in value.lower()
                    text = response.read().decode()
                    connection.close()
                    result = json.loads(text) if text and response.getheader("Content-Type", "").startswith("application/json") else {}
                    return status, result

                def acquire(self, client=None):
                    payload = {'op': 'acquire'}
                    if client: payload['client'] = client
                    status, body = self.request('shell-slot', payload)
                    assert status == 200 and body['ok'], (status, body)
                    self.id = body['id']
                    return self.id

                def beat(self, **kwargs):
                    return self.request('shell-slot', {'op': 'beat', 'id': self.id, **kwargs})

                def auth(self, user, password, generation=None):
                    if generation is None:
                        status, body = self.beat()
                        assert status == 200
                        generation = body['generation']
                    return self.request('shell-auth', {'user': user, 'password': password, 'slot': self.id, 'generation': generation})

                def control(self, action, target='', value=''):
                    return self.request('shell-slot', {'op': action, 'actor': self.id, 'id': target, 'value': value})

            def expect(value, expected, label):
                nonlocal checks
                assert value == expected, f'{label}: {value!r} != {expected!r}'
                checks += 1

            # Every combination of the former passwords, users and operator gate.
            for user in ['admin', 'root']:
                for password_index in range(2):
                    for operator in [False, True]:
                        client = Client(operator)
                        client.acquire()
                        status, body = client.auth(user, passwords[password_index])
                        success = (user == 'admin' and password_index == 0 and operator) or (user == 'root' and password_index == 1)
                        expect(status, 200 if success else 401, f'{user} mapping {password_index}/{operator}')
                        expect(body['ok'], success, 'auth result')
                        expect(client.control('list')[0], 200 if success and user == 'admin' else 403, 'admin privilege boundary')
                        client.request('shell-slot', {'op': 'release', 'id': client.id})

            admin = Client(True)
            admin.acquire()
            expect(admin.auth('admin', passwords[0])[0], 200, 'admin login')
            visitor = Client()
            key = secrets.token_hex(16)
            visitor.acquire(key)
            first = visitor.id
            expect(visitor.acquire(key), first, 'idempotent acquire')
            stranger = Client()
            expect(stranger.request('shell-slot', {'op': 'beat', 'id': first})[0], 404, 'owner binding')
            expect(visitor.control('list')[0], 403, 'visitor controls denied')
            expect(visitor.request('shell-slot', {'op': 'beat', 'id': first}, {'Origin': 'https://evil.example'})[0], 403, 'origin rejected')
            status, listing = admin.control('list')
            visitor_row = next(row for row in listing['slots'] if row['id'] == first)
            expect(visitor_row['ip'], visitor.ip, 'admin sees real remote IP')
            expect(visitor_row['ua'], 'HL8x-QA / accurate UA <&>', 'admin sees accurate UA')
            expect(any(key in visitor.beat()[1] for key in ['ip', 'ua', 'slots']), False, 'heartbeat has no identity leak')
            token1 = visitor.request('csrf')[1]['token']
            expect(visitor.request('csrf')[1]['token'], token1, 'csrf stable across tabs')
            expect(visitor.request('shell-slot', {'op': 'beat', 'id': first}, {'Origin': '', 'X-CSRF-TOKEN': token1})[0], 200, 'originless token')
            expect(visitor.request('shell-slot', {'op': 'beat', 'id': first}, {'Origin': '', 'X-CSRF-TOKEN': 'x'})[0], 403, 'bad token')
            expect(visitor.request('shell-slot', raw='[]')[0], 400, 'array body')
            expect(visitor.request('shell-auth', raw='x' * 5000)[0], 413, 'oversized auth')
            for action, value in [('banner', 'hello'), ('theme', 'ice'), ('particles', 'off'), ('appearance', 'accent #abc123')]:
                expect(admin.control(action, first, value)[0], 200, action)
            expect(admin.control('appearance', first, 'color red; display:none')[0], 400, 'css injection')
            expect(admin.control('exec', first, 'echo\x00evil')[0], 400, 'control null byte')
            expect(admin.control('banner', first, 'x' * 241)[0], 400, 'oversized banner')
            expect(visitor.beat(ack=4, result={'status': 0, 'output': ''})[0], 400, 'unsent acknowledgement')
            status, beat = visitor.beat()
            expect(len(beat['commands']), 1, 'one delivery at a time')
            expect(beat['commands'][0]['seq'], 1, 'first sequence')
            expect(visitor.beat()[1]['commands'][0]['seq'], 1, 'unacknowledged replay')
            for seq in range(1, 5):
                status, beat = visitor.beat(ack=seq, result={'status': 0, 'output': f'done {seq}'})
                expect(status, 200, 'ordered acknowledgement')
            expect(beat['commands'], [], 'queue drained')
            expect(visitor.beat(ack=4, result={'status': 0, 'output': 'changed'})[0], 200, 'duplicate acknowledgement')
            rows = admin.control('list')[1]['slots']
            expect(next(row for row in rows if row['id'] == first)['result']['output'], 'done 4', 'duplicate does not overwrite result')
            generation = visitor.beat()[1]['generation']
            visitor.request('shell-slot', {'op': 'demote', 'id': first})
            expect(visitor.auth('root', passwords[1], generation)[0], 401, 'cancelled auth generation')
            expect(admin.control('lock', first)[0], 200, 'lock visitor')
            expect(visitor.auth('root', passwords[1])[0], 401, 'locked slot cannot authenticate')
            expect(visitor.beat()[1]['locked'], True, 'locked heartbeat')
            expect(admin.control('unlock', first)[0], 200, 'unlock visitor')
            duplicate_cookie = f'hl_op={cookie}; hl_op=wrong; hl_session={admin.cookies["hl_session"]}'
            expect(admin.request('shell-slot', {'op': 'list', 'actor': admin.id}, {'Cookie': duplicate_cookie})[0], 403, 'ambiguous cookie denied')
            # An admin cannot continue controlling from a locked slot.
            expect(admin.control('lock', admin.id)[0], 200, 'lock own slot')
            expect(admin.control('list')[0], 403, 'locked actor denied')
            # Restore the fixture only; no production file is ever opened.
            store = state / 'highlion-shell-slots.json'
            data = json.loads(store.read_text())
            for row in data['slots']: row['locked'] = False
            store.write_text(json.dumps(data))
            expect(admin.control('drop', first)[0], 200, 'terminate visitor')
            before = next(row['seen'] for row in json.loads(store.read_text())['slots'] if row['id'] == first)
            expect(visitor.beat()[1]['mode'], 'terminated', 'termination delivered')
            after = next(row['seen'] for row in json.loads(store.read_text())['slots'] if row['id'] == first)
            expect(after, before, 'terminated lease not extended')
            rate = Client()
            rate.acquire()
            for _ in range(5): expect(rate.auth('root', 'incorrect')[0], 401, 'failure counter')
            expect(rate.auth('root', passwords[1])[0], 429, 'no success bypass of limiter')
            data = json.loads(store.read_text())
            for row in data['slots']:
                if row['id'] == rate.id: row['seen'] = int(time.time()) + 1000
            store.write_text(json.dumps(data))
            expect(rate.beat()[0], 404, 'future clock record rejected')
            # Prefix-free env fallbacks keep the same explicit cross-mapping.
            env_path = config / 'shell.env'
            original_env = env_path.read_text()
            env_path.write_text(original_env.replace('HL_ROOT_PW_HASH=', 'ROOT_PW_HASH=').replace('HL_ADMIN_PW_HASH=', 'ADMIN_PW_HASH='))
            for user, index, operator in [('admin', 0, True), ('root', 1, False)]:
                fallback = Client(operator)
                fallback.acquire()
                expect(fallback.auth(user, passwords[index])[0], 200, 'fallback hash mapping')
                fallback.request('shell-slot', {'op': 'release', 'id': fallback.id})
            env_path.write_text(original_env)
            malformed = Client(True)
            malformed.acquire()
            expect(malformed.request('shell-auth', {'user': 'admin', 'password': passwords[0], 'slot': malformed.id, 'generation': 0}, {'Cookie': f'hl_op={cookie}%00; hl_session={malformed.cookies["hl_session"]}'})[0], 401, 'malformed operator cookie')
            malformed.request('shell-slot', {'op': 'release', 'id': malformed.id})
            # Cached APIs stay usable without any outbound request.
            cached_thumb = 'a' * 40
            (state / 'highlion-thumbs').mkdir(exist_ok=True)
            (state / 'highlion-thumbs' / cached_thumb).write_bytes(b'cached-image-fixture')
            (state / 'highlion-intel.json').write_text(json.dumps({'ok': True, 'items': [{'title': 'cached', 'thumb': '/api/thumb.php?id=' + cached_thumb + '&v=outdated'}], 'count': 1}))
            cached_feed = visitor.request('intel')[1]
            expect(cached_feed['count'], 1, 'news cache')
            expect(cached_feed['items'][0]['thumb'], '/api/thumb.php?id=' + cached_thumb + '&v=hl8z', 'cached thumbnail version normalized')
            (state / 'highlion-market.json').write_text(json.dumps({'bitcoin:1': {'fetched_at': int(time.time()), 'prices': [[1, 2], [3, 4]]}}))
            expect(visitor.request('market?coin=bitcoin&days=1')[1]['prices'], [[1, 2], [3, 4]], 'market cache')
            expect(visitor.request('thumb', extra={'Origin': ''})[0], 204, 'missing thumbnail')
            # The actual normalization function rejects oversized dimensions before decoding.
            intel_source = (api / 'intel.php').read_text()
            normalize = intel_source[intel_source.index('function hl_intel_normalize_image'):intel_source.index('function hl_intel_thumbnail_url')]
            png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=')
            huge = bytearray(png)
            huge[16:20] = (100000).to_bytes(4, 'big')
            probe = normalize + '$v=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map(fn($x)=>hl_intel_normalize_image(base64_decode($x),"image/png") !== null,$v));'
            image_results = json.loads(subprocess.check_output([PHP, '-r', probe], input=json.dumps([base64.b64encode(png).decode(), base64.b64encode(huge).decode(), base64.b64encode(b'<svg/>').decode()]).encode()))
            expect(image_results, [True, False, False], 'image decode bounds')
            # A thumbnail response must wait for a concurrent cache writer.
            thumb_directory = state / 'highlion-thumbs'
            thumb_directory.mkdir(exist_ok=True)
            thumb_id = 'a' * 40
            thumb_path = thumb_directory / thumb_id
            thumb_path.write_bytes(png)
            writer_code = '$h=fopen($argv[1],"c+"); flock($h,LOCK_EX); ftruncate($h,0); echo "locked\\n"; fflush(STDOUT); usleep(500000); fwrite($h,base64_decode($argv[2])); fflush($h); flock($h,LOCK_UN); fclose($h);'
            with subprocess.Popen([PHP, '-r', writer_code, str(thumb_path), base64.b64encode(png).decode()], stdout=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)) as writer:
                assert writer.stdout.readline() == b'locked\n'
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                try:
                    connection.request('GET', '/api/thumb.php?id=' + thumb_id)
                    response = connection.getresponse()
                    expect(response.read(), png, 'thumbnail read waits for writer')
                    expect(response.getheader('Content-Length'), str(len(png)), 'thumbnail length matches body')
                finally:
                    connection.close()
                    writer.wait(timeout=5)
            lock_probe = 'require $argv[1]; $first=hl_refresh_lock("test"); $second=hl_refresh_lock("test"); echo json_encode([is_resource($first),$second === false]);'
            expect(json.loads(subprocess.check_output([PHP, '-r', lock_probe, str(api / '_lib.php')])), [True, True], 'refresh single writer')
            # Logging takes identity from REMOTE_ADDR, not spoofed forwarding headers.
            hpot = Client(); hpot.ip = '127.0.0.1'
            expect(hpot.request('contact', extra={'X-Forwarded-For': '8.8.8.8', 'CF-Connecting-IP': '8.8.8.8', 'HL-Client-IP': '8.8.8.8'})[0], 405, 'bad contact method')
            row = json.loads((state / 'highlion-honeypot.log').read_text().splitlines()[-1])
            expect(row['ip'], '127.0.0.1', 'spoofed proxy headers ignored')
            expect(row['ua'], 'HL8x-QA / accurate UA <&>', 'honeypot accurate UA')
            expect(row['type'], 'BAD-METHOD', 'method type retained')
            expect((api / 'deny.php').exists(), False, 'public deny endpoint stays absent')
            relay_code = '$_SERVER["HL_ROUTE"]="station"; $_SERVER["REQUEST_METHOD"]="GET"; $_SERVER["REMOTE_ADDR"]="127.0.0.1"; $_SERVER["REQUEST_URI"]="/.env?private=.env&x=%3Cbad%3E"; $_SERVER["QUERY_STRING"]="private=.env&x=%3Cbad%3E"; $_SERVER["HL_REASON"]="private-file"; require $argv[1];'
            relay_body = subprocess.check_output([PHP, '-r', relay_code, str(api / '_relay.php')])
            expect(b'Access forbidden.' in relay_body, True, 'internal relay has styled HTML fallback')
            row = json.loads((state / 'highlion-honeypot.log').read_text().splitlines()[-1])
            expect(row['query'], 'private=.env&x=%3Cbad%3E', 'internal relay query retained')
            expect(hpot.request('contact', {'company': 'bot'})[0], 200, 'honeypot stays plausible')
            expect(hpot.request('contact', extra={'Content-Type': 'application/x-www-form-urlencoded'}, raw='company=bot&page=403')[0], 200, 'form honeypot parsed')
            expect(hpot.request('shell-slot', extra={'Content-Type': 'application/x-www-form-urlencoded'}, raw='op=acquire')[0], 400, 'shell API remains strict JSON')
            budget_code = 'require $argv[1]; $_SERVER["REMOTE_ADDR"]=$argv[2]; echo hl_rate_allow("qa-global-alerts",2,60,true) ? "1" : "0";'
            budget = [subprocess.check_output([PHP, '-r', budget_code, str(api / '_lib.php'), ip]).decode() for ip in ['8.8.8.1', '8.8.8.2', '8.8.8.3']]
            expect(budget, ['1', '1', '0'], 'outbound alert budget shared across IPs')
            identity_code = '$_SERVER["REMOTE_ADDR"]="127.0.0.1"; $_SERVER["HL_CLIENT_IP"]="::ffff:8.8.8.8"; require $argv[1]; echo hl_client_ip();'
            expect(subprocess.check_output([PHP, '-r', identity_code, str(api / '_lib.php')]).decode(), '8.8.8.8', 'verified FastCGI visitor survives a local relay')
            alert_row_code = 'require $argv[1]; $_SERVER["QUERY_STRING"]="x=1&%74oken=secret&password=secret"; echo json_encode(hl_alert_row("TEST"));'
            redacted = json.loads(subprocess.check_output([PHP, '-r', alert_row_code, str(api / '_lib.php')]))
            expect(redacted['query'], 'x=1&%74oken=[redacted]&password=[redacted]', 'secret and encoded query fields redacted')
            # Claims still validate on the server; only verified flags disclose the configured reward.
            ctf = Client()
            expect('reward' in ctf.request('ctf')[1], False, 'GET never exposes reward')
            expect(ctf.request('ctf', {'flag': 'HL8{wrong_flag_value}'})[0], 400, 'invalid claim rejected')
            for flag in [f'HL8{{modular_{pow(7, 11, 97)}}}', 'HL8{route_34_445_ember}', f'HL8{{xor_{0x6a3c ^ 0x19e7}}}', 'HL8{timeline_kestrel_051842}']:
                status, claim = ctf.request('ctf', {'flag': flag})
                expect(status, 200, 'valid claim accepted')
                expect(claim['reward'], passwords[1], 'same verified reward for every flag')
            expect(len(claim['claimed']), 4, 'all claims retained')
            expect(ctf.request('ctf', {'flag': flag})[1]['duplicate'], True, 'duplicate claim retained')
            # Real probing, never local/private IPs, drives persistent nine-month bans.
            probe_code = 'require $argv[1]; $_SERVER["REMOTE_ADDR"]=$argv[2]; echo json_encode(hl_probe_state(true));'
            stale = state / 'abuse' / (hashlib.sha256(b'8.8.4.5').hexdigest() + '.json')
            stale.write_text(json.dumps({'strikes': 4, 'last': int(time.time()) - 86400, 'ban_until': 0, 'events': [int(time.time()) - 31 * 86400] * 4}))
            recent = json.loads(subprocess.check_output([PHP, '-r', probe_code, str(api / '_lib.php'), '8.8.4.5']))
            expect(recent['strikes'], 1, 'expired strikes excluded from rolling window')
            expect(recent['ban_until'], 0, 'old events cannot cause a fresh ban')
            for local_ip in ['127.0.0.1', '::1', '10.0.0.1', '192.168.1.2', '::ffff:127.0.0.1']:
                row = json.loads(subprocess.check_output([PHP, '-r', probe_code, str(api / '_lib.php'), local_ip]))
                expect(row['strikes'], 0, 'local address ignored: ' + local_ip)
            for count in range(1, 6):
                row = json.loads(subprocess.check_output([PHP, '-r', probe_code, str(api / '_lib.php'), '8.8.4.4']))
                expect(row['strikes'], count, 'real IP strike tracked')
            expect(269 * 86400 < row['ban_until'] - time.time() <= 270 * 86400, True, 'nine-month ban')
            blocked = Client(); blocked.ip = '8.8.4.4'
            expect(blocked.request('csrf')[0], 403, 'persistent ban enforced')
            for local_ip in ['127.0.0.1', '::1']:
                blocked.ip = local_ip
                expect(blocked.request('csrf')[0], 200, 'local request not banned')
            html_code = 'require $argv[1]; echo hl_alert_html(json_decode(stream_get_contents(STDIN),true));'
            html = subprocess.check_output([PHP, '-r', html_code, str(api / '_lib.php')], input=json.dumps({'ip': '1.2.3.4', 'ua': '<script>&test', 'query': '<bad>'}).encode()).decode()
            expect('<script>' in html, False, 'alert HTML escaped')
            expect('<b>&lt;script&gt;&amp;test</b>' in html, True, 'UA prominent and escaped')
            expect(html.count('<td>'), 12, 'all request fields in readable two-column table')
            title_code = 'require $argv[1]; echo json_encode(array_map("hl_alert_title",json_decode(stream_get_contents(STDIN),true)));'
            titles = json.loads(subprocess.check_output([PHP, '-r', title_code, str(api / '_lib.php')], input=json.dumps(['TEST transport', 'PATH traversal', 'PATH xss', 'PATH private-file', 'HPOT-COMPANY', 'CSRF-FAIL', 'BAD-METHOD', 'RATE-LIMIT']).encode()))
            expect(titles, ['HighLion security alert — test', 'Path traversal detected', 'XSS payload detected', 'Sensitive file access detected', 'Unexpected company field', 'CSRF validation failed', 'Unexpected HTTP method detected', 'Request rate limit reached'], 'event-specific alert titles')
            # Capture the real Telegram transport envelope without sending any network traffic.
            (config / 'honeypot.env').write_text('TELEGRAM_BOT_TOKEN=qa-bot\nTELEGRAM_CHAT_ID=qa-chat\n')
            transport = r'''require $argv[1];
class HLTestHttps {
 public $context; private $offset=0;
 public function stream_open($path,$mode,$options,&$opened_path) { $v=stream_context_get_options($this->context); parse_str($v['http']['content'],$p); $GLOBALS['sent'][]=['path'=>$path,'parameters'=>$p]; return true; }
 public function stream_read($count) { $s=substr('{"ok":true}',$this->offset,$count); $this->offset+=strlen($s); return $s; }
 public function stream_eof() { return $this->offset>=11; }
 public function stream_stat() { return []; }
}
stream_wrapper_unregister('https'); stream_wrapper_register('https',HLTestHttps::class);
hl_telegram($argv[2],hl_alert_html(['ip'=>'1.2.3.4','ua'=>'QA <&>']),true);
hl_telegram($argv[2],'letterbox stays plain'); echo json_encode($GLOBALS['sent']);'''
            sent = json.loads(subprocess.check_output([PHP, '-r', transport, str(api / '_lib.php'), str(config / 'honeypot.env')], stderr=subprocess.PIPE))
            expect(sent[0]['path'].endswith('/sendRichMessage'), True, 'rich alert transport')
            rich = json.loads(sent[0]['parameters']['rich_message'])
            expect('<table bordered striped compact>' in rich['html'], True, 'real HTML table envelope')
            expect(rich['skip_entity_detection'], True, 'request URLs cannot create automatic links')
            expect(sent[1]['path'].endswith('/sendMessage'), True, 'letterbox transport unchanged')
            expect(sent[1]['parameters']['text'], 'letterbox stays plain', 'letterbox content unchanged')
            store.write_text('{broken')
            expect(admin.control('list')[0], 503, 'corrupt store fails closed')
            expect(store.read_text(), '{broken', 'corrupt store preserved')
            # Separate PHP processes contend on the same real file lock.
            store.write_text('{"slots":[]}')
            (api / '_session.php').write_text((api / '_session.php').read_text().replace('php://input', 'php://stdin'))
            bootsdeny = "$_SERVER['REQUEST_METHOD']='POST'; $_SERVER['HTTP_ORIGIN']='https://www.highlion.net'; $_SERVER['REMOTE_ADDR']=$argv[1]; require $argv[2];"
            def concurrent_acquire(index):
                output = subprocess.check_output([PHP, '-d', 'session.save_path=' + sessions.as_posix(), '-r', bootsdeny, f'198.51.100.{index}', str(api / 'shell-slot.php')], input=b'{"op":"acquire"}')
                return json.loads(output)
            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
                replies = list(pool.map(concurrent_acquire, range(1, 17)))
            ids = [row['id'] for row in replies if row['ok']]
            expect(len(ids), 8, 'concurrent capacity bound')
            expect(len(set(ids)), 8, 'concurrent unique slots')
            expect(len(json.loads(store.read_text())['slots']), 8, 'concurrent store intact')
            print(f'API: {checks} assertions passed; temporary credentials and storage removed.')
        finally:
            server.terminate()
            server.wait(timeout=5)
            log.close()


if __name__ == '__main__':
    run()
