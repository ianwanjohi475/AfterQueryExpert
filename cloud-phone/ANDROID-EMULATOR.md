# Easiest free Android phones on Windows (no card, no Docker, no kernel)

This skips Docker/redroid entirely. The Android Emulator runs Android **directly
on Windows**. It's the simplest free way to get working phones — Play Store, apps,
proxy, fake GPS, and you can run **several at once** for multiple accounts.

**What it is NOT:** it runs on *your PC* (not a remote cloud), and it has no deep
anti-detect fingerprinting. If those two things are essential, you need the
redroid route (see README / WINDOWS-WSL2 / ORACLE-CLOUD). For everything else,
this is the easy path.

**You need:** Windows with virtualization on (it already is — Docker Desktop uses
it), about **8 GB+ RAM** for one or two phones, and ~10 GB free disk.

---

## Step 1 — Install Android Studio (includes the emulator)

1. Download from <https://developer.android.com/studio> and run the installer.
2. Click through the defaults. On first launch it runs a **Setup Wizard** —
   choose **Standard**, accept the licenses, let it download the SDK + emulator.

## Step 2 — Create your first phone

1. On the Android Studio welcome screen: **More Actions → Virtual Device Manager**
   (or **Device Manager**).
2. Click **Create Device** → pick e.g. **Pixel 6** → **Next**.
3. **System image:** pick a recent Android (e.g. **Tiramisu / API 33**) with the
   **"Google Play"** label (the Play-Store logo). This is what gives you a working
   Play Store. Click the **Download** link next to it, wait, then **Next → Finish**.
4. Back in the device list, press the ▶ **Play** button. Your phone boots in a
   window. Open the **Play Store**, sign in with a Google account, install apps. ✅

## Step 3 — More phones (multiple accounts)

Repeat Step 2 to create `Phone 2`, `Phone 3`, … Each is fully separate (own apps,
own logins). Start as many as your RAM allows (≈2–4 GB each). You can run several
at the same time from the Device Manager.

## Step 4 — Give a phone a proxy

The friendly way: while a phone is running, click the **`...` (Extended controls)**
on its toolbar → **Settings → Proxy** → enter your proxy host and port.

The exact way (per-phone): start it from a terminal. Open
**PowerShell** and run (replace the name + proxy):
```powershell
cd "$env:LOCALAPPDATA\Android\Sdk\emulator"
.\emulator -list-avds                       # see your phone names
.\emulator -avd Pixel_6_API_33 -http-proxy http://USER:PASS@HOST:PORT
```
Each phone can use a different proxy this way.

## Step 5 — Fake GPS / location

While a phone runs: **`...` Extended controls → Location**. Type any latitude /
longitude (or search a place) → **Set Location**. The phone now reports that spot.

---

## Quick tips

- **Runs slow?** Give the emulator more RAM/CPU: Device Manager → pencil/edit →
  **Show Advanced Settings** → raise RAM and cores. Close other heavy apps.
- **"VT-x/virtualization" error?** It's almost certainly fine since Docker works,
  but if not, enable virtualization in your PC's BIOS.
- **Want it lighter?** You don't need the whole Android Studio long-term — once set
  up, you can launch phones straight from the `emulator` command in Step 4.

## How this compares

| | Emulator (this) | redroid cloud phone |
|---|---|---|
| Cost | Free | Free |
| Card needed | No | No (PC) / Card for Oracle Cloud |
| Setup difficulty | **Easy** | Hard (kernel) / Medium (Oracle) |
| Play Store, apps, proxy, GPS | ✅ | ✅ |
| Multiple phones | ✅ (RAM-limited) | ✅ |
| Runs in the real cloud (PC off) | ❌ on your PC | ✅ on Oracle |
| Deep anti-detect fingerprint | ❌ | ⚠️ basic |

Start here if you just want working Android phones today. Move to the redroid
route later only if you specifically need a real always-on cloud server or
anti-detect.
