# Self-Hosted Cloud Phone

A free, open-source "cloud phone" you run yourself — the same core technology
behind paid services like MoreLogin and GoLogin. It gives you one or more **real
Android devices** running in the cloud (or on your own machine) that you can see
and control **from any web browser**, install apps into, and route through
proxies.

This is honest about what it is: the *software* is free. The thing you pay a
service like MoreLogin for is the **server that runs it 24/7** — here, you supply
that (your own Linux PC, or a rented Linux machine that allows kernel modules).

## What you get

- **Multiple independent phones** (`phone1`, `phone2`, `phone3`, …) — each fully
  isolated, like separate devices. Easy to add more.
- **Browser access** — open a URL, see the phone screen, tap and type. Nothing to
  install on the device you're watching from (your laptop, your real phone, etc.).
- **Any app** — install any APK; optionally use a Google-Play image to sign in and
  install from the Play Store.
- **Per-phone HTTP proxy** — give each phone a different IP/proxy.

## Requirements (read this first — it's the catch)

| Need | Why |
|------|-----|
| A **Linux host** | Android-in-Docker needs the Linux `binder` kernel feature. A normal Linux PC/laptop works great. |
| `binder` kernel support | Most modern desktop Linux kernels have it. Many cheap cloud VPSes **block** it — see notes below. |
| Docker + Docker Compose v2 | Runs the containers. |
| `adb` (android-tools) | Installs apps and sets proxies. |

> **Will a cheap VPS work?** Often **no** — shared/OpenVZ VPSes can't load kernel
> modules. You need a **bare-metal** server, a **KVM VPS that allows custom kernel
> modules**, or just your **own Linux machine**. This is the real reason "free
> cloud phone hosting" is hard — it's a hosting limitation, not a software one.
>
> **Windows?** Use **WSL2**, but the default WSL kernel lacks `binder`; you'd need
> a custom WSL kernel compiled with binder. Doable but advanced.

## Quick start

```bash
cd cloud-phone

# 1. (optional) choose image/screen/Play Store
cp .env.example .env      # then edit if you want Google Play, see below

# 2. check the host and load kernel modules
chmod +x setup.sh phone.sh
./phone.sh setup

# 3. start the phones + browser UI
./phone.sh up

# 4. watch them boot (first boot ~1-3 min each)
./phone.sh list

# 5. open the browser UI
./phone.sh web           # prints http://<your-ip>:8000
```

In the browser UI you'll see each phone listed (by its adb address, e.g.
`localhost:5555`). Click one to open the live screen and control it.

## Installing apps

**Sideload any APK:**
```bash
./phone.sh apk phone1 ~/Downloads/whatsapp.apk
./phone.sh app phone1 com.whatsapp          # launch it
```

**Use the Google Play Store instead:** edit `.env` and set a GApps image, e.g.
```
REDROID_IMAGE=fahaddz/redroid:13
```
then `./phone.sh down && ./phone.sh up`. Open the Play Store on the phone, sign in
with a Google account, install apps normally. (GApps images are
community-maintained — the base `redroid` images contain no Google services by
design.)

## Per-phone proxy (different IP per phone)

```bash
./phone.sh proxy phone1 192.168.1.50:8888     # set a system-wide HTTP proxy
./phone.sh proxy phone2 user-proxy.example:3128
./phone.sh proxy phone1 clear                 # remove it
```
This sets Android's global HTTP proxy. For SOCKS5 or per-app routing, install a
proxy app (e.g. a SOCKS client) via `apk` and configure it inside the phone.

## Adding more phones

1. In `docker-compose.yml`, copy a `phoneN:` block. Change the name, the host port
   (the number before `:5555` — keep them unique, e.g. `5585:5555`), and the
   volume name.
2. Add the new volume under `volumes:`.
3. In `phone.sh`, add it to the `PORTS` map (e.g. `[phone4]=5585`).
4. `./phone.sh up`.

## Everyday commands

```bash
./phone.sh list                 # status of every phone
./phone.sh shell phone1         # root shell inside a phone
./phone.sh adb phone1 -- logcat # any adb command
./phone.sh down                 # stop, keep data
./phone.sh wipe                 # stop and erase everything (factory reset)
```

## Security warning

The browser UI (ws-scrcpy) has **no built-in login or encryption**. Do **not**
expose port `8000` (or the adb ports `555x`) directly to the public internet. Keep
them on a private network, or put them behind a VPN / SSH tunnel / an
authenticating reverse proxy (e.g. Caddy or nginx with basic-auth + TLS).

## Troubleshooting

- **Phones never leave `offline/booting`** → almost always missing `binder`.
  Re-run `./phone.sh setup` and read its output. If your kernel has no binder
  support, this host can't run redroid. Check: `cat /proc/filesystems | grep binder`.
- **`./phone.sh list` shows `offline`** for a minute or two after `up` → normal,
  Android is still booting. Wait and re-run.
- **Web UI shows no devices** → make sure phones are `device` state in
  `./phone.sh list` first; ws-scrcpy uses the host's adb.
- **Black screen / slow** → try `GPU_MODE=guest` in `.env` (software rendering).

## How it works (the tech behind MoreLogin/GoLogin)

- **[redroid](https://github.com/remote-android/redroid-doc)** — runs a full
  Android OS inside a Docker container. This is each "phone".
- **[ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy)** — streams the Android
  screen to a browser over WebSocket and sends your taps back.
- **adb** — the channel for installing apps and configuring each phone.

Paid services wrap this same idea in a billing dashboard, managed proxies, device-
fingerprint spoofing, and (most importantly) **server farms** they pay to keep
running. This project gives you the engine; you bring the machine.

## Sources / further reading

- redroid docs: <https://github.com/remote-android/redroid-doc>
- ws-scrcpy: <https://github.com/NetrisTV/ws-scrcpy>
- scrcpy: <https://github.com/Genymobile/scrcpy>
- redroid Docker images: <https://hub.docker.com/r/redroid/redroid>
