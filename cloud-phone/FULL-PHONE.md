# Upgrade to a "real" cloud phone (Play Store + ARM apps + root proxy)

The base `redroid:13` image is bare AOSP with no Google services, and on an x86
PC it can't run ARM-only apps. This builds a richer image with **GApps (Play
Store)**, **ARM translation** (run ARM apps on Intel/AMD), and **Magisk (root)**.

> ARM translation on x86 only works on **Android 11/12** (not 13). We use 11.

## 1. Build the upgraded image (on the Linux/WSL host)

```bash
cd ~
sudo apt-get install -y python3 python3-pip lzip unzip
git clone https://github.com/ayasa520/redroid-script.git
cd redroid-script
sudo pip3 install -r requirements.txt 2>/dev/null || sudo pip3 install requests tqdm
# Android 11 + gapps (-g) + ndk arm-translation (-n) + magisk (-m)
sudo python3 redroid.py 11.0.0 -g -n -m
```
When it finishes it prints the **new image name** (something like
`redroid/redroid:11.0.0-gapps-ndk-magisk`). Copy that exact name.

## 2. Point the cloud phone at the new image

```bash
cd ~/AfterQueryExpert/cloud-phone
# replace the tag below with the exact name the script printed
sed -i 's|^REDROID_IMAGE=.*|REDROID_IMAGE=PASTE_IMAGE_NAME_HERE|' .env
sudo docker compose down
sudo docker volume rm cloud-phone_phone1-data 2>/dev/null || true   # fresh start
sudo docker compose up -d phone1 web
```
Wait ~2-3 min for first boot (`sudo docker exec phone1 getprop sys.boot_completed`
returns `1`).

## 3. View it (audio disabled — redroid has no audio encoder)

```bash
sudo apt-get install -y scrcpy
PIP=$(sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' phone1)
adb connect $PIP:5555
scrcpy -s $PIP:5555 --no-audio --max-size 900 --max-fps 30
```

## 4. Play Store + apps
Open the **Play Store** on the phone, sign in with a Google account, install
Chrome and whatever you need. ARM apps now work via the translation layer.

## 5. SOCKS5 proxy with username/password (location spoof)
Because the image is rooted, use a root proxy app:
1. In Play Store install **ProxyDroid** (or **SocksDroid**).
2. Open it, set:
   - Host: `161.77.95.162`  Port: `22325`
   - User: `14aa1d4f37e18`   Password: `19efe095e4`
   - Proxy type: **SOCKS5**, enable **Global proxy** / **Auto connect**.
3. Turn it on. All the phone's traffic (including the browser) now exits through
   that proxy, so sites see the proxy's location.

(For the format `host:port:user:pass` you pasted, map them in that order.)

## Camera — honest status
redroid has no camera, and passing a real webcam through WSL2 → Docker → Android
is not practical. The virtual-camera (video file) path via v4l2loopback also
needs a host kernel module WSL2 doesn't ship. So camera is the one MoreLogin-style
feature this self-hosted setup can't realistically provide here.
