<?php
declare(strict_types=1);
require_once __DIR__ . '/_shell.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method === 'HEAD') hl_json(['ok' => true]);
if ($method !== 'POST') { header('Allow: POST, HEAD'); hl_json(['ok' => false], 405); }
if (!hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) hl_json(['ok' => false], 403);
$payload = hl_payload(16384);
$op = is_string($payload['op'] ?? null) ? $payload['op'] : '';
$controls = ['list', 'drop', 'lock', 'unlock', 'reset', 'clear', 'exec', 'fx', 'particles', 'theme', 'banner', 'appearance'];
if (!in_array($op, array_merge(['acquire', 'beat', 'release', 'demote'], $controls), true)) hl_json(['ok' => false], 400);
$control = in_array($op, $controls, true);
$id = is_string($payload['id'] ?? null) ? $payload['id'] : '';
$actor = is_string($payload['actor'] ?? null) ? $payload['actor'] : '';
$value = is_string($payload['value'] ?? null) ? $payload['value'] : '';
$client = is_string($payload['client'] ?? null) ? $payload['client'] : '';
if (($op !== 'acquire' && $op !== 'list' && !hl_slot_id($id)) || ($control && !hl_slot_id($actor))) hl_json(['ok' => false], 400);
if ($op === 'acquire' && $client !== '' && !hl_slot_id($client)) hl_json(['ok' => false], 400);
if (strlen($value) > 4096 || preg_match('/[\x00-\x1f\x7f]/', $value)) hl_json(['ok' => false], 400);
if (in_array($op, ['exec', 'banner'], true) && $value === '') hl_json(['ok' => false], 400);
if ($op === 'banner' && strlen($value) > 240) hl_json(['ok' => false], 400);
if (in_array($op, ['fx', 'particles'], true) && !in_array($value, ['on', 'off'], true)) hl_json(['ok' => false], 400);
if ($op === 'theme' && !in_array($value, ['default', 'amber', 'ice', 'green'], true)) hl_json(['ok' => false], 400);
if ($op === 'appearance' && !preg_match('/^(?:accent #[a-fA-F0-9]{6}|density (?:normal|compact)|scan (?:on|off)|reset)$/D', $value)) hl_json(['ok' => false], 400);
$env = hl_env_load('/etc/highlion/shell.env');
$ttl = hl_slot_ttl($env);
$limit = max(1, min(128, (int) ($env['HL_SHELL_SLOTS'] ?? 8)));
if (!$control && !hl_rate_allow('shell-slot', 240, 60)) { header('Retry-After: 60'); hl_json(['ok' => false], 429); }
if ($control && hl_cookie('hl_session') === '') hl_json(['ok' => false], 403);
hl_session();
if ($control && !hl_admin($actor, $env)) hl_json(['ok' => false], 403);
if ($control && !hl_rate_allow('shell-control', 60, 60)) { header('Retry-After: 60'); hl_json(['ok' => false], 429); }
[$handle, $slots] = hl_slots_open($env);
$now = time();
$actorValid = false;
foreach ($slots as $row) if (hash_equals($row['id'], $actor) && hl_slot_admin($row, $env)) $actorValid = true;
if ($control && !$actorValid) hl_json(['ok' => false], 403);
$reply = ['ok' => false];
$status = 200;
if ($op === 'acquire') {
    if ($client !== '') foreach ($slots as $row) {
        if (($row['client'] ?? '') === $client && hl_slot_owned($row, $env) && !($row['terminated'] ?? false)) {
            $reply = ['ok' => true, 'mode' => 'full', 'id' => $row['id'], 'ttl' => $ttl, 'operator' => false];
            break;
        }
    }
    if (!$reply['ok']) {
        if (!hl_rate_allow('shell-acquire', 8, 60)) $status = 429;
        elseif (count($slots) >= $limit) { $reply['mode'] = 'retry'; $status = 503; }
        else {
            $id = bin2hex(random_bytes(16));
            $slots[] = ['id' => $id, 'client' => $client, 'owner' => hash('sha256', (string) $_SESSION['lease_owner']),
                'ip_hash' => hl_shell_ip_hash($env), 'ip' => hl_client_ip(), 'ua' => hl_user_agent(), 'user' => 'kali', 'created' => $now, 'seen' => $now, 'commands' => [], 'next' => 0, 'acked' => 0, 'delivered' => 0];
            $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl, 'operator' => false];
        }
    }
} elseif ($op === 'list') {
    $reply = ['ok' => true, 'slots' => array_map(static function (array $row): array {
        return ['id' => $row['id'], 'user' => $row['user'] ?? 'kali', 'created' => $row['created'], 'seen' => $row['seen'],
            'ip' => $row['ip'] ?? '', 'ua' => $row['ua'] ?? '',
            'locked' => (bool) ($row['locked'] ?? false), 'terminated' => (bool) ($row['terminated'] ?? false),
            'result' => $row['result'] ?? null, 'pending' => count($row['commands'] ?? [])];
    }, $slots)];
} else {
    $status = 404;
    foreach ($slots as $index => &$row) {
        if (!hash_equals($row['id'], $id) || (!$control && !hl_slot_owned($row, $env))) continue;
        $status = 200;
        $reply = ['ok' => true];
        if ($op === 'release') {
            unset($slots[$index], $_SESSION['admins'][$id], $_SESSION['shell_users'][$id]);
        } elseif ($op === 'demote') {
            unset($_SESSION['admins'][$id], $_SESSION['shell_users'][$id]);
            $row['user'] = 'kali';
            $row['auth_generation'] = (int) ($row['auth_generation'] ?? 0) + 1;
        } elseif ($op === 'beat') {
            if ($row['terminated'] ?? false) {
                unset($_SESSION['admins'][$id], $_SESSION['shell_users'][$id]);
                $reply = ['ok' => true, 'mode' => 'terminated'];
            } else {
                $row['seen'] = $now;
                $row['ip'] = hl_client_ip();
                $row['ua'] = hl_user_agent();
                $ack = is_int($payload['ack'] ?? null) ? $payload['ack'] : 0;
                $queue = $row['commands'] ?? [];
                $head = $queue[0] ?? null;
                $report = $payload['result'] ?? null;
                if ($ack > (int) ($row['acked'] ?? 0)) {
                    if (!$head || $head['seq'] !== $ack || (int) ($row['delivered'] ?? 0) !== $ack || !is_array($report)
                        || !is_int($report['status'] ?? null) || !is_string($report['output'] ?? null) || strlen($report['output']) > 8192) {
                        $reply = ['ok' => false]; $status = 400;
                    } else {
                        $row['result'] = ['seq' => $ack, 'status' => max(0, min(255, $report['status'])), 'output' => substr($report['output'], 0, 4096)];
                        $row['acked'] = $ack;
                        array_shift($queue);
                        $row['commands'] = $queue;
                    }
                }
                if ($status === 200) {
                    $admin = hl_slot_admin($row, $env);
                    $row['user'] = $admin ? 'admin' : (($row['auth_version'] ?? '') === 'hl8v' && ($row['user'] ?? '') === 'root'
                        && ($_SESSION['shell_users'][$id] ?? '') === 'root' ? 'root' : 'kali');
                    if (!$admin) unset($_SESSION['admins'][$id]);
                    $pending = array_slice($queue, 0, 1);
                    if ($pending) $row['delivered'] = $pending[0]['seq'];
                    $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl, 'operator' => $admin,
                        'user' => $row['user'], 'generation' => (int) ($row['auth_generation'] ?? 0), 'locked' => (bool) ($row['locked'] ?? false), 'commands' => $pending];
                }
            }
        } elseif ($op === 'drop') {
            $row['terminated'] = true;
            $row['auth_generation'] = (int) ($row['auth_generation'] ?? 0) + 1;
            $row['commands'] = [];
            $row['user'] = 'kali';
        } elseif ($op === 'lock' || $op === 'unlock') {
            $row['locked'] = $op === 'lock';
            if ($op === 'lock') $row['auth_generation'] = (int) ($row['auth_generation'] ?? 0) + 1;
        } elseif ($row['terminated'] ?? false) {
            $reply = ['ok' => false]; $status = 409;
        } elseif (count($row['commands'] ?? []) >= 8 || strlen((string) json_encode($slots)) > 1048576) {
            $reply = ['ok' => false]; $status = 409;
        } else {
            $row['next'] = (int) ($row['next'] ?? 0) + 1;
            $row['commands'][] = ['seq' => $row['next'], 'action' => $op, 'value' => $value];
            $reply['seq'] = $row['next'];
            if ($op === 'reset') { $row['user'] = 'kali'; $row['auth_generation'] = (int) ($row['auth_generation'] ?? 0) + 1; }
        }
        if ($control && $reply['ok']) hl_log('session-control ' . $op . ' actor=' . substr($actor, 0, 8) . ' target=' . substr($id, 0, 8));
        break;
    }
    unset($row);
}
hl_slots_save($handle, $slots);
hl_json($reply, $status);
