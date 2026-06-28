# Running the Cloud Phone on Windows (Docker Desktop / WSL2)

Read this fully once before starting. Your Windows PC **can** run the cloud phone,
but Windows' built-in Linux kernel (WSL2) is missing the `binder` feature Android
needs, so there's a one-time step where you build a kernel that has it. After
that, everything works.

**Honest expectation:** this is ~1–2 hours, mostly waiting on a compile. It's
copy-paste, but it's the command line. Take it one part at a time. Free.

You only do Parts 0–4 **once**. After that you just use `./phone.sh up`.

---

## Part 0 — Quick check (2 minutes): maybe it already works

Some WSL2 kernels already have what we need. Let's check before doing the hard part.

1. Open **PowerShell** (click Start, type `PowerShell`, Enter).
2. Run:
   ```powershell
   wsl -e bash -c "cat /proc/filesystems | grep binder && echo HAS_BINDER || echo NO_BINDER"
   ```
- If it prints **`HAS_BINDER`** → lucky you, skip to **Part 2**.
- If it prints **`NO_BINDER`** → continue to Part 1 (the normal case).

---

## Part 1 — Get an Ubuntu environment in WSL2

Docker Desktop uses WSL2, but you want your own Ubuntu to work in.

1. In PowerShell (as Administrator — right-click → Run as administrator):
   ```powershell
   wsl --install -d Ubuntu
   ```
2. If it asks you to reboot, do it, then it'll finish setting up Ubuntu and ask you
   to create a **username and password** (remember the password — you'll type it for
   `sudo`).
3. In Docker Desktop → **Settings → Resources → WSL Integration** → turn ON the
   toggle for **Ubuntu**, then **Apply & Restart**. (This lets you use `docker`
   from inside Ubuntu.)
4. Open **Ubuntu** (Start menu → Ubuntu). Every command from here on goes in this
   Ubuntu window unless it says PowerShell.

Verify Docker is reachable from Ubuntu:
```bash
docker --version
```

---

## Part 2 — Get the cloud-phone code onto your machine

Inside the **Ubuntu** window:
```bash
sudo apt update
sudo apt install -y git android-tools-adb
git clone -b claude/cloud-phone-app-1du6fr https://github.com/ianwanjohi475/AfterQueryExpert.git
cd AfterQueryExpert/cloud-phone
chmod +x *.sh
```
You now have all the files (`phone.sh`, `docker-compose.yml`, etc.) on your machine.

If Part 0 said **HAS_BINDER**, skip to **Part 5** now. Otherwise continue.

---

## Part 3 — Build a WSL2 kernel that has `binder` (the one-time hard part)

Still in **Ubuntu**:

```bash
# 1. Find your current WSL2 kernel version (note the number it prints)
uname -r

# 2. Install build tools
sudo apt install -y build-essential flex bison libssl-dev libelf-dev dwarves bc

# 3. Download the matching kernel source (this is Microsoft's WSL2 kernel)
cd ~
git clone --depth 1 https://github.com/microsoft/WSL2-Linux-Kernel.git
cd WSL2-Linux-Kernel

# 4. Start from the default WSL config
cp Microsoft/config-wsl .config
```

Now turn on the Android features. Run this block exactly — it appends the needed
options:
```bash
cat >> .config <<'EOF'
CONFIG_DMABUF_HEAPS=y
CONFIG_DMABUF_HEAPS_SYSTEM=y
CONFIG_STAGING=y
CONFIG_ASHMEM=y
CONFIG_ANDROID=y
CONFIG_ANDROID_BINDER_IPC=y
CONFIG_ANDROID_BINDERFS=y
CONFIG_ANDROID_BINDER_DEVICES="binder,hwbinder,vndbinder"
EOF
```

Build it (this is the slow part — 20–60 min depending on your PC):
```bash
make -j$(nproc)
```
When it finishes, the new kernel is at `arch/x86/boot/bzImage`. Copy it to your
Windows user folder:
```bash
mkdir -p /mnt/c/wsl
cp arch/x86/boot/bzImage /mnt/c/wsl/bzImage
```

---

## Part 4 — Tell WSL2 to use your new kernel

1. Open **PowerShell** and create the config file:
   ```powershell
   notepad "$env:USERPROFILE\.wslconfig"
   ```
   (Say **Yes** to create it.)
2. Paste this in, **save**, and close Notepad:
   ```
   [wsl2]
   kernel=C:\\wsl\\bzImage
   ```
3. Restart WSL from PowerShell:
   ```powershell
   wsl --shutdown
   ```
4. Reopen **Ubuntu** and confirm the new kernel + binder:
   ```bash
   cat /proc/filesystems | grep binder && echo "BINDER OK"
   ```
   If you see **BINDER OK**, the hard part is done forever. 🎉

---

## Part 5 — Run your cloud phones

In **Ubuntu**, in the `cloud-phone` folder:
```bash
cd ~/AfterQueryExpert/cloud-phone
cp .env.example .env          # default image includes Play Store
./phone.sh setup              # loads modules, checks everything
./phone.sh up                 # starts the phones + browser UI
./phone.sh list               # wait until phones show "device" (1-3 min)
./phone.sh web                # prints the browser link, e.g. http://localhost:8000
```
Open that link in your Windows browser → click a phone → you're controlling
Android. Then:
```bash
./phone.sh fingerprint phone1     # randomise its identity
./phone.sh proxy phone1 IP:PORT   # give it a proxy
```
Open the **Play Store** on the phone screen, sign in, install apps. Done.

---

## If something goes wrong

- **`make` fails** with a missing-tool error → install what it names, e.g.
  `sudo apt install -y <tool>`, then run `make -j$(nproc)` again (it resumes).
- **Still `NO_BINDER` after Part 4** → double-check `.wslconfig` points at the exact
  path `C:\wsl\bzImage`, you ran `wsl --shutdown`, and you fully reopened Ubuntu.
- **Phones stay `offline` in `./phone.sh list`** → wait 2–3 min (Android is booting).
  Still stuck after 5 min → binder isn't really loaded; recheck Part 0's command.
- **`docker: command not found` in Ubuntu** → redo Part 1 step 3 (WSL Integration).
- **Default image won't download** → in `.env` set
  `REDROID_IMAGE=redroid/redroid:13.0.0-latest` (works, but no Play Store).

This kernel work is exactly what you're avoiding paying MoreLogin for. Once it's
done, your PC is the server — free, forever.
