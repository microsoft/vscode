#!/usr/bin/env bash

#
# codesign-erdos.sh
#
# Comprehensive signing script for Erdos, adapted from Positron's approach
# Signs ALL binaries recursively to pass Apple notarization
#

set -e

if [ "$#" = "0" ] || [ "$1" = "--help" ]; then
	echo "Usage: codesign-erdos.sh [Erdos.app path] [codesign identity] [optional: output DMG name]"
	echo "Example: codesign-erdos.sh ./Erdos-darwin-arm64/Erdos.app 'Developer ID Application: Your Name (TEAMID)' Erdos-1.0.0"
	echo ""
	echo "This script will:"
	echo "  1. Sign all binaries in the Erdos.app recursively"
	echo "  2. Create a DMG containing the signed app"
	echo "  3. Sign the DMG for distribution"
	exit 0
fi

# read the package directory and identity
package="$1"
identity="$2"
dmg_name="${3:-Erdos}"

if [ -z "$identity" ]; then
	echo "Error: Missing codesign identity"
	echo "Usage: codesign-erdos.sh [Erdos.app path] [codesign identity] [optional: output DMG name]"
	exit 1
fi

# Validate that the app exists
if [ ! -d "$package" ]; then
	echo "Error: Erdos.app not found at: $package"
	exit 1
fi

# Get absolute paths
package="$(cd "$(dirname "$package")" && pwd)/$(basename "$package")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create entitlements file for Erdos
cat > /tmp/erdos-entitlements.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required by Electron/Chromium -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.cs.disable-executable-page-protection</key>
  <true/>
  
  <!-- Required for WebAssembly compilation in Electron -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  
  <!-- Required for Python/R integration -->
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  
  <!-- Required for file system access -->
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
  
  <!-- Network access -->
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  
  <!-- Camera/microphone for potential packages -->
  <key>com.apple.security.device.camera</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  
  <!-- Apple Events for automation -->
  <key>com.apple.security.automation.apple-events</key>
  <true/>
</dict>
</plist>
EOF

# recurse into hidden directories (that is, .webpack, node_modules)
shopt -s nullglob
shopt -s dotglob

# codesign flags for Erdos
codesign_args=(
	--sign "$identity"
	--options runtime
	--timestamp
	--entitlements /tmp/erdos-entitlements.plist
	--force
	--keychain login.keychain-db
)

codesign-file () {
	local file="$1"
	local base=$(basename "$file")
	
	# Skip certain file types that don't need signing
	case "$base" in
		*.txt|*.md|*.json|*.js|*.ts|*.css|*.html|*.svg|*.png|*.jpg|*.ico|*.woff*|*.ttf|*.otf)
			return 0
			;;
		*.plist|*.strings|*.nib|*.lproj)
			return 0
			;;
		*.pak|*.bin|*.dat|*.mp3)
			return 0
			;;
	esac
	
	# Check if file is a binary/executable or library
	if file "$file" | grep -q -E "(Mach-O|executable|dynamically linked|shared library)" 2>/dev/null; then
		echo "[i] Signing: $(basename "$file")"
		codesign "${codesign_args[@]}" "$file" 2>/dev/null || {
			echo "[w] Failed to sign: $(basename "$file") (may not be signable)"
		}
	fi
}

handle-vsix-file () {
	local vsix_file="$(realpath "$1")"
	local original_dir="$(pwd)"
	local vsix_base="$(basename "$vsix_file")"
	local vsix_dir="/tmp/${vsix_base%.vsix}_extracted_$$"
	
	echo "[i] Processing VSIX: $vsix_base"
	
	# Create temporary directory for extraction
	mkdir -p "$vsix_dir"
	
	# Extract the VSIX (it's a ZIP file)
	cd "$vsix_dir"
	unzip -q "$vsix_file" 2>/dev/null || {
		echo "[w] Failed to extract $vsix_base"
		cd "$original_dir"
		rm -rf "$vsix_dir"
		return 1
	}
	cd "$original_dir"
	
	# Recursively sign all binaries in the extracted VSIX
	codesign-directory "$vsix_dir"
	
	# Repackage the VSIX (replace original)
	cd "$vsix_dir"
	rm -f "$vsix_file"
	zip -r -q "$vsix_file" . || {
		echo "[w] Failed to repackage $vsix_base"
		cd "$original_dir"
		rm -rf "$vsix_dir"
		return 1
	}
	cd "$original_dir"
	
	# Clean up extraction directory
	rm -rf "$vsix_dir"
	
	echo "[i] Completed VSIX: $vsix_base"
}

