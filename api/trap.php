<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

$ip = hl_client_ip();
$country = hl_country();
$userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$uri = substr((string) ($_SERVER['REQUEST_URI'] ?? '/'), 0, 1024);
$query = substr((string) ($_SERVER['QUERY_STRING'] ?? ''), 0, 512);

hl_honeypot_write([
    'ts' => gmdate('c'),
    'ip' => $ip,
    'ua' => $userAgent,
    'page' => 'trap',
    'country' => $country,
    'kind' => 'path',
    'extra' => [
        'method' => $method,
        'uri' => $uri,
        'query' => $query,
    ],
]);

hl_telegram(
    '/etc/highlion/honeypot.env',
    "[HL ALERT] TRAP path\n"
    . 'ip=' . $ip . ' country=' . $country . ' ua=' . $userAgent . "\n"
    . 'method=' . $method . ' uri=' . $uri
);

http_response_code(403);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
echo 'Forbidden';
exit;
