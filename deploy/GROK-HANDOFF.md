# Superseded configuration handoff

The owner supplied the complete live nginx configuration. It has now been replaced by the tested files `deploy/nginx.conf` and `deploy/highlion.conf`, with the shared includes in this directory.

Do not mix the earlier partial configuration suggestions with these replacements. Follow [CONFIG.md](CONFIG.md) and run `sudo python3 /var/www/highlion/deploy/install-config.py` after syncing the release. Run [VERIFY.md](VERIFY.md) before treating the deployment as complete.
