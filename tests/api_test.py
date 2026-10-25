"""Exercise real PHP endpoints with disposable users, cookies and storage."""
import concurrent.futures
import base64
import http.client
import json
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
        for source in (REPO / 'api').rglob('*.php'):
            target = api / source.relative_to(REPO / 'api')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source.read_text(encoding='utf-8').replace('/var/tmp', state.as_posix()).replace('/etc/highlion', config.as_posix()), encoding='utf-8')
        passwords = [secrets.token_urlsafe(24) for _ in range(2)]
        cookie = secrets.token_hex(32)
        code = '<?php $values=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map(fn($v)=>password_hash($v,PASSWORD_BCRYPT),$values));'
        hashes = json.loads(subprocess.check_output([PHP, '-r', code[6:]], input=json.dumps(passwords).encode()))
        (config / 'shell.env').write_text(f'HL_ROOT_PW_HASH={hashes[0]}\nHL_ADMIN_PW_HASH={hashes[1]}\nHL_OP_COOKIE={cookie}\nHL_SHELL_SLOTS=8\n', encoding='utf-8')
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
                    headers = {'Origin': 'https://www.highlion.net', 'Content-Type': 'application/json', 'X-Test-IP': self.ip}
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
            (state / 'highlion-intel.json').write_text(json.dumps({'ok': True, 'items': [{'title': 'cached', 'thumb': ''}], 'count': 1}))
            expect(visitor.request('intel')[1]['count'], 1, 'news cache')
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
            store.write_text('{broken')
            expect(admin.control('list')[0], 503, 'corrupt store fails closed')
            expect(store.read_text(), '{broken', 'corrupt store preserved')
            # Separate PHP processes contend on the same real file lock.
            store.write_text('{"slots":[]}')
            (api / '_session.php').write_text((api / '_session.php').read_text().replace('php://input', 'php://stdin'))
            bootstrap = "$_SERVER['REQUEST_METHOD']='POST'; $_SERVER['HTTP_ORIGIN']='https://www.highlion.net'; $_SERVER['REMOTE_ADDR']=$argv[1]; require $argv[2];"
            def concurrent_acquire(index):
                output = subprocess.check_output([PHP, '-d', 'session.save_path=' + sessions.as_posix(), '-r', bootstrap, f'198.51.100.{index}', str(api / 'shell-slot.php')], input=b'{"op":"acquire"}')
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
