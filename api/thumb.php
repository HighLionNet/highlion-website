<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if (!in_array($requestMethod, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}

$id = strtolower(trim((string) ($_GET['id'] ?? '')));
$source = strtolower(trim((string) ($_GET['source'] ?? '')));
$allowedSources = ['bleeping', 'hackernews', 'krebs', 'cisa', 'highlion'];
$path = '';

if (preg_match('/^[a-f0-9]{40}$/', $id) === 1) {
    $candidate = '/var/tmp/highlion-thumbs/' . $id;
    if (is_file($candidate) && is_readable($candidate)) {
        $path = $candidate;
    }
}

if ($path === '' && in_array($source, $allowedSources, true)) {
    $sticky = '/var/tmp/highlion-thumbs/by-source/' . $source;
    if (is_file($sticky) && is_readable($sticky)) {
        $path = $sticky;
    } else {
        foreach (['jpg', 'jpeg', 'png', 'webp'] as $extension) {
            $static = dirname(__DIR__) . '/assets/thumbs/' . $source . '.' . $extension;
            if (is_file($static) && is_readable($static)) {
                $path = $static;
                break;
            }
        }
    }
}

if ($path === '') {
    http_response_code(204);
    header('Cache-Control: public, max-age=300');
    exit;
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

if (function_exists('finfo_open')) {
    $fileInfo = @finfo_open(FILEINFO_MIME_TYPE);
    $detected = $fileInfo === false ? '' : strtolower((string) @finfo_file($fileInfo, $path));
    if ($fileInfo !== false) {
        finfo_close($fileInfo);
    }
    if (in_array($detected, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
        $contentType = $detected;
    }
}

header('Content-Type: ' . $contentType);
header('Content-Length: ' . (string) filesize($path));
header('Cache-Control: public, max-age=86400');
header('X-Content-Type-Options: nosniff');
if ($requestMethod !== 'HEAD') {
    readfile($path);
}
