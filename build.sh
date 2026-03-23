#!/usr/bin/env bash
#
# Build script for AI Email Copilot Chrome Extension
# Creates a clean .zip ready for Chrome Web Store upload.
#
# Usage:
#   ./build.sh           # default output: dist/ai-email-copilot-v<version>.zip
#   ./build.sh --dir     # only copy to dist/ without zipping (for local testing)
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
MANIFEST="$EXT_DIR/manifest.json"

# Read version from manifest.json
VERSION=$(python3 -c "import json; print(json.load(open('$MANIFEST'))['version'])")
ZIP_NAME="ai-email-copilot-v${VERSION}.zip"

echo "================================"
echo " AI Email Copilot - Build"
echo " Version: $VERSION"
echo "================================"
echo ""

# ── Validate ───────────────────────────────────────────────────────

echo "[1/4] Validating extension files..."

REQUIRED_FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup/popup.html"
  "popup/popup.js"
  "popup/popup.css"
  "ui/panel.js"
  "ui/panel.css"
  "utils/ollamaClient.js"
  "utils/promptBuilder.js"
  "utils/gmailParser.js"
  "utils/storage.js"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

MISSING=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$EXT_DIR/$file" ]; then
    echo "  ✗ Missing: extension/$file"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "ERROR: Required files are missing. Fix the above issues and retry."
  exit 1
fi

echo "  ✓ All required files present"

# ── Clean & Copy ───────────────────────────────────────────────────

echo "[2/4] Preparing dist/ directory..."

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/extension"

# Copy all extension files (exclude dotfiles, .DS_Store)
rsync -a \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  --exclude='.git*' \
  "$EXT_DIR/" "$DIST_DIR/extension/"

echo "  ✓ Files copied to dist/extension/"

# ── Zip ────────────────────────────────────────────────────────────

if [ "${1:-}" = "--dir" ]; then
  echo ""
  echo "[skip] --dir flag set, skipping zip."
  echo "  Output: $DIST_DIR/extension/"
  exit 0
fi

echo "[3/4] Creating zip archive..."

cd "$DIST_DIR/extension"
zip -r -q "$DIST_DIR/$ZIP_NAME" . \
  -x '*.DS_Store' \
  -x '__MACOSX/*'
cd "$ROOT_DIR"

ZIP_SIZE=$(du -h "$DIST_DIR/$ZIP_NAME" | awk '{print $1}')

echo "  ✓ $ZIP_NAME ($ZIP_SIZE)"

# ── Summary ────────────────────────────────────────────────────────

echo "[4/4] Validating zip contents..."

FILE_COUNT=$(zipinfo -1 "$DIST_DIR/$ZIP_NAME" | wc -l | awk '{print $1}')
echo "  ✓ $FILE_COUNT files in archive"

echo ""
echo "================================"
echo " Build complete!"
echo ""
echo " Output: dist/$ZIP_NAME"
echo " Size:   $ZIP_SIZE"
echo " Files:  $FILE_COUNT"
echo ""
echo " Next steps:"
echo "   1. Go to https://chrome.google.com/webstore/devconsole"
echo "   2. Click 'New Item' or update existing"
echo "   3. Upload dist/$ZIP_NAME"
echo "================================"
