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
  local base ext dest
  base="$(basename "$f")"
  ext="${base##*.}"
  case "${ext,,}" in
    jpg|jpeg|png|gif|webp|bmp|heic) dest=/sdcard/Pictures ;;
    mp4|mkv|3gp|webm|mov|avi)       dest=/sdcard/Movies ;;
    mp3|wav|m4a|ogg|flac)           dest=/sdcard/Music ;;
    *)                              dest=/sdcard/Documents ;;
  esac
  echo "  -> $base   ($dest)"
  # </dev/null stops adb from swallowing the rest of the file list
  adb -s "$DEV" shell mkdir -p "$dest" >/dev/null 2>&1 </dev/null || true
  adb -s "$DEV" push "$f" "$dest/$base" >/dev/null </dev/null
  adb -s "$DEV" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d "file://$dest/$base" >/dev/null 2>&1 </dev/null || true
}

if [ -d "$SRC" ]; then
  echo "Uploading ALL files from folder: $SRC"
  # process substitution (not a pipe) so the loop keeps its own stdin
  while IFS= read -r f; do push_one "$f"; done < <(find "$SRC" -maxdepth 1 -type f)
else
  echo "Uploading file: $SRC"
  push_one "$SRC"
fi

echo "Done. Open the Gallery/Photos app on the phone (pull to refresh if needed)."
