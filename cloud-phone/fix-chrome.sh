#!/usr/bin/env bash
# Fix Chrome (and other Chromium browsers) crashing on redroid+WSL2.
#
# Root cause:
#   Chrome 100+ uses memfd_create + F_ADD_SEALS for IPC shared memory.
#   In docker, /dev/shm defaults to 64MB and Chrome's CHECK on memfd
#   sealing fires SIGTRAP when the region is too small or fails to seal.
#   On WSL2 there's the extra wrinkle that the kernel has CONFIG_MEMFD_CREATE
#   but the container memory is tight (MemFree was only 275MB).
#
# What this script does:
#   1. Confirms docker-compose has shm_size: 2gb and mem_limit: 4g on phone1
#      (already added; this just verifies and triggers a re-create).
#   2. Recreates the phone1 container so the new shm_size applies.
#   3. Writes Chrome command-line flags to /data/local/tmp/chrome-command-line
#      that turn off the IPC paths that fail in this environment:
#        --no-sandbox                 : kernel seccomp filters break Chrome sandbox in container
#        --in-process-gpu             : skip the GPU process IPC entirely
#        --single-process             : avoid Mojo memfd handoff between renderer/browser
#        --disable-features=MojoIpcz  : older IPC path, doesn't need memfd sealing
#        --disable-dev-shm-usage      : use /tmp instead of /dev/shm
#        --use-gl=swiftshader         : pure software GL, no GraphicBuffer allocations
#        --disable-gpu-compositing    : skip the failing format 43/56 allocations
#   4. Force-stops Chrome and relaunches it so it picks up the flags.
#
# Usage:
#   sudo ./fix-chrome.sh             apply the fix to phone1
#   sudo ./fix-chrome.sh recreate    full recreate + fix (use after editing .env)
#   sudo ./fix-chrome.sh diagnose    capture a fresh crash log if it still fails
set -euo pipefail
cd "$(dirname "$0")"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

ACTION="${1:-apply}"
PHONE=phone1

# Chrome command-line flags. The leading "_" is REQUIRED -- Chrome treats the
# first token as argv[0] and ignores it. Don't drop it.
#
# The critical flag for the SIGTRAP-in-libmonochrome crash on redroid+WSL2 is
# --js-flags=--jitless. That crash is V8's JIT emitting code that hits a CFI /
# CET trap on the host CPU. --jitless runs V8 in pure interpreter mode (no JIT,
# no Sparkplug, no Turbofan, no Maglev) -- slower but doesn't crash.
FLAGS='_ --no-sandbox --disable-gpu --in-process-gpu --single-process --disable-features=MojoIpcz,SharedArrayBuffer,V8VmFuture,BackForwardCache --disable-dev-shm-usage --use-gl=swiftshader --disable-gpu-compositing --disable-gpu-rasterization --disable-software-rasterizer --disable-gpu-sandbox --js-flags="--jitless --no-sparkplug --no-turbofan --no-maglev --no-opt" --disable-features=VaapiVideoDecoder --disable-partial-raster --disable-features=PartitionAllocBackupRefPtr'

wait_for_boot() {
  # All progress output goes to STDERR so command substitution
  # `PIP="$(wait_for_boot)"` only captures the final IP on stdout.
  local pip
  echo -n "Waiting for phone1 to come back online" >&2
  for i in $(seq 1 90); do
    sleep 2
    pip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1 2>/dev/null || true)"
    if [[ -n "$pip" ]]; then
      adb connect "$pip:5555" >/dev/null 2>&1 || true
      local booted
      booted="$(adb -s "$pip:5555" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
      if [[ "$booted" == "1" ]]; then echo >&2; echo "$pip"; return 0; fi
    fi
    printf '.' >&2
  done
  echo >&2
  red "phone1 did not finish booting after 3 min. Check: docker logs phone1"
  return 1
}

