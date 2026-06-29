#!/usr/bin/env bash
# Route the phone's traffic through a SOCKS5 proxy (with username/password).
# It runs a small local bridge (gost) that turns the authenticated SOCKS5 into
# a plain proxy the phone can use, then points Android's global proxy at it.
#
# Usage:  sudo ./proxy-on.sh <host> <port> <user> <pass>
#   e.g.  sudo ./proxy-on.sh 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
set -e
cd "$(dirname "$0")"

[ $# -eq 4 ] || { echo "Usage: sudo ./proxy-on.sh <host> <port> <user> <pass>"; exit 1; }
HOST=$1; PORT=$2; USERN=$3; PASSW=$4

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
PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)

# (re)start the bridge in the background
pkill -f 'gost -L http://:8080' 2>/dev/null || true
nohup gost -L http://:8080 -F "socks5://${USERN}:${PASSW}@${HOST}:${PORT}" >/tmp/gost.log 2>&1 &
sleep 1

adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy "${GW}:8080"

echo "Proxy ON  ->  phone routes through ${HOST}:${PORT}"
echo "Check on the phone: open the browser and visit whatismyipaddress.com"
echo "(bridge log: /tmp/gost.log)"
