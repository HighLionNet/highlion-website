<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if (!in_array($requestMethod, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false, 'items' => []], 405);
}
if ($requestMethod === 'HEAD') {
    hl_json(['ok' => true, 'items' => [], 'count' => 0]);
}

$cacheFile = '/var/tmp/highlion-intel.json';
$cacheTtl = 900;
$thumbDirectory = '/var/tmp/highlion-thumbs';
$thumbMapFile = '/var/tmp/highlion-thumbs.json';
$thumbTtl = 7 * 86400;
$articleHosts = [
    'bleepingcomputer.com',
    'www.bleepingcomputer.com',
    'feeds.feedburner.com',
    'thehackernews.com',
    'www.thehackernews.com',
    'krebsonsecurity.com',
    'www.krebsonsecurity.com',
    'cisa.gov',
    'www.cisa.gov',
];
$imageHosts = array_merge($articleHosts, [
    'cdn.bleepingcomputer.com',
    'images.bleepingcomputer.com',
    'bleepstatic.com',
    'www.bleepstatic.com',
    'cdn.thehackernews.com',
    'blogger.googleusercontent.com',
    'lh3.googleusercontent.com',
    'lh4.googleusercontent.com',
    'lh5.googleusercontent.com',
    'lh6.googleusercontent.com',
    'googleusercontent.com',
    'assets.cisa.gov',
    'cisa.gov',
    'www.cisa.gov',
    'media.defense.gov',
    'krebsonsecurity.com',
    'www.krebsonsecurity.com',
    'i0.wp.com',
    'i1.wp.com',
    'i2.wp.com',
]);

function hl_intel_resolve_url(string $base, string $candidate): string
{
    $candidate = html_entity_decode(trim($candidate), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($candidate === '') {
        return '';
    }
    if (strpos($candidate, '//') === 0) {
        return 'https:' . $candidate;
    }
    if (filter_var($candidate, FILTER_VALIDATE_URL) !== false) {
        return $candidate;
    }
    $parts = parse_url($base);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }
    $origin = $parts['scheme'] . '://' . $parts['host'];
    if (isset($parts['port'])) {
        $origin .= ':' . (int) $parts['port'];
    }
    if ($candidate[0] === '/') {
        return $origin . $candidate;
    }
    $basePath = (string) ($parts['path'] ?? '/');
    $directory = preg_replace('#/[^/]*$#', '/', $basePath);
    $path = ($directory ?: '/') . $candidate;
    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }
    return $origin . '/' . implode('/', $segments);
}

function hl_intel_fetch_limited(string $url, int $limit, array $allowedHosts): ?array
{
    for ($redirects = 0; $redirects <= 3; $redirects += 1) {
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
            return null;
        }
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 8,
                'follow_location' => 0,
                'ignore_errors' => true,
                'user_agent' => 'HighLion-Intel/1.0 (+https://www.highlion.net/)',
                'header' => "Accept: text/html,image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.5\r\n",
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $http_response_header = [];
        $handle = @fopen($url, 'rb', false, $context);
        if ($handle === false) {
            return null;
        }
        $status = 0;
        $contentType = '';
        $location = '';
        $contentLength = null;
        foreach ($http_response_header as $headerLine) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/i', (string) $headerLine, $match)) {
                $status = (int) $match[1];
            } elseif (stripos((string) $headerLine, 'Content-Type:') === 0) {
                $contentType = strtolower(trim(explode(';', substr((string) $headerLine, 13), 2)[0]));
            } elseif (stripos((string) $headerLine, 'Content-Length:') === 0) {
                $lengthValue = trim(substr((string) $headerLine, 15));
                $contentLength = ctype_digit($lengthValue) ? (int) $lengthValue : null;
            } elseif (stripos((string) $headerLine, 'Location:') === 0) {
                $location = trim(substr((string) $headerLine, 9));
            }
        }
        if ($status >= 300 && $status < 400) {
            fclose($handle);
            if ($location === '' || $redirects >= 3) {
                return null;
            }
            $url = hl_intel_resolve_url($url, $location);
            if ($url === '') {
                return null;
            }
            continue;
        }
        if ($status < 200 || $status >= 400 || ($contentLength !== null && $contentLength > $limit)) {
            fclose($handle);
            return null;
        }
        $body = '';
        while (!feof($handle) && strlen($body) <= $limit) {
            $chunk = fread($handle, min(8192, $limit + 1 - strlen($body)));
            if ($chunk === false) {
                fclose($handle);
                return null;
            }
            if ($chunk === '') {
                break;
            }
            $body .= $chunk;
        }
        fclose($handle);
        if (strlen($body) > $limit) {
            return null;
        }
        return ['body' => $body, 'ctype' => $contentType, 'url' => $url, 'status' => $status];
    }
    return null;
}

