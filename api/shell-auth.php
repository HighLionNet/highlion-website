<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

function hl_shell_auth_reply(bool $ok, string $user = '', int $status = 200): void
{
    hl_json(['ok' => $ok, 'user' => $ok ? $user : ''], $status);
}

function hl_shell_auth_rate_reply(): void
{
    header('Retry-After: 600');
    hl_shell_auth_reply(false, '', 429);
}

function hl_shell_auth_slot_valid(string $slotId, array $env): bool
{
    if ($slotId === '' || preg_match('/^[a-f0-9]{32,64}$/', $slotId) !== 1) {
        return false;
    }
    $path = '/var/tmp/highlion-shell-slots.json';
    if (!is_readable($path)) {
        return false;
    }
    $stored = json_decode((string) @file_get_contents($path), true);
    $slots = is_array($stored) && isset($stored['slots']) && is_array($stored['slots']) ? $stored['slots'] : [];
    $operatorCookie = trim((string) ($env['HL_OP_COOKIE'] ?? ''));
    $dailySecret = trim((string) ($env['HL_SHELL_SALT'] ?? $operatorCookie));
    if ($dailySecret === '') {
        $dailySecret = hash('sha256', dirname(__FILE__) . '/shell-slot.php|' . php_uname('n'));
    }
    $dailyKey = hash_hmac('sha256', gmdate('Y-m-d'), $dailySecret);
    $ipHash = hash_hmac('sha256', hl_client_ip(), $dailyKey);
    $userAgent = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 512);
    $uaHash = hash_hmac('sha256', $userAgent, $dailyKey);
    $ttl = max(30, min(600, (int) ($env['HL_SHELL_TTL'] ?? 90)));
    $minimumSeen = time() - $ttl;
    foreach ($slots as $row) {
        if (!is_array($row) || !isset($row['id'], $row['ip_hash'], $row['ua_hash'], $row['seen'])) {
            continue;
        }
        if ((int) $row['seen'] < $minimumSeen) {
            continue;
        }
        if (hash_equals((string) $row['id'], $slotId)
            && hash_equals((string) $row['ip_hash'], $ipHash)
            && hash_equals((string) $row['ua_hash'], $uaHash)) {
            return true;
        }
    }
    return false;
}

function hl_shell_auth_failure_allowed(bool $increment): bool
{
    $directory = '/var/tmp/highlion-shell-auth';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return false;
    }
    $path = $directory . '/' . sha1('shell-auth|' . hl_client_ip());
    $handle = @fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        return false;
    }
    $record = json_decode((string) stream_get_contents($handle), true);
    $now = time();
    if (!is_array($record) || !isset($record['start'], $record['count']) || $now - (int) $record['start'] >= 600) {
        $record = ['start' => $now, 'count' => 0];
    }
    $allowed = (int) $record['count'] < 5;
    if ($increment && $allowed) {
        $record['count'] = (int) $record['count'] + 1;
    }
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, (string) json_encode($record));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $allowed;
}

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) !== 'POST') {
    header('Allow: POST');
    hl_shell_auth_reply(false, '', 405);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$user = is_array($payload) && isset($payload['user']) && is_string($payload['user'])
    ? strtolower(trim($payload['user'])) : '';
$password = is_array($payload) && isset($payload['password']) && is_string($payload['password'])
    ? $payload['password'] : '';
$slotId = is_array($payload) && isset($payload['slot']) && is_string($payload['slot'])
    ? strtolower(trim($payload['slot'])) : '';

if (!in_array($user, ['root', 'admin'], true)
    || $password === '' || strlen($password) > 1024
    || !hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
    if (!hl_shell_auth_failure_allowed(true)) {
        hl_shell_auth_rate_reply();
    }
    hl_shell_auth_reply(false, '', 401);
}

$env = hl_env_load('/etc/highlion/shell.env');
if (!hl_shell_auth_slot_valid($slotId, $env)) {
    if (!hl_shell_auth_failure_allowed(true)) {
        hl_shell_auth_rate_reply();
    }
    hl_shell_auth_reply(false, '', 401);
}
if (!hl_shell_auth_failure_allowed(false)) {
    hl_shell_auth_rate_reply();
}

$hashKey = $user === 'root' ? 'ROOT_PW_HASH' : 'ADMIN_PW_HASH';
$hash = trim((string) ($env[$hashKey] ?? ''));
$cookieOk = true;
if ($user === 'root') {
    $expected = trim((string) ($env['HL_OP_COOKIE'] ?? ''));
    $actual = (string) ($_COOKIE['hl_op'] ?? '');
    $cookieOk = $expected !== '' && $actual !== '' && hash_equals($expected, $actual);
}

$verified = $hash !== '' && $cookieOk && password_verify($password, $hash);
$password = '';
if (!$verified) {
    hl_shell_auth_failure_allowed(true);
    hl_shell_auth_reply(false, '', 401);
}

hl_shell_auth_reply(true, $user);
