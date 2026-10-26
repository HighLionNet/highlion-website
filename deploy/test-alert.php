<?php
declare(strict_types=1);
// Operator-only transport test. Does not create probe strikes or change bans.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/api/_lib.php';
$row = [
    'ts' => gmdate('c'), 'type' => 'TEST — operator transport check',
    'ip' => '127.0.0.1', 'peer' => 'CLI', 'source' => 'CLI (synthetic)', 'country' => '',
    'ua' => 'HighLion-QA <HTML & escaping>', 'method' => 'CLI',
    'uri' => '/deploy/test-alert.php', 'query' => 'escaped=<value>&safe=1',
    'notes' => 'Synthetic local test. Loopback is expected here; public HTTP tests verify cloudflared visitor identity.',
    'id' => bin2hex(random_bytes(8)),
];
if (!hl_telegram('/etc/highlion/honeypot.env', hl_alert_html($row), true, 8)) {
    fwrite(STDERR, "Telegram delivery failed. Check the PHP error log and server-only honeypot.env credentials.\n");
    exit(1);
}
echo "Telegram accepted the rich HTML table. Confirm its rendered appearance in Telegram.\n";
