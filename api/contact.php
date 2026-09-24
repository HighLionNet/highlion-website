<?php
declare(strict_types=1);

# location ^~ /api/ {
#   fastcgi_pass unix:/run/php/php-fpm.sock;
#   include fastcgi_params;
#   fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
# }
# rewrite ^/api/contact$ /api/contact.php last;
# rewrite ^/api/intel$   /api/intel.php last;
# rewrite ^/api/traffic$ /api/traffic.php last;
# rewrite ^/api/csrf$    /api/csrf.php last;
# EXCLUDE ^/api/ from the IL geo-403 that wraps /contact.html
# do not geo-block 403.html
# suggested headers:
#   Referrer-Policy no-referrer-when-downgrade -> strict-origin-when-cross-origin
#   X-Content-Type-Options nosniff
#   X-Frame-Options SAMEORIGIN
#   Permissions-Policy camera=(), microphone=(), geolocation=()

require_once __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    hl_json(['ok' => false], 405);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($payload)) {
    hl_json(['ok' => false], 400);
}

$value = static function (string $key) use ($payload): string {
    return isset($payload[$key]) && is_string($payload[$key]) ? $payload[$key] : '';
};
$company = trim($value('company'));
if ($company !== '') {
    hl_json(['ok' => true]);
}

$name = trim($value('name'));
$email = trim($value('email'));
$message = trim($value('message'));
$headerToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$token = $headerToken !== '' ? $headerToken : $value('token');
$length = static function (string $input): int {
    return function_exists('mb_strlen') ? mb_strlen($input, 'UTF-8') : strlen($input);
};

$nameOk = $length($name) >= 2 && $length($name) <= 80
    && !preg_match('/[\r\n<>]/', $name);
$emailOk = $length($email) >= 6 && $length($email) <= 254
    && !preg_match('/[\r\n]/', $email)
    && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
$messageOk = $length($message) >= 10 && $length($message) <= 4000
    && !preg_match('/\r\n\r\nFrom:/i', $message)
    && !preg_match('/MIME-Version:/i', $message);

if (!$nameOk || !$emailOk || !$messageOk || !hl_csrf_check($token) || !hl_origin_ok()) {
    hl_log('contact rejected 0');
    hl_json(['ok' => false], 400);
}

if (!hl_rate_allow('contact', 5, 900)) {
    hl_log('contact limited 0');
    hl_json(['ok' => false], 429);
}

$safeName = trim(strip_tags($name));
$safeMessage = trim(strip_tags($message));
$safeEmail = hl_clean_header($email);
$userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 500));
try {
    $suffix = bin2hex(random_bytes(3));
} catch (Throwable $error) {
    $suffix = substr(sha1(uniqid('hl', true)), 0, 6);
}
$subject = '[HighLion] letterbox ' . gmdate('Ymd') . '-' . $suffix;
$body = implode("\n", [
    'Name: ' . $safeName,
    'Email: ' . $safeEmail,
    'IP: ' . hl_client_ip(),
    'UA: ' . $userAgent,
    'Time: ' . gmdate('c'),
    '-----',
    $safeMessage,
]);
$headers = implode("\r\n", [
    'From: letterbox@highlion.net',
    'Reply-To: ' . $safeEmail,
    'Content-Type: text/plain; charset=UTF-8',
]);

$sent = function_exists('mail') && @mail('admin@highlion.net', $subject, $body, $headers);
hl_log('contact ' . ($sent ? 'sent ' : 'failed ') . strlen($body));
if (!$sent) {
    hl_json(['ok' => false], 500);
}
hl_json(['ok' => true]);
