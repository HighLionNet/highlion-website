"""Check recovery of server-only contact links using disposable fake profiles."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('contact_profiles', ROOT / 'deploy/contact-profiles.py')
profiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profiles)


class ContactProfiles(unittest.TestCase):
    def test_current_links_win_and_missing_link_recovers_from_backup(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.qa') as temp:
            root = Path(temp)
            site, backups = root / 'site', root / 'backups'
            (site / 'assets').mkdir(parents=True)
            destination = site / 'assets/contact-links.inc.html'
            destination.write_text('<a href="https://www.linkedin.com/in/current-fixture">LinkedIn</a>')
            backup = backups / '20260101/files'
            backup.mkdir(parents=True)
            (backup / 'contact.html').write_text('<html><script>danger()</script><a href="https://www.linkedin.com/in/old-fixture">old</a><a href="https://tryhackme.com/p/fixture-profile">profile</a></html>')
            profiles.prepare(site, backups)
            snippet = destination.read_text()
            self.assertIn('/in/current-fixture', snippet)
            self.assertIn('/p/fixture-profile', snippet)
            self.assertNotIn('old-fixture', snippet)
            self.assertNotIn('<script', snippet)
            self.assertNotIn('<html', snippet)
            self.assertEqual(snippet.count('class="social-link"'), 2)
            self.assertEqual(snippet.count('rel="noopener noreferrer"'), 2)

    def test_legacy_json_migrates_without_changing_the_source(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.qa') as temp:
            site = Path(temp)
            (site / 'assets').mkdir()
            source = site / 'assets/contact-links.json'
            raw = json.dumps([{'href': 'https://www.linkedin.com/in/fixture-profile'}, {'href': 'https://www.tryhackme.com/p/fixture-profile'}])
            source.write_text(raw)
            profiles.prepare(site, site / 'missing-backups')
            self.assertEqual(source.read_text(), raw)
            self.assertEqual(len(profiles.read_profiles(site / 'assets/contact-links.inc.html')), 2)

    def test_untrusted_urls_and_incomplete_profiles_fail_before_writing(self):
        for href in ['javascript:alert(1)', 'https://www.linkedin.com.attacker.org/in/a', 'https://www.linkedin.com/in/a?redirect=evil', 'https://www.tryhackme.com/p/a\" onclick=alert(1)']:
            self.assertIsNone(profiles.profile(href))
        with tempfile.TemporaryDirectory(dir=ROOT / '.qa') as temp:
            site = Path(temp)
            with self.assertRaisesRegex(RuntimeError, 'Missing server-only contact profiles'):
                profiles.prepare(site, site / 'missing-backups')
            self.assertFalse((site / 'assets/contact-links.inc.html').exists())


if __name__ == '__main__':
    unittest.main()
