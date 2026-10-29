#!/usr/bin/env python3
"""Preserve/recover server-only contact profiles without putting them in Git."""
import argparse
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re


def profile(href):
    if not isinstance(href, str):
        return None
    for name, pattern in [
        ('linkedin', r'https://(?:www\.)?linkedin\.com/in/[A-Za-z0-9_%.-]+/?'),
        ('tryhackme', r'https://(?:www\.)?tryhackme\.com/p/[A-Za-z0-9_%.-]+/?'),
    ]:
        if re.fullmatch(pattern, href):
            return name
    return None


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.profiles = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            href = dict(attrs).get('href', '')
            name = profile(href)
            if name:
                self.profiles.setdefault(name, href)


def read_profiles(path):
    if not path.is_file() or path.stat().st_size > 262144:
        return {}
    try:
        content = path.read_text(encoding='utf-8')
        if path.suffix == '.json':
            rows = json.loads(content)
            if not isinstance(rows, list):
                return {}
            return {profile(row.get('href')): row['href'] for row in rows
                    if isinstance(row, dict) and profile(row.get('href'))}
        parser = Links()
        parser.feed(content)
        return parser.profiles
    except (ValueError, UnicodeError):
        return {}


def prepare(site, backups):
    destination = site / 'assets/contact-links.inc.html'
    candidates = [destination, site / 'assets/contact-links.json']
    if backups.is_dir():
        for backup in sorted(backups.iterdir(), reverse=True):
            candidates.extend(backup / 'files' / path for path in [
                'assets/contact-links.inc.html', 'assets/contact-links.json', 'contact.html',
            ])
    profiles = {}
    for path in candidates:
        for name, href in read_profiles(path).items():
            profiles.setdefault(name, href)
        if all(name in profiles for name in ['linkedin', 'tryhackme']):
            break
    if not all(name in profiles for name in ['linkedin', 'tryhackme']):
        raise RuntimeError('Missing server-only contact profiles. Restore assets/contact-links.inc.html or assets/contact-links.json from your server backup before syncing. No account URLs were printed.')
    # Rebuild only anchors and trusted icons; never copy whole old pages/scripts.
    snippet = ''.join(
        f'<a class="social-link" href="{escape(profiles[name], quote=True)}" target="_blank" rel="noopener noreferrer">'
        f'<img src="/assets/marks/{name}.svg?v=hl97" alt="">{label}</a>\n'
        for name, label in [('linkedin', 'LinkedIn'), ('tryhackme', 'TryHackMe')]
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(snippet, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, default=Path('/var/www/highlion'))
    parser.add_argument('--backup-root', type=Path, default=Path('/var/backups/highlion'))
    args = parser.parse_args()
    try:
        prepare(args.site_root, args.backup_root)
    except RuntimeError as error:
        parser.exit(1, str(error) + '\n')
    print('Server-only LinkedIn and TryHackMe links are ready.')
