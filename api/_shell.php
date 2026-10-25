<?php
declare(strict_types=1);
require_once __DIR__ . '/_session.php';

function hl_slot_ttl(array $env): int
{
    return max(30, min(600, (int) ($env['HL_SHELL_TTL'] ?? 90)));
}

function hl_slot_id(string $id): bool
{
    return preg_match('/^[a-f0-9]{32}$/D', $id) === 1;
}

function hl_slot_owned(array $row, array $env): bool
{
    return hash_equals((string) ($row['ip_hash'] ?? ''), hl_shell_ip_hash($env))
        && hash_equals((string) ($row['owner'] ?? ''), hash('sha256', (string) $_SESSION['lease_owner']));
}

function hl_slot_admin(array $row, array $env): bool
{
    return hl_slot_owned($row, $env) && !($row['locked'] ?? false) && !($row['terminated'] ?? false)
        && ($row['auth_version'] ?? '') === 'hl8v' && ($row['user'] ?? '') === 'admin'
        && hl_admin($row['id'], $env);
}

function hl_slots_open(array $env): array
{
    $path = '/var/tmp/highlion-shell-slots.json';
    if (is_link($path) || is_link($path . '.lock')) hl_json(['ok' => false], 503);
    $handle = @fopen($path . '.lock', 'c+');
    if ($handle === false) hl_json(['ok' => false], 503);
    if (!flock($handle, LOCK_EX)) { fclose($handle); hl_json(['ok' => false], 503); }
    @chmod($path . '.lock', 0600);
    $raw = is_file($path) ? @file_get_contents($path, false, null, 0, 2097153) : '';
    if (!is_string($raw)) { flock($handle, LOCK_UN); fclose($handle); hl_json(['ok' => false], 503); }
    $stored = json_decode((string) $raw, true, 16);
    if (($raw !== '' && (!is_array($stored) || !is_array($stored['slots'] ?? null))) || strlen((string) $raw) > 2097152) {
        flock($handle, LOCK_UN); fclose($handle); hl_json(['ok' => false], 503);
    }
    $now = time();
    $ttl = hl_slot_ttl($env);
    $slots = array_values(array_filter($stored['slots'] ?? [], static function ($row) use ($now, $ttl): bool {
        return is_array($row) && hl_slot_id((string) ($row['id'] ?? ''))
            && preg_match('/^[a-f0-9]{64}$/D', (string) ($row['ip_hash'] ?? '')) === 1
            && (int) ($row['seen'] ?? 0) > $now - $ttl && (int) ($row['seen'] ?? 0) <= $now + 5;
    }));
    $ids = array_column($slots, 'id');
    foreach (['admins', 'shell_users'] as $key) {
        $_SESSION[$key] = array_intersect_key(is_array($_SESSION[$key] ?? null) ? $_SESSION[$key] : [], array_flip($ids));
    }
    return [$handle, $slots];
}

function hl_slots_save($handle, array $slots): void
{
    $encoded = json_encode(['slots' => array_values($slots)], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    $path = '/var/tmp/highlion-shell-slots.json';
    $temporary = @tempnam(dirname($path), 'highlion-slots-');
    $ok = is_string($encoded) && strlen($encoded) <= 2097152 && is_string($temporary);
    if ($ok) {
        @chmod($temporary, 0600);
        $writer = @fopen($temporary, 'wb');
        $ok = $writer !== false && fwrite($writer, $encoded) === strlen($encoded) && fflush($writer);
        if (is_resource($writer)) { if ($ok && function_exists('fsync')) $ok = fsync($writer); fclose($writer); }
        if ($ok) $ok = @rename($temporary, $path);
    }
    if (is_string($temporary) && is_file($temporary)) @unlink($temporary);
    flock($handle, LOCK_UN);
    fclose($handle);
    if (!$ok) hl_json(['ok' => false], 503);
}
