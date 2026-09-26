<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (!in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')), ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}

$token = hl_csrf_issue();
hl_json(['ok' => true, 'token' => $token]);