function hl_intel_article_image(string $articleUrl, array $articleHosts): string
{
    $response = hl_intel_fetch_limited($articleUrl, 256 * 1024, $articleHosts);
    if ($response === null || $response['body'] === '') {
        return '';
    }
    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $document->loadHTML((string) $response['body'], LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded) {
        return '';
    }
    $xpath = new DOMXPath($document);
    $query = '//meta['
        . 'translate(@property,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="og:image"'
        . ' or translate(@property,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="og:image:url"'
        . ' or translate(@name,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="twitter:image"'
        . ' or translate(@name,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="twitter:image:src"'
        . ' or translate(@property,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="twitter:image"'
        . ' or translate(@property,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="twitter:image:src"'
        . ']/@content';
    $nodes = $xpath->query($query);
    if ($nodes === false) {
        return '';
    }
    foreach ($nodes as $node) {
        $resolved = hl_intel_resolve_url((string) $response['url'], (string) $node->nodeValue);
        if ($resolved !== '') {
            return $resolved;
        }
    }
    return '';
}

function hl_intel_feed_image(DOMXPath $xpath, DOMNode $node, string $feed): string
{
    $mediaNode = $xpath->query(
        './*[local-name()="enclosure" and @url and starts-with(translate(@type,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"image/")]'
        . ' | .//*[local-name()="content" and @url]'
        . ' | .//*[local-name()="thumbnail" and @url]'
        . ' | .//*[local-name()="image" and (@href or @url)]',
        $node
    )->item(0);
    if ($mediaNode !== null && $mediaNode->attributes !== null) {
        foreach (['url', 'href'] as $attribute) {
            $imageNode = $mediaNode->attributes->getNamedItem($attribute);
            if ($imageNode !== null) {
                $resolved = hl_intel_resolve_url($feed, (string) $imageNode->nodeValue);
                if ($resolved !== '') {
                    return $resolved;
                }
            }
        }
    }
    $htmlNodes = $xpath->query(
        './*[local-name()="encoded" or local-name()="description" or local-name()="summary" or local-name()="content"]',
        $node
    );
    if ($htmlNodes === false) {
        return '';
    }
    foreach ($htmlNodes as $htmlNode) {
        $markup = html_entity_decode((string) $htmlNode->textContent, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (preg_match('/<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1/is', $markup, $match) !== 1) {
            continue;
        }
        $resolved = hl_intel_resolve_url($feed, (string) $match[2]);
        if ($resolved !== '') {
            return $resolved;
        }
    }
    return '';
}

function hl_intel_cached_payload(
    array $payload,
    string $thumbDirectory,
    array &$thumbMap
): array
{
    foreach ($payload['items'] as &$item) {
        $articleUrl = (string) ($item['url'] ?? '');
        $thumb = (string) ($item['thumb'] ?? '');
        if (preg_match('/^\/api\/thumb\.php\?id=([a-f0-9]{40})$/', $thumb, $match) !== 1
            || !is_file($thumbDirectory . '/' . $match[1])) {
            $item['thumb'] = '';
        }
    }
    unset($item);
    $payload['count'] = count($payload['items']);
    return $payload;
}

function hl_intel_normalize_image(string $body, string $contentType): ?array
{
    $limit = 200 * 1024;
    if ($body === '') {
        return null;
    }
    if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        $source = @imagecreatefromstring($body);
        if ($source !== false) {
            $width = imagesx($source);
            $height = imagesy($source);
            $scale = min(1.0, 224 / max(1, $width, $height));
            $targetWidth = max(1, (int) round($width * $scale));
            $targetHeight = max(1, (int) round($height * $scale));
            $target = imagecreatetruecolor($targetWidth, $targetHeight);
            if ($target !== false) {
                imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
                ob_start();
                imagejpeg($target, null, 82);
                $jpeg = ob_get_clean();
                imagedestroy($target);
                imagedestroy($source);
                if (is_string($jpeg) && $jpeg !== '' && strlen($jpeg) <= $limit) {
                    return ['body' => $jpeg, 'ctype' => 'image/jpeg'];
                }
            } else {
                imagedestroy($source);
            }
        }
    }
    if (class_exists('Imagick')) {
        try {
            $image = new Imagick();
            $image->readImageBlob($body);
            $image->setIteratorIndex(0);
            $image->thumbnailImage(224, 224, true, true);
            $image->setImageFormat('jpeg');
            $image->setImageCompressionQuality(82);
            $jpeg = $image->getImageBlob();
            $image->clear();
            if ($jpeg !== '' && strlen($jpeg) <= $limit) {
                return ['body' => $jpeg, 'ctype' => 'image/jpeg'];
            }
        } catch (Throwable $error) {
            // The validated original remains a safe fallback below.
        }
    }
    return strlen($body) <= $limit ? ['body' => $body, 'ctype' => $contentType] : null;
}

