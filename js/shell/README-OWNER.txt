HighLion sealed browser machine — owner manual

BOUNDARY
The terminal is an in-browser Kali userspace on an isolated, deterministic simulated network. It cannot mount or inspect the Pi, /var/www/highlion, /etc/highlion, PHP, Telegram, the honeypot, or any other host resource. Never place a secret, operator value, private credential, or real service file in the image.

IDENTITIES
Visitors boot as kali. admin is an unprivileged simulated lab user. Neither account belongs to sudo or adm. Visitors receive an immediate "Authentication failure" from su; there is no password prompt or password verifier. An authenticated owner boots directly as simulated root. While that operator lease is active, `su admin`, `su kali`, and `su root` switch immediately, and `exit`/`logout` returns through the simulated identity stack. Root is an emergency session console, not a website or host administrator.

FILESYSTEM
The base image is js/shell/image/tree.json plus the text fixtures beside it. Visitor changes persist only in localStorage key hl-machine-v1 and are capped at 64 KiB. kali may write /home/kali, /tmp, and /var/tmp. admin may write /home/admin, /tmp, and /var/tmp. Root may additionally use /root and simulated logs. /etc, /usr, /bin, /srv, and /var/www remain read-only. /dev/null, /dev/zero, /dev/urandom, and selected /proc files are generated in memory.

SESSIONS
api/shell-slot.php leases the full machine. When the lease pool is unavailable, terminal.js uses the read-only console automatically. The lease file stores only opaque ids, users, salted IP/UA hashes, timestamps, and simulated pid arrays. It never stores terminal history or file contents.

OPERATOR ROOT
PHP-FPM must be able to read /etc/highlion/shell.env, so install it as root:www-data mode 0640, not 0600. Set HL_OP_COOKIE to a long random value there, then set cookie hl_op only inside the intended Firefox container for www.highlion.net with Path=/, Secure, and SameSite=Lax. JavaScript cannot read the operator cookie. Slot acquisition first obtains a same-origin CSRF token; a matching cookie and CSRF-proven request receives the simulated root session. Root may run:
  sessionctl who
  sessionctl list
  sessionctl drop ID

Removing hl_op removes operator access. There is no root password or verifier in git. If the terminal still shows kali, inspect the /api/shell-slot.php acquire response: operator:false means cookie scope/value or shell.env readability is wrong; mode:"fallback" means the lease store/pool is unavailable.

NETWORK
All arbitrary hostnames and valid IPv4 addresses resolve to deterministic simulated profiles with stable reachability, latency, routes, ports, banners, and HTTP/DNS responses. No real network request is made for ping, nmap, nc, traceroute, DNS, ssh, or arbitrary curl/wget targets. The only egress exception is GET-only curl/wget access to the explicit public HighLion brochure allowlist; /api, /lab, /contact.html, /403.html, third-party hosts, disallowed redirects, and bodies over 64 KiB are refused.

IMAGE MAINTENANCE
Edit the JSON/text image in git, validate it, deploy the repository, and use reset-machine to remount it in a browser. Challenge packs remain data files under js/shell/image/packs/. Keep flags in those hidden fixtures; never add host secrets or broaden the browser network boundary. Advanced branded offensive suites are deliberately omitted rather than represented by shallow toy commands.
