#!/usr/bin/env bash
# Turn OFF the whole-device proxy for one phone, or all phones.
#
# Usage:
#   sudo ./proxy-full-off.sh <phone>    remove proxy from one phone only
#   sudo ./proxy-full-off.sh all        remove proxy from all phones + stop redsocks
set -e
cd "$(dirname "$0")"

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

TARGET="${1:-all}"

remove_phone() {
  local phone="$1"
  local pip
  pip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$phone" 2>/dev/null || true)
  if [[ -n "$pip" ]]; then
    iptables -t nat -D PREROUTING -s "$pip" -p tcp -j REDSOCKS 2>/dev/null || true
    adb connect "$pip:5555" >/dev/null 2>&1 || true
    adb -s "$pip:5555" shell settings put global http_proxy :0 2>/dev/null || true
    echo "Proxy removed from $phone."
  else
    echo "$phone not running — skipping iptables rule."
  fi
}

if [[ "$TARGET" == "all" ]]; then
  for phone in "${!PORTS[@]}"; do
    remove_phone "$phone"
  done
  iptables -t nat -F REDSOCKS 2>/dev/null || true
  iptables -t nat -X REDSOCKS 2>/dev/null || true
  pkill -x redsocks 2>/dev/null || true
  echo "redsocks stopped. All phones use normal connection."
else
  [[ -n "${PORTS[$TARGET]:-}" ]] || { echo "Unknown phone '$TARGET'. Known: ${!PORTS[*]}"; exit 1; }
  remove_phone "$TARGET"
  echo "Other phones (if proxied) are unaffected."
fi