function hl_intel_thumbnail_url(string $imageUrl): string
{
    $parts = parse_url($imageUrl);
    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === 'blogger.googleusercontent.com' || substr($host, -22) === '.googleusercontent.com') {
        $imageUrl = (string) preg_replace('#/s\d+(?:-[a-z0-9-]+)?/#i', '/s224/', $imageUrl, 1);
        return (string) preg_replace('#=s\d+(?:-[a-z0-9-]+)?(?=$|[?&])#i', '=s224', $imageUrl, 1);
    }
    if (in_array($host, ['i0.wp.com', 'i1.wp.com', 'i2.wp.com'], true)) {
        $separator = strpos($imageUrl, '?') === false ? '?' : '&';
        return $imageUrl . $separator . 'resize=224%2C224&quality=82';
    }
    return $imageUrl;
}

function hl_intel_source_key(string $host): string
{
    $host = strtolower(preg_replace('/^www\./', '', $host));
    if ($host === 'bleepingcomputer.com') {
        return 'bleeping';
    }
    if ($host === 'thehackernews.com' || strpos($host, 'feedburner.com') !== false
        || strpos($host, 'thehackersnews') !== false) {
        return 'hackernews';
    }
    if ($host === 'krebsonsecurity.com') {
        return 'krebs';
    }
    if ($host === 'cisa.gov') {
        return 'cisa';
    }
    return 'highlion';
}

function hl_intel_thumb(
    string $imageUrl,
    string $cacheKey,
    string $sourceKey,
    array &$thumbMap,
    string $thumbDirectory,
    int $thumbTtl,
    array $imageHosts
): string {
    $imageUrl = hl_intel_thumbnail_url($imageUrl);
    $parts = parse_url($imageUrl);
    $host = strtolower((string) ($parts['host'] ?? ''));
    if (strtolower((string) ($parts['scheme'] ?? '')) !== 'https' || !in_array($host, $imageHosts, true)) {
        return '';
    }
    $record = $thumbMap[$cacheKey] ?? null;
    if (is_array($record)) {
        $id = strtolower((string) ($record['id'] ?? ''));
        $at = (int) ($record['at'] ?? 0);
        if (preg_match('/^[a-f0-9]{40}$/', $id) === 1 && time() - $at < $thumbTtl
            && is_file($thumbDirectory . '/' . $id)) {
            return $id;
        }
    }
    $response = hl_intel_fetch_limited($imageUrl, 4 * 1024 * 1024, $imageHosts);
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if ($response !== null && in_array($response['ctype'], $allowedTypes, true) && $response['body'] !== '') {
        if (!is_dir($thumbDirectory) && !@mkdir($thumbDirectory, 0750, true) && !is_dir($thumbDirectory)) {
            return '';
        }
        $finalUrl = (string) $response['url'];
        $id = sha1('article|' . $cacheKey);
        $normalized = hl_intel_normalize_image((string) $response['body'], (string) $response['ctype']);
        if ($normalized !== null && @file_put_contents($thumbDirectory . '/' . $id, $normalized['body'], LOCK_EX) !== false) {
            $sourceDirectory = $thumbDirectory . '/by-source';
            if ((is_dir($sourceDirectory) || @mkdir($sourceDirectory, 0750, true))
                && in_array($sourceKey, ['bleeping', 'hackernews', 'krebs', 'cisa', 'highlion'], true)) {
                @file_put_contents($sourceDirectory . '/' . $sourceKey, $normalized['body'], LOCK_EX);
            }
            $thumbMap[$cacheKey] = [
                'id' => $id,
                'ctype' => $normalized['ctype'],
                'at' => time(),
                'source' => $finalUrl,
            ];
            return $id;
        }
    }
    if (is_array($record)) {
        $staleId = strtolower((string) ($record['id'] ?? ''));
        if (preg_match('/^[a-f0-9]{40}$/', $staleId) === 1
            && is_file($thumbDirectory . '/' . $staleId)) {
            return $staleId;
        }
    }
    return '';
}

