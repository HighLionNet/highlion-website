HighLion browser machine — owner customization

BOUNDARY
The root account controls only the in-browser virtual filesystem. It is not Debian/nginx/PHP root and is not a security boundary: visitors can inspect and modify JavaScript running in their own browser. Never put a server password, API token, Telegram secret, or private flag in this image.

ROOT OWNER PROFILE
Visitors always boot as kali. Root is present but locked by default, and root state is never restored as the active user after reload.

1. Run: node deploy/generate-shell-admin.mjs
2. Copy the printed enabled/auth object over root in js/shell/image/admin.json.
3. Keep a strong, unique passphrase outside git. Only its PBKDF2 verifier is published.
4. In the terminal run: su -
5. Leave owner mode with: exit

Root may edit the simulated /root, /etc, /opt, /home, /tmp, and /var trees. /proc and /sys remain generated read-only views. Changes are browser-local and subject to the 64 KiB persisted-state cap; publish durable changes by editing the image files in git.

CUSTOMIZATION SURFACE
- hostname, users, base directories/files, aliases: image/tree.json
- motd and OS fixtures: image/motd, os-release, hostname, hosts, resolv.conf
- packages and services: image/packages.json, units.json
- process/network fixtures: image/proc.json
- mounts: image/fstab.json
- root verifier and pack policy: image/admin.json
- challenge load order: image/packs/manifest.json
- challenge content: one JSON file per pack under image/packs/

PACK CONTRACT
Each manifest entry names one same-directory JSON file. A pack has schema, id, title, hidden, mount, hosts, banners, optional units, flags, and prizes. Mount keys are absolute VFS paths. Nodes use type=file|dir|symlink plus mode, owner, group, content/target, and optional kids. Pack files are validated before mounting; an invalid pack is skipped and reported by packctl verify.

Owner commands after su -:
  admin-status
  packctl list
  packctl verify
  packctl info season00
  packctl template season01

To add a season, copy the template into image/packs/season01.json, add that filename to image/packs/manifest.json, reset-machine, then run packctl verify. File-driven puzzles require no terminal.js edit.
