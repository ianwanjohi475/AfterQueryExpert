#!/usr/bin/env bash
# Fix: ARM64 app crash (SIGILL / "Undefined instruction" from NDK translation)
#
# Root cause:
#   ReDroid on x86_64 uses libndk_translation (libnb.so on this image) to run
#   ARM64 native code. The Android 11 image ships an older translator that
#   cannot translate every ARM64 instruction. Apps that probe CPU features
#   with system-register reads (e.g. "mrs x9, midr_el1") crash with
#   Fatal signal 4 (SIGILL) immediately on launch.
#
# Fix B applied here (no data loss, current image):
#   Use Magisk's resetprop to override ro.product.cpu.abilist* at runtime so
#   the phone advertises x86_64 only. Restart zygote so Package Manager and
#   Play Store see the change. Then uninstall + reinstall the app: Play Store
#   ships the x86_64 split, no translation path, no crash.
#
#   Persistence: also installs a Magisk post-fs-data.d script so the override
#   is re-applied automatically every time the container starts.
#
# Fix A (permanent, wipes data):
#   Upgrade to redroid:13.0.0-latest which ships a newer translator:
#     edit .env -> REDROID_IMAGE=redroid/redroid:13.0.0-latest
#     ./phone.sh wipe && ./phone.sh up
#
# Usage:
#   ./fix-arm-crash.sh <phone>           apply the fix (e.g. phone1)
#   ./fix-arm-crash.sh <phone> revert    remove the fix and restore arm64 ABI

set -euo pipefail
cd "$(dirname "$0")"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

PHONE="${1:-}"
ACTION="${2:-apply}"

[[ -n "$PHONE" ]] || { echo "Usage: $0 <phone> [revert]  (e.g. phone1)"; exit 1; }
[[ -n "${PORTS[$PHONE]:-}" ]] || { red "Unknown phone '$PHONE'. Known: ${!PORTS[*]}"; exit 1; }

command -v adb    >/dev/null 2>&1 || { red "adb not found."; exit 1; }
command -v docker >/dev/null 2>&1 || { red "docker not found."; exit 1; }

DEV="localhost:${PORTS[$PHONE]}"
adb connect "$DEV" >/dev/null 2>&1 || true

echo "=== ARM crash fix for $PHONE ==="

ANDROID_VER="$(adb -s "$DEV" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n')"
ABI_NOW="$(adb -s "$DEV" shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r\n')"
yellow "Android: ${ANDROID_VER:-unknown}   ABI list: ${ABI_NOW:-unknown}"

# ---- Revert -----------------------------------------------------------------
if [[ "$ACTION" == "revert" ]]; then
  echo "Removing Magisk module + reverting props..."
  CID="$(docker inspect -f '{{.Id}}' "$PHONE" 2>/dev/null || true)"
  if [[ -n "$CID" ]]; then
    docker exec "$CID" sh -c 'rm -rf /data/adb/modules/abi-x86-only /data/local.prop' 2>/dev/null || true
  fi
  adb -s "$DEV" shell "su -c 'rm -rf /data/adb/modules/abi-x86-only /data/local.prop'" 2>/dev/null || true
  echo "Restarting $PHONE..."
  docker compose restart "$PHONE"
  sleep 8
  PIP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PHONE" 2>/dev/null || true)"
  green "Revert done. Reconnect adb: adb connect $PIP:5555"
  exit 0
fi

# ---- Apply ------------------------------------------------------------------
#
# We get root through `docker exec` (real uid 0 inside the container) instead of
# adb `su`, because the Magisk su *policy* often denies the adb shell user on
# these images. docker exec never hits that policy.

CID="$(docker inspect -f '{{.Id}}' "$PHONE" 2>/dev/null || true)"
[[ -n "$CID" ]] || { red "Container $PHONE is not running. Run ./phone.sh up first."; exit 1; }

dex() { docker exec "$CID" sh -c "$1"; }       # run a shell line as root in Android

# Locate the Magisk resetprop binary (only it can override ro.* at runtime).
echo "Locating resetprop inside $PHONE..."
RP="$(dex 'for p in /sbin/resetprop /system/bin/resetprop /debug_ramdisk/.magisk/busybox/resetprop /data/adb/magisk/resetprop $(magisk --path 2>/dev/null)/.magisk/busybox/resetprop; do [ -x "$p" ] && { echo "$p"; break; }; done' 2>/dev/null | tr -d '\r' | head -n1)"
if [[ -z "$RP" ]]; then
  # Magisk exposes resetprop as a subcommand too.
  if dex 'command -v magisk >/dev/null 2>&1'; then RP='magisk resetprop'; fi
fi
if [[ -z "$RP" ]]; then
  red "Could not find resetprop or magisk inside $PHONE."
  red "This image has no Magisk, so ro.* props can't be overridden at runtime."
  red "Use the clean Android 13 path instead (newer translator, no Magisk needed):"
  red "    sed -i 's|^REDROID_IMAGE=.*|REDROID_IMAGE=fahaddz/redroid:13|' .env"
  red "    docker pull fahaddz/redroid:13 && ./phone.sh wipe && ./phone.sh up"
  exit 1
