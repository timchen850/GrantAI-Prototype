#!/usr/bin/env bash
# Grange AI – macOS installer
# Downloads and installs the app without triggering Gatekeeper,
# because curl doesn't set the com.apple.quarantine flag that browsers do.

set -euo pipefail

REPO="timchen850/GrantAI-Prototype"
DMG_URL="https://github.com/${REPO}/releases/latest/download/Grange-AI-mac.dmg"
APP_NAME="Grange AI"
MOUNT="/tmp/grange-ai-mount"
TMP_DMG="/tmp/Grange-AI-mac.dmg"
DEST="${HOME}/Applications"

echo ""
echo "  Installing ${APP_NAME}…"
echo ""

# Download
echo "  ↓ Downloading…"
curl -# -L "${DMG_URL}" -o "${TMP_DMG}"

# Mount
echo "  ⊙ Mounting disk image…"
hdiutil attach "${TMP_DMG}" -nobrowse -quiet -mountpoint "${MOUNT}"

# Install
mkdir -p "${DEST}"
echo "  ⊙ Copying to ~/Applications…"
cp -r "${MOUNT}/${APP_NAME}.app" "${DEST}/"

# Strip any quarantine bit (belt-and-suspenders)
xattr -cr "${DEST}/${APP_NAME}.app" 2>/dev/null || true

# Unmount and clean up
hdiutil detach "${MOUNT}" -quiet 2>/dev/null || true
rm -f "${TMP_DMG}"

echo ""
echo "  ✓ Grange AI installed to ~/Applications"
echo "  ✓ Opening now…"
echo ""
open "${DEST}/${APP_NAME}.app"
