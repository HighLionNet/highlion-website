#!/usr/bin/env python3
"""Install the complete HighLion nginx/FPM configuration with backups and checks."""
import glob
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/var/www/highlion')
ONION = 'hh7547je3hpb4hj7stuiorzwnwazamecatqn6saqkxamlmckztgr2lid.onion'


def tor_records(config, seen=None):
    seen = set() if seen is None else seen
    config = config.resolve()
    if config in seen:
        raise RuntimeError('Repeated/cyclic Tor configuration include: ' + str(config))
    seen.add(config)
    for index, line in enumerate(config.read_text().splitlines(keepends=True)):
        words = shlex.split(line, comments=True)
        if not words:
            continue
        if words[0].lower() == '%include':
            if len(words) != 2:
                raise RuntimeError('Ambiguous Tor include in ' + str(config))
            pattern = str(config.parent / words[1]) if not os.path.isabs(words[1]) else words[1]
            for child in sorted(glob.glob(pattern)):
                child = Path(child)
                if child.is_dir():
                    for member in sorted(child.iterdir()):
                        if member.is_file():
                            yield from tor_records(member, seen)
                else:
                    yield from tor_records(child, seen)
        else:
            yield config, index, words


def tor_updates(config):
    service = None
    matches = []
    for path, index, words in tor_records(config):
        if words[0].lower() == 'hiddenservicedir' and len(words) == 2:
            service = Path(words[1])
        elif words[0].lower() == 'hiddenserviceport' and len(words) >= 2 and words[1] == '80' and service:
            hostname = service / 'hostname'
            if hostname.is_file() and hostname.read_text().strip() == ONION:
                matches.append((path, index))
    if len(matches) != 1:
        raise RuntimeError('Expected exactly one existing HTTP port for the HighLion onion service; no Tor keys or configuration were changed.')
    path, index = matches[0]
    lines = path.read_text().splitlines(keepends=True)
    lines[index] = 'HiddenServicePort 80 127.0.0.1:8081\n'
    return {path: ''.join(lines)}


def run(*args):
    subprocess.run(args, check=True)


def tor_runtime_user(unit):
    import pwd
    pid = subprocess.check_output(['systemctl', 'show', '--property=MainPID', '--value', unit], text=True).strip()
    if not re.fullmatch(r'[1-9][0-9]*', pid):
        raise RuntimeError('Cannot determine the running Tor process for ' + unit)
    status = Path('/proc', pid, 'status').read_text()
    match = re.search(r'^Uid:\s+\d+\s+(\d+)', status, re.M)
    if not match or int(match[1]) == 0:
        raise RuntimeError('Expected a running unprivileged Tor process; refusing to validate as root.')
    return pwd.getpwuid(int(match[1])).pw_name


def tor_verify_command(tor, config, unit):
    runner = shutil.which('runuser')
    if not runner:
        raise RuntimeError('Missing runuser for validating Tor under its runtime identity.')
    command = [runner, '-u', tor_runtime_user(unit), '--', tor]
    defaults = Path('/usr/share/tor/tor-service-defaults-torrc')
    if defaults.is_file():
        command += ['--defaults-torrc', str(defaults)]
    return command + ['--verify-config', '-f', str(config)]


