#!/usr/bin/env bash
# Route a phone's traffic through a SOCKS5 proxy (with username/password).
# Runs a local gost bridge (turns authenticated SOCKS5 into a plain HTTP proxy)
# then points Android's global proxy at it.
#
# Usage:  sudo ./proxy-on.sh <phone> <host> <port> <user> <pass>
#   e.g.  sudo ./proxy-on.sh phone1 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
#   e.g.  sudo ./proxy-on.sh phone2 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
#
# Note: this sets Android's global HTTP proxy (browser-level). For whole-device
# proxy that covers every app (not just browser), use proxy-full-on.sh instead.
set -e
cd "$(dirname "$0")"

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

[ $# -eq 5 ] || { echo "Usage: sudo ./proxy-on.sh <phone> <host> <port> <user> <pass>"; exit 1; }
PHONE=$1; HOST=$2; PORT=$3; USERN=$4; PASSW=$5

[[ -n "${PORTS[$PHONE]:-}" ]] || { echo "Unknown phone '$PHONE'. Known: ${!PORTS[*]}"; exit 1; }

command -v gost >/dev/null 2>&1 || {
  echo "gost not installed. Installing..."
  cd /tmp
  wget -q https://github.com/ginuerzh/gost/releases/download/v2.11.5/gost-linux-amd64-2.11.5.gz
  gunzip -f gost-linux-amd64-2.11.5.gz
  chmod +x gost-linux-amd64-2.11.5
  mv gost-linux-amd64-2.11.5 /usr/local/bin/gost
  cd - >/dev/null
}

GW=$(docker network inspect cloud-phone_default -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PHONE")
[ -n "$PIP" ] || { echo "$PHONE not running. Run ./phone.sh up first."; exit 1; }

# (re)start the gost bridge if not already running
if ! pgrep -f 'gost -L http://:8080' >/dev/null 2>&1; then
  echo "Starting gost bridge on :8080..."
  nohup gost -L http://:8080 -F "socks5://${USERN}:${PASSW}@${HOST}:${PORT}" >/tmp/gost.log 2>&1 &
  sleep 1
else
  echo "gost bridge already running — reusing."
fi

adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy "${GW}:8080"

echo "Proxy ON for $PHONE -> traffic routed through ${HOST}:${PORT}"
echo "Check: open browser on $PHONE and visit whatismyipaddress.com"
echo "To turn off: sudo ./proxy-off.sh $PHONE"
