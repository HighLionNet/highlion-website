<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}
// Returns only this caller's identity, never configuration, headers or secrets.
$ip = hl_client_ip();
$source = hl_ip_source();
hl_json([
    'ok' => true,
    'ip' => $source === 'tor' ? null : $ip,
    'remote_addr' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    'peer' => (string) ($_SERVER['HL_PEER_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''),
    'source' => $source,
    'verified' => $source === 'cloudflared' && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false,
    'request_id' => substr((string) ($_SERVER['HL_REQUEST_ID'] ?? ''), 0, 64),
]);
