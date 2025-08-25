#!/usr/bin/env bash
set -euo pipefail

# Generates Orbitron and JetBrains Mono WOFF2 fonts locally.
# Requires: wget, woff2 (woff2_compress)
# If missing, will attempt to install via apt (Debian/Raspberry Pi OS).

FONT_DIR="/var/www/highlion/assets/fonts"
mkdir -p "$FONT_DIR"
cd "$FONT_DIR"

need_install=0
command -v wget >/dev/null 2>&1 || need_install=1
command -v woff2_compress >/dev/null 2>&1 || need_install=1

if [ "$need_install" -eq 1 ]; then
  echo "[*] Installing required tools (wget, woff2)..."
  sudo apt-get update
  sudo apt-get install -y wget woff2
fi

echo "[*] Fetching TTF sources..."
wget -q -O Orbitron.ttf "https://github.com/google/fonts/raw/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf"
wget -q -O JetBrainsMono.ttf "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf"

echo "[*] Converting to WOFF2..."
woff2_compress Orbitron.ttf
woff2_compress JetBrainsMono.ttf

rm -f Orbitron.ttf JetBrainsMono.ttf

echo "[*] Done. Generated:"
ls -l "$FONT_DIR"/*.woff2
