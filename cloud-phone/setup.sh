#!/usr/bin/env bash
# Prepares a Linux host to run the cloud-phone stack.
# Checks for Docker + adb, and loads the kernel modules redroid needs.
set -euo pipefail

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

echo "== Cloud Phone host setup =="

# --- 1. OS check ---------------------------------------------------------
if [[ "$(uname -s)" != "Linux" ]]; then
  red "This must run on a Linux host. (macOS/Windows can't load the binder module."
  red "On Windows, run this inside a WSL2 distro with a custom kernel that has binder.)"
  exit 1
fi

# --- 2. Docker -----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  yellow "Docker not found. Install it, e.g.:  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
green "Docker found: $(docker --version)"

if ! docker compose version >/dev/null 2>&1; then
  yellow "Docker Compose v2 plugin not found (need 'docker compose'). Install docker-compose-plugin."
  exit 1
fi

# --- 3. adb (for installing apps / proxies) ------------------------------
if ! command -v adb >/dev/null 2>&1; then
  yellow "adb not found. Install it for app/proxy management:"
  yellow "  Debian/Ubuntu: sudo apt-get install -y android-tools-adb"
  yellow "  Fedora:        sudo dnf install -y android-tools"
  yellow "  Arch:          sudo pacman -S android-tools"
else
  green "adb found: $(adb --version | head -1)"
fi

# --- 4. Kernel modules redroid needs -------------------------------------
echo
echo "Loading kernel modules (binder_linux, ashmem may be needed on older kernels)..."

load_mod() {
  local mod="$1" params="${2:-}"
  if [[ -n "$params" ]]; then
    sudo modprobe "$mod" $params 2>/dev/null && green "  loaded: $mod $params" && return 0
  fi
  sudo modprobe "$mod" 2>/dev/null && green "  loaded: $mod" && return 0
  return 1
}

OK=1
# Modern kernels (5.x+) ship binderfs; redroid wants binder devices named like this.
if load_mod binder_linux "devices=binder,hwbinder,vndbinder"; then :; else
  if load_mod binder_linux; then :; else
    # On Ubuntu/Debian (incl. most cloud servers like Oracle Cloud) the binder
    # module ships in linux-modules-extra but may not be installed. Try it.
    if command -v apt-get >/dev/null 2>&1; then
      yellow "  binder module not found; installing linux-modules-extra-$(uname -r)..."
      sudo apt-get update -qq && sudo apt-get install -y "linux-modules-extra-$(uname -r)" >/dev/null 2>&1 || true
      load_mod binder_linux "devices=binder,hwbinder,vndbinder" || load_mod binder_linux || true
    fi
    if lsmod 2>/dev/null | grep -q binder || grep -q binderfs /proc/filesystems 2>/dev/null; then
      green "  binder is available now."
    elif [[ -d /sys/kernel/security/binderfs ]]; then
      green "  ...binderfs is present in the kernel. That's fine."
    else
      red   "  No binder support detected. redroid will NOT start on this host."
      red   "  Linux server (e.g. Oracle Cloud): see ORACLE-CLOUD.md."
      red   "  Windows/WSL2: see WINDOWS-WSL2.md."
      OK=0
    fi
  fi
fi

# ashmem only needed on older kernels; memfd replaces it on 5.x+. Try, ignore failure.
load_mod ashmem_linux || yellow "  ashmem_linux not loaded (OK on kernel 5.x+ which uses memfd)."

echo
if [[ "$OK" -eq 1 ]]; then
  green "Host looks ready. Next:  ./phone.sh up"
else
  red "Host is missing binder support. The phones won't boot until that's fixed."
  red "See the 'Troubleshooting' section of README.md."
  exit 1
fi
