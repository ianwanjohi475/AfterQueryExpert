# Host your cloud phone on a FREE cloud server (Oracle Cloud)

This is the **easiest free way to get a real cloud phone** — one that lives on a
server on the internet, reachable from anywhere, not tied to your PC. Oracle Cloud
gives an **Always-Free** ARM Linux server (currently 2 CPUs / 12 GB RAM, free
forever). ARM is the native chip for Android, so apps run fast and there's **no
kernel building** like on Windows.

**Honest catches up front:**
- Sign-up needs a **credit/debit card for identity check** — Oracle does a small
  temporary authorisation, but Always-Free resources are **not charged**. If you
  truly have no card at all, this option won't work for you.
- The free ARM servers are popular and Oracle sometimes says **"out of capacity"**
  when you try to create one. You just retry (often a different
  Availability Domain, or try again later). Annoying but free.
- A cloud server is **public**, so security matters — we access the phone screen
  through a secure SSH tunnel, never an open port. (Covered below.)

---

## Step 1 — Create the free Oracle account

1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Fill in details, verify email, add the card for verification. Pick a **Home
   Region** close to you (you can't change it later).
3. Wait for the account to finish provisioning (a few minutes).

## Step 2 — Create the free ARM server

1. In the Oracle Cloud console: menu → **Compute → Instances → Create instance**.
2. **Name:** `cloudphone`.
3. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 22.04**.
   - Shape: **Change shape → Ampere (Arm) → VM.Standard.A1.Flex**. Set **2 OCPUs**
     and **12 GB** memory (the free allowance).
   - If you see **"Out of host capacity"**, change the *Availability Domain* at the
     top and retry, or try again in a few hours. (This is the one painful part.)
4. **Add SSH keys:** choose **Generate a key pair for me** and **Download** both the
   private and public key. Keep the **private** key safe — it's how you log in.
5. **Create**. Wait until the instance shows **Running**, and note its **Public IP
   address**.

## Step 3 — Open the SSH port (only SSH, nothing else)

Oracle usually opens SSH (port 22) by default. We will **not** open any other port —
the phone screen is reached through SSH, so it stays private. (If you ever can't
SSH in, check **Networking → Virtual Cloud Network → Security Lists** and ensure
port 22 is allowed from `0.0.0.0/0`.)

## Step 4 — Log in from your Windows PC

1. Move the downloaded private key somewhere simple, e.g. `C:\Users\YOU\cloudphone.key`.
2. Open **PowerShell** and connect (replace the IP and path):
   ```powershell
   icacls "C:\Users\YOU\cloudphone.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"
   ssh -i "C:\Users\YOU\cloudphone.key" ubuntu@YOUR_PUBLIC_IP
   ```
   Type `yes` the first time. You're now inside your cloud server.

## Step 5 — Install everything and run the phones

Paste these on the server (one block at a time):

```bash
# Docker + tools
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git android-tools-adb
sudo usermod -aG docker $USER && newgrp docker

# The binder kernel module Android needs (ships with Ubuntu, just install + load)
sudo apt-get install -y "linux-modules-extra-$(uname -r)"
sudo modprobe binder_linux devices=binder,hwbinder,vndbinder

# Get the code
git clone -b claude/cloud-phone-app-1du6fr https://github.com/ianwanjohi475/AfterQueryExpert.git
cd AfterQueryExpert/cloud-phone
chmod +x *.sh
cp .env.example .env

# Launch
./phone.sh setup       # confirms binder is loaded
./phone.sh up
./phone.sh list        # wait until phones show "device" (1-3 min)
```

Make binder load automatically on every reboot:
```bash
echo binder_linux | sudo tee /etc/modules-load.d/binder.conf
echo "options binder_linux devices=binder,hwbinder,vndbinder" | sudo tee /etc/modprobe.d/binder.conf
```

## Step 6 — See and control the phone from your own browser (securely)

The browser UI has no password, so **don't** open its port to the internet. Instead,
from your **Windows PowerShell**, open an SSH tunnel:
```powershell
ssh -i "C:\Users\YOU\cloudphone.key" -L 8000:localhost:8000 ubuntu@YOUR_PUBLIC_IP
```
Leave that window open, then in your browser go to:
```
http://localhost:8000
```
You'll see your phones — click one and control it. Everything travels encrypted
through SSH. 🎉

## Everyday use (same as anywhere)

```bash
./phone.sh apk phone1 app.apk        # install an app
./phone.sh proxy phone1 IP:PORT      # per-phone proxy
./phone.sh fingerprint phone1        # randomise identity
./phone.sh list                      # status
```
Open the **Play Store** on the phone screen, sign in, install apps.

---

## Other free options (and why Oracle wins)

| Option | Free? | Good for a persistent cloud phone? |
|---|---|---|
| **Oracle Cloud Always-Free ARM** | ✅ Forever | ✅ **Best** — real server, ARM, 12 GB RAM, runs 24/7 |
| Google Cloud / AWS free tier | ⚠️ Trial credit / tiny x86 | ❌ Too weak or expires; x86 needs ARM app translation |
| GitHub Codespaces / Colab | ✅ but temporary | ❌ Shuts down; can't load binder; not 24/7 |
| Appetize.io / Samsung Test Lab | ✅ limited minutes | ❌ For app *testing* only, time-limited, not yours |

Oracle's Always-Free ARM box is the one genuinely-free option that gives you a
real, always-on, ARM Android host. The only cost is the sign-up card check and the
occasional "out of capacity" retry.

## Troubleshooting

- **`modprobe binder_linux` fails** → ensure `linux-modules-extra-$(uname -r)` is
  installed; if your kernel was just updated, reboot first (`sudo reboot`), then
  reconnect and retry.
- **Can't SSH in** → check the key path/permissions (Step 4) and that the instance
  is **Running** with port 22 allowed.
- **Phones stuck `offline`** → wait 2-3 min; if still stuck, binder isn't loaded —
  re-run `./phone.sh setup` and read its output.
- **"Out of host capacity" on create** → switch Availability Domain or retry later;
  it's Oracle's free-tier demand, not your mistake.
