#!/usr/bin/env bash
# Build a single-file Linux AppImage for Code - OSS (for deployment without system packages).
#
# Prerequisites:
#   - curl or wget
#   - Same flow as other Linux packages: full gulp desktop build (see scripts/package-linux.sh)
#   - Optional: APPIMAGETOOL=/path/to/appimagetool.AppImage to skip download
#
# Output: .build/linux/appimage/<arch>/Code-OSS-<version>-<arch>.AppImage
#
# Usage:
#   ./scripts/package-appimage.sh
#   VSCODE_LINUX_ARCH=x64|arm64|armhf ./scripts/package-appimage.sh
#   SKIP_VSCODE_BUILD=1 ./scripts/package-appimage.sh   # only assemble + appimagetool (tree must exist)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ensure-nvm-node.sh
source "$SCRIPT_DIR/ensure-nvm-node.sh"

cd "$ROOT"

ARCH="${VSCODE_LINUX_ARCH:-x64}"
case "$ARCH" in
	x64|arm64|armhf) ;;
	*)
		echo "Unsupported VSCODE_LINUX_ARCH=$ARCH" >&2
		exit 1
		;;
esac

case "$ARCH" in
	x64) AI_ARCH=x86_64 ;;
	arm64) AI_ARCH=aarch64 ;;
	armhf) AI_ARCH=armhf ;;
esac

HOST_UNAME=$(uname -m)
case "$HOST_UNAME" in
	x86_64) TOOL_ARCH=x86_64 ;;
	aarch64) TOOL_ARCH=aarch64 ;;
	*)
		echo "Unsupported build machine uname=$HOST_UNAME (need x86_64 or aarch64 to run appimagetool)" >&2
		exit 1
		;;
esac

BINARY_PARENT="$(dirname "$ROOT")/VSCode-linux-${ARCH}"
if [[ ! -d "$BINARY_PARENT" || ! -x "$BINARY_PARENT/$(node -p "require('./product.json').applicationName")" ]]; then
	if [[ "${SKIP_VSCODE_BUILD:-}" == "1" ]]; then
		echo "Missing unpacked build at $BINARY_PARENT (run without SKIP_VSCODE_BUILD=1 first)" >&2
		exit 1
	fi
	echo "==> Building desktop bundle (vscode-linux-${ARCH})…"
	npm run gulp "vscode-linux-${ARCH}"
fi

APP_NAME=$(node -p "require('./product.json').applicationName")
NAME_LONG=$(node -p "require('./product.json').nameLong")
NAME_SHORT=$(node -p "require('./product.json').nameShort")
ICON_NAME=$(node -p "require('./product.json').linuxIconName")
VERSION=$(node -p "require('./package.json').version")

WORKDIR="$ROOT/.build/linux/appimage/${ARCH}"
APPDIR="$WORKDIR/AppDir"
OUTDIR="$WORKDIR/out"
rm -rf "$APPDIR" "$OUTDIR"
mkdir -p "$APPDIR/usr/share/${APP_NAME}" "$OUTDIR" "$ROOT/.build/tools"

echo "==> Staging AppDir from $BINARY_PARENT …"
cp -a "$BINARY_PARENT"/. "$APPDIR/usr/share/${APP_NAME}/"
chmod +x "$APPDIR/usr/share/${APP_NAME}/${APP_NAME}" || true

mkdir -p "$APPDIR/usr/share/icons/hicolor/512x512/apps"
cp -f "$ROOT/resources/linux/code.png" "$APPDIR/usr/share/icons/hicolor/512x512/apps/${ICON_NAME}.png"
# appimagetool expects Icon= at AppDir root (code-oss.png)
cp -f "$ROOT/resources/linux/code.png" "$APPDIR/${ICON_NAME}.png"

mkdir -p "$APPDIR/usr/share/applications"
DESKTOP="$APPDIR/usr/share/applications/${APP_NAME}.desktop"
sed -e "s/@@NAME_LONG@@/${NAME_LONG//\//\\/}/g" \
	-e "s/@@NAME_SHORT@@/${NAME_SHORT//\//\\/}/g" \
	-e "s/@@NAME@@/${APP_NAME}/g" \
	-e "s|@@EXEC@@|/usr/share/${APP_NAME}/${APP_NAME}|g" \
	-e "s/@@ICON@@/${ICON_NAME}/g" \
	"$ROOT/resources/linux/code.desktop" >"$DESKTOP"
# Route desktop entries through root AppRun (required for AppImage type 2)
sed -i "s|^Exec=/usr/share/${APP_NAME}/${APP_NAME} --new-window|Exec=AppRun --new-window|" "$DESKTOP"
sed -i "s|^Exec=/usr/share/${APP_NAME}/${APP_NAME} %F|Exec=AppRun %F|" "$DESKTOP"

ln -sf "usr/share/applications/${APP_NAME}.desktop" "$APPDIR/${APP_NAME}.desktop"

cat >"$APPDIR/AppRun" <<'APPRUN'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${0}")")"
export APPDIR="$HERE"
exec "${HERE}/usr/share/APP_NAME_PLACEHOLDER/APP_NAME_PLACEHOLDER" "$@"
APPRUN
sed -i "s/APP_NAME_PLACEHOLDER/${APP_NAME}/g" "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"

APPIMAGETOOL="${APPIMAGETOOL:-}"
if [[ -z "$APPIMAGETOOL" || ! -f "$APPIMAGETOOL" ]]; then
	CACHED="$ROOT/.build/tools/appimagetool-${TOOL_ARCH}.AppImage"
	if [[ ! -f "$CACHED" ]]; then
		URL="https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-${TOOL_ARCH}.AppImage"
		echo "==> Downloading appimagetool (${TOOL_ARCH})…"
		if command -v curl >/dev/null 2>&1; then
			curl -fsSL -o "$CACHED.tmp" "$URL" && mv "$CACHED.tmp" "$CACHED"
		else
			wget -q -O "$CACHED.tmp" "$URL" && mv "$CACHED.tmp" "$CACHED"
		fi
	fi
	chmod +x "$CACHED"
	APPIMAGETOOL="$CACHED"
fi

OUTNAME="Code-OSS-${VERSION}-${AI_ARCH}.AppImage"
OUTFILE="$OUTDIR/$OUTNAME"

echo "==> Running appimagetool (ARCH=$AI_ARCH)…"
export ARCH="$AI_ARCH"
# Avoid requiring FUSE on the build host when appimagetool itself is an AppImage
export APPIMAGE_EXTRACT_AND_RUN=1
"$APPIMAGETOOL" --verbose "$APPDIR" "$OUTFILE"

echo ""
echo "AppImage: $OUTFILE"
ls -la "$OUTFILE"
