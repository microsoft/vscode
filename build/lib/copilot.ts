/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureNpmPackage, materializeNpmPackageVersion, type EnsureNpmPackageOptions } from './npmPackage.ts';

/**
 * Options for {@link prepareBuiltInCopilotRipgrepShim}. Extends the npm packing
 * options with an override for the extension lockfile used to verify natives
 * fetched for the pinned version (defaults to the repo's copy; overridable in
 * tests).
 */
export interface PrepareBuiltInCopilotOptions extends EnsureNpmPackageOptions {
	extensionLockfilePath?: string;
}

/**
 * The platforms that @github/copilot ships platform-specific packages for.
 * These are the `@github/copilot-{platform}` optional dependency packages.
 */
export const copilotPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
	'linuxmusl-arm64', 'linuxmusl-x64',
	'win32-arm64', 'win32-x64',
];

/**
 * Converts VS Code build platform/arch to the values that Node.js reports
 * at runtime via `process.platform` and `process.arch`.
 *
 * The copilot SDK's `loadNativeModule` looks up native binaries under
 * `prebuilds/${process.platform}-${process.arch}/`, so the directory names
 * must match these runtime values exactly.
 */
function toNodePlatformArch(platform: string, arch: string): { nodePlatform: string; nodeArch: string } {
	// alpine is musl-linux; Node still reports process.platform === 'linux'
	let nodePlatform = platform === 'alpine' ? 'linux' : platform;
	let nodeArch = arch;

	if (arch === 'armhf') {
		// VS Code build uses 'armhf'; Node reports process.arch === 'arm'
		nodeArch = 'arm';
	} else if (arch === 'alpine') {
		// Legacy: { platform: 'linux', arch: 'alpine' } means alpine-x64
		nodePlatform = 'linux';
		nodeArch = 'x64';
	}

	return { nodePlatform, nodeArch };
}

/**
 * The platform-arch directories shipped by @vscode/ripgrep-universal.
 * These follow Node's `${process.platform}-${process.arch}` naming.
 * Alpine builds reuse the regular `linux-*` binaries (ripgrep is statically
 * linked enough to run on both glibc and musl).
 */
const ripgrepUniversalPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm', 'linux-arm64', 'linux-ia32', 'linux-x64',
	'linux-ppc64', 'linux-riscv64', 'linux-s390x',
	'win32-arm64', 'win32-ia32', 'win32-x64',
];

const copilotTgrepPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
	'linuxmusl-arm64', 'linuxmusl-x64',
	'win32-arm64', 'win32-x64',
];

const mxcArchitectures = ['x64', 'arm64'];

function toCopilotTgrepPlatformArch(platform: string, arch: string): string {
	if (platform === 'alpine') {
		return `linuxmusl-${arch}`;
	}
	if (arch === 'alpine') {
		return 'linuxmusl-x64';
	}

	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	return `${nodePlatform}-${nodeArch}`;
}

function toCopilotPackagePlatformArch(platform: string, arch: string): string {
	if (platform === 'alpine') {
		return `linuxmusl-${arch}`;
	}
	if (arch === 'alpine') {
		return 'linuxmusl-x64';
	}

	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	return `${nodePlatform}-${nodeArch}`;
}

const copilotOptionalNativePayloadDirs = [
	'clipboard',
	'foundry-local-sdk',
	'mxc-bin',
	'pvrecorder',
	'webview',
];

function getCopilotOptionalNativePayloadFiles(platform: string): string[] {
	const files = [
		// Computer Use ships under plugins/computer-use/** in current
		// @github/copilot platform packages. Do not productize it.
		'plugins/computer-use/**',
		'prebuilds/*/computer.node',
		'prebuilds/*/keytar.node',
		// macOS voice media-pause helper (MediaRemote adapter). Optional and
		// nested under prebuilds; keep it out of the product so universal
		// merge does not need to special-case the framework binary tree.
		'prebuilds/*/mediaremote-adapter/**',
	];

	if (platform !== 'win32') {
		files.push('prebuilds/*/cli-native.node');
	}

	return files;
}

/**
 * Returns a glob filter that strips @microsoft/mxc-sdk `bin/<arch>` payload for
 * architectures other than the build target. `@microsoft/mxc-sdk` ships a full
 * set of sandbox binaries for every architecture under `bin/<arch>/`; only the
 * build target's architecture is needed. Architectures that mxc-sdk does not
 * ship (e.g. armhf) strip every `bin/<arch>` directory.
 */
export function getMxcExcludeFilter(arch: string): string[] {
	const target = mxcArchitectures.includes(arch) ? arch : undefined;
	const nonTargetArchitectures = mxcArchitectures.filter(a => a !== target);

	return [
		'**',
		...nonTargetArchitectures.map(a => `!**/node_modules/@microsoft/mxc-sdk/bin/${a}/**`),
	];
}

