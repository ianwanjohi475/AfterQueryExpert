#!/usr/bin/env bash
# Turn the SOCKS5 proxy off (phone goes back to your normal connection).
# Usage:  sudo ./proxy-off.sh
set -e
cd "$(dirname "$0")"
PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
pkill -f 'gost -L http://:8080' 2>/dev/null || true
adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy :0
echo "Proxy OFF -> phone uses your normal connection."