fi
green "resetprop: $RP"

# Build the list of resetprop calls once, reuse for runtime + boot script.
read -r -d '' RP_CMDS <<EOF || true
$RP ro.product.cpu.abilist x86_64,x86
$RP ro.product.cpu.abilist64 x86_64
$RP ro.product.cpu.abilist32 x86
$RP ro.product.cpu.abi x86_64
$RP ro.product.cpu.abi2 x86
$RP ro.system.product.cpu.abilist x86_64,x86
$RP ro.system.product.cpu.abilist64 x86_64
$RP ro.system.product.cpu.abilist32 x86
$RP ro.vendor.product.cpu.abilist x86_64,x86
$RP ro.vendor.product.cpu.abilist64 x86_64
$RP ro.vendor.product.cpu.abilist32 x86
EOF

# 1) Runtime override -- effective immediately, before Play Store rescans.
echo "Applying resetprop overrides (via docker exec, real root)..."
dex "$RP_CMDS" >/dev/null 2>&1 || true

# 2) Install a Magisk module so it re-applies on every boot.
echo "Installing Magisk module abi-x86-only (persists across reboots)..."
MOD='/data/adb/modules/abi-x86-only'
# resetprop in the boot script uses the magisk-provided one on PATH at that time.
dex "mkdir -p $MOD && \
  printf 'id=abi-x86-only\nname=ABI x86 only\nversion=1.0\nversionCode=1\nauthor=cloud-phone\ndescription=Hide arm64-v8a so Play Store ships x86_64 splits.\n' > $MOD/module.prop && \
  { echo '#!/system/bin/sh'; echo 'resetprop ro.product.cpu.abilist x86_64,x86'; echo 'resetprop ro.product.cpu.abilist64 x86_64'; echo 'resetprop ro.product.cpu.abilist32 x86'; echo 'resetprop ro.product.cpu.abi x86_64'; echo 'resetprop ro.product.cpu.abi2 x86'; echo 'resetprop ro.system.product.cpu.abilist x86_64,x86'; echo 'resetprop ro.system.product.cpu.abilist64 x86_64'; echo 'resetprop ro.system.product.cpu.abilist32 x86'; echo 'resetprop ro.vendor.product.cpu.abilist x86_64,x86'; echo 'resetprop ro.vendor.product.cpu.abilist64 x86_64'; echo 'resetprop ro.vendor.product.cpu.abilist32 x86'; } > $MOD/post-fs-data.sh && \
  chmod 755 $MOD/post-fs-data.sh && touch $MOD/update" >/dev/null 2>&1 || true

# 3) Restart zygote so Package Manager and Play Store re-read the new ABIs.
echo "Restarting Android framework so Play Store sees the new ABI..."
dex 'stop; start' >/dev/null 2>&1 || true

echo -n "Waiting for framework to come back"
for i in $(seq 1 40); do
  sleep 2
  BOOTED="$(adb -s "$DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  [[ "$BOOTED" == "1" ]] && { echo; break; }
  printf '.'
done

NEW_ABI="$(dex 'getprop ro.product.cpu.abilist' 2>/dev/null | tr -d '\r\n')"
if [[ "$NEW_ABI" == "x86_64,x86" ]]; then
  green "Fix applied. ABI list is now: $NEW_ABI"
else
  red   "ABI list still reports: $NEW_ABI"
  red   "resetprop did not stick. Diagnose with:"
  red   "   docker exec $PHONE sh -c '$RP --help; getprop | grep abilist'"
  red   "If this image has no working Magisk, use the Android 13 path:"
  red   "   sed -i 's|^REDROID_IMAGE=.*|REDROID_IMAGE=fahaddz/redroid:13|' .env"
  red   "   docker pull fahaddz/redroid:13 && ./phone.sh wipe && ./phone.sh up"
  exit 1
fi

# 4) Tell the user the current container IP -- it may have changed after a
#    restart and confuses scrcpy if hard-coded.
PIP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PHONE" 2>/dev/null || true)"
adb connect "$PIP:5555" >/dev/null 2>&1 || true

echo
yellow "Next steps:"
yellow "  1. Uninstall the crashing app:"
yellow "       ./phone.sh adb $PHONE -- uninstall com.withpersona.app.reusablepersonas"
yellow "     (replace with the actual package, or uninstall on-screen via long-press)"
yellow "  2. Reopen scrcpy with the current container IP:"
yellow "       scrcpy -s $PIP:5555 --no-audio"
yellow "  3. Open Play Store on the phone -> reinstall the app."
yellow "     Play Store now sees x86_64 only, ships the x86_64 split, no SIGILL."
echo
yellow "To revert (restore arm64 ABI):  ./fix-arm-crash.sh $PHONE revert"