/**
 * Returns a glob filter that strips @vscode/ripgrep-universal bin directories
 * for architectures other than the build target.
 */
export function getRipgrepExcludeFilter(platform: string, arch: string): string[] {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const target = `${nodePlatform}-${nodeArch}`;
	const nonTargetPlatforms = ripgrepUniversalPlatforms.filter(p => p !== target);

	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@vscode/ripgrep-universal/bin/${p}/**`);

	return ['**', ...excludes];
}

export function getCopilotTgrepExcludeFilter(platform: string, arch: string): string[] {
	const target = toCopilotTgrepPlatformArch(platform, arch);
	const nonTargetPlatforms = copilotTgrepPlatforms.filter(p => p !== target);

	return [
		'**',
		...nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot/tgrep/bin/${p}/**`),
		...nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot/sdk/tgrep/bin/${p}/**`),
	];
}

/**
 * Returns a glob filter that strips @github/copilot platform packages
 * for architectures other than the build target.
 *
 * Alpine uses the linuxmusl-* packages. Other platform package names follow
 * Node's `${process.platform}-${process.arch}` naming. If Copilot does not
 * ship the computed platform package (for example linux-arm for armhf builds),
 * this strips every known @github/copilot-* platform package.
 */
export function getCopilotExcludeFilter(platform: string, arch: string): string[] {
	const targetPlatformArch = toCopilotPackagePlatformArch(platform, arch);
	const nonTargetPlatforms = copilotPlatforms.filter(p => p !== targetPlatformArch);

	// Strip wrong-architecture @github/copilot-{platform} packages.
	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot-${p}/**`);

	return [
		'**',
		...excludes,
		'!**/node_modules/@github/copilot-*/copilot',
		'!**/node_modules/@github/copilot-*/copilot.exe',
	];
}

/**
 * Returns the public @github/copilot package files that must survive
 * app/remote packaging for the target platform.
 *
 * .moduleignore strips all @github/copilot-* platform packages globally.
 * Re-add the selected runtime package so Agent Host can launch its index.js
 * entrypoint and load runtime prebuilds. Keep the standalone SEA executable
 * and optional native payload trees out of the product build.
 */
export function getCopilotRuntimePrebuildFiles(platform: string, arch: string, nodeModulesRoot = 'node_modules'): string[] {
	const copilotPackagePlatformArch = toCopilotPackagePlatformArch(platform, arch);
	const copilotPlatformPackageDir = path.posix.join(nodeModulesRoot, '@github', `copilot-${copilotPackagePlatformArch}`);

	return [
		path.posix.join(copilotPlatformPackageDir, '**'),
		`!${path.posix.join(copilotPlatformPackageDir, 'copilot')}`,
		`!${path.posix.join(copilotPlatformPackageDir, 'copilot.exe')}`,
		...copilotOptionalNativePayloadDirs.map(dir => `!${path.posix.join(copilotPlatformPackageDir, dir, '**')}`),
		...getCopilotOptionalNativePayloadFiles(platform).map(file => `!${path.posix.join(copilotPlatformPackageDir, file)}`),
	];
}

/**
 * Ensures the selected @github/copilot-{platform} package is present before
 * packaging. npm only installs the host-compatible optional dependency, but
 * VS Code packaging can cross-build targets such as darwin-x64 on arm64 hosts.
 */
export function ensureCopilotPlatformPackage(platform: string, arch: string, nodeModulesRoot = 'node_modules', options: EnsureNpmPackageOptions = {}): void {
	const copilotPackagePlatformArch = toCopilotPackagePlatformArch(platform, arch);
	if (!copilotPlatforms.includes(copilotPackagePlatformArch)) {
		return;
	}

	const packageName = `@github/copilot-${copilotPackagePlatformArch}`;
	ensureNpmPackage(packageName, nodeModulesRoot, options);
}

/**
 * Materializes target-platform Copilot CLI SDK files directly inside the built-in copilot extension.
 *
 * This is used when copilot is shipped as a built-in extension so startup does
 * not need to create the shim at runtime. The Copilot VSIX is built once on the
 * Linux x64 host, so product packaging also restores target-platform SDK
 * natives from the selected @github/copilot-{platform} package.
 *
 * Note: `node-pty` is no longer shimmed. The copilot CLI SDK resolves
 * `node-pty` from the embedder (VS Code) via `hostRequire` and falls back to
 * its bundled copy only if that fails.
 *
 * Failures throw to fail the build because built-in packaging must guarantee
 * this artifact is present.
 */
