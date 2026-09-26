<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method === 'HEAD') {
    hl_json(['ok' => true]);
}
if ($method !== 'POST') {
    header('Allow: POST, HEAD');
    hl_json(['ok' => false], 405);
}

$raw = (string) file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    hl_json(['ok' => false], 400);
}
$op = isset($payload['op']) && is_string($payload['op']) ? $payload['op'] : '';
if (!in_array($op, ['acquire', 'beat', 'release', 'list', 'drop'], true)) {
    hl_json(['ok' => false], 400);
}

$env = hl_env_load('/etc/highlion/shell.env');
$slotLimit = max(1, min(128, (int) ($env['HL_SHELL_SLOTS'] ?? 8)));
$ttl = max(30, min(600, (int) ($env['HL_SHELL_TTL'] ?? 90)));
$operatorCookie = trim((string) ($env['HL_OP_COOKIE'] ?? ''));
$cookieValue = (string) ($_COOKIE['hl_op'] ?? '');
$originOk = hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
$operator = $operatorCookie !== '' && $cookieValue !== '' && hash_equals($operatorCookie, $cookieValue);

if (!$originOk) {
    hl_json(['ok' => false], 403);
}

if ($op === 'list' || $op === 'drop') {
    if (!$operator) {
        hl_json(['ok' => false], 404);
    }
}

$dailySecret = trim((string) ($env['HL_SHELL_SALT'] ?? $operatorCookie));
if ($dailySecret === '') {
    $dailySecret = hash('sha256', __FILE__ . '|' . php_uname('n'));
}
$dailyKey = hash_hmac('sha256', gmdate('Y-m-d'), $dailySecret);
$ipHash = hash_hmac('sha256', hl_client_ip(), $dailyKey);
$userAgent = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 512);
$uaHash = hash_hmac('sha256', $userAgent, $dailyKey);
$now = time();
$storePath = '/var/tmp/highlion-shell-slots.json';
$handle = @fopen($storePath, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    if (is_resource($handle)) {
        fclose($handle);
    }
    hl_json($op === 'acquire' ? ['ok' => true, 'mode' => 'fallback'] : ['ok' => false], $op === 'acquire' ? 200 : 503);
}

$storedRaw = stream_get_contents($handle);
$stored = json_decode($storedRaw ?: '', true);
if (!is_array($stored)) {
    $stored = [];
}
$slots = isset($stored['slots']) && is_array($stored['slots']) ? $stored['slots'] : [];
$acquires = isset($stored['acquires']) && is_array($stored['acquires']) ? $stored['acquires'] : [];
$slots = array_values(array_filter($slots, static function ($row) use ($now, $ttl): bool {
    return is_array($row)
        && isset($row['id'], $row['seen'])
        && is_string($row['id'])
        && (int) $row['seen'] >= $now - $ttl;
}));
$acquires = array_values(array_filter($acquires, static function ($row) use ($now): bool {
    return is_array($row) && isset($row['ip_hash'], $row['at']) && (int) $row['at'] >= $now - 60;
}));

$reply = ['ok' => false];
$status = 200;

if ($op === 'acquire') {
    $recent = 0;
    foreach ($acquires as $row) {
        if (is_string($row['ip_hash']) && hash_equals($row['ip_hash'], $ipHash)) {
            $recent += 1;
        }
    }
    if ($recent >= 8) {
        $status = 429;
    } else {
        $acquires[] = ['ip_hash' => $ipHash, 'at' => $now];
        if (count($slots) >= $slotLimit) {
            $reply = ['ok' => true, 'mode' => 'fallback'];
        } else {
            try {
                $id = bin2hex(random_bytes(16));
            } catch (Throwable $error) {
                $id = hash('sha256', uniqid('shell', true) . microtime(true));
            }
            $user = 'kali';
            $slots[] = [
                'id' => $id,
                'user' => $user,
                'ua_hash' => $uaHash,
                'ip_hash' => $ipHash,
                'created' => $now,
                'seen' => $now,
                'pids' => [],
            ];
            $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl, 'operator' => $operator];
        }
    }
} elseif ($op === 'beat' || $op === 'release') {
    $id = isset($payload['id']) && is_string($payload['id']) ? $payload['id'] : '';
    $found = false;
    foreach ($slots as $index => &$row) {
        $sameLease = $id !== '' && hash_equals((string) $row['id'], $id)
            && hash_equals((string) $row['ip_hash'], $ipHash)
            && hash_equals((string) $row['ua_hash'], $uaHash);
        if (!$sameLease) {
            continue;
        }
        $found = true;
        if ($op === 'release') {
            unset($slots[$index]);
        } else {
            $row['seen'] = $now;
            $reply = ['ok' => true, 'mode' => 'full', 'id' => $id, 'ttl' => $ttl];
        }
        break;
    }
    unset($row);
    $slots = array_values($slots);
    if ($op === 'release') {
        $reply = ['ok' => true];
    } elseif (!$found) {
        $reply = ['ok' => true, 'mode' => 'fallback'];
    }
} elseif ($op === 'list') {
    $publicSlots = array_map(static function (array $row): array {
        return [
            'id' => (string) $row['id'],
            'user' => (string) ($row['user'] ?? 'kali'),
            'created' => (int) ($row['created'] ?? 0),
            'seen' => (int) ($row['seen'] ?? 0),
            'pids' => isset($row['pids']) && is_array($row['pids']) ? $row['pids'] : [],
        ];
    }, $slots);
    $reply = ['ok' => true, 'slots' => $publicSlots];
} elseif ($op === 'drop') {
    $id = isset($payload['id']) && is_string($payload['id']) ? $payload['id'] : '';
    $before = count($slots);
    $slots = array_values(array_filter($slots, static function (array $row) use ($id): bool {
        return $id === '' || !hash_equals((string) $row['id'], $id);
    }));
    if ($id === '' || count($slots) === $before) {
        $status = 404;
    } else {
        $reply = ['ok' => true];
    }
}

$stored = ['slots' => $slots, 'acquires' => $acquires];
rewind($handle);
ftruncate($handle, 0);
fwrite($handle, (string) json_encode($stored, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
fflush($handle);
flock($handle, LOCK_UN);
fclose($handle);
@chmod($storePath, 0660);

hl_json($reply, $status);
