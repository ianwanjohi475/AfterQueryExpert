#!/usr/bin/env bash
# Upload images/videos from your PC into the phone's gallery and make them appear.
#
# Usage:  sudo ./upload.sh <file-or-folder>
#   single file:  sudo ./upload.sh "/mnt/c/Users/ian/Desktop/photo.jpg"
#   whole folder: sudo ./upload.sh "/mnt/c/Users/ian/Pictures"
#
# Your Windows files live under /mnt/c/Users/<YourName>/...
set -e
cd "$(dirname "$0")"
SRC="$1"
[ -n "$SRC" ] || { echo "Usage: sudo ./upload.sh <file-or-folder>"; exit 1; }
[ -e "$SRC" ] || { echo "Not found: $SRC"; echo "Your Windows files are under /mnt/c/Users/ - run:  ls /mnt/c/Users/"; exit 1; }

PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
DEV="$PIP:5555"
adb connect "$DEV" >/dev/null 2>&1 || true
adb -s "$DEV" shell mkdir -p /sdcard/Pictures >/dev/null 2>&1 || true

push_one() {
  local f="$1" base
  base="$(basename "$f")"
  echo "  -> $base"
  adb -s "$DEV" push "$f" "/sdcard/Pictures/$base" >/dev/null
  adb -s "$DEV" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d "file:///sdcard/Pictures/$base" >/dev/null 2>&1 || true
}

if [ -d "$SRC" ]; then
  echo "Uploading media from folder: $SRC"
  find "$SRC" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
       -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.3gp' \
       -o -iname '*.webm' -o -iname '*.mov' -o -iname '*.avi' \) \
  | while read -r f; do push_one "$f"; done
else
  echo "Uploading file: $SRC"
  push_one "$SRC"
fi

echo "Done. Open the Gallery/Photos app on the phone (pull to refresh if needed)."