export function prepareBuiltInCopilotRipgrepShim(platform: string, arch: string, builtInCopilotExtensionDir: string, appNodeModulesDir: string, options: PrepareBuiltInCopilotOptions = {}): void {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const platformArch = `${nodePlatform}-${nodeArch}`;
	const copilotPackagePlatformArch = toCopilotPackagePlatformArch(platform, arch);
	const tgrepPlatformArch = toCopilotTgrepPlatformArch(platform, arch);

	const extensionNodeModules = path.join(builtInCopilotExtensionDir, 'node_modules');
	const copilotBase = path.join(extensionNodeModules, '@github', 'copilot');
	const copilotSdkBase = path.join(copilotBase, 'sdk');
	if (!fs.existsSync(copilotSdkBase)) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Copilot SDK directory not found at ${copilotSdkBase}`);
	}
	materializeBuiltInCopilotSdkPlatformFiles(copilotPackagePlatformArch, tgrepPlatformArch, copilotBase, appNodeModulesDir, options);
	pruneNonTargetCopilotSdkPrebuilds(copilotPackagePlatformArch, path.join(copilotSdkBase, 'prebuilds'), copilotPlatforms);
	pruneNonTargetCopilotSdkPrebuilds(tgrepPlatformArch, path.join(copilotSdkBase, path.join('tgrep', 'bin')), copilotTgrepPlatforms);
	pruneNonTargetCopilotSdkPrebuilds(tgrepPlatformArch, path.join(copilotBase, path.join('tgrep', 'bin')), copilotTgrepPlatforms);

	const ripgrepSource = path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', platformArch);
	if (!fs.existsSync(ripgrepSource)) {
		const binDir = path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin');
		let diagnostics: string;
		try {
			diagnostics = fs.existsSync(binDir)
				? `Available bin entries: ${JSON.stringify(fs.readdirSync(binDir))}`
				: `bin directory does not exist at ${binDir}`;
		} catch (err) {
			diagnostics = `Failed to enumerate bin directory: ${err}`;
		}
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] ripgrep source not found at ${ripgrepSource} (build platform=${platform}, arch=${arch}, computed platformArch=${platformArch}). ${diagnostics}`);
	}

	const ripgrepDest = path.join(copilotSdkBase, 'ripgrep', 'bin', platformArch);
	const shimMarkerPath = path.join(copilotBase, 'shims.txt');

	try {
		fs.mkdirSync(ripgrepDest, { recursive: true });
		fs.cpSync(ripgrepSource, ripgrepDest, { recursive: true });

		fs.writeFileSync(shimMarkerPath, 'Shims created successfully');
		console.log(`[prepareBuiltInCopilotRipgrepShim] Materialized ripgrep shim for ${platformArch} in ${builtInCopilotExtensionDir}`);
	} catch (err) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Failed to materialize ripgrep shim for ${platformArch}: ${err}`);
	}
}

function materializeBuiltInCopilotSdkPlatformFiles(copilotPackagePlatformArch: string, tgrepPlatformArch: string, copilotBase: string, appNodeModulesDir: string, options: PrepareBuiltInCopilotOptions = {}): void {
	if (!copilotPlatforms.includes(copilotPackagePlatformArch)) {
		return;
	}

	// The SDK JavaScript shipped inside the built-in extension and the native
	// `runtime.node` it loads MUST be the same @github/copilot version: the JS
	// calls native functions the binary may not export (e.g. a newer CLI that
	// removed one), which throws at load. Source the native from a platform
	// package matching the EXTENSION's version rather than whatever app-root
	// currently has — the extension is intentionally pinned to a fixed CLI
	// version for the extension host while the agent host (app-root) keeps
	// updating, so the two versions diverge by design.
	const extVersion = readCopilotPackageVersion(copilotBase);
	const { dir: platformPackageDir, cleanup } = resolveVersionMatchedCopilotPlatformPackage(copilotPackagePlatformArch, extVersion, appNodeModulesDir, options);
	try {
		const sdkPrebuildsTarget = path.join(copilotBase, 'sdk', 'prebuilds', copilotPackagePlatformArch);
		copyRequiredDirectory(
			path.join(platformPackageDir, 'prebuilds', copilotPackagePlatformArch),
			sdkPrebuildsTarget,
			`Copilot SDK native prebuilds for ${copilotPackagePlatformArch}`
		);
		// Built-in materialization copies the whole prebuilds tree (not the gulp
		// exclude globs above), so drop mediaremote-adapter explicitly afterward.
		fs.rmSync(path.join(sdkPrebuildsTarget, 'mediaremote-adapter'), { recursive: true, force: true });

		if (!copilotTgrepPlatforms.includes(tgrepPlatformArch)) {
			return;
		}

		const tgrepSource = path.join(platformPackageDir, 'tgrep', 'bin', tgrepPlatformArch);
		copyRequiredDirectory(
			tgrepSource,
			path.join(copilotBase, 'tgrep', 'bin', tgrepPlatformArch),
			`Copilot tgrep for ${tgrepPlatformArch}`
		);
		copyRequiredDirectory(
			tgrepSource,
			path.join(copilotBase, 'sdk', 'tgrep', 'bin', tgrepPlatformArch),
			`Copilot SDK tgrep for ${tgrepPlatformArch}`
		);
	} finally {
		cleanup();
	}
}

/**
 * Resolves a `@github/copilot-{platform}` package directory whose version
 * matches `extVersion`, so the native copied into the built-in extension always
 * matches the extension's own SDK JavaScript.
 *
 * Prefers the app-root package when it already matches (no extra work), and
 * otherwise fetches the exact extension version into a temp dir. The extension
 * is pinned to a fixed CLI version for the extension host while the agent host
 * (app-root) keeps updating, so app-root will normally NOT match and the fetch
 * is the expected path once the two versions diverge. The fetched tarball is
 * verified against the SHA-512 the extension lockfile pins for that version
 * before extraction; resolution fails closed if that integrity is missing.
 */
function resolveVersionMatchedCopilotPlatformPackage(copilotPackagePlatformArch: string, extVersion: string, appNodeModulesDir: string, options: PrepareBuiltInCopilotOptions): { dir: string; cleanup: () => void } {
	const noop = () => { };
	const packageName = `@github/copilot-${copilotPackagePlatformArch}`;

	const appRootDir = path.join(appNodeModulesDir, '@github', `copilot-${copilotPackagePlatformArch}`);
	if (readOptionalPackageVersion(appRootDir) === extVersion) {
		return { dir: appRootDir, cleanup: noop };
	}

	const integrity = resolvePinnedPlatformPackageIntegrity(packageName, extVersion, options);
	const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-native-'));
	try {
		const stagedPackageDir = path.join(staged, `copilot-${copilotPackagePlatformArch}`);
		materializeNpmPackageVersion(packageName, extVersion, stagedPackageDir, integrity, options);
		console.log(`[prepareBuiltInCopilotRipgrepShim] ${packageName} in app-root does not match the built-in extension's @github/copilot@${extVersion}; using the version-matched package instead.`);
		return { dir: stagedPackageDir, cleanup: () => fs.rmSync(staged, { recursive: true, force: true }) };
	} catch (err) {
		fs.rmSync(staged, { recursive: true, force: true });
		throw err;
	}
}

