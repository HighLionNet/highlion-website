<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hl_json(['ok' => false, 'reason' => 'offline', 'count' => 0, 'codes' => (object) []], 405);
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

$logFile = '';
foreach (['/var/log/nginx/access.log', '/var/log/nginx/access.log.1'] as $candidate) {
    if (is_readable($candidate)) {
        $logFile = $candidate;
        break;
    }
}
if ($logFile === '') {
    hl_json(['ok' => false, 'reason' => 'offline', 'count' => 0, 'codes' => (object) []]);
}

$parsed = [];
$hasTimestamps = false;
foreach (hl_tail_lines($logFile, 4000) as $line) {
    if (!preg_match('/"HTTP\/\d(?:\.\d)?"\s+(\d{3})\b/', $line, $statusMatch)) {
        continue;
    }
    $timestamp = null;
    if (preg_match('/\[([^\]]+)\]/', $line, $timeMatch)) {
        $date = DateTimeImmutable::createFromFormat('d/M/Y:H:i:s O', $timeMatch[1]);
        if ($date instanceof DateTimeImmutable) {
            $timestamp = $date->getTimestamp();
            $hasTimestamps = true;
        }
    }
    $path = '';
    if (preg_match('/"[A-Z]+\s+(\S+)/', $line, $pathMatch)) {
        $path = (string) parse_url($pathMatch[1], PHP_URL_PATH);
    }
    $parsed[] = ['status' => (int) $statusMatch[1], 'time' => $timestamp, 'path' => $path];
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
    if ($row['path'] !== '') {
        $paths[$row['path']] = ($paths[$row['path']] ?? 0) + 1;
    }
}
arsort($paths);
$top = [];
foreach (array_slice($paths, 0, 5, true) as $path => $number) {
    $top[] = ['path' => $path, 'n' => $number];
}

hl_json([
    'ok' => true,
    'window' => $hasTimestamps ? '15m' : 'tail',
    'count' => $count,
    'codes' => $codes,
    'top' => $top,
    'generated' => gmdate('c'),
]);
