#!/usr/bin/env bash
# Turn the HTTP proxy off for one phone (or all phones).
#
# Usage:
#   sudo ./proxy-off.sh <phone>   clear proxy for one phone
#   sudo ./proxy-off.sh all       clear proxy for all phones + stop gost
set -e
cd "$(dirname "$0")"

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

TARGET="${1:-all}"

clear_phone() {
  local phone="$1"
  local pip
  pip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$phone" 2>/dev/null || true)
  if [[ -n "$pip" ]]; then
    adb connect "$pip:5555" >/dev/null 2>&1 || true
    adb -s "$pip:5555" shell settings put global http_proxy :0 2>/dev/null || true
    echo "Proxy cleared on $phone."
  else
    echo "$phone not running — skipping."
  fi
}

if [[ "$TARGET" == "all" ]]; then
  for phone in "${!PORTS[@]}"; do
    clear_phone "$phone"
  done
  pkill -f 'gost -L http://:8080' 2>/dev/null || true
  echo "gost stopped. All phones use normal connection."
else
  [[ -n "${PORTS[$TARGET]:-}" ]] || { echo "Unknown phone '$TARGET'. Known: ${!PORTS[*]}"; exit 1; }
  clear_phone "$TARGET"
fi
