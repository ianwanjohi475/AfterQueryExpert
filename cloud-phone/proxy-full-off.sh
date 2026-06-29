#!/usr/bin/env bash
# Turn OFF the whole-device proxy and restore normal connectivity.
# Usage:  sudo ./proxy-full-off.sh
set -e
cd "$(dirname "$0")"
PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
iptables -t nat -D PREROUTING -s "$PIP" -p tcp -j REDSOCKS 2>/dev/null || true
iptables -t nat -F REDSOCKS 2>/dev/null || true
iptables -t nat -X REDSOCKS 2>/dev/null || true
pkill -x redsocks 2>/dev/null || true
adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy :0 2>/dev/null || true
echo "Whole-device proxy OFF -> phone uses your normal connection again."
