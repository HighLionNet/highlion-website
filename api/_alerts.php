<?php
declare(strict_types=1);

// Identity comes from nginx's verified FastCGI parameters, never browser headers.
function hl_user_agent(): string
{
    return preg_replace('/[\x00-\x1f\x7f]/', '', substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 2048)) ?: 'unknown';
}

function hl_probe_ip(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return false;
    $packed = inet_pton($ip);
    if (is_string($packed) && strlen($packed) === 16 && substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
        return hl_probe_ip(inet_ntop(substr($packed, 12)));
    }
    return true;
}

function hl_probe_state(bool $strike = false): array
{
    $empty = ['strikes' => 0, 'ban_until' => 0];
    $ip = hl_client_ip();
    if (!hl_probe_ip($ip)) return $empty;
    $directory = '/var/lib/highlion/abuse';
    if (is_link($directory) || !is_dir($directory)) {
        if ($strike) error_log('HighLion: provision /var/lib/highlion/abuse for persistent probe bans');
        return $empty;
    }
    $path = $directory . '/' . hash('sha256', $ip) . '.json';
    if (is_link($path) || (!$strike && !is_file($path))) return $empty;
    $handle = @fopen($path, $strike ? 'c+' : 'r');
    if ($handle === false) return $empty;
    if (!flock($handle, $strike ? LOCK_EX : LOCK_SH)) { fclose($handle); return $empty; }
    $row = json_decode(stream_get_contents($handle, 4096) ?: '', true);
    if (!is_array($row)) $row = $empty;
    if ($strike) {
        $now = time();
        // A rolling window, rather than extending the window on every probe.
        $recent = array_values(array_filter(is_array($row['events'] ?? null) ? $row['events'] : [],
            static function ($stamp) use ($now): bool { return is_int($stamp) && $stamp >= $now - 30 * 86400 && $stamp <= $now; }));
        $recent[] = $now;
        $row['events'] = array_slice($recent, -32);
        $row['strikes'] = count($row['events']);
        $row['last'] = $now;
        // Five positive trap events within thirty days: a 270-day ban.
        if ($row['strikes'] >= 5 && (int) ($row['ban_until'] ?? 0) <= $now) $row['ban_until'] = $now + 270 * 86400;
        rewind($handle);
        $encoded = (string) json_encode($row);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) error_log('HighLion: probe state write failed');
        @chmod($path, 0600);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $row + $empty;
}

function hl_alert_title(string $type): string
{
    $type = strtoupper(trim($type));
    if (strpos($type, 'TEST') === 0) return 'HighLion security alert — test';
    if (strpos($type, 'XSS') !== false) return 'XSS payload detected';
    if (strpos($type, 'TRAVERSAL') !== false) return 'Path traversal detected';
    if (strpos($type, 'WRAPPER') !== false) return 'File inclusion attempt detected';
    if (strpos($type, 'SYSTEM-FILE') !== false || strpos($type, 'QUERY-SYSTEM') !== false) return 'System file access attempt detected';
    if (strpos($type, 'CONFIG-FILE') !== false) return 'Configuration file access attempt detected';
    if (strpos($type, 'PATH') === 0) return 'Sensitive file access detected';
    $titles = [
        'HPOT-COMPANY' => 'Honeypot submission detected',
        'BAD-METHOD' => 'Unexpected HTTP method detected',
        'CSRF-FAIL' => 'CSRF validation failed',
        'RATE-LIMIT' => 'Request rate limit reached',
    ];
    return $titles[$type] ?? 'Suspicious request detected';
}

function hl_alert_html(array $row): string
{
    $escape = static function ($value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
    $labels = ['Time (UTC)' => 'ts', 'Type' => 'type', 'Remote IP' => 'ip', 'Proxy peer' => 'peer', 'IP source' => 'source', 'Country' => 'country', 'User agent' => 'ua', 'Method' => 'method', 'URI' => 'uri', 'Query' => 'query', 'Notes' => 'notes', 'Request ID' => 'id'];
    $html = '<h3>' . $escape(hl_alert_title((string) ($row['type'] ?? ''))) . '</h3><table bordered striped compact><tr><th>Field</th><th>Value</th></tr>';
    foreach ($labels as $label => $key) {
        $value = $escape($key === 'ip' && ($row['source'] ?? '') === 'tor' ? 'Unavailable through Tor' : ($row[$key] ?? ''));
        if ($value !== '' && ($key === 'ip' || $key === 'ua')) $value = '<b>' . $value . '</b>';
        $html .= '<tr><th>' . $label . '</th><td>' . ($value === '' ? '—' : $value) . '</td></tr>';
    }
    return $html . '</table>';
}

function hl_alert_row(string $type, string $notes = '', bool $probe = false): array
{
    $state = hl_probe_state($probe);
    $uri = substr((string) ($_SERVER['REQUEST_URI'] ?? '/'), 0, 2048);
    $query = substr((string) ($_SERVER['QUERY_STRING'] ?? ''), 0, 768);
    $query = preg_replace_callback('/(^|&)([^=&]+)=([^&]*)/', static function (array $part): string {
        $value = preg_match('/password|passwd|pwd|token|csrf|api.?key|secret|authorization|session|cookie/i', rawurldecode($part[2])) ? '[redacted]' : $part[3];
        return $part[1] . $part[2] . '=' . $value;
    }, $query);
    return [
        'ts' => gmdate('c'), 'type' => substr($type, 0, 64), 'ip' => hl_client_ip(), 'country' => hl_country(), 'ua' => substr(hl_user_agent(), 0, 512),
        'peer' => substr((string) ($_SERVER['HL_PEER_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 45),
        'source' => hl_ip_source(),
        'id' => substr((string) ($_SERVER['HL_REQUEST_ID'] ?? ''), 0, 64),
        'method' => substr((string) ($_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN'), 0, 16),
        'uri' => substr(explode('?', $uri, 2)[0], 0, 1024), 'query' => $query,
        'notes' => substr($notes, 0, 512) . ($probe ? '; strikes=' . $state['strikes'] : '')
            . ($state['ban_until'] > time() ? '; banned until ' . gmdate('Y-m-d', $state['ban_until']) : ''),
    ];
}

function hl_alert_send(array $row): bool
{
    // Count/log every probe; limit outbound notifications independently.
    if (!hl_rate_allow('alert-send', 5, 60, true)) return false;
    if (!hl_telegram('/etc/highlion/honeypot.env', hl_alert_html($row), true, 2)) {
        error_log('HighLion: Telegram alert delivery failed; event retained in honeypot log');
        return false;
    }
    return true;
}

function hl_alert(string $type, string $notes = '', bool $probe = false): void
{
    $row = hl_alert_row($type, $notes, $probe);
    hl_honeypot_write($row);
    hl_alert_send($row);
}

function hl_ban_guard(): void
{
    if ((int) hl_probe_state()['ban_until'] <= time()) return;
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit('Forbidden');
}
