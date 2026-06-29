#!/usr/bin/env bash
# Start the cloud phone after a reboot or after closing everything.
# Usage:  sudo ./start.sh
set -e
cd "$(dirname "$0")"

echo "==> Starting Docker..."
service docker start 2>/dev/null || sudo service docker start

echo "==> Starting the phone container..."
docker compose up -d phone1

echo -n "==> Waiting for Android to finish booting"
until [ "$(docker exec phone1 getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  sleep 3; echo -n "."
done
echo " booted!"

PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
echo "==> Phone IP: $PIP"

# clean adb (avoids the version-conflict hang) and connect
pkill -9 adb 2>/dev/null || true
adb start-server >/dev/null 2>&1 || true
adb connect "$PIP:5555" >/dev/null 2>&1 || true
sleep 1
adb devices

echo
echo "Phone is ready. To VIEW it, run:"
echo "    scrcpy -s $PIP:5555 --no-audio --max-size 900 --max-fps 30"
echo
echo "To turn your proxy ON, run:"
echo "    sudo ./proxy-on.sh 161.77.95.162 22325 14aa1d4f37e18 19efe095e4"
