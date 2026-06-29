#!/usr/bin/env bash
# BROWSER-ONLY proxy: only the browser uses the SOCKS5 proxy; every other app
# uses your real IP. It runs the gost bridge and makes sure no system-wide proxy
# is set; you point Firefox at the bridge once (Firefox remembers it).
#
# Usage:  sudo ./proxy-browser.sh <host> <port> <user> <pass>
#   e.g.  sudo ./proxy-browser.sh 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
set -e
cd "$(dirname "$0")"
[ $# -eq 4 ] || { echo "Usage: sudo ./proxy-browser.sh <host> <port> <user> <pass>"; exit 1; }
HOST=$1; PORT=$2; USERN=$3; PASSW=$4

command -v gost >/dev/null 2>&1 || {
  cd /tmp
  wget -q https://github.com/ginuerzh/gost/releases/download/v2.11.5/gost-linux-amd64-2.11.5.gz
  gunzip -f gost-linux-amd64-2.11.5.gz; chmod +x gost-linux-amd64-2.11.5
  mv gost-linux-amd64-2.11.5 /usr/local/bin/gost; cd - >/dev/null
}

GW=$(docker network inspect cloud-phone_default -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)

# make sure nothing is forcing OTHER apps through the proxy
adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy :0 2>/dev/null || true
iptables -t nat -D PREROUTING -s "$PIP" -p tcp -j REDSOCKS 2>/dev/null || true
iptables -t nat -F REDSOCKS 2>/dev/null || true
iptables -t nat -X REDSOCKS 2>/dev/null || true
pkill -x redsocks 2>/dev/null || true

# (re)start the bridge that adds the SOCKS5 username/password
pkill -f 'gost -L http://:8080' 2>/dev/null || true
nohup gost -L http://:8080 -F "socks5://${USERN}:${PASSW}@${HOST}:${PORT}" >/tmp/gost.log 2>&1 &
sleep 1

cat <<EOF

Browser proxy bridge is running at:  ${GW}:8080

Now set it INSIDE Firefox on the phone (one time -- Firefox remembers it):
  1. Open Firefox, go to the address bar and type:  about:config   (tap Accept)
  2. Search and set each of these (tap the value to edit):
        network.proxy.type                 = 1
        network.proxy.http                 = ${GW}
        network.proxy.http_port            = 8080
        network.proxy.ssl                  = ${GW}
        network.proxy.ssl_port             = 8080
        network.proxy.share_proxy_settings = true
  3. Open a new tab -> whatismyipaddress.com -> shows ${HOST}.

Result: ONLY Firefox uses the proxy; all other apps keep your real IP.
Turn the bridge off later with:  pkill -f 'gost -L http://:8080'
EOF
