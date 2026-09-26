HighLion sealed browser machine — owner manual

BOUNDARY
The terminal is one in-browser Kali userspace on an isolated simulated network. It cannot read or write the Pi, /var/www/highlion, /etc/highlion, PHP, Telegram, the honeypot, or any other host resource. Never place a secret, operator value, private credential, or real service file in the image.

IDENTITIES
Visitors boot as kali. admin is an unprivileged lab target with a private mode-0750 home. Neither account belongs to sudo or adm. su asks for a password and fails; sudo logs only to the simulated /var/log/auth.log and fails. Root is an emergency session console, not a site administrator.

FILESYSTEM
The base image is js/shell/image/tree.json plus the text fixtures beside it. Visitor changes persist only in localStorage key hl-machine-v1 and are capped at 64 KiB. kali may write /home/kali, /tmp, and /var/tmp. admin may write /home/admin, /tmp, and /var/tmp. Root may additionally use /root and simulated logs. /etc, /usr, /bin, /srv, and /var/www remain read-only.

SESSIONS
api/shell-slot.php leases the full machine. When the lease pool is unavailable, terminal.js uses the read-only console automatically. The lease file stores only opaque ids, users, salted IP/UA hashes, timestamps, and simulated pid arrays. It never stores history or file contents.

OPERATOR ROOT
The Pi sets cookie hl_op to the value in /etc/highlion/shell.env on the owner's browser only. JavaScript never reads that cookie. A matching same-origin request receives the emergency root session. Root may run:
  sessionctl who
  sessionctl list
  sessionctl drop ID

The list/drop calls also require the site's CSRF token. Removing the cookie removes operator access. There is no root password or verifier in git.

NETWORK
ping, ssh, and nc use simulated fixtures. curl and wget are GET-only and restricted to the public HighLion brochure allowlist. /api, /lab, /contact.html, /403.html, third-party hosts, redirects outside the allowlist, and bodies over 64 KiB are refused.

IMAGE MAINTENANCE
Edit the JSON/text image in git, validate it, deploy the repository, and use reset-machine to remount it in a browser. Challenge packs remain data files under js/shell/image/packs/. Keep flags in those hidden fixtures; never add host secrets or broaden the browser network boundary.
