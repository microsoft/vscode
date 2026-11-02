#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$ROOT_DIR/.build/linux/deb/amd64/deb"

if [[ $# -gt 1 ]]; then
	echo "Usage: $0 [path/to/code-oss_amd64.deb]" >&2
	exit 2
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
	echo "dpkg-deb is required to extract the package." >&2
	exit 1
fi

DEB_FILE="${1:-}"
if [[ -z "$DEB_FILE" ]]; then
	while IFS= read -r candidate; do
		if dpkg-deb --contents "$candidate" >/dev/null 2>&1; then
			DEB_FILE="$candidate"
			break
		fi
	done < <(find "$PACKAGE_DIR" -maxdepth 1 -type f -name 'code-oss_*_amd64.deb' -printf '%T@ %p\n' 2>/dev/null | sort -nr | cut -d' ' -f2-)
fi

if [[ -z "$DEB_FILE" || ! -f "$DEB_FILE" ]]; then
	echo "No complete amd64 .deb found. Build one first with ./build-deb.sh." >&2
	exit 1
fi

if ! dpkg-deb --contents "$DEB_FILE" >/dev/null 2>&1; then
	echo "Invalid or incomplete Debian package: $DEB_FILE" >&2
	exit 1
fi

PACKAGE_NAME="$(dpkg-deb --field "$DEB_FILE" Package)"
ARCHITECTURE="$(dpkg-deb --field "$DEB_FILE" Architecture)"
VERSION="$(dpkg-deb --field "$DEB_FILE" Version | tr -c '[:alnum:].+-_' '_')"
if [[ "$PACKAGE_NAME" != "code-oss" || "$ARCHITECTURE" != "amd64" ]]; then
	echo "Expected code-oss amd64 package; found $PACKAGE_NAME ($ARCHITECTURE)." >&2
	exit 1
fi

APP_ROOT="$HOME/.local/opt/code-oss"
INSTALL_ID="$VERSION-$(sha256sum "$DEB_FILE" | cut -c1-12)"
INSTALL_DIR="$APP_ROOT/$INSTALL_ID"
LOCAL_BIN="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/com.visualstudio.CodeOSS.desktop"
UNSANDBOXED_LAUNCHER="$LOCAL_BIN/code-oss-no-sandbox"
UNSANDBOXED_DESKTOP_FILE="$DESKTOP_DIR/com.visualstudio.CodeOSS.no-sandbox.desktop"

mkdir -p "$APP_ROOT" "$LOCAL_BIN" "$DESKTOP_DIR"

if [[ ! -d "$INSTALL_DIR/usr/share/code-oss" ]]; then
	STAGING_DIR="$APP_ROOT/.extract-$INSTALL_ID-$$"
	mkdir -p "$STAGING_DIR"
	if ! dpkg-deb --extract "$DEB_FILE" "$STAGING_DIR"; then
		rm -rf "$STAGING_DIR"
		exit 1
	fi
	if [[ ! -x "$STAGING_DIR/usr/share/code-oss/bin/code-oss" || ! -f "$STAGING_DIR/usr/share/code-oss/resources/app/out/cli.js" ]]; then
		rm -rf "$STAGING_DIR"
		echo "Package extraction is missing the Code OSS launcher or app files." >&2
		exit 1
	fi
	mv "$STAGING_DIR" "$INSTALL_DIR"
fi

cd "$APP_ROOT"
rm -f current
ln -s "$INSTALL_ID" current
rm -f "$LOCAL_BIN/code-oss"
ln -s "$APP_ROOT/current/usr/share/code-oss/bin/code-oss" "$LOCAL_BIN/code-oss"
cat > "$UNSANDBOXED_LAUNCHER" <<EOF
#!/usr/bin/env sh
exec "$APP_ROOT/current/usr/share/code-oss/bin/code-oss" --no-sandbox "\$@"
EOF
chmod 755 "$UNSANDBOXED_LAUNCHER"

DESKTOP_EXEC="$LOCAL_BIN/code-oss"
DESKTOP_EXEC="${DESKTOP_EXEC//\\/\\\\}"
DESKTOP_EXEC="${DESKTOP_EXEC//\"/\\\"}"
DESKTOP_ICON="$APP_ROOT/current/usr/share/pixmaps/code-oss.png"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Trinoris Code Editor
Comment=Code Editing. Redefined.
GenericName=Text Editor
Exec="$DESKTOP_EXEC" %F
Icon=$DESKTOP_ICON
Type=Application
StartupNotify=false
StartupWMClass=com.visualstudio.CodeOSS
Categories=TextEditor;Development;IDE;
MimeType=application/x-code-oss-workspace;
Actions=new-empty-window;
Keywords=vscode;trinoris;

[Desktop Action new-empty-window]
Name=New Empty Window
Exec="$DESKTOP_EXEC" --new-window %F
Icon=$DESKTOP_ICON
EOF

cat > "$UNSANDBOXED_DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Trinoris Code Editor (No Chromium Sandbox)
Comment=Runs the per-user build with Chromium sandboxing disabled
Exec="$UNSANDBOXED_LAUNCHER" %F
Icon=$DESKTOP_ICON
Type=Application
StartupNotify=false
Categories=TextEditor;Development;IDE;
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
	update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

# Keep only the version just activated. Installer-created version directories
# end with the 12-character package hash; leave any unrelated data untouched.
for old_install in "$APP_ROOT"/*; do
	[[ -d "$old_install" && ! -L "$old_install" ]] || continue
	old_name="${old_install##*/}"
	[[ "$old_name" == "$INSTALL_ID" ]] && continue
	if [[ "$old_name" =~ -[[:xdigit:]]{12}$ ]]; then
		rm -rf -- "$old_install"
	fi
done

echo "Installed for this user: $INSTALL_DIR"
echo "Launcher: $LOCAL_BIN/code-oss"
echo "Desktop entry: $DESKTOP_FILE"
echo "No-sandbox launcher (reduced renderer isolation): $UNSANDBOXED_LAUNCHER"
echo "No-sandbox desktop entry: $UNSANDBOXED_DESKTOP_FILE"
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
	echo "Add $LOCAL_BIN to PATH to launch with: code-oss"
fi
