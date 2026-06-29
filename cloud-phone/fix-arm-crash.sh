#!/usr/bin/env bash
# Fix: ARM64 app crash (SIGILL / "Undefined instruction" from NDK translation)
#
# Root cause:
#   ReDroid on x86_64 uses libndk_translation to run ARM64 native code.
#   The Android 11 image ships an old libndk_translation that cannot translate
#   every ARM64 instruction. Apps that probe CPU features with system-register
#   reads (e.g. "mrs x9, id_aa64pfr0_el1") crash with Fatal signal 4 (SIGILL)
#   immediately on launch.
#
# Fix A — preferred (survives data wipe):
#   Upgrade to the Android 12 or 13 image, which ships a newer
#   libndk_translation that handles the missing instructions.
#   Edit .env:
#     REDROID_IMAGE=redroid/redroid:13.0.0-latest
#   Then:
#     ./phone.sh wipe && ./phone.sh up     # WARNING: erases all phone data
#
# Fix B — applied by this script (no data loss, current image):
#   Write /data/local.prop so Android init reports only x86_64 ABI.
#   Android then installs the x86_64 APK split rather than the arm64 one,
#   sidestepping the translation layer entirely.
#   Works for any app that ships an x86_64 build (nearly all mainstream apps).
#   ARM64-only apps will not be installable from Play Store (rare on x86_64).
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

command -v adb    >/dev/null 2>&1 || { red "adb not found. Run ./setup.sh for install instructions."; exit 1; }
command -v docker >/dev/null 2>&1 || { red "docker not found."; exit 1; }

DEV="localhost:${PORTS[$PHONE]}"
adb connect "$DEV" >/dev/null 2>&1 || true

wait_online() {
  local dev="$1" name="$2"
  echo -n "Waiting for $name to come back online"
  for i in $(seq 1 40); do
    sleep 3
    adb connect "$dev" >/dev/null 2>&1 || true
    local s
    s="$(adb -s "$dev" get-state 2>/dev/null || true)"
    [[ "$s" == "device" ]] && { echo; return 0; }
    printf '.'
  done
  echo
  red "$name did not come back online after 120 s. Check: docker logs $name"
  exit 1
}

echo "=== ARM crash fix for $PHONE ==="

ANDROID_VER="$(adb -s "$DEV" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n')"
ABI_NOW="$(adb -s "$DEV" shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r\n')"
yellow "Android: ${ANDROID_VER:-unknown}   ABI list: ${ABI_NOW:-unknown}"

if [[ "$ACTION" == "revert" ]]; then
  echo "Reverting: removing /data/local.prop..."
  adb -s "$DEV" shell "rm -f /data/local.prop"
  echo "Restarting $PHONE..."
  docker compose restart "$PHONE"
  wait_online "$DEV" "$PHONE"
  green "Reverted. arm64-v8a ABI is back. Reinstall any apps that need it."
  exit 0
fi

# Warn if already on Android 12+; the fix still works but Fix A is better.
if [[ "${ANDROID_VER:-11}" != "11" ]]; then
  yellow ""
  yellow "  Note: Android $ANDROID_VER already ships a newer libndk_translation."
  yellow "  If the crash persists, Fix B (applied here) will still help."
  yellow ""
else
  yellow ""
  yellow "  Android 11 detected — this is the most common cause of this crash."
  yellow "  Fix B applied now. For a permanent fix without limitations, also:"
  yellow "    1. Edit .env:  REDROID_IMAGE=redroid/redroid:13.0.0-latest"
  yellow "    2. ./phone.sh wipe && ./phone.sh up   (erases all data)"
  yellow ""
fi

# Apply Fix B: /data/local.prop is read by Android init on userdebug builds
# (all ReDroid images) and overrides ro.* properties before any app starts.
# Removing arm64-v8a from the ABI list causes Android to install x86_64 APK
# splits instead, bypassing the broken NDK translation path entirely.
echo "Writing /data/local.prop on $PHONE..."
adb -s "$DEV" shell "printf 'ro.product.cpu.abilist=x86_64,x86\nro.product.cpu.abilist64=x86_64\nro.product.cpu.abilist32=x86\n' > /data/local.prop"

echo "Restarting $PHONE..."
docker compose restart "$PHONE"
wait_online "$DEV" "$PHONE"

NEW_ABI="$(adb -s "$DEV" shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r\n')"
green "Fix applied. ABI list is now: ${NEW_ABI}"
echo
yellow "Next steps:"
yellow "  1. Uninstall the crashing app from the phone UI, or:"
yellow "       ./phone.sh adb $PHONE -- uninstall <package.name>"
yellow "  2. Reinstall it — Play Store / APK will now pick the x86_64 build."
echo
yellow "To revert (restore arm64 ABI):  ./fix-arm-crash.sh $PHONE revert"
