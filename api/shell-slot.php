<?php
declare(strict_types=1);
require_once __DIR__ . '/_session.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method === 'HEAD') hl_json(['ok' => true]);
if ($method !== 'POST') { header('Allow: POST, HEAD'); hl_json(['ok' => false], 405); }
if (!hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) hl_json(['ok' => false], 403);
$payload = hl_payload();
$op = is_string($payload['op'] ?? null) ? $payload['op'] : '';
$operations = ['acquire', 'beat', 'release', 'demote', 'list', 'drop', 'lock', 'unlock', 'reset', 'clear', 'exec', 'fx'];
if (!in_array($op, $operations, true)) hl_json(['ok' => false], 400);
$env = hl_env_load('/etc/highlion/shell.env');
$ttl = max(30, min(600, (int) ($env['HL_SHELL_TTL'] ?? 90)));
$limit = max(1, min(128, (int) ($env['HL_SHELL_SLOTS'] ?? 8)));
$id = is_string($payload['id'] ?? null) ? $payload['id'] : '';
$actor = is_string($payload['actor'] ?? null) ? $payload['actor'] : '';
$value = is_string($payload['value'] ?? null) ? $payload['value'] : '';
$control = in_array($op, ['list', 'drop', 'lock', 'unlock', 'reset', 'clear', 'exec', 'fx'], true);
hl_session();
if ($control && !hl_admin($actor, $env)) hl_json(['ok' => false], 403);
if ($control && !hl_rate_allow('shell-control', 60, 60)) hl_json(['ok' => false], 429);
if ($op === 'exec' && ($value === '' || strlen($value) > 4096 || preg_match('/[\x00-\x1f\x7f]/', $value))) hl_json(['ok' => false], 400);
if ($op === 'fx' && !in_array($value, ['on', 'off'], true)) hl_json(['ok' => false], 400);

$handle = @fopen('/var/tmp/highlion-shell-slots.json', 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) hl_json(['ok' => false, 'mode' => 'retry'], 503);
@chmod('/var/tmp/highlion-shell-slots.json', 0600);
$stored = json_decode((string) stream_get_contents($handle), true);
$now = time();
$slots = array_values(array_filter(is_array($stored['slots'] ?? null) ? $stored['slots'] : [], static function ($row) use ($now, $ttl): bool {
    return is_array($row) && is_string($row['id'] ?? null) && is_string($row['ip_hash'] ?? null) && (int) ($row['seen'] ?? 0) >= $now - $ttl;
}));
$ip = hl_shell_ip_hash($env);
$owner = hash('sha256', (string) $_SESSION['lease_owner']);
$own = static function (array $row) use ($ip, $owner): bool {
    return hash_equals((string) $row['ip_hash'], $ip) && hash_equals((string) ($row['owner'] ?? ''), $owner);
};
$actorValid = false;
foreach ($slots as $row) {
    if (hash_equals($row['id'], $actor) && $own($row) && !($row['terminated'] ?? false)) $actorValid = true;
}
if ($control && !$actorValid) hl_json(['ok' => false], 403);
$reply = ['ok' => false];
$status = 200;
if ($op === 'acquire') {
    if (!hl_rate_allow('shell-acquire', 8, 60)) { $status = 429; }
    elseif (count($slots) >= $limit) { $reply['mode'] = 'retry'; $status = 503; }
    else {
        $id = bin2hex(random_bytes(16));
        $slots[] = ['id' => $id, 'owner' => $owner, 'ip_hash' => $ip, 'user' => 'kali', 'created' => $now, 'seen' => $now, 'commands' => [], 'next' => 0];
        $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl, 'operator' => false];
    }
} elseif ($op === 'list') {
    $reply = ['ok' => true, 'slots' => array_map(static function (array $row): array {
        return ['id' => $row['id'], 'user' => $row['user'] ?? 'kali', 'created' => $row['created'], 'seen' => $row['seen'], 'locked' => (bool) ($row['locked'] ?? false), 'terminated' => (bool) ($row['terminated'] ?? false), 'result' => $row['result'] ?? null, 'pending' => count($row['commands'] ?? [])];
    }, $slots)];
} else {
    $status = 404;
    foreach ($slots as $index => &$row) {
        if ($id === '' || !hash_equals($row['id'], $id) || (!$control && !$own($row))) continue;
        $status = 200;
        $reply = ['ok' => true];
        if ($op === 'release') {
            unset($slots[$index], $_SESSION['admins'][$id], $_SESSION['shell_users'][$id]);
        } elseif ($op === 'demote') {
            unset($_SESSION['admins'][$id], $_SESSION['shell_users'][$id]);
            $row['user'] = 'kali';
        } elseif ($op === 'beat') {
            $row['seen'] = $now;
            if ($row['terminated'] ?? false) {
                unset($_SESSION['admins'][$id]);
                $reply = ['ok' => true, 'mode' => 'terminated'];
            } else {
                $ack = is_int($payload['ack'] ?? null) ? $payload['ack'] : 0;
                $queue = $row['commands'] ?? [];
                $acked = array_filter($queue, static function (array $entry) use ($ack): bool { return $entry['seq'] === $ack; });
                if ($acked) {
                    $report = is_array($payload['result'] ?? null) ? $payload['result'] : [];
                    $row['result'] = ['seq' => $ack, 'status' => (int) ($report['status'] ?? 0), 'output' => substr(is_string($report['output'] ?? null) ? $report['output'] : '', 0, 4096)];
                    $row['commands'] = array_values(array_filter($queue, static function (array $entry) use ($ack): bool { return $entry['seq'] > $ack; }));
                }
                $row['user'] = hl_admin($id, $env) ? 'admin' : (($_SESSION['shell_users'][$id] ?? '') === 'root' ? 'root' : 'kali');
                $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl, 'operator' => hl_admin($id, $env), 'locked' => (bool) ($row['locked'] ?? false), 'commands' => $row['commands'] ?? []];
            }
        } elseif ($op === 'drop') {
            $row['terminated'] = true;
            $row['commands'] = [];
        } elseif ($op === 'lock' || $op === 'unlock') {
            $row['locked'] = $op === 'lock';
        } else {
            if (count($row['commands'] ?? []) >= 8) { $reply = ['ok' => false]; $status = 409; }
            else {
                $row['next'] = (int) ($row['next'] ?? 0) + 1;
                $row['commands'][] = ['seq' => $row['next'], 'action' => $op, 'value' => $value];
            }
        }
        if ($control) hl_log('session-control ' . $op . ' actor=' . substr($actor, 0, 8) . ' target=' . substr($id, 0, 8));
        break;
    }
    unset($row);
}
$encoded = json_encode(['slots' => array_values($slots)], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
rewind($handle);
if ($encoded === false || !ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) {
    flock($handle, LOCK_UN); fclose($handle); hl_json(['ok' => false], 503);
}
flock($handle, LOCK_UN);
fclose($handle);
hl_json($reply, $status);