apply_chrome_flags() {
  local pip="$1"
  echo "Writing Chrome command-line flags..."
  # Use stdin (printf | adb shell cat) so embedded quotes in --js-flags=... do
  # not get mangled by the shell-in-shell quoting.
  printf '%s\n' "$FLAGS" | adb -s "$pip:5555" shell 'cat > /data/local/tmp/chrome-command-line'
  adb -s "$pip:5555" shell "chmod 644 /data/local/tmp/chrome-command-line"

  # Also try Chrome's debug build path (some images read this instead)
  printf '%s\n' "$FLAGS" | adb -s "$pip:5555" shell 'cat > /data/local/tmp/chrome-debug-command-line' 2>/dev/null || true

  # WebView/Trichrome uses a separate flags file. Apps that embed Chromium
  # (Brave, Edge) usually respect their own; doesn't hurt to set it too.
  printf '%s\n' "$FLAGS" | adb -s "$pip:5555" shell 'cat > /data/local/tmp/webview-command-line' 2>/dev/null || true

  echo "Stopping Chrome..."
  adb -s "$pip:5555" shell am force-stop com.android.chrome 2>/dev/null || true
  sleep 1

  echo "Launching Chrome with workaround flags..."
  adb -s "$pip:5555" shell am start -W -n com.android.chrome/com.google.android.apps.chrome.Main 2>/dev/null || true

  green "Done. Check the phone screen — Chrome should open to the welcome page."
  green "If it still crashes, run: sudo ./fix-chrome.sh diagnose"
}

case "$ACTION" in
  diagnose)
    PIP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)"
    [[ -n "$PIP" ]] || { red "phone1 not running"; exit 1; }
    adb connect "$PIP:5555" >/dev/null 2>&1 || true
    echo "=== /dev/shm in container ==="
    docker exec phone1 df -h /dev/shm
    echo
    echo "=== container memory limit ==="
    docker inspect phone1 -f '{{.HostConfig.Memory}} bytes; ShmSize={{.HostConfig.ShmSize}} bytes'
    echo
    echo "=== Chrome flags file ==="
    adb -s "$PIP:5555" shell cat /data/local/tmp/chrome-command-line 2>/dev/null || echo "(not set)"
    echo
    echo "=== Clearing logcat and launching Chrome ==="
    adb -s "$PIP:5555" logcat -c
    adb -s "$PIP:5555" shell am force-stop com.android.chrome
    adb -s "$PIP:5555" shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
    sleep 8
    echo
    echo "=== Last 60 lines of crash log ==="
    adb -s "$PIP:5555" logcat -d -b crash -b main | grep -E "chromium|cr_|DEBUG|libc|SIGTRAP|SIGILL|SIGSEGV|fatal|FATAL|CHECK|memfd|seal" | tail -60
    ;;

  recreate)
    yellow "Stopping phone1 and recreating with new shm_size + mem_limit..."
    docker compose stop phone1 2>/dev/null || true
    docker compose rm -f phone1 2>/dev/null || true
    docker compose up -d phone1
    PIP="$(wait_for_boot)" || exit 1
    apply_chrome_flags "$PIP"
    echo
    yellow "Note: container IP is now $PIP (may have changed). Reopen scrcpy:"
    yellow "  scrcpy -s $PIP:5555 --no-audio"
    ;;

  apply|*)
    # Verify docker-compose has the shm_size line; if not, tell the user to
    # git pull and run "recreate".
    if ! grep -q 'shm_size' docker-compose.yml; then
      red "docker-compose.yml does not have shm_size yet. Run:"
      red "  git pull origin claude/cloud-phone-app-1du6fr"
      red "  sudo ./fix-chrome.sh recreate"
      exit 1
    fi

    # Check current container actually has the bigger shm. If not, recreate.
    CURRENT_SHM="$(docker inspect phone1 -f '{{.HostConfig.ShmSize}}' 2>/dev/null || echo 0)"
    if [[ "${CURRENT_SHM:-0}" -lt 1073741824 ]]; then
      yellow "Current container has only ${CURRENT_SHM} bytes of /dev/shm."
      yellow "Recreating phone1 with 2GB shm_size..."
      docker compose stop phone1 2>/dev/null || true
      docker compose rm -f phone1 2>/dev/null || true
      docker compose up -d phone1
      PIP="$(wait_for_boot)" || exit 1
    else
      PIP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)"
      adb connect "$PIP:5555" >/dev/null 2>&1 || true
    fi

    apply_chrome_flags "$PIP"
    ;;
esac
