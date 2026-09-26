HighLion sealed browser machine — owner manual

BOUNDARY
The terminal is an in-browser Kali userspace on an isolated simulated network. It cannot mount or inspect the Pi, /var/www/highlion, /etc/highlion, PHP, Telegram, the honeypot, or any other host resource. Never place a real secret, operator value, private credential, or host service file in the image.

IDENTITIES
Every browser boots as kali. `su admin` and `su root` use the server-backed password verifier; neither password nor hash is shipped to the browser. Root also requires the server-managed operator credential. A failed attempt prints exactly `su: Authentication failure`. `exit`, `logout`, and `su kali` return to kali. Root is an emergency simulated-session console, not a website or host administrator.

FILESYSTEM
The base image is js/shell/image/tree.json plus its text fixtures. Browser changes are capped at 64 KiB and remain inside the simulated machine. kali may write /home/kali, /tmp, and /var/tmp. admin may write /home/admin, /tmp, and /var/tmp. Root may additionally use /root and simulated logs. Stock Kali paths stay in /usr, /etc, /var, and user homes; HighLion fixtures stay under /opt/highlion, /var/www/highlion, and /home/kali/highlion.

SESSIONS
api/shell-slot.php leases the full machine. When the pool is unavailable, terminal.js uses the read-only console automatically. The lease store contains only opaque ids, users, salted IP/UA hashes, timestamps, and simulated pid arrays. It never stores passwords, terminal history, or file contents.

AUTHENTICATION
api/shell-auth.php checks a live slot, same-origin request, failure budget, and password hash. It returns only `{ok,user}`. Five failed attempts from one IP in ten minutes are rate-limited. The owner installs the private hashes and operator credential in /etc/highlion/shell.env as documented in deploy/OWNER.txt. No privileged identity is automatic.

NETWORK
The shipped hosts expose explicit simulated reachability, latency, packet loss, routes, users, services, and file shares. ping, nmap, nc, traceroute/tracepath, DNS, ssh, curl, wget, and iptables wait for believable simulated delays. Firewall edits affect only the simulated network. Arbitrary real network access is not available.

IMAGE MAINTENANCE
Edit the JSON/text image in git, validate it, deploy the repository, and use reset-machine to remount it in a browser. Challenge packs remain data files under js/shell/image/packs/. Keep public lab flags in those fixtures; never add host secrets or broaden the browser boundary. Branded offensive suites remain unavailable instead of being represented by shallow toys.