def install():
    import pwd
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo python3 /var/www/highlion/deploy/install-config.py')
    if ROOT.resolve() != ROOT:
        raise RuntimeError('Unexpected webroot symlink; inspect the deployment path first.')
    sockets = sorted({p.resolve() for p in Path('/run/php').glob('php*-fpm.sock') if p.is_socket() and p.name != 'highlion-relay.sock'})
    if len(sockets) != 1:
        raise RuntimeError('Expected one active application PHP-FPM socket under /run/php; found: ' + ', '.join(map(str, sockets)))
    match = re.fullmatch(r'php(\d+\.\d+)-fpm\.sock', sockets[0].name)
    if not match:
        raise RuntimeError('Cannot identify the FPM version from ' + str(sockets[0]))
    version = match[1]
    fpm = shutil.which('php-fpm' + version)
    if not fpm:
        raise RuntimeError('Missing php-fpm' + version + ' configuration checker')
    for command in ['nginx', 'systemctl']:
        if not shutil.which(command):
            raise RuntimeError('Missing ' + command)
    tor_config = Path('/etc/tor/torrc')
    tor = shutil.which('tor')
    tor_changes = tor_updates(tor_config) if tor and tor_config.is_file() else {}
    tor_unit = None
    if tor_changes:
        for unit in ['tor@default.service', 'tor.service']:
            if subprocess.run(['systemctl', 'is-active', '--quiet', unit]).returncode == 0:
                tor_unit = unit
                break
        if tor_unit is None:
            raise RuntimeError('The existing onion configuration has no active default Tor service to reload; no config changes made.')
    # Debian supplies User/DataDirectory through its service defaults. Validate
    # as the actual daemon user, not root; never change hidden-service ownership.
    tor_check = tor_verify_command(tor, tor_config, tor_unit) if tor_changes else None

    backup = Path('/var/backups/highlion') / ('config-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid()))
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(backup, 0o700)
    site_link = Path('/etc/nginx/sites-enabled/highlion.conf')
    site_file = site_link.resolve() if site_link.exists() or site_link.is_symlink() else Path('/etc/nginx/sites-available/highlion.conf')
    nginx_main = (ROOT / 'deploy/nginx.conf').read_text().replace('/run/php/php8.2-fpm.sock', str(sockets[0]))
    changes = {
        Path('/etc/nginx/nginx.conf'): nginx_main,
        site_file: (ROOT / 'deploy/highlion.conf').read_text(),
        Path('/etc/php') / version / 'fpm/pool.d/highlion-relay.conf': (ROOT / 'deploy/php-relay-pool.conf').read_text(),
        **tor_changes,
    }
    # Old copies of our maps would otherwise declare zones/variables twice.
    disabled = [p for p in [Path('/etc/nginx/conf.d/highlion-path.conf'), Path('/etc/nginx/sites-enabled/default')] if p.exists() or p.is_symlink()]
    originals = {}
    for index, path in enumerate(changes):
        if path.is_file():
            originals[path] = (path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
            shutil.copy2(path, backup / (str(index) + '-' + path.name))
        else:
            originals[path] = None
    moved = []
    made_link = False
    try:
        for index, path in enumerate(disabled):
            target = backup / ('disabled-' + str(index) + '-' + path.name)
            path.rename(target)
            moved.append((path, target))
        for path, content in changes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            os.chmod(path, 0o644)
        if not site_link.exists():
            site_link.symlink_to(site_file)
            made_link = True
        www = pwd.getpwnam('www-data')
        for directory in [Path('/var/lib/highlion'), Path('/var/lib/highlion/abuse')]:
            if directory.is_symlink():
                raise RuntimeError('Refusing symlink state directory: ' + str(directory))
            directory.mkdir(parents=True, exist_ok=True)
        os.chown('/var/lib/highlion/abuse', www.pw_uid, www.pw_gid)
        os.chmod('/var/lib/highlion/abuse', 0o700)
        run(fpm, '-t')
        nginx_check = subprocess.run(['nginx', '-t'], text=True, capture_output=True)
        print(nginx_check.stdout + nginx_check.stderr, end='')
        if nginx_check.returncode or 'conflicting server name' in nginx_check.stderr.lower():
            raise RuntimeError('nginx validation failed or another enabled site conflicts with these hostnames')
        if tor_check:
            run(*tor_check)
    except Exception:
        for path, original in originals.items():
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original[0])
                os.chmod(path, original[1])
        if made_link:
            site_link.unlink(missing_ok=True)
        for path, target in moved:
            target.rename(path)
        raise
    run('systemctl', 'reload', 'php' + version + '-fpm')
    run('systemctl', 'reload', 'nginx')
    if tor_unit:
        run('systemctl', 'reload', tor_unit)
    # Prove that the real FastCGI routes forward a non-loopback identity.
    request = urllib.request.Request('http://127.0.0.1/api/client-ip.php', headers={'Host': 'www.highlion.net', 'CF-Connecting-IP': '198.51.100.77', 'CF-IPCountry': 'IL'})
    direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with direct.open(request, timeout=10) as response:
        identity = json.load(response)
    if identity.get('ip') != '198.51.100.77' or identity.get('remote_addr') != '198.51.100.77' or identity.get('source') != 'cloudflared':
        raise RuntimeError('FastCGI identity check FAILED: ' + json.dumps(identity))
    request = urllib.request.Request('http://127.0.0.1:8081/api/client-ip.php', headers={'Host': ONION, 'CF-Connecting-IP': '8.8.8.8'})
    with direct.open(request, timeout=10) as response:
        onion_identity = json.load(response)
    if onion_identity.get('ip') is not None or onion_identity.get('remote_addr') != '127.0.0.1' or onion_identity.get('source') != 'tor':
        raise RuntimeError('Tor header-isolation check FAILED: ' + json.dumps(onion_identity))
    print('Installed and checked nginx, PHP-FPM ' + version + ' and the isolated Tor origin.')
    print('Backups: ' + str(backup))
    print('Next: bash /var/www/highlion/deploy/verify-live.sh')


if __name__ == '__main__':
    try:
        install()
    except Exception as error:
        print('Configuration install stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
