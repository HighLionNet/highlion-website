<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) !== 'POST') {
    header('Allow: POST');
    hl_json(['ok' => false], 405);
}

$source = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
if ($source === '') {
    $source = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
}
$sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
if (!in_array($sourceHost, ['www.highlion.net', 'highlion.net'], true)) {
    hl_json(['ok' => false], 403);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$flag = is_array($payload) && isset($payload['flag']) && is_string($payload['flag'])
    ? trim($payload['flag'])
    : '';
$allowedDigests = [
    '9d46e63c754258ae2536b6fcb39daeffe1af80c7aded8856d9d26934a7363760',
    '946a21665631102749adff6eb305996b426e0fd196fbcd41695febaa7327f39b',
    'fda8f03c08a75dede0edd3ce60a050da7563e39542e88748eb33244751dd58bb',
    '3f47ad874b80b8e2728f7f77cdbebd43b77051dfe9df8bda6bf57b85a9c0f2f1',
    'a199774a5f59c77b64a72b9127eb88520d52719a87cbf2bd5089fb218b2a17a1',
];
$submittedDigest = hash('sha256', $flag);
$accepted = false;
foreach ($allowedDigests as $allowedDigest) {
    $accepted = hash_equals($allowedDigest, $submittedDigest) || $accepted;
}
if (!$accepted) {
    hl_json(['ok' => false], 400);
}
if (!hl_rate_allow('ctf', 10, 3600)) {
    hl_json(['ok' => false], 429);
}

hl_json(['ok' => true]);
