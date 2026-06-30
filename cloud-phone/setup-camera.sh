#!/usr/bin/env bash
# Virtual camera for the cloud phones.
#
# redroid has no real camera. This creates a fake one on the HOST using the
# v4l2loopback kernel module + ffmpeg, then the phones can use it as their
# camera (the /dev/video device is passed into the containers — see the
# commented block in docker-compose.yml).
#
# Usage:
#   ./setup-camera.sh <video.mp4|photo.jpg>   loop a video / photo as the camera
#   ./setup-camera.sh patch [phone1|all]       uncomment docker-compose devices +
#                                               restart phone(s) (run once after
#                                               starting the feed above)
#   ./setup-camera.sh unpatch [phone1|all]     undo patch (if /dev/video10 missing)
#   ./setup-camera.sh doctor [phone2]          check every layer, show what's broken
#   ./setup-camera.sh stop                     stop the feed and unload the module
#
# Full walkthrough:
#   1. ./setup-camera.sh selfie.jpg            (start feeding the photo as camera)
#   2. ./setup-camera.sh patch phone1          (wire phone1 to it; restarts phone1)
#   3. ./phone.sh cam-grant phone1 firefox     (grant Firefox camera permission)
#   4. Open Firefox -> inquiry.withpersona.com/veri -> allow camera when prompted
#
# HONEST STATUS: experimental. It depends on your host kernel supporting
# v4l2loopback and on the redroid image accepting the camera device. It is NOT
# as turnkey as MoreLogin's virtual camera. Treat it as best-effort.
set -euo pipefail
cd "$(dirname "$0")"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

DEV=/dev/video10

# ---------- stop ---------------------------------------------------------------
if [[ "${1:-}" == "stop" ]]; then
  pkill -f "ffmpeg.*$DEV" 2>/dev/null || true
  sudo modprobe -r v4l2loopback 2>/dev/null || true
  green "Virtual camera stopped."
  exit 0
fi

# ---------- doctor -------------------------------------------------------------
# Checks every layer of the camera chain and says exactly which one is broken.
#   ./setup-camera.sh doctor [phone2]
if [[ "${1:-}" == "doctor" ]]; then
  declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )
  PHONE="${2:-phone1}"
  [[ -n "${PORTS[$PHONE]:-}" ]] || { red "Unknown phone '$PHONE'."; exit 1; }
  ok()   { green "  [OK]  $1"; }
  bad()  { red   "  [!!]  $1"; }
  echo "=== Camera doctor for $PHONE ==="

  echo
  echo "Layer 1 — host kernel module"
  if lsmod 2>/dev/null | grep -q v4l2loopback; then
    ok "v4l2loopback is loaded"
  else
    bad "v4l2loopback NOT loaded. Fix: sudo modprobe v4l2loopback video_nr=10 exclusive_caps=1 card_label=CloudPhoneCam"
  fi
  if [[ -e "$DEV" ]]; then ok "$DEV exists on host"; else bad "$DEV missing (module not loaded)"; fi

  echo
  echo "Layer 2 — ffmpeg feed"
  if pgrep -f "ffmpeg.*$DEV" >/dev/null 2>&1; then
    ok "ffmpeg is feeding $DEV"
  else
    bad "No ffmpeg feeding $DEV. Fix: ./phone.sh camera <video.mp4>  (keep it running)"
  fi

  echo
  echo "Layer 3 — device inside the container"
  CID="$(docker inspect -f '{{.Id}}' "$PHONE" 2>/dev/null || true)"
  if [[ -z "$CID" ]]; then
    bad "$PHONE container not running."
  elif docker exec "$CID" sh -c "[ -e $DEV ]" 2>/dev/null; then
    ok "$DEV is visible INSIDE $PHONE"
  else
    bad "$DEV NOT inside $PHONE. Fix: ./setup-camera.sh patch $PHONE && docker compose up -d --force-recreate $PHONE"
  fi

  echo
  echo "Layer 4 — Android sees a camera"
  DEVADB="localhost:${PORTS[$PHONE]}"
  adb connect "$DEVADB" >/dev/null 2>&1 || true
  CAMS="$(adb -s "$DEVADB" shell cmd media.camera get-number-of-cameras 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "$CAMS" || "$CAMS" == "0" ]]; then
    CAMS="$(adb -s "$DEVADB" shell dumpsys media.camera 2>/dev/null | grep -c 'Camera [0-9]' || true)"
  fi
  if [[ -n "$CAMS" && "$CAMS" != "0" ]]; then
    ok "Android reports $CAMS camera(s)"
  else
    bad "Android reports ZERO cameras."
    yellow "      The stock redroid image has no v4l2 camera HAL, so passing"
    yellow "      /dev/video10 alone does NOT create an Android camera. This is"
    yellow "      the layer that blocks browser getUserMedia. See notes below."
  fi
  echo
  echo "=== End of report ==="
  exit 0