$thumbMap = [];
if (is_readable($thumbMapFile)) {
    $decodedMap = json_decode((string) @file_get_contents($thumbMapFile), true);
    if (is_array($decodedMap)) {
        $thumbMap = $decodedMap;
    }
}

$cached = null;
if (is_readable($cacheFile)) {
    $decoded = json_decode((string) @file_get_contents($cacheFile), true);
    if (is_array($decoded) && isset($decoded['items']) && is_array($decoded['items'])) {
        $cached = hl_intel_cached_payload($decoded, $thumbDirectory, $thumbMap);
        if (filemtime($cacheFile) !== false && time() - (int) filemtime($cacheFile) < $cacheTtl) {
            @file_put_contents(
                $thumbMapFile,
                (string) json_encode($thumbMap, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                LOCK_EX
            );
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
        $title = function_exists('mb_substr') ? mb_substr($title, 0, 180, 'UTF-8') : substr($title, 0, 180);
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
        $image = hl_intel_feed_image($xpath, $node, $feed);
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $current[] = [
            'title' => $title,
            'url' => $url,
            'source' => $host,
            'date' => $timestamp === false ? '' : gmdate('Y-m-d', $timestamp),
            '_timestamp' => $timestamp === false ? 0 : $timestamp,
            'image' => $image,
        ];
        if (count($current) >= 10) {
            break;
        }
    }
    $feedItems[] = $current;
}

$items = [];
$seen = [];
for ($round = 0; $round < 10 && count($items) < 10; $round += 1) {
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
        if (count($items) >= 10) {
            break;
        }
    }
}

usort($items, static function (array $left, array $right): int {
    $dateOrder = (int) ($right['_timestamp'] ?? 0) <=> (int) ($left['_timestamp'] ?? 0);
    return $dateOrder !== 0 ? $dateOrder : strcmp((string) ($left['url'] ?? ''), (string) ($right['url'] ?? ''));
});

if ($items === []) {
    if (is_array($cached)) {
        $cached['stale'] = true;
        hl_json($cached);
    }
    hl_json(['ok' => false, 'generated' => gmdate('c'), 'items' => [], 'count' => 0]);
}

foreach ($items as &$item) {
    $imageUrl = (string) ($item['image'] ?? '');
    $articleUrl = (string) $item['url'];
    $sourceKey = hl_intel_source_key((string) ($item['source'] ?? ''));
    $thumbId = '';
    if ($imageUrl === '') {
        $articleRecord = $thumbMap[$articleUrl] ?? null;
        if (is_array($articleRecord)) {
            $articleId = strtolower((string) ($articleRecord['id'] ?? ''));
            $articleAt = (int) ($articleRecord['at'] ?? 0);
            if (preg_match('/^[a-f0-9]{40}$/', $articleId) === 1
                && time() - $articleAt < $thumbTtl
                && is_file($thumbDirectory . '/' . $articleId)) {
                $thumbId = $articleId;
            }
        }
        if ($thumbId === '') {
            $imageUrl = hl_intel_article_image($articleUrl, $articleHosts);
            if ($imageUrl !== '') {
                $thumbId = hl_intel_thumb(
                    $imageUrl,
                    $articleUrl,
                    $sourceKey,
                    $thumbMap,
                    $thumbDirectory,
                    $thumbTtl,
                    $imageHosts
                );
            }
        }
        if ($thumbId === '' && is_array($articleRecord)) {
            $staleId = strtolower((string) ($articleRecord['id'] ?? ''));
            if (preg_match('/^[a-f0-9]{40}$/', $staleId) === 1
                && is_file($thumbDirectory . '/' . $staleId)) {
                $thumbId = $staleId;
            }
        }
    } else {
        $thumbId = hl_intel_thumb(
            $imageUrl,
            $articleUrl,
            $sourceKey,
            $thumbMap,
            $thumbDirectory,
            $thumbTtl,
            $imageHosts
        );
    }
    $item['thumb'] = $thumbId === '' ? '' : '/api/thumb.php?id=' . $thumbId;
    unset($item['image'], $item['_timestamp']);
}
unset($item);

@file_put_contents(
    $thumbMapFile,
    (string) json_encode($thumbMap, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    LOCK_EX
);
$payload = [
    'ok' => true,
    'generated' => gmdate('c'),
    'items' => $items,
    'count' => count($items),
];
@file_put_contents(
    $cacheFile,
    (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    LOCK_EX
);
hl_json($payload);
