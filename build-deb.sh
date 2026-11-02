#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export VSCODE_BUILD_PROFILE=minimal

SYSROOT_DIR="${VSCODE_SYSROOT_DIR:-/tmp/vscode-amd64-sysroot}"
export VSCODE_SYSROOT_DIR="$SYSROOT_DIR"
SYSROOT_TRIPLE_DIR="$SYSROOT_DIR/x86_64-linux-gnu"
SYSROOT="$SYSROOT_TRIPLE_DIR/x86_64-linux-gnu/sysroot"
TOOLCHAIN="$SYSROOT_TRIPLE_DIR/bin"
APP_DIR="$ROOT_DIR/../VSCode-linux-x64"
NODE_GYP="$ROOT_DIR/build/npm/gyp/node_modules/.bin/node-gyp"
NODE_ROOT="$(node -p 'require("path").dirname(require("path").dirname(process.execPath))')"
BUILD_APP=1

if [[ "${1:-}" == "--skip-app-build" ]]; then
	BUILD_APP=0
elif [[ $# -gt 0 ]]; then
	echo "Usage: $0 [--skip-app-build]" >&2
	exit 2
fi

if [[ ! -x "$NODE_GYP" ]]; then
	echo "Missing bundled node-gyp: $NODE_GYP" >&2
	exit 1
fi

if [[ ! -f "$NODE_ROOT/include/node/node.h" ]]; then
	echo "Node headers not found under $NODE_ROOT/include/node" >&2
	exit 1
fi

# Fetch or reuse the pinned glibc 2.28 toolchain sysroot.
SYSROOT_ARCH=amd64 VSCODE_SYSROOT_DIR="$SYSROOT_DIR" node --experimental-strip-types --input-type=module -e 'import { getVSCodeSysroot } from "./build/linux/debian/install-sysroot.ts"; await getVSCodeSysroot("amd64");'

if [[ ! -x "$TOOLCHAIN/x86_64-linux-gnu-g++" || ! -d "$SYSROOT" ]]; then
	echo "Pinned amd64 sysroot toolchain is incomplete at $SYSROOT_DIR" >&2
	exit 1
fi

export CC="$TOOLCHAIN/x86_64-linux-gnu-gcc"
export CXX="$TOOLCHAIN/x86_64-linux-gnu-g++"
export CFLAGS="--sysroot=$SYSROOT"
export CXXFLAGS="--sysroot=$SYSROOT"
export LDFLAGS="--sysroot=$SYSROOT -L$SYSROOT/usr/lib/x86_64-linux-gnu -static-libstdc++ -static-libgcc"

if [[ "$BUILD_APP" == 1 ]]; then
	# The -min-ci task only packages out-vscode-min; it does not rebuild the
	# workbench bundle. Compile the current source with the selected feature
	# profile before packaging so source fixes are included in the .deb.
	npm run gulp -- core-ci
	npm run gulp -- vscode-linux-x64-min-ci
fi

if [[ ! -d "$APP_DIR/resources/app/node_modules.asar.unpacked" ]]; then
	echo "Minimal Linux app bundle not found at $APP_DIR. Build it first or omit --skip-app-build." >&2
	exit 1
fi

# Catch incomplete/stale app output before rebuilding native modules or the .deb.
node --input-type=module - "$APP_DIR/resources/app/product.json" "$APP_DIR/resources/app/extensions/trinoris-coordination/package.json" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const [productPath, extensionPath] = process.argv.slice(2);
const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
const features = product.buildFeatures;
const failures = [];

if (product.buildProfile !== 'minimal') failures.push(`expected minimal build profile, got ${product.buildProfile ?? 'unset'}`);
if (features?.coordinationUI !== true) failures.push('Trinoris Coordination UI is disabled');
if (features?.copilotChat !== false) failures.push('Copilot Chat should be disabled');
if (features?.chatPanel !== false) failures.push('Chat panel should be disabled');
if (features?.terminal !== true) failures.push('Terminal must remain enabled');
if (features?.bundledExtensions !== '*' && !features?.bundledExtensions?.some(id => id.toLowerCase() === 'trinoris.coordination')) {
	failures.push('Trinoris Coordination is missing from the bundled extension allowlist');
}
if (!Array.isArray(product.builtInExtensionsEnabledWithAutoUpdates)) {
	failures.push('builtInExtensionsEnabledWithAutoUpdates must be an array');
} else if (product.builtInExtensionsEnabledWithAutoUpdates.some(id => id.toLowerCase() === 'github.copilot-chat')) {
	failures.push('Copilot Chat must not be in the built-in auto-update list');
}
if (product.defaultChatAgent !== undefined) failures.push('Copilot defaultChatAgent metadata should be absent');

try {
	const extension = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));
	if (`${extension.publisher}.${extension.name}`.toLowerCase() !== 'trinoris.coordination') {
		failures.push('bundled coordinator extension has the wrong identifier');
	}
	const extensionMain = path.resolve(path.dirname(extensionPath), extension.main ?? '');
	if (![extensionMain, `${extensionMain}.js`, `${extensionMain}.cjs`, `${extensionMain}.mjs`].some(fs.existsSync)) {
		failures.push('bundled coordinator extension entry point is missing');
	}
} catch {
	failures.push('Trinoris Coordination extension package is missing or invalid');
}

if (failures.length) {
	console.error(`Invalid minimal app bundle:\n- ${failures.join('\n- ')}`);
	process.exit(1);
}
console.log('Validated minimal profile, terminal, and Trinoris Coordination extension.');
NODE

# Native modules in the local npm tree may have been built with the host libc.
# Rebuild the runtime addons against the pinned sysroot and stage their .node
# files into the app bundle used by Debian packaging.
NATIVE_MODULES=(
	'@vscode/sqlite3'
	'@vscode/policy-watcher'
	'@vscode/spdlog'
	'kerberos'
	'node-pty'
	'native-keymap'
	'@parcel/watcher'
)

for module in "${NATIVE_MODULES[@]}"; do
	module_dir="$ROOT_DIR/node_modules/$module"
	if [[ ! -f "$module_dir/binding.gyp" ]]; then
		echo "Missing native module source: $module_dir/binding.gyp" >&2
		exit 1
	fi
	echo "Rebuilding $module against glibc 2.28 sysroot"
	(
		cd "$module_dir"
		"$NODE_GYP" rebuild --nodedir="$NODE_ROOT"
	)
done

APP_UNPACKED="$APP_DIR/resources/app/node_modules.asar.unpacked"
for module in "${NATIVE_MODULES[@]}"; do
	module_dir="$ROOT_DIR/node_modules/$module"
	while IFS= read -r -d '' binary; do
		relative_path="${binary#"$ROOT_DIR/node_modules/"}"
		destination="$APP_UNPACKED/$relative_path"
		mkdir -p "$(dirname "$destination")"
		cp "$binary" "$destination"
	done < <(find "$module_dir/build/Release" -type f -name '*.node' -print0)
done

npm run gulp -- vscode-linux-x64-prepare-deb
npm run gulp -- vscode-linux-x64-build-deb

artifact="$(find .build/linux/deb/amd64/deb -maxdepth 1 -type f -name '*.deb' -print -quit)"
if [[ -z "$artifact" ]]; then
	echo "Debian package was not produced." >&2
	exit 1
fi

if ! dpkg-deb --contents "$artifact" | grep -F 'resources/app/extensions/trinoris-coordination/package.json' >/dev/null; then
	echo "Debian package is missing the Trinoris Coordination extension." >&2
	exit 1
fi

echo "Built package: $artifact"
dpkg-deb --field "$artifact" Package Version Architecture Depends