codesign-directory () {
	local dir="$1"
	
	# first, recurse into directories (depth-first)
	for FILE in "$dir"/*; do
		if [ -d "${FILE}" ]; then
			codesign-directory "${FILE}"
		fi
	done

	# now, sign files in this directory
	for FILE in "$dir"/*; do
		if [ -f "${FILE}" ]; then
			# Check if this is a VSIX file that needs special handling
			if [[ "${FILE}" == *.vsix ]]; then
				handle-vsix-file "${FILE}"
			else
				codesign-file "${FILE}"
			fi
		fi
	done
}

echo "=========================================="
echo "Erdos Comprehensive Code Signing"
echo "=========================================="
echo "[i] Package: ${package}"
echo "[i] Identity: ${identity}"
echo "[i] Unlocking keychain to avoid repeated prompts..."

# Unlock the keychain once to avoid repeated prompts
security unlock-keychain ~/Library/Keychains/login.keychain-db 2>/dev/null || echo "[w] Could not unlock keychain - you may see prompts"

echo "[i] Starting recursive signing..."
echo "=========================================="

# Start recursive signing
codesign-directory "${package}"

echo "=========================================="
echo "[i] Re-signing main Electron binary"
codesign "${codesign_args[@]}" "${package}/Contents/MacOS/Electron"

echo "[i] Re-signing Electron Framework"
if [ -d "${package}/Contents/Frameworks/Electron Framework.framework" ]; then
	codesign "${codesign_args[@]}" "${package}/Contents/Frameworks/Electron Framework.framework"
fi

echo "[i] Re-signing Erdos Helper apps"
for helper_app in "${package}/Contents/Frameworks/Erdos Helper"*.app; do
	if [ -d "$helper_app" ]; then
		echo "[i] Re-signing $(basename "$helper_app")"
		codesign "${codesign_args[@]}" "$helper_app"
	fi
done

echo "[i] Re-signing other frameworks"
for framework in "${package}/Contents/Frameworks/"*.framework; do
	if [ -d "$framework" ] && [[ "$framework" != *"Electron Framework.framework" ]]; then
		echo "[i] Re-signing $(basename "$framework")"
		codesign "${codesign_args[@]}" "$framework"
	fi
done

echo "[i] Re-signing main app bundle"
codesign "${codesign_args[@]}" "${package}"

echo "=========================================="
echo "[i] Validating all signatures..."
codesign -vvv --deep --strict "${package}"

echo "=========================================="
echo "[✓] App signing completed!"
echo "[i] Creating DMG package..."
echo "=========================================="

# Create temporary directory for DMG contents
temp_dmg_dir="/tmp/erdos-dmg-$$"
mkdir -p "$temp_dmg_dir"

# Copy the signed app to the temporary directory
echo "[i] Copying signed Erdos.app to DMG staging area..."
cp -R "$package" "$temp_dmg_dir/"

# Create Applications symlink for easy installation
echo "[i] Creating Applications symlink..."
ln -s /Applications "$temp_dmg_dir/Applications"

# Determine output DMG path (same directory as the input app)
output_dir="$(dirname "$package")"
dmg_path="${output_dir}/${dmg_name}.dmg"

# Remove existing DMG if it exists
if [ -f "$dmg_path" ]; then
	echo "[i] Removing existing DMG: $dmg_path"
	rm -f "$dmg_path"
fi

echo "[i] Creating DMG: $dmg_path"
hdiutil create \
	-size 2g \
	-fs "APFS" \
	-volname "$dmg_name" \
	-srcfolder "$temp_dmg_dir" \
	-ov \
	-format "UDZO" \
	"$dmg_path"

# Clean up temporary directory
rm -rf "$temp_dmg_dir"

echo "=========================================="
echo "[i] Signing DMG..."
echo "=========================================="

# Sign the DMG
codesign "${codesign_args[@]}" "$dmg_path"

echo "[i] Validating DMG signature..."
codesign -vvv --deep --strict "$dmg_path"

echo "=========================================="
echo "[i] Starting notarization process..."
echo "=========================================="

# Check if we have notarization credentials
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_TEAM_ID" ]; then
    echo "[w] APPLE_ID and APPLE_TEAM_ID environment variables not set"
    echo "[i] Please set these variables for automatic notarization:"
    echo "    export APPLE_ID='your-apple-id@example.com'"
    echo "    export APPLE_TEAM_ID='YOUR_TEAM_ID'"
    echo "[i] Skipping notarization - you can run it manually with:"
    echo "    xcrun notarytool submit '$dmg_path' --apple-id \$APPLE_ID --team-id \$APPLE_TEAM_ID --password \$APP_PASSWORD --wait"
else
    echo "[i] Submitting DMG for notarization..."
    echo "[i] This may take several minutes..."
    
    # Submit for notarization
    if xcrun notarytool submit "$dmg_path" \
        --apple-id "$APPLE_ID" \
        --team-id "$APPLE_TEAM_ID" \
        --password "$APP_PASSWORD" \
        --wait; then
        
        echo "[i] Notarization successful! Stapling ticket to DMG..."
        xcrun stapler staple "$dmg_path"
        
        echo "[i] Validating stapled DMG..."
        xcrun stapler validate "$dmg_path"
        
        echo "=========================================="
        echo "[✓] Complete workflow finished!"
        echo "[i] Signed and notarized app: $package"
        echo "[i] Signed and notarized DMG: $dmg_path"
        echo "[i] Ready for distribution"
        echo "=========================================="
    else
        echo "[w] Notarization failed. DMG is signed but not notarized."
        echo "[i] You may need to check your Apple ID credentials or try again."
        echo "=========================================="
        echo "[✓] Signing workflow finished!"
        echo "[i] Signed app: $package"
        echo "[i] Signed DMG: $dmg_path"
        echo "[w] Manual notarization required"
        echo "=========================================="
    fi
fi

# Clean up
rm -f /tmp/erdos-entitlements.plist
