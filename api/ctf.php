<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) !== 'POST') {
    header('Allow: POST');
    hl_json(['ok' => false], 405);
}

$source = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
if ($source === '') {
    $source = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
}
$sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
if (!in_array($sourceHost, ['www.highlion.net', 'highlion.net'], true)) {
    hl_json(['ok' => false], 403);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$flag = is_array($payload) && isset($payload['flag']) && is_string($payload['flag'])
    ? trim($payload['flag'])
    : '';
$allowed = [
    'HL8{off-catalog}',
    'HL8{spare-field}',
    'HL{east-node-01}',
    'HL8{east-node-01}',
    'HL8{relay-ack}',
];
if (!in_array($flag, $allowed, true)) {
    hl_json(['ok' => false], 400);
}
if (!hl_rate_allow('ctf', 10, 3600)) {
    hl_json(['ok' => false], 429);
}

$ip = hl_client_ip();
$userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
$row = [
    'ts' => gmdate('c'),
    'flag' => $flag,
    'ip' => $ip,
    'ua' => $userAgent,
];
$encoded = json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if (is_string($encoded)) {
    @file_put_contents('/var/tmp/highlion-ctf.log', $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
}
hl_telegram(
    '/etc/highlion/letterbox.env',
    '[HL CTF] CLAIM flag=' . $flag . ' ip=' . $ip . ' ua=' . $userAgent
);
hl_json(['ok' => true]);