fi

# ---------- patch --------------------------------------------------------------
# Uncomments the `devices:` block in docker-compose.yml and restarts the phone(s)
# so they see the virtual camera device.
if [[ "${1:-}" == "patch" ]]; then
  target="${2:-all}"   # "all" or a phone name like "phone1"

  # Uncomment the devices lines for the requested phone(s).
  # The YAML comment pattern is:
  #     # devices:
  #     #   - "/dev/video10:/dev/video10"
  # → become:
  #     devices:
  #       - "/dev/video10:/dev/video10"
  #
  # sed matches the exact indented comment forms used in docker-compose.yml.
  if [[ "$target" == "all" ]]; then
    # GNU sed: -i with -e; BSD sed (macOS): -i '' with -e.
    sed -i -e 's/^    # devices:$/    devices:/' \
           -e 's/^    #   - "\/dev\/video10:\/dev\/video10"$/      - "\/dev\/video10:\/dev\/video10"/' \
           docker-compose.yml 2>/dev/null || \
    sed -i '' \
        -e 's/^    # devices:$/    devices:/' \
        -e 's/^    #   - "\/dev\/video10:\/dev\/video10"$/      - "\/dev\/video10:\/dev\/video10"/' \
        docker-compose.yml
    green "Uncommented camera devices in docker-compose.yml for all phones."
    echo
    yellow "Now restart the phones so they inherit the new device mapping:"
    yellow "  docker compose up -d --force-recreate phone1 phone2 phone3"
  else
    # Phone-specific patch: only uncomment the block right after the phoneN service header.
    python3 - "$target" <<'PYEOF'
import sys, re

phone = sys.argv[1]
path  = "docker-compose.yml"
with open(path) as f:
    lines = f.readlines()

# Find the line that starts the target service block (e.g. "  phone1:")
in_block = False
i = 0
out = []
while i < len(lines):
    line = lines[i]
    # Detect start of the target service
    if re.match(rf"^  {re.escape(phone)}:\s*$", line):
        in_block = True
    # Detect start of a different top-level service (stops our edit scope)
    elif in_block and re.match(r"^  \w", line) and not line.startswith(f"  {phone}"):
        in_block = False

    if in_block and line.rstrip() == "    # devices:":
        line = "    devices:\n"
    elif in_block and line.rstrip() == '    #   - "/dev/video10:/dev/video10"':
        line = '      - "/dev/video10:/dev/video10"\n'

    out.append(line)
    i += 1

with open(path, "w") as f:
    f.writelines(out)
print(f"Patched docker-compose.yml for {phone}.")
PYEOF
    green "Camera device wired into $target in docker-compose.yml."
    echo
    yellow "Restart $target to apply:"
    yellow "  docker compose up -d --force-recreate $target"
    yellow "Then grant the browser camera permission:"
    yellow "  ./phone.sh cam-grant $target firefox"
  fi
  exit 0
fi

