# Access your cloud phone from anywhere (free, no card)

Once your phones are running (on your PC or a Linux box), this is how you reach
them the way you reach MoreLogin — from your real phone, your laptop, anywhere —
**without** exposing them naked on the internet. Both options below are free and
need no card.

The browser UI (`ws-scrcpy`, port 8000) has **no password**, so never just open
that port to the world. Pick one of these instead.

---

## Option 1 — Tailscale (recommended: private, secure, dead simple)

Tailscale builds a tiny private network between *your own* devices. Your phone and
your laptop see the cloud phone as if they were on the same Wi-Fi — encrypted, and
invisible to everyone else.

**On the host (where the phones run — your PC's Ubuntu/WSL2, or your Linux box):**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
It prints a link — open it, sign in (Google/GitHub/email, **no card**). Then get
this machine's Tailscale address:
```bash
tailscale ip -4        # e.g. 100.101.102.103
```

**On your phone / other laptop:**
1. Install the **Tailscale** app (App Store / Play Store / tailscale.com).
2. Sign in with the **same account**.
3. Open a browser and go to:
   ```
   http://100.101.102.103:8000      # the Tailscale IP from above
   ```
That's your cloud phone, controllable from anywhere. Only your logged-in devices
can reach it.

---

## Option 2 — Cloudflare Tunnel (a public https link you can open anywhere)

Gives you a real `https://something.trycloudflare.com` URL. Good if you want to
open it on a device where you can't install Tailscale. **Because the URL is
public and the UI has no login, add a password (Step B) — don't skip it.**

**A. Start a quick tunnel on the host:**
```bash
# install once
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
sudo install cloudflared /usr/local/bin/cloudflared

# run it (prints a https URL pointing at your web UI)
cloudflared tunnel --url http://localhost:8000
```
It prints a `https://...trycloudflare.com` link — open that anywhere.

**B. Put a password in front of it (important).** Run a tiny auth proxy so randoms
who guess the URL can't drive your phone:
```bash
# basic-auth in front of the UI using Caddy (one binary)
sudo apt-get install -y caddy 2>/dev/null || true
# create a hashed password
caddy hash-password --plaintext 'CHOOSE_A_PASSWORD'
```
Then point the tunnel at Caddy instead of 8000, with a Caddyfile like:
```
:9000 {
    basicauth { you THE_HASH_FROM_ABOVE }
    reverse_proxy localhost:8000
}
```
`caddy run` it, then `cloudflared tunnel --url http://localhost:9000`. Now the
public link asks for a username/password first.

---

## Which should you use?

| | Tailscale | Cloudflare Tunnel |
|---|---|---|
| Setup | Easiest | A bit more (add a password) |
| Who can reach it | Only your devices | Anyone with the link (so add auth) |
| Need a card | No | No |
| Best for | Almost everyone | Sharing / devices you can't install apps on |

**Start with Tailscale.** It's the simplest and safest, and it makes your
self-hosted phone feel exactly like a paid cloud phone — open it from your pocket,
anywhere.

> Reminder: this only works while the host machine is **on**. On your own PC, that
> means the phone is reachable whenever the PC is running. A truly always-on
> version needs an always-on Linux server (e.g. the free Oracle Cloud box in
> ORACLE-CLOUD.md — which does need a card at signup).
