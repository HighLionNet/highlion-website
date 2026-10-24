<?php
declare(strict_types=1);


require_once __DIR__ . '/_session.php';
if (!hl_rate_allow('contact-ingress', 8, 600)) hl_json(['ok' => false], 429);

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($requestMethod !== 'POST') {
    $ip = hl_client_ip();
    $country = hl_country();
    $userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
    hl_honeypot_write([
        'ts' => gmdate('c'),
        'ip' => $ip,
        'ua' => $userAgent,
        'page' => 'contact',
        'country' => $country,
        'kind' => 'method',
        'extra' => ['method' => $requestMethod],
    ]);
    hl_telegram(
        '/etc/highlion/honeypot.env',
        "[HL ALERT] BAD-METHOD contact\n"
        . 'ip=' . $ip . ' country=' . $country . ' ua=' . $userAgent . "\n"
        . 'method=' . ($requestMethod !== '' ? $requestMethod : 'UNKNOWN')
    );
    header('Allow: POST');
    hl_json(['ok' => false], 405);
}

$payload = hl_payload(16384);
if (!is_array($payload)) {
    hl_json(['ok' => false], 400);
}

$value = static function (string $key) use ($payload): string {
    return isset($payload[$key]) && is_string($payload[$key]) ? $payload[$key] : '';
};
$company = trim($value('company'));
if ($company !== '') {
    $page = $value('page') === '403' ? '403' : 'contact';
    $ip = hl_client_ip();
    $country = hl_country();
    $userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
    hl_honeypot_write([
        'ts' => gmdate('c'),
        'ip' => $ip,
        'ua' => $userAgent,
        'page' => $page,
        'country' => $country,
        'kind' => 'company',
        'extra' => (object) [],
    ]);
    hl_log('honeypot trip');
    $alertFirstLine = $page === '403'
        ? '[HL ALERT] HPOT-COMPANY 403'
        : '[HL ALERT] HPOT-COMPANY contact';
    hl_telegram(
        '/etc/highlion/honeypot.env',
        $alertFirstLine . "\n"
        . 'ip=' . $ip . ' country=' . $country . ' ua=' . $userAgent . "\n"
        . 'field=company'
    );
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

if (!hl_csrf_check($token)) {
    $ip = hl_client_ip();
    $country = hl_country();
    $userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
    hl_honeypot_write([
        'ts' => gmdate('c'),
        'ip' => $ip,
        'ua' => $userAgent,
        'page' => 'contact',
        'country' => $country,
        'kind' => 'csrf',
        'extra' => (object) [],
    ]);
    hl_telegram(
        '/etc/highlion/honeypot.env',
        "[HL ALERT] CSRF-FAIL contact\n"
        . 'ip=' . $ip . ' country=' . $country . ' ua=' . $userAgent . "\n"
        . 'reason=token'
    );
    hl_log('contact csrf rejected');
    hl_json(['ok' => false], 400);
}

$nameOk = $length($name) >= 2 && $length($name) <= 80
    && !preg_match('/[\r\n<>]/', $name);
$emailOk = $length($email) >= 6 && $length($email) <= 254
    && !preg_match('/[\r\n]/', $email)
    && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
$messageOk = $length($message) >= 10 && $length($message) <= 4000
    && !preg_match('/\r\n\r\nFrom:/i', $message)
    && !preg_match('/MIME-Version:/i', $message);

if (!$nameOk || !$emailOk || !$messageOk || !hl_origin_ok($token)) {
    hl_json(['ok' => false], 400);
}

if (!hl_rate_allow('contact', 5, 900)) {
    $ip = hl_client_ip();
    $country = hl_country();
    $userAgent = hl_clean_header(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 300));
    hl_honeypot_write([
        'ts' => gmdate('c'),
        'ip' => $ip,
        'ua' => $userAgent,
        'page' => 'contact',
        'country' => $country,
        'kind' => 'rate',
        'extra' => (object) [],
    ]);
    hl_telegram(
        '/etc/highlion/honeypot.env',
        "[HL ALERT] RATE-LIMIT contact\n"
        . 'ip=' . $ip . ' country=' . $country . ' ua=' . $userAgent . "\n"
        . 'window=5/900s'
    );
    hl_log('contact limited 0');
    hl_json(['ok' => false], 429);
}

$safeName = trim(strip_tags($name));
$safeMessage = trim(strip_tags($message));
$safeEmail = hl_clean_header($email);
try {
    $suffix = bin2hex(random_bytes(3));
} catch (Throwable $error) {
    $suffix = substr(sha1(uniqid('hl', true)), 0, 6);
}
$subject = '[HighLion] letterbox ' . gmdate('Ymd') . '-' . $suffix;
$body = implode("\n", [
    'Name: ' . $safeName,
    'Email: ' . $safeEmail,
    'Time: ' . gmdate('c'),
    '-----',
    $safeMessage,
]);
$sent = hl_telegram('/etc/highlion/letterbox.env', $subject . "\n" . $body);
if (!$sent) {
    hl_json(['ok' => false], 500);
}
hl_json(['ok' => true]);
