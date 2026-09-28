HighLion sealed browser machine — owner manual

BOUNDARY
The terminal is an in-browser Kali userspace on an isolated simulated network. It cannot mount or inspect the Pi, /var/www/highlion, /etc/highlion, PHP, Telegram, the honeypot, or any other host resource. Never place a real secret, operator value, private credential, or host service file in the image.

IDENTITIES
Every browser boots as kali. `su admin` and `su root` use the server-backed password verifier; neither password nor hash is shipped to the browser. Root also requires the server-managed operator credential. A failed attempt prints exactly `su: Authentication failure`. `exit`, `logout`, and `su kali` return to kali. Root is an emergency simulated-session console, not a website or host administrator.

FILESYSTEM
The base image is js/shell/image/tree.json plus its text fixtures. The disk overlay is memory-local and may be mirrored only to the current tab's sessionStorage key hl-machine-overlay-v1, capped near 256 KiB. It disappears when the tab closes. cwd, environment, aliases, command history, and user identity are not persisted. kali may write /home/kali, /tmp, and /var/tmp. admin may write /home/admin, /tmp, and /var/tmp. Root may additionally use /root and simulated logs. `rm -rf .` from kali's home or `rm -rf ~` clears that home overlay and immediately remounts the stock home. reset-machine remounts the stock image. Stock Kali paths under /usr and /etc plus /opt/highlion/challenges and /var/www/highlion remain image-backed; any in-session change is restored by remount/reset.

SESSIONS
terminal.js always boots the full sealed machine. api/shell-slot.php leases concurrency and enables privileged authentication; it never selects a smaller fallback console. If acquire or heartbeat fails, Kali keeps running, root/admin fail closed, and the browser retries every five seconds. A live lease is matched by opaque id + stable salted IP hash + TTL, never User-Agent or UTC date. The lease store contains only opaque ids, users, salted IP hashes, timestamps, and simulated pid arrays. It never stores passwords, terminal history, or file contents.

TROPHIES
Only trophy ids survive tab close. localStorage key hl-trophies-v1 contains `{ "v": 1, "claimed": ["flag-id"] }`: no names, IPs, timestamps, paths, flags, file contents, or identities. score, trophies, and claim read and write that key. Clearing site data clears trophies. reset-machine preserves it.

AUTHENTICATION
api/shell-auth.php checks a live slot, same-origin request, failure budget, and password hash. It returns only `{ok,user}`. Five failed attempts from one IP in ten minutes are rate-limited. The owner installs the private hashes and operator credential in /etc/highlion/shell.env as documented in deploy/OWNER.txt. No privileged identity is automatic.

NETWORK
The terminal is attached to an isolated 10.8.0.0/24 Osprey & Hale office LAN with three neighbors: fw01, intranet, and files01. There is no WAN and there are no HighLion services on the segment. Firewall edits affect only this tab-local simulation. Arbitrary real network access is not available.

IMAGE MAINTENANCE
Edit the JSON/text image in git, validate it, deploy the repository, and use reset-machine to remount it in a browser. Challenge packs remain data files under js/shell/image/packs/. Keep public lab flags in those fixtures; never add host secrets or broaden the browser boundary. Branded offensive suites remain unavailable instead of being represented by shallow toys.
