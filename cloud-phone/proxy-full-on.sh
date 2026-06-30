#!/usr/bin/env bash
# WHOLE-DEVICE proxy: force ALL the phone's TCP traffic through a SOCKS5 proxy
# with username/password, using redsocks + iptables transparent redirect on the host.
#
# Usage:  sudo ./proxy-full-on.sh <phone> <host> <port> <user> <pass>
#   e.g.  sudo ./proxy-full-on.sh phone1 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
#   e.g.  sudo ./proxy-full-on.sh phone2 161.77.95.162 22325 14aa1d4f37e18 19efe095e4
#
# Safe to run for multiple phones — each gets its own PREROUTING rule.
# One redsocks daemon is shared across all phones.
#
# Reverse for one phone:  sudo ./proxy-full-off.sh <phone>
# Reverse for all phones: sudo ./proxy-full-off.sh all
set -e
cd "$(dirname "$0")"

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

[ $# -eq 5 ] || { echo "Usage: sudo ./proxy-full-on.sh <phone> <host> <port> <user> <pass>"; exit 1; }
PHONE=$1; HOST=$2; PORT=$3; USERN=$4; PASSW=$5
RPORT=12345

[[ -n "${PORTS[$PHONE]:-}" ]] || { echo "Unknown phone '$PHONE'. Known: ${!PORTS[*]}"; exit 1; }
ADBPORT="${PORTS[$PHONE]}"

# Install deps
command -v redsocks >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y redsocks; }
modprobe xt_REDIRECT 2>/dev/null || true
modprobe nf_nat_redirect 2>/dev/null || true

PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PHONE")
[ -n "$PIP" ] || { echo "$PHONE not running. Run ./phone.sh up first."; exit 1; }

# Clear the simple http_proxy on this phone (so the two methods don't fight)
adb connect "$PIP:$ADBPORT" >/dev/null 2>&1 || true
adb -s "$PIP:5555" shell settings put global http_proxy :0 2>/dev/null || true

# ---- redsocks (one shared daemon for all phones) -------------------------
if ! pgrep -x redsocks >/dev/null 2>&1; then
  echo "Starting redsocks on port $RPORT..."
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
  sleep 0.5
else
  echo "redsocks already running — reusing."
fi

# ---- iptables REDSOCKS chain (create once, shared across all phones) -----
if ! iptables -t nat -L REDSOCKS >/dev/null 2>&1; then
  echo "Creating iptables REDSOCKS chain..."
  iptables -t nat -N REDSOCKS
  iptables -t nat -A REDSOCKS -d "$HOST"         -j RETURN
  iptables -t nat -A REDSOCKS -d 0.0.0.0/8       -j RETURN
  iptables -t nat -A REDSOCKS -d 10.0.0.0/8      -j RETURN
  iptables -t nat -A REDSOCKS -d 127.0.0.0/8     -j RETURN
  iptables -t nat -A REDSOCKS -d 172.16.0.0/12   -j RETURN
  iptables -t nat -A REDSOCKS -d 192.168.0.0/16  -j RETURN
  iptables -t nat -A REDSOCKS -p tcp -j REDIRECT --to-ports $RPORT
fi

# ---- per-phone PREROUTING rule (idempotent — remove old then re-add) -----
iptables -t nat -D PREROUTING -s "$PIP" -p tcp -j REDSOCKS 2>/dev/null || true
iptables -t nat -A PREROUTING -s "$PIP" -p tcp -j REDSOCKS

echo
echo "WHOLE-DEVICE proxy ON for $PHONE -> all TCP exits via $HOST:$PORT"
echo "Test: open the browser on $PHONE and visit whatismyipaddress.com"
echo "To add another phone: sudo ./proxy-full-on.sh phone2 $HOST $PORT $USERN $PASSW"
echo "To remove:            sudo ./proxy-full-off.sh $PHONE"
