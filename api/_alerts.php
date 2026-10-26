<?php
declare(strict_types=1);

// Request identity comes from nginx's verified REMOTE_ADDR, never a browser header.
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
        if ((int) ($row['last'] ?? 0) < $now - 30 * 86400 && (int) ($row['ban_until'] ?? 0) <= $now) $row = $empty;
        $row['strikes'] = min(1000000, (int) ($row['strikes'] ?? 0) + 1);
        $row['last'] = $now;
        // Five positive trap events within thirty days: nine calendar-month-ish months.
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

function hl_alert_html(array $row): string
{
    $escape = static function ($value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
    $labels = ['Time' => 'ts', 'Type' => 'type', 'Remote IP' => 'ip', 'Country' => 'country', 'UA' => 'ua', 'Method' => 'method', 'URI' => 'uri', 'Query' => 'query', 'Notes' => 'notes'];
    $html = '<h3>HighLion security alert</h3><table bordered compact><tr>';
    foreach ($labels as $label => $key) $html .= '<th>' . $label . '</th>';
    $html .= '</tr><tr>';
    foreach ($labels as $key) {
        $value = $escape($row[$key] ?? '');
        if ($key === 'ip' || $key === 'ua') $value = '<b>' . $value . '</b>';
        $html .= '<td>' . ($value === '' ? '—' : $value) . '</td>';
    }
    return $html . '</tr></table>';
}

function hl_alert(string $type, string $notes = '', bool $probe = false): void
{
    $state = hl_probe_state($probe);
    $uri = substr((string) ($_SERVER['REQUEST_URI'] ?? '/'), 0, 2048);
    $row = [
        'ts' => gmdate('c'), 'type' => $type, 'ip' => hl_client_ip(), 'country' => hl_country(), 'ua' => hl_user_agent(),
        'method' => substr((string) ($_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN'), 0, 32),
        'uri' => explode('?', $uri, 2)[0], 'query' => substr((string) ($_SERVER['QUERY_STRING'] ?? ''), 0, 2048),
        'notes' => $notes . ($probe ? '; strikes=' . $state['strikes'] : '')
            . ($state['ban_until'] > time() ? '; banned until ' . gmdate('Y-m-d', $state['ban_until']) : ''),
    ];
    hl_honeypot_write($row);
    // Count/log every probe; limit outbound notifications independently.
    if (hl_rate_allow('alert-send', 5, 60) && !hl_telegram('/etc/highlion/honeypot.env', hl_alert_html($row), true)) {
        error_log('HighLion: Telegram alert delivery failed; event retained in honeypot log');
    }
}

function hl_ban_guard(): void
{
    if ((int) hl_probe_state()['ban_until'] <= time()) return;
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit('Forbidden');
}
