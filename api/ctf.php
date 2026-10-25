<?php
declare(strict_types=1);
require_once __DIR__ . '/_session.php';
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method === 'GET') {
    if (!hl_rate_allow('ctf-read', 60, 60)) hl_json(['ok' => false], 429);
    hl_session();
    $claims = hl_claims();
    hl_json(['ok' => true, 'claimed' => $claims, 'total' => 4]);
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    hl_json(['ok' => false], 405);
}
if (!hl_origin_ok((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) hl_json(['ok' => false], 403);
if (!hl_rate_allow('ctf-attempts', 30, 600)) {
    header('Retry-After: 600');
    hl_json(['ok' => false], 429);
}
$payload = hl_payload(1024);
$flag = isset($payload['flag']) && is_string($payload['flag']) ? trim($payload['flag']) : '';
if (strlen($flag) > 160 || !preg_match('/^HL8\{[a-z0-9_-]{8,140}\}$/D', $flag)) hl_json(['ok' => false], 400);
$allowedDigests = [
    'modular' => 'd8befebf57092dbadfd29b434d2344d9c8afba4e5041416eb0437c6ce2a7f288',
    'route' => '38130503bf809a5255496e20a6c6dfefc6d58e3afe901d280982b338c68a6599',
    'xor' => 'fa03c4a54c78140dea4909fe9b310ff72369e24e574fa2e6845b8ee4b8de2d0f',
    'timeline' => '2f70b2a0f8fa009309d444b143e4ad214995e87515e18692b02f7cea6391b6ad',
];
$digest = hash('sha256', $flag);
$id = '';
foreach ($allowedDigests as $name => $allowed) {
    if (hash_equals($allowed, $digest)) $id = $name;
}
if ($id === '') hl_json(['ok' => false], 400);
hl_session();
$claims = hl_claims();
$duplicate = in_array($id, $claims, true);
if (!$duplicate) $claims[] = $id;
$_SESSION['ctf'] = ['season' => 'station-01', 'claimed' => $claims];
hl_json(['ok' => true, 'id' => $id, 'claimed' => $claims, 'duplicate' => $duplicate]);
