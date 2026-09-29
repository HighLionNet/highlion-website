<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (!in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')), ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}

$coins = ['bitcoin', 'bitcoin-cash', 'monero', 'ethereum', 'solana', 'litecoin', 'dogecoin', 'cardano'];
$validDays = ['1', '7', '30'];
$coin = isset($_GET['coin']) && is_string($_GET['coin']) ? strtolower(trim($_GET['coin'])) : '';
$days = isset($_GET['days']) && is_string($_GET['days']) ? trim($_GET['days']) : '';
if (!in_array($coin, $coins, true) || !in_array($days, $validDays, true)) {
    hl_json(['ok' => false], 400);
}

$cachePath = '/var/tmp/highlion-market.json';
$cacheKey = $coin . ':' . $days;
$readCache = static function () use ($cachePath): array {
    if (!is_readable($cachePath)) {
        return [];
    }
    $decoded = json_decode((string) @file_get_contents($cachePath), true);
    return is_array($decoded) ? $decoded : [];
};
$cleanPrices = static function ($rows): array {
    if (!is_array($rows)) {
        return [];
    }
    $clean = [];
    foreach (array_slice($rows, -5000) as $row) {
        if (!is_array($row) || count($row) < 2 || !is_numeric($row[0]) || !is_numeric($row[1])) {
            continue;
        }
        $timestamp = (float) $row[0];
        $price = (float) $row[1];
        if (!is_finite($timestamp) || !is_finite($price) || $timestamp <= 0 || $price < 0) {
            continue;
        }
        $clean[] = [$timestamp, $price];
    }
    return $clean;
};
$reply = static function (array $entry, bool $stale = false) use ($coin, $days, $cleanPrices): void {
    $prices = $cleanPrices($entry['prices'] ?? []);
    if (count($prices) < 2) {
        hl_json(['ok' => false], 503);
    }
    $payload = ['ok' => true, 'coin' => $coin, 'days' => (int) $days, 'prices' => $prices];
    if ($stale) {
        $payload['stale'] = true;
    }
    hl_json($payload);
};

$cache = $readCache();
$entry = isset($cache[$cacheKey]) && is_array($cache[$cacheKey]) ? $cache[$cacheKey] : [];
$fetchedAt = (int) ($entry['fetched_at'] ?? 0);
if ($fetchedAt > 0 && $fetchedAt >= time() - 60) {
    $reply($entry);
}

$url = 'https://api.coingecko.com/api/v3/coins/' . rawurlencode($coin)
    . '/market_chart?vs_currency=usd&days=' . rawurlencode($days);
$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 6,
        'ignore_errors' => true,
        'header' => "Accept: application/json\r\nUser-Agent: HighLion-HLv8/1.0\r\n",
    ],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
]);
$http_response_header = [];
$raw = @file_get_contents($url, false, $context);
$statusOk = isset($http_response_header[0]) && preg_match('/\s200\s/', (string) $http_response_header[0]) === 1;
$decoded = $statusOk && is_string($raw) ? json_decode($raw, true) : null;
$prices = is_array($decoded) ? $cleanPrices($decoded['prices'] ?? null) : [];

if (count($prices) >= 2) {
    $nextEntry = ['fetched_at' => time(), 'prices' => $prices];
    $handle = @fopen($cachePath, 'c+');
    if ($handle !== false && flock($handle, LOCK_EX)) {
        $stored = json_decode((string) stream_get_contents($handle), true);
        if (!is_array($stored)) {
            $stored = [];
        }
        $stored[$cacheKey] = $nextEntry;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, (string) json_encode($stored, JSON_UNESCAPED_SLASHES));
        fflush($handle);
        flock($handle, LOCK_UN);
        @chmod($cachePath, 0660);
    }
    if (is_resource($handle)) {
        fclose($handle);
    }
    $reply($nextEntry);
}

$cache = $readCache();
$fallback = isset($cache[$cacheKey]) && is_array($cache[$cacheKey]) ? $cache[$cacheKey] : $entry;
if (count($cleanPrices($fallback['prices'] ?? [])) >= 2) {
    $reply($fallback, true);
}
hl_json(['ok' => false], 503);
