HighLion simulated userspace

The machine starts as kali. su root verifies the unchanged root password. su admin verifies the unchanged admin password plus the hl_op capability cookie; admin is the developer identity and can use sessionctl. Neither identity accesses the host.
Deployment, credentials, moderation, storage and claim-gate configuration are documented in deploy/OWNER.txt. Deny this file over HTTP.
Virtual disk changes use sessionStorage and are capped at 256 KiB. Trophy IDs use hl-trophies-v1 in localStorage. Identity and passwords never persist in browser storage. Server-side claims authorize operator notes independently of local trophies.
Network commands operate only on fixture data. Challenge packs contain clues, never accepted answers or password hashes. Add challenge IDs and hints to the pack, with matching SHA-256 answer digests in api/ctf.php. Keep each investigation solvable through supported commands.
