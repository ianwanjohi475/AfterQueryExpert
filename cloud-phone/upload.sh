#!/usr/bin/env bash
# Upload images/videos/files from your PC into a phone's gallery.
#
# Usage:
#   ./upload.sh <phone> <file-or-folder>
#   ./upload.sh phone1 "/mnt/c/Users/ADMIN/Downloads/cloud"
#   ./upload.sh phone2 "/mnt/c/Users/ADMIN/Downloads/photo.jpg"
#
# <phone> is phone1, phone2, or phone3.
# Your Windows files live under /mnt/c/Users/<YourName>/...
set -e
cd "$(dirname "$0")"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

declare -A PORTS=( [phone1]=5555 [phone2]=5565 [phone3]=5575 )

PHONE="${1:-}"
SRC="${2:-}"

if [[ -z "$PHONE" || -z "$SRC" ]]; then
  echo "Usage: ./upload.sh <phone> <file-or-folder>"
  echo "  e.g. ./upload.sh phone1 \"/mnt/c/Users/ADMIN/Downloads/cloud\""
  echo "  e.g. ./upload.sh phone2 photo.jpg"
  exit 1
fi

[[ -n "${PORTS[$PHONE]:-}" ]] || { red "Unknown phone '$PHONE'. Known: ${!PORTS[*]}"; exit 1; }
[[ -e "$SRC" ]] || {
  red "Not found: $SRC"
  echo "Your Windows files are under /mnt/c/Users/ — run:  ls /mnt/c/Users/"
  exit 1
}

PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PHONE")
DEV="$PIP:5555"
adb connect "$DEV" >/dev/null 2>&1 || true
adb -s "$DEV" shell mkdir -p /sdcard/Pictures >/dev/null 2>&1 || true

push_one() {
  local f="$1" base ext dest
  base="$(basename "$f")"
  ext="${base##*.}"
  case "${ext,,}" in
    jpg|jpeg|png|gif|webp|bmp|heic) dest=/sdcard/Pictures ;;
    mp4|mkv|3gp|webm|mov|avi)       dest=/sdcard/Movies ;;
    mp3|wav|m4a|ogg|flac)           dest=/sdcard/Music ;;
    *)                               dest=/sdcard/Documents ;;
  esac
  echo "  -> $base   ($dest)"
  adb -s "$DEV" shell mkdir -p "$dest" >/dev/null 2>&1 </dev/null || true
  adb -s "$DEV" push "$f" "$dest/$base" >/dev/null </dev/null
  adb -s "$DEV" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d "file://$dest/$base" >/dev/null 2>&1 </dev/null || true
}

if [ -d "$SRC" ]; then
  echo "Uploading ALL files from folder: $SRC  ->  $PHONE"
  while IFS= read -r f; do push_one "$f"; done < <(find "$SRC" -maxdepth 1 -type f | sort)
else
  echo "Uploading file: $SRC  ->  $PHONE"
  push_one "$SRC"
fi

green "Done. Open the Gallery/Photos app on $PHONE (pull to refresh if needed)."
