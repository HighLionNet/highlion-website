<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hl_json(['ok' => false, 'reason' => 'offline', 'count' => 0], 405);
}

function hl_tail_lines(string $path, int $limit): array
{
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return [];
    }
    fseek($handle, 0, SEEK_END);
    $position = ftell($handle);
    if ($position === false) {
        fclose($handle);
        return [];
    }
    $buffer = '';
    while ($position > 0 && substr_count($buffer, "\n") <= $limit) {
        $read = min(8192, $position);
        $position -= $read;
        fseek($handle, $position);
        $buffer = (string) fread($handle, $read) . $buffer;
    }
    fclose($handle);
    $lines = preg_split('/\r?\n/', trim($buffer));
    return is_array($lines) ? array_slice($lines, -$limit) : [];
}

function hl_traffic_timestamp($value): ?int
{
    if (is_int($value) || (is_string($value) && ctype_digit($value))) {
        $number = (int) $value;
        if ($number > 20000000000) {
            $number = (int) floor($number / 1000);
        }
        return $number > 0 ? $number : null;
    }
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $timestamp = strtotime(trim($value, " \t\n\r\0\x0B\""));
    return $timestamp === false ? null : $timestamp;
}

function hl_traffic_path(string $target): string
{
    $path = parse_url($target, PHP_URL_PATH);
    return is_string($path) && $path !== '' ? $path : '';
}

function hl_traffic_parse(string $line): ?array
{
    $line = trim($line);
    if ($line === '') {
        return null;
    }

    $json = json_decode($line, true);
    if (is_array($json) && isset($json['status']) && is_numeric($json['status'])) {
        $target = '';
        if (isset($json['path']) && is_string($json['path'])) {
            $target = $json['path'];
        } elseif (isset($json['uri']) && is_string($json['uri'])) {
            $target = $json['uri'];
        }
        $timestamp = null;
        foreach (['time', 'timestamp', 'ts', '@timestamp'] as $key) {
            if (array_key_exists($key, $json)) {
                $timestamp = hl_traffic_timestamp($json[$key]);
                if ($timestamp !== null) {
                    break;
                }
            }
        }
        $status = (int) $json['status'];
        if ($status >= 100 && $status <= 599) {
            return ['status' => $status, 'time' => $timestamp, 'path' => hl_traffic_path($target)];
        }
    }

    $path = '';
    $status = 0;
    if (preg_match('/"[A-Z]+\s+(\S+)\s+HTTP\/\d(?:\.\d+)?"\s+([1-5]\d{2})\b/', $line, $combined)) {
        $path = hl_traffic_path($combined[1]);
        $status = (int) $combined[2];
    } elseif (preg_match('/"[A-Z]+\s+(\S+)\s+HTTP\/\d(?:\.\d+)?"\s+"[^"]*"\s+"[^"]*"\s+([1-5]\d{2})\b/', $line, $combinedCf)) {
        $path = hl_traffic_path($combinedCf[1]);
        $status = (int) $combinedCf[2];
    } elseif (
        preg_match('/\bstatus=([1-5]\d{2})\b/', $line, $statusMatch)
        && preg_match('/\bpath=("[^"]+"|\S+)/', $line, $pathMatch)
    ) {
        $status = (int) $statusMatch[1];
        $path = hl_traffic_path(trim($pathMatch[1], '"'));
    } else {
        return null;
    }

    $timestamp = null;
    if (preg_match('/\[([^\]]+)\]/', $line, $timeMatch)) {
        $date = DateTimeImmutable::createFromFormat('d/M/Y:H:i:s O', $timeMatch[1]);
        if ($date instanceof DateTimeImmutable) {
            $timestamp = $date->getTimestamp();
        }
    }
    if ($timestamp === null && preg_match('/\b(?:time|timestamp|ts)=("[^"]+"|\S+)/', $line, $timeMatch)) {
        $timestamp = hl_traffic_timestamp(trim($timeMatch[1], '"'));
    }
    return ['status' => $status, 'time' => $timestamp, 'path' => $path];
}

$logFile = '';
foreach ([
    '/var/log/nginx/access.log',
    '/var/log/nginx/access.log.1',
    '/var/log/nginx/www.highlion.net.access.log',
    '/var/log/cloudflared/access.log',
] as $candidate) {
    if (is_readable($candidate)) {
        $logFile = $candidate;
        break;
    }
}
if ($logFile === '') {
    hl_json(['ok' => false, 'reason' => 'offline', 'count' => 0]);
}

$parsed = [];
$hasTimestamps = false;
foreach (hl_tail_lines($logFile, 4000) as $line) {
    $row = hl_traffic_parse($line);
    if ($row === null) {
        continue;
    }
    if (is_int($row['time'])) {
        $hasTimestamps = true;
    }
    $parsed[] = $row;
}

$codes = ['2xx' => 0, '3xx' => 0, '4xx' => 0, '5xx' => 0];
$paths = [];
$count = 0;
$cutoff = time() - 900;
foreach ($parsed as $row) {
    if ($hasTimestamps && (!is_int($row['time']) || $row['time'] < $cutoff)) {
        continue;
    }
    $count += 1;
    $family = (int) floor($row['status'] / 100) . 'xx';
    if (array_key_exists($family, $codes)) {
        $codes[$family] += 1;
    }
    if ($row['path'] !== '' && !in_array($row['path'], ['/api/traffic.php', '/assets/ping.txt'], true)) {
        $paths[$row['path']] = ($paths[$row['path']] ?? 0) + 1;
    }
}

arsort($paths);
$top = [];
foreach (array_slice($paths, 0, 5, true) as $path => $number) {
    $top[] = ['path' => $path, 'n' => $number];
}

$payload = [
    'ok' => true,
    'window' => $hasTimestamps ? '15m' : 'tail',
    'count' => $count,
    'codes' => $codes,
    'top' => $top,
    'generated' => gmdate('c'),
];
if ($count === 0) {
    $payload['reason'] = 'no lines in window';
}
hl_json($payload);
