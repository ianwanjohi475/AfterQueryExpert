#!/usr/bin/env bash
# One-shot deploy of the cloud phone on an ARM64 Ubuntu host (Hetzner CAX21,
# Oracle Ampere A1, AWS Graviton, etc.). Native arm64-v8a, no ndk_translation,
# so apps like Persona/banking SDKs that hit unsupported ARM instructions on
# x86 will run without SIGILL on this box.
#
# Usage (run as root on the fresh ARM64 box):
#   curl -fsSL https://raw.githubusercontent.com/ianwanjohi475/AfterQueryExpert/claude/cloud-phone-app-1du6fr/cloud-phone/deploy-arm.sh | bash
# or:
#   git clone https://github.com/ianwanjohi475/AfterQueryExpert.git
#   cd AfterQueryExpert/cloud-phone && sudo ./deploy-arm.sh
set -e

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo $0"; exit 1; }
ARCH=$(uname -m)
[ "$ARCH" = "aarch64" ] || { echo "This box is $ARCH, not aarch64. Run on an ARM64 host."; exit 1; }

echo "==> Updating apt and installing deps"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  docker.io docker-compose-v2 git adb scrcpy \
  linux-modules-extra-$(uname -r) iptables wget

echo "==> Enabling binder (host kernel module)"
modprobe binder_linux num_devices=3 2>/dev/null || modprobe binder 2>/dev/null || true
if ! grep -q binder /proc/filesystems; then
  echo "WARN: binder not in /proc/filesystems. Some kernels need binderfs mounted manually."
  mkdir -p /dev/binderfs
  mount -t binder binder /dev/binderfs 2>/dev/null || true
fi
echo "binder_linux" > /etc/modules-load.d/binder.conf

echo "==> Loading docker iptables modules"
for m in ip_tables iptable_nat iptable_filter nf_nat xt_conntrack xt_addrtype \
         br_netfilter overlay xt_MASQUERADE iptable_raw iptable_mangle xt_nat \
         xt_REDIRECT nf_nat_redirect; do
  modprobe "$m" 2>/dev/null || true
done
printf '%s\n' ip_tables iptable_nat iptable_filter nf_nat xt_conntrack xt_addrtype \
  br_netfilter overlay xt_MASQUERADE iptable_raw iptable_mangle xt_nat \
  xt_REDIRECT nf_nat_redirect > /etc/modules-load.d/docker-arm.conf

systemctl enable --now docker

echo "==> Cloning repo (if not already in it)"
if [ ! -f docker-compose.yml ]; then
  cd /opt
  git clone https://github.com/ianwanjohi475/AfterQueryExpert.git
  cd AfterQueryExpert/cloud-phone
  git checkout claude/cloud-phone-app-1du6fr
fi

echo "==> Switching image to multi-arch tag (pulls arm64 layer on this host)"
[ -f .env ] || cp .env.example .env
sed -i 's|^REDROID_IMAGE=.*|REDROID_IMAGE=redroid/redroid:11.0.0-latest|' .env

echo "==> Pulling redroid arm64 image"
docker pull redroid/redroid:11.0.0-latest

echo "==> Starting phone1"
docker compose up -d phone1

echo "==> Waiting for boot (this takes 60-120s on first run)"
for i in $(seq 1 120); do
  PIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1 2>/dev/null || true)
  [ -n "$PIP" ] && break
  sleep 1
done
[ -n "$PIP" ] || { echo "phone1 never got an IP. Check: docker logs phone1"; exit 1; }

adb start-server >/dev/null 2>&1
adb connect "$PIP:5555" >/dev/null
for i in $(seq 1 120); do
  BOOTED=$(adb -s "$PIP:5555" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  [ "$BOOTED" = "1" ] && break
  sleep 2
done

ABI=$(adb -s "$PIP:5555" shell getprop ro.product.cpu.abi | tr -d '\r')
BRIDGE=$(adb -s "$PIP:5555" shell getprop ro.dalvik.vm.native.bridge | tr -d '\r')

HOST_IP=$(hostname -I | awk '{print $1}')
cat <<EOF

================================================================
Cloud phone is UP on ARM64.
  phone1 container IP : $PIP
  ABI                 : $ABI         (expected: arm64-v8a)
  Native bridge       : ${BRIDGE:-<none>}  (empty = no translation, good)
  Host public IP      : $HOST_IP

View from your laptop (Windows/WSL):
  # 1. tunnel adb over SSH:
  ssh -L 5555:$PIP:5555 root@$HOST_IP
  # 2. in WSL on your PC:
  adb connect 127.0.0.1:5555
  scrcpy -s 127.0.0.1:5555 --no-audio

Install Persona (or any app) and it will run native ARM64 — no SIGILL
from ndk_translation on MRS / unsupported system-register reads.

Note: Play Integrity / hardware attestation can still block KYC apps
even on a real ARM kernel. That is a separate wall.
================================================================
EOF