# ---------- unpatch ------------------------------------------------------------
# Re-comments the devices block so phones can start without /dev/video10.
# Run this if v4l2loopback can't load and phone2/phone3 won't start.
if [[ "${1:-}" == "unpatch" ]]; then
  target="${2:-all}"

  if [[ "$target" == "all" ]]; then
    sed -i -e 's/^    devices:$/    # devices:/' \
           -e 's/^      - "\/dev\/video10:\/dev\/video10"$/    #   - "\/dev\/video10:\/dev\/video10"/' \
           docker-compose.yml 2>/dev/null || \
    sed -i '' \
        -e 's/^    devices:$/    # devices:/' \
        -e 's/^      - "\/dev\/video10:\/dev\/video10"$/    #   - "\/dev\/video10:\/dev\/video10"/' \
        docker-compose.yml
    green "Camera devices re-commented in docker-compose.yml (all phones)."
  else
    python3 - "$target" <<'PYEOF'
import sys, re

phone = sys.argv[1]
path  = "docker-compose.yml"
with open(path) as f:
    lines = f.readlines()

in_block = False
out = []
for line in lines:
    if re.match(rf"^  {re.escape(phone)}:\s*$", line):
        in_block = True
    elif in_block and re.match(r"^  \w", line) and not line.startswith(f"  {phone}"):
        in_block = False

    if in_block and line.rstrip() == "    devices:":
        line = "    # devices:\n"
    elif in_block and line.rstrip() == '      - "/dev/video10:/dev/video10"':
        line = '    #   - "/dev/video10:/dev/video10"\n'

    out.append(line)

with open(path, "w") as f:
    f.writelines(out)
print(f"Reverted camera patch for {phone}.")
PYEOF
    green "Camera device re-commented for $target — phone can now start without /dev/video10."
  fi
  echo
  yellow "Now start the phone normally:"
  yellow "  docker compose up -d ${2:-phone1 phone2 phone3}"
  exit 0
fi

# ---------- feed a video / photo -----------------------------------------------
input="${1:-}"
[[ -n "$input" && -f "$input" ]] || {
  red "Usage:"
  red "  ./setup-camera.sh <video.mp4|photo.jpg>   start virtual camera"
  red "  ./setup-camera.sh patch [phone1|all]       wire phone(s) after camera started"
  red "  ./setup-camera.sh unpatch [phone1|all]     re-comment (undo patch) if /dev/video10 missing"
  red "  ./setup-camera.sh stop                     stop"
  exit 1
}

command -v ffmpeg >/dev/null 2>&1 || { red "ffmpeg not installed. Install it first:  sudo apt-get install -y ffmpeg"; exit 1; }

echo "Loading v4l2loopback (creates a virtual camera at $DEV)..."
if ! sudo modprobe v4l2loopback video_nr=10 card_label="CloudPhoneCam" exclusive_caps=1 2>/dev/null; then
  red "Could not load v4l2loopback. Install it:"
  red "  Debian/Ubuntu: sudo apt-get install -y v4l2loopback-dkms"
  red "  Arch:          sudo pacman -S v4l2loopback-dkms"
  red "  Then re-run. (Some cloud kernels can't load it — same limitation as binder.)"
  exit 1
fi

green "Virtual camera ready at $DEV."
echo

# Detect if the input is a static image and loop it as a video stream.
ext="${input##*.}"
ext="${ext,,}"   # lowercase
case "$ext" in
  jpg|jpeg|png|bmp|webp)
    green "Static image detected — looping it at 10 fps as the camera feed."
    echo "Press Ctrl+C to stop."
    echo
    yellow "NEXT STEPS (in a second terminal):"
    yellow "  ./setup-camera.sh patch phone1     (wire phone1 to this camera)"
    yellow "  ./phone.sh cam-grant phone1 firefox (grant Firefox the permission)"
    echo
    exec ffmpeg -loglevel warning \
      -loop 1 -r 10 -i "$input" \
      -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
      -f v4l2 "$DEV"
    ;;
  *)
    green "Looping '$input' into virtual camera at $DEV."
    echo "Press Ctrl+C to stop."
    echo
    yellow "NEXT STEPS (in a second terminal):"
    yellow "  ./setup-camera.sh patch phone1     (wire phone1 to this camera)"
    yellow "  ./phone.sh cam-grant phone1 firefox (grant Firefox the permission)"
    echo
    exec ffmpeg -loglevel warning \
      -stream_loop -1 -re -i "$input" \
      -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
      -f v4l2 "$DEV"
    ;;
esac
