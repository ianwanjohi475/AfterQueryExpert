#!/usr/bin/env bash
# Virtual camera for the cloud phones.
#
# redroid has no real camera. This creates a fake one on the HOST using the
# v4l2loopback kernel module + ffmpeg, then the phones can use it as their
# camera (the /dev/video device is passed into the containers — see the
# commented block in docker-compose.yml).
#
# HONEST STATUS: experimental. It depends on your host kernel supporting
# v4l2loopback and on the redroid image accepting the camera device. It is NOT
# as turnkey as MoreLogin's virtual camera. Treat it as best-effort.
#
#   ./setup-camera.sh <video.mp4>     loop a video file as the camera
#   ./setup-camera.sh stop            stop the feed and unload the module
set -euo pipefail

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
DEV=/dev/video10

if [[ "${1:-}" == "stop" ]]; then
  pkill -f "ffmpeg.*$DEV" 2>/dev/null || true
  sudo modprobe -r v4l2loopback 2>/dev/null || true
  green "Virtual camera stopped."
  exit 0
fi

video="${1:-}"
[[ -n "$video" && -f "$video" ]] || { red "Usage: ./setup-camera.sh <video.mp4>"; exit 1; }

command -v ffmpeg >/dev/null 2>&1 || { red "ffmpeg not installed. Install it first."; exit 1; }

echo "Loading v4l2loopback (creates a virtual camera at $DEV)..."
if ! sudo modprobe v4l2loopback video_nr=10 card_label="CloudPhoneCam" exclusive_caps=1 2>/dev/null; then
  red "Could not load v4l2loopback. Install it:"
  red "  Debian/Ubuntu: sudo apt-get install -y v4l2loopback-dkms"
  red "  Then re-run. (Some cloud kernels can't load it — same limitation as binder.)"
  exit 1
fi

green "Virtual camera ready at $DEV. Looping '$video' into it..."
echo "Now uncomment the 'devices: [$DEV...]' lines in docker-compose.yml and run ./phone.sh up."
echo "Press Ctrl+C to stop the feed."
exec ffmpeg -stream_loop -1 -re -i "$video" -vf format=yuv420p -f v4l2 "$DEV"
