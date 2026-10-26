<?php
declare(strict_types=1);
// Run as root from SSH: php deploy/hl8x-setup.php. No values are printed or shipped.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
function hl_setup_fail(string $message): void { fwrite(STDERR, $message); exit(1); }
require_once dirname(__DIR__) . '/api/_lib.php';
$path = '/etc/highlion/shell.env';
$env = hl_env_load($path);
$rootHash = (string) ($env['HL_ADMIN_PW_HASH'] ?? $env['ADMIN_PW_HASH'] ?? '');
if ($rootHash === '') hl_setup_fail("Existing root hash missing from /etc/highlion/shell.env\n");
$reward = (string) ($env['HL_CTF_ROOT_PASSWORD'] ?? '');
if ($reward === '' || !password_verify($reward, $rootHash)) {
    fwrite(STDOUT, 'Enter the existing CTF root password (hidden): ');
    $terminal = trim((string) shell_exec('stty -g'));
    if ($terminal === '') hl_setup_fail("Run this command in your SSH terminal.\n");
    system('stty -echo');
    try { $reward = rtrim((string) fgets(STDIN), "\r\n"); }
    finally { system('stty ' . escapeshellarg($terminal)); fwrite(STDOUT, "\n"); }
    if (!password_verify($reward, $rootHash) || preg_match('/[\r\n\0]/', $reward)) hl_setup_fail("Password does not match the existing root hash; no changes made.\n");
    $raw = (string) file_get_contents($path);
    $raw = preg_replace('/^HL_CTF_ROOT_PASSWORD=.*(?:\r?\n|$)/m', '', $raw);
    if (file_put_contents($path, rtrim($raw) . "\nHL_CTF_ROOT_PASSWORD=" . $reward . "\n", LOCK_EX) === false) hl_setup_fail("Cannot save reward.\n");
}
// Persistent across reboot; separate from temporary rate-limit counters.
$parent = '/var/lib/highlion';
if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0755, true))) hl_setup_fail("Cannot create abuse parent.\n");
$directory = $parent . '/abuse';
if (is_link($directory) || (!is_dir($directory) && !mkdir($directory, 0700, true))) hl_setup_fail("Cannot create abuse store.\n");
if (!chown($directory, 'www-data') || !chgrp($directory, 'www-data') || !chmod($directory, 0700)) hl_setup_fail("Cannot secure abuse store; use your PHP pool user.\n");
echo "Reward verified. Persistent probe bans ready.\n";
echo "For site-wide bans, include deploy/nginx-abuse.conf in the active nginx server block, then nginx -t and reload.\n";
