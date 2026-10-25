<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function hl_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '86400');
    session_name('hl_session');
    session_set_cookie_params(['lifetime' => 86400, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    if (!session_start()) hl_json(['ok' => false], 503);
    if (!isset($_SESSION['lease_owner'])) $_SESSION['lease_owner'] = bin2hex(random_bytes(32));
    header('Cache-Control: private, no-store');
}

function hl_payload(int $limit = 8192): array
{
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) hl_json(['ok' => false], 413);
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if (!is_string($raw) || strlen($raw) > $limit) hl_json(['ok' => false], 413);
    $data = json_decode($raw, true, 16);
    if (!is_array($data)) hl_json(['ok' => false], 400);
    return $data;
}

function hl_operator(array $env): bool
{
    $expected = trim((string) ($env['HL_OP_COOKIE'] ?? ''));
    $actual = hl_cookie('hl_op');
    return $expected !== '' && $actual !== '' && hash_equals($expected, $actual);
}

function hl_admin(string $actor, array $env): bool
{
    return hl_operator($env) && $actor !== '' && (int) ($_SESSION['admins'][$actor] ?? 0) > time();
}

function hl_claims(): array
{
    $record = $_SESSION['ctf'] ?? [];
    return is_array($record) && ($record['season'] ?? '') === 'station-01'
        ? array_values(array_intersect(['modular', 'route', 'xor', 'timeline'], $record['claimed'] ?? [])) : [];
}
