<?php
declare(strict_types=1);


require_once __DIR__ . '/_session.php';

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($requestMethod !== 'POST') {
    hl_alert('BAD-METHOD', 'contact');
    header('Allow: POST');
    hl_json(['ok' => false], 405);
}

if (!hl_rate_allow('contact-ingress', 8, 600)) hl_json(['ok' => false], 429);
$payload = hl_payload(16384, true);
if (!is_array($payload)) {
    hl_json(['ok' => false], 400);
}

$value = static function (string $key) use ($payload): string {
    return isset($payload[$key]) && is_string($payload[$key]) ? $payload[$key] : '';
};
$company = trim($value('company'));
if ($company !== '') {
    hl_alert('HPOT-COMPANY', $value('page') === '403' ? '403; field=company' : 'contact; field=company', true);
    hl_json(['ok' => true]);
}

$name = trim($value('name'));
$email = trim($value('email'));
$message = trim($value('message'));
if (strpos($name . $email . $message, "\0") !== false) hl_json(['ok' => false], 400);
$headerToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$token = $headerToken !== '' ? $headerToken : $value('token');
$length = static function (string $input): int {
    return function_exists('mb_strlen') ? mb_strlen($input, 'UTF-8') : strlen($input);
};

if (!hl_csrf_check($token)) {
    hl_alert('CSRF-FAIL', 'contact; reason=token');
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
    hl_alert('RATE-LIMIT', 'contact; window=5/900s');
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
