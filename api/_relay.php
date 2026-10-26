<?php
declare(strict_types=1);

// A server-set FastCGI parameter, never an HTTP header or a URL parameter.
if (($_SERVER['HL_ROUTE'] ?? '') !== 'station') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/_lib.php';

// Bytes outside printable ASCII are escaped, including invalid UTF-8 and
// terminal controls. Logs and Telegram cannot acquire forged extra lines.
$clean = static function ($value, int $limit): string {
    $raw = substr((string) $value, 0, $limit);
    return (string) preg_replace_callback('/[^\x20-\x7e]/', static function (array $m): string {
        return sprintf('\\x%02X', ord($m[0]));
    }, $raw);
};
$method = $clean($_SERVER['REQUEST_METHOD'] ?? '', 16);
$reason = $clean($_SERVER['HL_REASON'] ?? '', 40);

// No sessions, payload parsing, eval, file includes from user input or writes
// into the webroot. nginx retains the complete escaped URI in its own log.
$row = hl_alert_row('PATH ' . $reason, 'sensitive path / traversal trap', true);
hl_honeypot_write($row);

http_response_code(403);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($method !== 'HEAD') echo 'Forbidden';
// Release the client before a bounded network call. This pool has two workers
// and nginx admits one/IP/minute and a sustained six/minute globally, burst 1.
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

// The shared sender logs delivery failures; intentional throttling stays quiet.
hl_alert_send($row);
exit;
