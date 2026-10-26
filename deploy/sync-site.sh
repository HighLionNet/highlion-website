#!/usr/bin/env bash
set -euo pipefail

# Run from a freshly extracted repository archive, outside the live webroot.
[[ ${EUID} -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $# -eq 1 ]] || { echo 'Usage: sudo bash deploy/sync-site.sh /absolute/extracted/repository' >&2; exit 1; }
source_dir=$(realpath -- "$1")
site_root=$(realpath -- /var/www/highlion)
[[ "$site_root" == /var/www/highlion ]] || { echo 'Unexpected live webroot; stopping.' >&2; exit 1; }
case "$source_dir" in "$site_root"|"$site_root"/*) echo 'Extract the release outside the live webroot.' >&2; exit 1;; esac
[[ -f "$source_dir/index.html" && -f "$source_dir/api/_alerts.php" && -f "$source_dir/deploy/nginx-path-http.conf" ]] || { echo 'Incomplete release directory.' >&2; exit 1; }
for program in rsync php systemctl; do command -v "$program" >/dev/null; done
php -r 'exit(PHP_VERSION_ID >= 80000 ? 0 : 1);'
while IFS= read -r -d '' php_file; do php -l "$php_file" >/dev/null; done < <(find "$source_dir/api" "$source_dir/deploy" -type f -name '*.php' -print0)

backup_dir="/var/backups/highlion/$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$backup_dir"
# Deleted and replaced files are retained outside the webroot. Server secrets
# in /etc/highlion, runtime state and active nginx/PHP configuration are untouched.
rsync -a --delete --delay-updates --backup --backup-dir="$backup_dir/files" \
  --chown=root:www-data --chmod=D755,F644 \
  --exclude='/.git/' --exclude='/.well-known/' --exclude='*.env' \
  "$source_dir/" "$site_root/"

# Reload the sole active FPM service to invalidate opcache, without guessing a version.
mapfile -t fpm_services < <(systemctl list-units --type=service --state=active --no-legend 'php*-fpm.service' | awk '{print $1}')
if [[ ${#fpm_services[@]} -eq 1 ]]; then
  systemctl reload "${fpm_services[0]}"
else
  echo 'Reload the PHP-FPM service selected in the nginx configuration after reviewing it.'
fi
printf 'Release files synchronized. Replaced/deleted files: %s\n' "$backup_dir"
echo 'Files ready. Now run: sudo python3 /var/www/highlion/deploy/install-config.py'
