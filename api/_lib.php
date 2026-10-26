<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

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
    $allowed = ['https://www.highlion.net', 'https://highlion.net'];
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '') return in_array($origin, $allowed, true);
    $referer = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
    if ($referer !== '') {
        $parts = parse_url($referer);
        $base = ($parts['scheme'] ?? '') . '://' . ($parts['host'] ?? '');
        return !isset($parts['port']) && in_array($base, $allowed, true);
    }
    return hl_csrf_check($csrfToken);
}

function hl_client_ip(): string
{
    // HL_CLIENT_IP is set by our FastCGI locations, never by an HTTP header.
    $address = trim((string) ($_SERVER['HL_CLIENT_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''));
    if (filter_var($address, FILTER_VALIDATE_IP) === false) return '0.0.0.0';
    $packed = inet_pton($address);
    if (strlen($packed) === 16 && substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") $packed = substr($packed, 12);
    return (string) inet_ntop($packed);
}

function hl_csrf_issue(): string
{
    $existing = hl_cookie('hl_csrf');
    if (preg_match('/^[a-f0-9]{64}$/D', $existing) === 1) return $existing;
    try {
        $token = bin2hex(random_bytes(32));
    } catch (Throwable $error) {
        hl_json(['ok' => false], 503);
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

function hl_cookie(string $name): string
{
    $raw = (string) ($_SERVER['HTTP_COOKIE'] ?? '');
    if (strlen($raw) > 16384) return '';
    $values = [];
    foreach (explode(';', $raw) as $part) {
        $part = trim($part);
        $separator = strpos($part, '=');
        if ($separator === false) {
            continue;
        }
        $cookieName = trim(substr($part, 0, $separator));
        if ($cookieName !== $name) {
            continue;
        }
        $value = rawurldecode(substr($part, $separator + 1));
        if (strlen($value) > 1024 || preg_match('/[\x00-\x20\x7f]/', $value)) return '';
        $values[] = $value;
    }
    if (!$values) return '';
    foreach ($values as $value) if (!hash_equals($values[0], $value)) return '';
    return $values[0];
}

function hl_op_refresh(string $value): void
{
    if ($value === '' || strlen($value) > 1024 || preg_match('/[\x00-\x20\x7f]/', $value)) {
        return;
    }
    $parts = ['hl_op=' . rawurlencode($value), 'Max-Age=31536000', 'Path=/'];
    $parts[] = 'Secure';
    $parts[] = 'HttpOnly';
    $parts[] = 'SameSite=Lax';
    header('Set-Cookie: ' . implode('; ', $parts), false);
}

function hl_shell_salt(array $env): string
{
    $operatorCookie = trim((string) ($env['HL_OP_COOKIE'] ?? ''));
    $salt = trim((string) ($env['HL_SHELL_SALT'] ?? $operatorCookie));
    return $salt !== '' ? $salt : hash('sha256', __DIR__ . '/shell-slot.php|' . php_uname('n'));
}

function hl_shell_ip_hash(array $env): string
{
    return hash_hmac('sha256', hl_client_ip(), hl_shell_salt($env));
}

function hl_csrf_check($token): bool
{
    if (!is_string($token) || preg_match('/^[a-f0-9]{64}$/D', $token) !== 1) {
        return false;
    }
    $cookie = hl_cookie('hl_csrf');
    return $cookie !== '' && hash_equals($cookie, $token);
}

function hl_rate_allow($bucket, $limit, $windowSec, bool $global = false): bool
{
    $limit = max(1, (int) $limit);
    $windowSec = max(1, (int) $windowSec);
    $directory = '/var/tmp/highlion-letterbox';
    if (is_link($directory)) return false;
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return false;
    }
    $address = inet_pton(hl_client_ip());
    $rateAddress = is_string($address) && strlen($address) === 16 ? bin2hex(substr($address, 0, 8)) . '/64' : hl_client_ip();
    $key = sha1((string) $bucket . '|' . ($global ? 'global' : $rateAddress));
    if (random_int(0, 127) === 0) {
        $entries = @opendir($directory);
        if ($entries !== false) {
            $scanned = 0;
            while (($entry = readdir($entries)) !== false && $scanned++ < 512) {
                if (preg_match('/^[a-f0-9]{40}$/D', $entry) !== 1) continue;
                $oldPath = $directory . '/' . $entry;
                if (!is_link($oldPath) && is_file($oldPath) && (int) @filemtime($oldPath) < time() - 86400) @unlink($oldPath);
            }
            closedir($entries);
        }
    }
    $path = $directory . '/' . $key;
    if (is_link($path)) return false;
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
    if (!is_array($record) || !isset($record['start'], $record['count']) || (int) $record['start'] > $now || $now - (int) $record['start'] >= $windowSec) {
        $record = ['start' => $now, 'count' => 0];
    }
    $allowed = (int) $record['count'] < $limit;
    if ($allowed) {
        $record['count'] = (int) $record['count'] + 1;
        rewind($handle);
        $encoded = (string) json_encode($record);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) {
            $allowed = false;
        }
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
    $encoded = json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if (is_string($encoded)) {
        @file_put_contents('/var/tmp/highlion-honeypot.log', $encoded . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function hl_env_load(string $path): array
{
    if (!is_file($path) || !is_readable($path) || filesize($path) > 65536) {
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

function hl_telegram(string $envPath, string $text, bool $rich = false, int $timeout = 8): bool
{
    $values = hl_env_load($envPath);
    $token = trim((string) ($values['TELEGRAM_BOT_TOKEN'] ?? ''));
    $chatId = trim((string) ($values['TELEGRAM_CHAT_ID'] ?? ''));
    if ($token === '' || $chatId === '' || preg_match('/^[A-Za-z0-9:_-]+$/', $token) !== 1) {
        return false;
    }
    if (!$rich) $text = function_exists('mb_substr') ? mb_substr($text, 0, 3500, 'UTF-8') : substr($text, 0, 3500);
    $parameters = ['chat_id' => $chatId];
    if ($rich) $parameters['rich_message'] = json_encode(['html' => $text, 'skip_entity_detection' => true], JSON_INVALID_UTF8_SUBSTITUTE);
    else $parameters += ['text' => $text, 'disable_web_page_preview' => 'true'];
    $body = http_build_query($parameters, '', '&', PHP_QUERY_RFC3986);
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => max(1, min(8, $timeout)),
            'ignore_errors' => true,
            'follow_location' => 0,
            'header' => "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: " . strlen($body) . "\r\n",
            'content' => $body,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $http_response_header = [];
    $response = @file_get_contents('https://api.telegram.org/bot' . $token . ($rich ? '/sendRichMessage' : '/sendMessage'), false, $context, 0, 65536);
    $statusOk = isset($http_response_header[0]) && preg_match('/\s200\s/', (string) $http_response_header[0]) === 1;
    $decoded = is_string($response) ? json_decode($response, true) : null;
    $ok = $statusOk && is_array($decoded) && ($decoded['ok'] ?? false) === true;
    if (!$ok) {
        // Never log the request URL: it contains the bot token.
        preg_match('/\s(\d{3})\s/', (string) ($http_response_header[0] ?? ''), $status);
        error_log('HighLion: Telegram ' . ($rich ? 'sendRichMessage' : 'sendMessage') . ' failed; HTTP=' . ($status[1] ?? 'network') . '; API=' . (int) ($decoded['error_code'] ?? 0));
    }
    return $ok;
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

function hl_json_file(string $path, int $limit = 2097152): array
{
    if (is_link($path)) return [];
    $handle = @fopen($path, 'r');
    if ($handle === false) return [];
    if (!flock($handle, LOCK_SH)) { fclose($handle); return []; }
    $raw = stream_get_contents($handle, $limit + 1);
    flock($handle, LOCK_UN); fclose($handle);
    if (!is_string($raw) || strlen($raw) > $limit) return [];
    $decoded = json_decode($raw, true, 32);
    return is_array($decoded) ? $decoded : [];
}

function hl_refresh_lock(string $bucket)
{
    $path = '/var/tmp/highlion-refresh-' . hash('sha256', $bucket);
    if (is_link($path)) return false;
    $handle = @fopen($path, 'c+');
    if ($handle === false) return false;
    @chmod($path, 0600);
    if (!flock($handle, LOCK_EX | LOCK_NB)) { fclose($handle); return false; }
    $last = (int) stream_get_contents($handle, 32);
    $now = time();
    if ($last <= $now && $last > $now - 30) { flock($handle, LOCK_UN); fclose($handle); return false; }
    rewind($handle);
    if (!ftruncate($handle, 0) || fwrite($handle, (string) $now) !== strlen((string) $now) || !fflush($handle)) {
        flock($handle, LOCK_UN); fclose($handle); return false;
    }
    return $handle;
}

require_once __DIR__ . '/_alerts.php';
hl_ban_guard();
