<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hl_json(['ok' => false, 'items' => []], 405);
}

$cacheFile = '/var/tmp/highlion-intel.json';
$cacheTtl = 86400;
$cached = null;
if (is_readable($cacheFile)) {
    $decoded = json_decode((string) @file_get_contents($cacheFile), true);
    if (is_array($decoded) && isset($decoded['items']) && is_array($decoded['items'])) {
        $cached = $decoded;
        if (filemtime($cacheFile) !== false && time() - (int) filemtime($cacheFile) < $cacheTtl) {
            $cached['count'] = count($cached['items']);
            hl_json($cached);
        }
    }
}

$feeds = [
    'https://www.bleepingcomputer.com/feed/',
    'https://feeds.feedburner.com/TheHackersNews',
    'https://krebsonsecurity.com/feed/',
    'https://www.cisa.gov/cybersecurity-advisories/all.xml',
];
$domAvailable = class_exists('DOMDocument') && class_exists('DOMXPath');
if (!$domAvailable) {
    if (is_array($cached)) {
        $cached['count'] = count($cached['items']);
        $cached['stale'] = true;
        hl_json($cached);
    }
    hl_json(['ok' => false, 'generated' => gmdate('c'), 'items' => [], 'count' => 0]);
}
$feedItems = [];
$context = stream_context_create([
    'http' => [
        'timeout' => 8,
        'follow_location' => 1,
        'max_redirects' => 3,
        'user_agent' => 'HighLion-Intel/1.0 (+https://www.highlion.net/)',
    ],
    'ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
    ],
]);

$fetchFeed = static function (string $url) use ($context): string {
    $body = @file_get_contents($url, false, $context);
    if (is_string($body) && $body !== '') {
        return $body;
    }
    if (!is_executable('/usr/bin/curl') || !function_exists('proc_open')) {
        return '';
    }
    $pipes = [];
    $process = @proc_open(
        ['/usr/bin/curl', '-fsSL', '--max-time', '8', $url],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    if (!is_resource($process)) {
        return '';
    }
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $status = proc_close($process);
    return $status === 0 && is_string($stdout) ? $stdout : '';
};

foreach ($feeds as $feed) {
    $current = [];
    $xmlText = $fetchFeed($feed);
    if ($xmlText === '') {
        $feedItems[] = $current;
        continue;
    }
    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $document->loadXML($xmlText, LIBXML_NONET | LIBXML_NOCDATA);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded) {
        $feedItems[] = $current;
        continue;
    }
    $xpath = new DOMXPath($document);
    $nodes = $xpath->query('//*[local-name()="item"] | //*[local-name()="entry"]');
    if ($nodes === false) {
        $feedItems[] = $current;
        continue;
    }
    foreach ($nodes as $node) {
        $titleNode = $xpath->query('./*[local-name()="title"]', $node)->item(0);
        $linkNode = $xpath->query('./*[local-name()="link"]', $node)->item(0);
        if ($titleNode === null || $linkNode === null) {
            continue;
        }
        $title = trim(strip_tags((string) $titleNode->textContent));
        if (function_exists('mb_substr')) {
            $title = mb_substr($title, 0, 180, 'UTF-8');
        } else {
            $title = substr($title, 0, 180);
        }
        $url = '';
        if ($linkNode->attributes !== null) {
            $hrefNode = $linkNode->attributes->getNamedItem('href');
            if ($hrefNode !== null) {
                $url = trim((string) $hrefNode->nodeValue);
            }
        }
        if ($url === '') {
            $url = trim((string) $linkNode->textContent);
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if ($title === '' || filter_var($url, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['http', 'https'], true)) {
            continue;
        }
        $dateNode = $xpath->query('./*[local-name()="pubDate" or local-name()="published" or local-name()="updated"]', $node)->item(0);
        $timestamp = $dateNode !== null ? strtotime(trim((string) $dateNode->textContent)) : false;
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $current[] = [
            'title' => $title,
            'url' => $url,
            'source' => $host,
            'date' => $timestamp === false ? '' : gmdate('Y-m-d', $timestamp),
        ];
        if (count($current) >= 8) {
            break;
        }
    }
    $feedItems[] = $current;
}

$items = [];
$seen = [];
for ($round = 0; $round < 8 && count($items) < 8; $round += 1) {
    foreach ($feedItems as $current) {
        if (!isset($current[$round])) {
            continue;
        }
        $item = $current[$round];
        $url = (string) ($item['url'] ?? '');
        if ($url === '' || isset($seen[$url])) {
            continue;
        }
        $seen[$url] = true;
        $items[] = $item;
        if (count($items) >= 8) {
            break;
        }
    }
}

if ($items === []) {
    if (is_array($cached)) {
        $cached['count'] = count($cached['items']);
        $cached['stale'] = true;
        hl_json($cached);
    }
    hl_json(['ok' => false, 'generated' => gmdate('c'), 'items' => [], 'count' => 0]);
}

$payload = [
    'ok' => true,
    'generated' => gmdate('c'),
    'items' => $items,
    'count' => count($items),
];
@file_put_contents($cacheFile, (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
hl_json($payload);
