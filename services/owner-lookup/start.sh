#!/bin/bash
set -e

CHROME_BIN="/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
CHROME_USER_DATA="/data/browser-session"
PORTAL_URL="https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic?prfNumber=3681&cadastralUnitCode=839914&outputType=html"

echo "Starting Xvfb on :99..."
Xvfb :99 -screen 0 1280x720x24 -ac &
XVFB_PID=$!
sleep 1

echo "Starting x11vnc on :99 (no password, port 5900)..."
x11vnc -display :99 -forever -nopw -rfbport 5900 -shared &
sleep 1

echo "Starting noVNC on port 6080..."
websockify --web /usr/share/novnc 6080 localhost:5900 &
NOVNC_PID=$!
sleep 1

mkdir -p "$CHROME_USER_DATA"

# Clean stale lock files from previous sessions (common when container restarts with persisting volume)
rm -f "$CHROME_USER_DATA/SingletonLock" "$CHROME_USER_DATA/SingletonSocket" "$CHROME_USER_DATA/SingletonCookie"

echo "Launching Chromium on DISPLAY=:99 with CDP on port 9222..."
DISPLAY=:99 "$CHROME_BIN" \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir="$CHROME_USER_DATA" \
  --window-size=1280,720 \
  "$PORTAL_URL" &
CHROME_PID=$!

sleep 3

echo ""
echo "========================================="
echo "  noVNC is running!"
echo "  Open http://localhost:6080/vnc.html"
echo "  Click 'Connect' to see the browser"
echo "========================================="
echo ""
echo "Steps to solve the captcha:"
echo "1. Open http://localhost:6080/vnc.html in your browser"
echo "2. Click 'Connect'"
echo "3. You'll see the Chromium browser with the ESKN Portal"
echo "4. Solve the reCAPTCHA"
echo "5. The cookies will be saved automatically"
echo "6. Close this tab when done ??? cookies persist!"
echo ""

echo "Starting Node.js app..."
cd /app
node dist/index.js &
NODE_PID=$!

wait $NODE_PID
