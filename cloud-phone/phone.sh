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
#   ./phone.sh fingerprint <phone> [show]        randomise device identity (anti-detect)
#   ./phone.sh gps  <phone> <pkg> <lat> <lng>    authorise a fake-GPS app
#   ./phone.sh camera <video.mp4>                feed a video as a virtual camera
#   ./phone.sh fix-ndk <phone>       fix ARM64 app crash (SIGILL/NDK translation)
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

  fingerprint)
    # Randomise device identity. Uses Magisk resetprop via `docker exec` (real
    # root inside the container -- bypasses Magisk's su policy which usually
    # denies the adb shell user). Installs a Magisk module so the identity
    # persists across container restarts. Needs a Magisk-enabled image
    # (e.g. fahaddz/redroid:13). On a base redroid image (no Magisk) this
    # fails with a clear instruction to switch images.
    need_adb
    [[ $# -ge 1 ]] || die "Usage: ./phone.sh fingerprint <phone> [show]"
    target="$(connect "$1")"
    if [[ "${2:-}" == "show" ]]; then
      # Reconnect once up front so the adb daemon doesn't drop us mid-stream.
      adb connect "$target" >/dev/null 2>&1 || true
      # Batch all props in a single shell to keep one adb session.
      adb -s "$target" shell '
        for k in \
          ro.product.brand ro.product.manufacturer ro.product.model ro.product.device ro.product.name \
          ro.product.system.brand ro.product.system.manufacturer ro.product.system.model ro.product.system.device ro.product.system.name \
          ro.product.vendor.brand ro.product.vendor.manufacturer ro.product.vendor.model ro.product.vendor.device ro.product.vendor.name \
          ro.product.product.brand ro.product.product.manufacturer ro.product.product.model ro.product.product.device ro.product.product.name \
          ro.product.odm.brand ro.product.odm.manufacturer ro.product.odm.model ro.product.odm.device ro.product.odm.name \
          ro.product.system_ext.brand ro.product.system_ext.manufacturer ro.product.system_ext.model ro.product.system_ext.device ro.product.system_ext.name \
          ro.serialno ro.boot.serialno ro.build.fingerprint; do
          v=$(getprop "$k")
          [ -n "$v" ] && printf "%-45s %s\n" "$k" "$v"
        done
        printf "%-45s %s\n" "android_id" "$(settings get secure android_id)"'
      exit 0
    fi

    CID="$(docker inspect -f '{{.Id}}' "$1" 2>/dev/null || true)"
    [[ -n "$CID" ]] || die "Container $1 is not running. Run ./phone.sh up first."
    dex() { docker exec "$CID" sh -c "$1"; }

    # Locate resetprop the same way fix-arm-crash.sh does.
    RP="$(dex 'for p in /sbin/resetprop /system/bin/resetprop /debug_ramdisk/.magisk/busybox/resetprop /data/adb/magisk/resetprop $(magisk --path 2>/dev/null)/.magisk/busybox/resetprop; do [ -x "$p" ] && { echo "$p"; break; }; done' 2>/dev/null | tr -d '\r' | head -n1)"
    if [[ -z "$RP" ]] && dex 'command -v magisk >/dev/null 2>&1'; then RP='magisk resetprop'; fi
    if [[ -z "$RP" ]]; then
      red "No Magisk / resetprop in this image. ro.* props can't be overridden."
      red "Switch to a Magisk-enabled image:"
      red "    sed -i 's|^REDROID_IMAGE=.*|REDROID_IMAGE=fahaddz/redroid:13|' .env"
      red "    docker pull fahaddz/redroid:13 && ./phone.sh wipe && ./phone.sh up"
      exit 1
    fi

    # A few real device profiles: brand|manufacturer|model|device|fingerprint
    PROFILES=(
      "samsung|samsung|SM-G991B|o1s|samsung/o1sxxx/o1s:13/TP1A.220624.014/G991BXXU5DWA1:user/release-keys"
      "google|Google|Pixel 7|panther|google/panther/panther:13/TQ3A.230805.001/10316531:user/release-keys"
      "Xiaomi|Xiaomi|2201123G|cupid|Xiaomi/cupid/cupid:13/RKQ1.211001.001/V14.0.3:user/release-keys"
      "OnePlus|OnePlus|CPH2451|salami|OnePlus/CPH2451/OP594DL1:13/TP1A.220905.001/123456:user/release-keys"
    )
    IFS='|' read -r brand mfr model device fp <<< "${PROFILES[$RANDOM % ${#PROFILES[@]}]}"
    serial="$(tr -dc 'A-Z0-9' </dev/urandom | head -c 12 || true)"
    aid="$(tr -dc 'a-f0-9' </dev/urandom | head -c 16 || true)"

    echo "Applying identity to $1: $brand $model  (serial $serial)"

    # Build the full list of property overrides. Android 10+ stores each of
    # brand/manufacturer/model/device/name under five "partition" variants
    # (system, vendor, product, odm, system_ext) plus the legacy flat key.
    # The flat key (ro.product.model etc.) is *derived* at boot from one of
    # the partition variants based on ro.product.property_source_order, so
    # overriding only the flat key leaves the real value visible to anything
    # that reads the partition variant directly. Override all of them.
    build_overrides() {
      local rp="$1"      # the resetprop command string (e.g. "resetprop" or "magisk resetprop")
      local partitions="system vendor product odm system_ext"
      # Quote values so multi-word ones (e.g. "Pixel 7") aren't split into
      # separate resetprop arguments when the shell re-parses the line.
      emit() { echo "$rp $1 \"$2\""; }
      for fv in "brand=$brand" "manufacturer=$mfr" "model=$model" "device=$device" "name=$device"; do
        local field="${fv%%=*}" value="${fv#*=}"
        emit "ro.product.$field" "$value"
        for p in $partitions; do emit "ro.product.$p.$field" "$value"; done
      done
      emit "ro.build.fingerprint" "$fp"
      emit "ro.serialno"          "$serial"
      emit "ro.boot.serialno"     "$serial"
    }

    # 1) Runtime override -- effective immediately for getprop callers.
    RP_CMDS="$(build_overrides "$RP")"
    dex "$RP_CMDS" >/dev/null 2>&1 || die "resetprop failed at runtime."

    # 2) Magisk module so the identity is re-applied on every container start.
    #    The post-fs-data.sh uses the plain "resetprop" name -- by the time it
    #    runs Magisk has it on PATH.
    MOD='/data/adb/modules/device-fingerprint'
    POST_FS_BODY="$(printf '#!/system/bin/sh\n%s\n' "$(build_overrides resetprop)")"
    # base64 the body so we don't fight with shell quoting inside docker exec.
    POST_FS_B64="$(printf '%s' "$POST_FS_BODY" | base64 -w0)"
    MODULE_PROP="$(printf 'id=device-fingerprint\nname=Device fingerprint\nversion=1.0\nversionCode=1\nauthor=cloud-phone\ndescription=Pinned device identity (%s %s).\n' "$brand" "$model")"
    MODULE_PROP_B64="$(printf '%s' "$MODULE_PROP" | base64 -w0)"
    dex "mkdir -p $MOD && \
      echo '$MODULE_PROP_B64' | base64 -d > $MOD/module.prop && \
      echo '$POST_FS_B64'    | base64 -d > $MOD/post-fs-data.sh && \
      chmod 755 $MOD/post-fs-data.sh && touch $MOD/update" \
      >/dev/null 2>&1 || true

    # 3) android_id doesn't need root and isn't a ro.* prop, so just write it.
    adb -s "$target" shell settings put secure android_id "$aid" || true

    # 4) Restart zygote so framework-level callers (Play Store, attestation,
    #    most apps) see the new ABIs/identity without a full container restart.
    echo "Restarting Android framework so apps re-read the identity..."
    dex 'stop; start' >/dev/null 2>&1 || true
    for i in $(seq 1 30); do
      sleep 2
      [[ "$(dex 'getprop sys.boot_completed' 2>/dev/null | tr -d '\r')" == "1" ]] && break
    done

    green "Identity applied + persisted via Magisk module."
    green "Verify with: ./phone.sh fingerprint $1 show"
    ;;

  gps)
    # Fake location. Android can't mock location from adb alone, so this points
    # a fake-GPS app (which you install once) at the coordinates and authorises
    # it. Install one first, e.g. from the Play Store ("Fake GPS location"),
    # then pass its package name.
    need_adb
    [[ $# -ge 4 ]] || die "Usage: ./phone.sh gps <phone> <package> <lat> <lng>"
    target="$(connect "$1")"; pkg="$2"; lat="$3"; lng="$4"
    adb -s "$target" shell appops set "$pkg" android:mock_location allow \
      || die "Could not authorise $pkg. Is it installed? ./phone.sh apk $1 fakegps.apk"
    adb -s "$target" shell settings put secure mock_location 1 2>/dev/null || true
    adb -s "$target" shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    green "Authorised $pkg as mock-location provider on $1."
    green "Open it on the phone and set $lat, $lng (apps can't be fully driven from adb)."
    ;;

  fix-ndk)
    [[ $# -ge 1 ]] || die "Usage: ./phone.sh fix-ndk <phone>"
    exec ./fix-arm-crash.sh "$1"
    ;;

  camera)
    # Virtual camera = feed a video file as the phone's camera. Needs the host
    # kernel module v4l2loopback and ffmpeg. Run ./setup-camera.sh first.
    exec ./setup-camera.sh "$@"
    ;;

  help|*)
    awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"
    ;;
esac
