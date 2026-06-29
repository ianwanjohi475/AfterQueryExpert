#!/usr/bin/env bash
# WHOLE-DEVICE proxy: force ALL the phone's TCP traffic (every app, not just the
# browser) through a SOCKS5 proxy with username/password, using redsocks +
# iptables transparent redirect on the host.
#
# Usage:  sudo ./proxy-full-on.sh <host> <port> <user> <pass>
#   e.g.  sudo ./proxy-full-on.sh 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
#
# Reverse it any time with:  sudo ./proxy-full-off.sh
set -e
cd "$(dirname "$0")"
[ $# -eq 4 ] || { echo "Usage: sudo ./proxy-full-on.sh <host> <port> <user> <pass>"; exit 1; }
HOST=$1; PORT=$2; USERN=$3; PASSW=$4
RPORT=12345

# deps + modules
command -v redsocks >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y redsocks; }
modprobe xt_REDIRECT 2>/dev/null || true
modprobe nf_nat_redirect 2>/dev/null || true

PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
[ -n "$PIP" ] || { echo "Phone not running. Run sudo ./start.sh first."; exit 1; }

# clear the simple http_proxy (so the two methods don't fight)
adb connect "$PIP:5555" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy :0 2>/dev/null || true

# clean any previous run
iptables -t nat -D PREROUTING -s "$PIP" -p tcp -j REDSOCKS 2>/dev/null || true
iptables -t nat -F REDSOCKS 2>/dev/null || true
iptables -t nat -X REDSOCKS 2>/dev/null || true
pkill -x redsocks 2>/dev/null || true

# redsocks: turns the authenticated SOCKS5 into a transparent redirect target
cat >/tmp/redsocks.conf <<EOF
base { log_debug = off; log_info = on; daemon = on; redirector = iptables; }
redsocks {
  local_ip = 0.0.0.0;
  local_port = $RPORT;
  ip = $HOST;
  port = $PORT;
  type = socks5;
  login = "$USERN";
  password = "$PASSW";
}
EOF
redsocks -c /tmp/redsocks.conf

# iptables: send all the phone's TCP out via redsocks (skip local + the proxy itself)
iptables -t nat -N REDSOCKS
iptables -t nat -A REDSOCKS -d "$HOST"          -j RETURN
iptables -t nat -A REDSOCKS -d 0.0.0.0/8        -j RETURN
iptables -t nat -A REDSOCKS -d 10.0.0.0/8       -j RETURN
iptables -t nat -A REDSOCKS -d 127.0.0.0/8      -j RETURN
iptables -t nat -A REDSOCKS -d 172.16.0.0/12    -j RETURN
iptables -t nat -A REDSOCKS -d 192.168.0.0/16   -j RETURN
iptables -t nat -A REDSOCKS -p tcp -j REDIRECT --to-ports $RPORT
iptables -t nat -A PREROUTING -s "$PIP" -p tcp -j REDSOCKS

echo "WHOLE-DEVICE proxy ON -> every app's TCP traffic exits via $HOST:$PORT"
echo "Test on the phone: whatismyipaddress.com AND any other app should show the proxy IP."
echo "Note: DNS (UDP) is not redirected, so the visible IP is the proxy but DNS may still"
echo "      resolve via your line. For most location checks this is fine."
echo "Turn it off with: sudo ./proxy-full-off.sh"
