<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if (!in_array($requestMethod, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}

$id = strtolower(trim((string) ($_GET['id'] ?? '')));
if (preg_match('/^[a-f0-9]{40}$/', $id) !== 1) {
    hl_json(['ok' => false], 404);
}

$path = '/var/tmp/highlion-thumbs/' . $id;
if (!is_file($path) || !is_readable($path)) {
    hl_json(['ok' => false], 404);
}

$contentType = 'image/jpeg';
$mapFile = '/var/tmp/highlion-thumbs.json';
if (is_readable($mapFile)) {
    $map = json_decode((string) @file_get_contents($mapFile), true);
    if (is_array($map)) {
        foreach ($map as $record) {
            if (!is_array($record) || strtolower((string) ($record['id'] ?? '')) !== $id) {
                continue;
            }
            $candidate = strtolower((string) ($record['ctype'] ?? ''));
            if (in_array($candidate, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
                $contentType = $candidate;
            }
            break;
        }
    }
}

header('Content-Type: ' . $contentType);
header('Content-Length: ' . (string) filesize($path));
header('Cache-Control: public, max-age=86400');
header('X-Content-Type-Options: nosniff');
if ($requestMethod !== 'HEAD') {
    readfile($path);
}
