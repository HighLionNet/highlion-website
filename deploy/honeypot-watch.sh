#!/usr/bin/env bash

LOG_FILE=/var/tmp/highlion-honeypot.log
touch "$LOG_FILE" 2>/dev/null || true

tail -n 0 -F "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    printf '%s\n' "$line"
    continue
  fi

  summary="$(printf '%s' "$line" | php -r '
    $row = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($row)) { exit(1); }
    $ip = preg_replace("/[\r\n\0]+/", " ", (string) ($row["ip"] ?? "unknown"));
    $ua = preg_replace("/[\r\n\0]+/", " ", (string) ($row["ua"] ?? "unknown"));
    $ts = preg_replace("/[\r\n\0]+/", " ", (string) ($row["ts"] ?? "unknown"));
    echo "HighLion honeypot  " . $ip . "  " . substr($ua, 0, 96) . "  " . $ts;
  ' 2>/dev/null)"

  if [ -z "$summary" ]; then
    printf 'HighLion honeypot watcher: bad line: %s\n' "$line" >&2
    continue
  fi

  curl -fsS --max-time 10 \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "text=$summary" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || \
    printf 'HighLion honeypot watcher: Telegram send failed: %s\n' "$line" >&2
done
