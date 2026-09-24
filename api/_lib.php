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
    $encoded = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        http_response_code(500);
        echo '{"ok":false}';
        exit;
    }
    echo $encoded;
    exit;
}

function hl_origin_ok(): bool
{
    $source = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($source === '') {
        $source = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
    }
    if ($source === '') {
        return false;
    }
    $host = strtolower((string) parse_url($source, PHP_URL_HOST));
    return $host === 'www.highlion.net' || $host === 'highlion.net';
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
    setcookie('hl_csrf_js', $token, $base + ['httponly' => false]);
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

function hl_clean_header($s): string
{
    $clean = preg_replace('/[\r\n\0]+/', '', (string) $s);
    $clean = preg_replace('/(?:^|\s)(?:to|from|cc|bcc|reply-to|content-type|mime-version)\s*:/i', '', (string) $clean);
    return trim((string) $clean);
}
