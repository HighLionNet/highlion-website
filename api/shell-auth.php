<?php
declare(strict_types=1);
require_once __DIR__ . '/_shell.php';

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) !== 'POST') {
    header('Allow: POST');
    hl_json(['ok' => false, 'user' => ''], 405);
}
if (!hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) hl_json(['ok' => false, 'user' => ''], 403);
$payload = hl_payload(4096);
if (!hl_rate_allow('shell-auth', 5, 600)) {
    header('Retry-After: 600');
    hl_json(['ok' => false, 'user' => ''], 429);
}
$user = is_string($payload['user'] ?? null) ? $payload['user'] : '';
$password = is_string($payload['password'] ?? null) ? $payload['password'] : '';
$id = is_string($payload['slot'] ?? null) ? $payload['slot'] : '';
$generation = is_int($payload['generation'] ?? null) ? $payload['generation'] : -1;
if (!in_array($user, ['root', 'admin'], true) || $password === '' || strlen($password) > 1024
    || strpos($password, "\0") !== false || !hl_slot_id($id)) hl_json(['ok' => false, 'user' => ''], 401);

$env = hl_env_load('/etc/highlion/shell.env');
// Env values stay in place: admin uses the former root hash; root uses the former admin hash.
$hashKeys = $user === 'admin' ? ['HL_ROOT_PW_HASH', 'ROOT_PW_HASH'] : ['HL_ADMIN_PW_HASH', 'ADMIN_PW_HASH'];
if ($user === 'admin' && !hl_operator($env)) hl_json(['ok' => false, 'user' => ''], 401);
$hash = '';
foreach ($hashKeys as $key) {
    $candidate = trim((string) ($env[$key] ?? ''));
    if ($candidate !== '') { $hash = $candidate; break; }
}
hl_session();
[$handle, $slots] = hl_slots_open($env);
foreach ($slots as &$row) {
    if (!hash_equals($row['id'], $id) || !hl_slot_owned($row, $env) || ($row['terminated'] ?? false) || ($row['locked'] ?? false)
        || $generation !== (int) ($row['auth_generation'] ?? 0)) continue;
    $verified = $hash !== '' && password_verify($password, $hash);
    $password = '';
    if (!$verified) break;
    if (!session_regenerate_id(true)) hl_json(['ok' => false, 'user' => ''], 503);
    unset($_SESSION['admins'][$id]);
    if ($user === 'admin') {
        hl_op_refresh(hl_cookie('hl_op'));
        $_SESSION['admins'][$id] = time() + 900;
    }
    $_SESSION['shell_users'][$id] = $user;
    $row['user'] = $user;
    $row['auth_version'] = 'hl8v';
    $row['auth_generation'] = $generation + 1;
    $row['seen'] = time();
    unset($row);
    hl_slots_save($handle, $slots);
    hl_json(['ok' => true, 'user' => $user]);
}
unset($row);
hl_slots_save($handle, $slots);
hl_json(['ok' => false, 'user' => ''], 401);
