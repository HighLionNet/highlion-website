<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hl_json(['ok' => false], 405);
}

$token = hl_csrf_issue();
hl_json(['ok' => true, 'token' => $token]);
