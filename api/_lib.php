<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

/*
Owner deployment notes:
rsync repo to /var/www/highlion
enable php-fpm location /api/
exclude /api/ from IL geo map
confirm off-IL: curl -I https://www.highlion.net/contact.html  ? 403
confirm any-IP: curl -I https://www.highlion.net/api/csrf.php ? 200
*/

function hl_json($data, $code = 200): void
{
    http_response_code((int) $code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) === 'HEAD') {
        exit;
    }
    $encoded = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        http_response_code(500);
        echo '{"ok":false}';
        exit;
    }
    echo $encoded;
    exit;
}

function hl_origin_ok(string $csrfToken = ''): bool
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '') {
        $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
        return $originHost === 'www.highlion.net' || $originHost === 'highlion.net';
    }

    $referer = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
    if ($referer !== '') {
        $refererHost = strtolower((string) parse_url($referer, PHP_URL_HOST));
        return $refererHost === 'www.highlion.net' || $refererHost === 'highlion.net';
    }

    $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
    $host = preg_replace('/:\d+$/', '', $host);
    return ($host === 'www.highlion.net' || $host === 'highlion.net') && hl_csrf_check($csrfToken);
}

function hl_client_ip(): string
{
    $candidates = [];
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $candidates[] = trim((string) $_SERVER['HTTP_CF_CONNECTING_IP']);
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $forwarded = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
        $candidates[] = trim((string) ($forwarded[0] ?? ''));
    }
    $candidates[] = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    foreach ($candidates as $candidate) {
        if (filter_var($candidate, FILTER_VALIDATE_IP) !== false) {
            return $candidate;
        }
    }
    return '0.0.0.0';
}

function hl_csrf_issue(): string
{
    try {
        $token = bin2hex(random_bytes(32));
    } catch (Throwable $error) {
        $token = hash('sha256', uniqid('hl', true) . microtime(true));
    }
    $base = [
        'expires' => time() + 3600,
        'path' => '/',
        'secure' => true,
        'samesite' => 'Lax',
    ];
    setcookie('hl_csrf', $token, $base + ['httponly' => true]);
    return $token;
}

function hl_csrf_check($token): bool
{
    if (!is_string($token) || $token === '') {
        return false;
    }
    $cookie = (string) ($_COOKIE['hl_csrf'] ?? '');
    return $cookie !== '' && hash_equals($cookie, $token);
}

function hl_rate_allow($bucket, $limit, $windowSec): bool
{
    $limit = max(1, (int) $limit);
    $windowSec = max(1, (int) $windowSec);
    $directory = '/var/tmp/highlion-letterbox';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return false;
    }
    $key = sha1((string) $bucket . '|' . hl_client_ip());
    $path = $directory . '/' . $key;
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return false;
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return false;
    }
    $raw = stream_get_contents($handle);
    $record = json_decode($raw ?: '', true);
    $now = time();
    if (!is_array($record) || !isset($record['start'], $record['count']) || $now - (int) $record['start'] >= $windowSec) {
        $record = ['start' => $now, 'count' => 0];
    }
    $allowed = (int) $record['count'] < $limit;
    if ($allowed) {
        $record['count'] = (int) $record['count'] + 1;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, (string) json_encode($record));
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $allowed;
}

function hl_log($line): void
{
    $clean = preg_replace('/[\r\n\0]+/', ' ', (string) $line);
    $entry = gmdate('c') . ' ' . hl_client_ip() . ' ' . trim((string) $clean) . PHP_EOL;
    @file_put_contents('/var/tmp/highlion-letterbox.log', $entry, FILE_APPEND | LOCK_EX);
}

function hl_honeypot_write(array $row): void
{
    $encoded = json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (is_string($encoded)) {
        @file_put_contents('/var/tmp/highlion-honeypot.log', $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function hl_env_load(string $path): array
{
    if (!is_readable($path)) {
        return [];
    }
    $lines = @file($path, FILE_IGNORE_NEW_LINES);
    if (!is_array($lines)) {
        return [];
    }
    $values = [];
    foreach ($lines as $line) {
        $line = trim((string) $line);
        if ($line === '' || substr($line, 0, 1) === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) {
            continue;
        }
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = $value[strlen($value) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }
        $values[$key] = $value;
    }
    return $values;
}

function hl_telegram(string $envPath, string $text): bool
{
    $values = hl_env_load($envPath);
    $token = trim((string) ($values['TELEGRAM_BOT_TOKEN'] ?? ''));
    $chatId = trim((string) ($values['TELEGRAM_CHAT_ID'] ?? ''));
    if ($token === '' || $chatId === '' || preg_match('/^[A-Za-z0-9:_-]+$/', $token) !== 1) {
        return false;
    }
    if (function_exists('mb_substr')) {
        $text = mb_substr($text, 0, 3500, 'UTF-8');
    } else {
        $text = substr($text, 0, 3500);
    }
    $body = http_build_query([
        'chat_id' => $chatId,
        'text' => $text,
        'disable_web_page_preview' => 'true',
    ], '', '&', PHP_QUERY_RFC3986);
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 8,
            'ignore_errors' => true,
            'header' => "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: " . strlen($body) . "\r\n",
            'content' => $body,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $http_response_header = [];
    $response = @file_get_contents('https://api.telegram.org/bot' . $token . '/sendMessage', false, $context);
    $statusOk = isset($http_response_header[0]) && preg_match('/\s200\s/', (string) $http_response_header[0]) === 1;
    $decoded = is_string($response) ? json_decode($response, true) : null;
    return $statusOk && is_array($decoded) && ($decoded['ok'] ?? false) === true;
}

function hl_country(): string
{
    $country = strtoupper(trim((string) ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? '')));
    return preg_match('/^[A-Z]{2}$/', $country) === 1 ? $country : '';
}

function hl_clean_header($s): string
{
    $clean = preg_replace('/[\r\n\0]+/', '', (string) $s);
    $clean = preg_replace('/(?:^|\s)(?:to|from|cc|bcc|reply-to|content-type|mime-version)\s*:/i', '', (string) $clean);
    return trim((string) $clean);
}
