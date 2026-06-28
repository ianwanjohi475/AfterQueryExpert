#!/usr/bin/env bash
# Management CLI for the self-hosted cloud phones.
#
#   ./phone.sh setup                 run host checks + load kernel modules
#   ./phone.sh up                    start all phones + the web UI
#   ./phone.sh down                  stop everything (keeps data)
#   ./phone.sh wipe                  stop everything and DELETE all phone data
#   ./phone.sh list                  show phones + adb connection state
#   ./phone.sh web                   print the browser URL
#   ./phone.sh apk  <phone> <file>   install an APK into a phone
#   ./phone.sh app  <phone> <pkg>    launch an installed app by package name
#   ./phone.sh proxy <phone> host:port | clear   set/clear an HTTP proxy
#   ./phone.sh adb  <phone> -- <args...>         run any adb command on a phone
#   ./phone.sh shell <phone>         open an interactive shell on a phone
#
# <phone> is the service name: phone1, phone2, phone3, ...
set -euo pipefail
cd "$(dirname "$0")"

# Map service name -> host adb port. Mirror docker-compose.yml. Add lines here
# when you add more phones.
declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
die()   { red "$*"; exit 1; }

need_adb() { command -v adb >/dev/null 2>&1 || die "adb not installed. Run ./setup.sh for instructions."; }

port_for() {
  local p="${1:-}"
  [[ -n "${PORTS[$p]:-}" ]] || die "Unknown phone '$p'. Known: ${!PORTS[*]}"
  echo "${PORTS[$p]}"
}

connect() {  # ensure adb is connected to the phone, echo the adb target
  local port; port="$(port_for "$1")"
  adb connect "localhost:$port" >/dev/null 2>&1 || true
  echo "localhost:$port"
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  setup) exec ./setup.sh ;;

  up)
    docker compose up -d
    echo
    green "Phones starting. First boot of each takes 1-3 minutes."
    green "Watch readiness with:  ./phone.sh list"
    ./phone.sh web
    ;;

  down)  docker compose down ;;

  wipe)
    read -r -p "This DELETES all phone data (apps, logins). Type 'yes': " a
    [[ "$a" == "yes" ]] || { echo "Aborted."; exit 0; }
    docker compose down -v
    green "All phone data removed."
    ;;

  list)
    need_adb
    echo "Service   HostPort   adb status"
    echo "-------   --------   ----------"
    for name in "${!PORTS[@]}"; do
      port="${PORTS[$name]}"
      adb connect "localhost:$port" >/dev/null 2>&1 || true
      state="$(adb -s "localhost:$port" get-state 2>/dev/null || echo 'offline/booting')"
      printf "%-9s %-10s %s\n" "$name" "$port" "$state"
    done | sort
    ;;

  web)
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; ip="${ip:-localhost}"
    green "Browser UI:  http://${ip}:8000   (open from any device on the network)"
    ;;

  apk)
    need_adb
    [[ $# -ge 2 ]] || die "Usage: ./phone.sh apk <phone> <file.apk>"
    target="$(connect "$1")"; file="$2"
    [[ -f "$file" ]] || die "No such file: $file"
    echo "Installing $file into $1 ..."
    adb -s "$target" install -r -g "$file"
    green "Done."
    ;;

  app)
    need_adb
    [[ $# -ge 2 ]] || die "Usage: ./phone.sh app <phone> <package.name>"
    target="$(connect "$1")"
    adb -s "$target" shell monkey -p "$2" -c android.intent.category.LAUNCHER 1
    ;;

  proxy)
    need_adb
    [[ $# -ge 2 ]] || die "Usage: ./phone.sh proxy <phone> host:port | clear"
    target="$(connect "$1")"
    if [[ "$2" == "clear" ]]; then
      adb -s "$target" shell settings put global http_proxy :0
      green "Proxy cleared on $1."
    else
      adb -s "$target" shell settings put global http_proxy "$2"
      green "Proxy set on $1 -> $2  (system-wide HTTP proxy)."
    fi
    ;;

  adb)
    need_adb
    [[ $# -ge 1 ]] || die "Usage: ./phone.sh adb <phone> -- <adb args>"
    target="$(connect "$1")"; shift
    [[ "${1:-}" == "--" ]] && shift
    exec adb -s "$target" "$@"
    ;;

  shell)
    need_adb
    [[ $# -ge 1 ]] || die "Usage: ./phone.sh shell <phone>"
    target="$(connect "$1")"
    exec adb -s "$target" shell
    ;;

  help|*)
    awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"
    ;;
esac