/**
 * Reads the `sha512-...` integrity the built-in extension's lockfile pins for
 * `packageName` at `extVersion`. Fails closed: a missing lockfile, entry,
 * version mismatch, or integrity means the fetched native cannot be verified,
 * so the build must stop rather than ship an unverified binary.
 */
function resolvePinnedPlatformPackageIntegrity(packageName: string, extVersion: string, options: PrepareBuiltInCopilotOptions): string {
	const lockfilePath = options.extensionLockfilePath ?? path.join(import.meta.dirname, '..', '..', 'extensions', 'copilot', 'package-lock.json');

	let lock: { packages?: Record<string, { version?: string; integrity?: string }> };
	try {
		lock = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
	} catch (err) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Could not read ${lockfilePath} to verify ${packageName}@${extVersion}: ${err instanceof Error ? err.message : String(err)}`);
	}

	const entry = lock.packages?.[path.posix.join('node_modules', packageName)];
	if (!entry) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] ${packageName} is not recorded in ${lockfilePath}; refusing to fetch an unverifiable native.`);
	}
	if (entry.version !== extVersion) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] ${packageName} is pinned to ${entry.version} in ${lockfilePath} but the built-in extension is @github/copilot@${extVersion}; refusing to fetch an unverifiable native.`);
	}
	if (!entry.integrity) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] ${packageName}@${extVersion} has no integrity in ${lockfilePath}; refusing to fetch an unverifiable native.`);
	}
	return entry.integrity;
}

function readCopilotPackageVersion(copilotBase: string): string {
	const version = readOptionalPackageVersion(copilotBase);
	if (!version) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Could not read a version from ${path.join(copilotBase, 'package.json')}`);
	}
	return version;
}

function readOptionalPackageVersion(packageDir: string): string | undefined {
	try {
		const version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
		return typeof version === 'string' ? version : undefined;
	} catch {
		return undefined;
	}
}

function copyRequiredDirectory(source: string, target: string, description: string): void {
	if (!fs.existsSync(source)) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] ${description} not found at ${source}`);
	}

	fs.rmSync(target, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.cpSync(source, target, { recursive: true });
}

function pruneNonTargetCopilotSdkPrebuilds(targetPlatformArch: string, prebuildsDir: string, platformArchs: string[]): void {
	if (!fs.existsSync(prebuildsDir)) {
		return;
	}

	for (const platformArch of platformArchs) {
		if (platformArch === targetPlatformArch) {
			continue;
		}
		fs.rmSync(path.join(prebuildsDir, platformArch), { recursive: true, force: true });
	}
}
