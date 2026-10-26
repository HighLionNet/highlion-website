"""Check that the installer migrates only the existing HighLion onion endpoint."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
(ROOT / '.qa').mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location('highlion_install', ROOT / 'deploy/install-config.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class TorMigration(unittest.TestCase):
    def test_tor_check_uses_daemon_identity_and_debian_defaults(self):
        with patch.object(installer, 'tor_runtime_user', return_value='debian-tor'), patch.object(installer.Path, 'is_file', return_value=True):
            command = installer.tor_verify_command('/usr/sbin/tor', Path('/etc/tor/torrc'), 'tor@default.service')
        self.assertEqual(command[0], '/usr/sbin/tor')
        self.assertNotIn('runuser', ' '.join(command))
        self.assertIn('--defaults-torrc', command)
        self.assertEqual(command[-5:], ['--verify-config', '-f', str(Path('/etc/tor/torrc')), '--User', 'debian-tor'])

    def test_runtime_user_uses_effective_uid_and_rejects_root(self):
        account = SimpleNamespace(getpwuid=lambda uid: SimpleNamespace(pw_name='debian-tor' if uid == 105 else 'wrong-user'))
        with patch.dict(sys.modules, {'pwd': account}), patch.object(installer.subprocess, 'check_output', return_value='31435\n'), patch.object(installer.Path, 'read_text', return_value='Name:\ttor\nUid:\t0\t105\t105\t105\n'):
            self.assertEqual(installer.tor_runtime_user('tor@default.service'), 'debian-tor')
        with patch.dict(sys.modules, {'pwd': account}), patch.object(installer.subprocess, 'check_output', return_value='31435\n'), patch.object(installer.Path, 'read_text', return_value='Uid:\t0\t0\t0\t0\n'):
            with self.assertRaises(RuntimeError):
                installer.tor_runtime_user('tor@default.service')

    def test_matching_service_only_and_no_key_changes(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.qa') as temp:
            root = Path(temp)
            service = root / 'highlion service'
            service.mkdir()
            (service / 'hostname').write_text(installer.ONION + '\n')
            (service / 'hs_ed25519_secret_key').write_bytes(b'private-key-fixture')
            other = root / 'other'
            other.mkdir()
            (other / 'hostname').write_text('another-service.onion\n')
            fragment = root / 'onions.conf'
            fragment.write_text(f'HiddenServiceDir "{service.as_posix()}"\nHiddenServicePort 80 127.0.0.1:80\nHiddenServiceDir "{other.as_posix()}"\nHiddenServicePort 80 127.0.0.1:9000\n')
            config = root / 'torrc'
            config.write_text('%include ' + fragment.as_posix() + '\n')
            changes = installer.tor_updates(config)
            self.assertEqual(list(changes), [fragment.resolve()])
            self.assertIn('HiddenServicePort 80 127.0.0.1:8081', changes[fragment])
            self.assertIn('HiddenServicePort 80 127.0.0.1:9000', changes[fragment])
            self.assertNotIn(':8081', fragment.read_text())
            self.assertEqual((service / 'hs_ed25519_secret_key').read_bytes(), b'private-key-fixture')

    def test_unknown_service_fails_before_writing(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.qa') as temp:
            config = Path(temp) / 'torrc'
            config.write_text('SocksPort 9050\n')
            with self.assertRaises(RuntimeError):
                installer.tor_updates(config)
            self.assertEqual(config.read_text(), 'SocksPort 9050\n')


if __name__ == '__main__':
    unittest.main()
