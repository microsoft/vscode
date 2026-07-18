/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { ensureNpmPackage, type EnsureNpmPackageOptions } from './npmPackage.ts';

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
];

function getCopilotOptionalNativePayloadFiles(platform: string): string[] {
	const files = [
		'prebuilds/*/computer.node',
		'prebuilds/*/computer-use-mcp',
		'prebuilds/*/computer-use-mcp.exe',
		'prebuilds/*/Copilot Computer Use.app/**',
		'prebuilds/*/CopilotComputerUse.exe',
		'prebuilds/*/keytar.node',
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
export function prepareBuiltInCopilotRipgrepShim(platform: string, arch: string, builtInCopilotExtensionDir: string, appNodeModulesDir: string): void {
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
	materializeBuiltInCopilotSdkPlatformFiles(copilotPackagePlatformArch, tgrepPlatformArch, copilotBase, appNodeModulesDir);
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

function materializeBuiltInCopilotSdkPlatformFiles(copilotPackagePlatformArch: string, tgrepPlatformArch: string, copilotBase: string, appNodeModulesDir: string): void {
	if (!copilotPlatforms.includes(copilotPackagePlatformArch)) {
		return;
	}

	const platformPackageDir = path.join(appNodeModulesDir, '@github', `copilot-${copilotPackagePlatformArch}`);
	if (!fs.existsSync(platformPackageDir)) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Copilot platform package not found at ${platformPackageDir}`);
	}

	copyRequiredDirectory(
		path.join(platformPackageDir, 'prebuilds', copilotPackagePlatformArch),
		path.join(copilotBase, 'sdk', 'prebuilds', copilotPackagePlatformArch),
		`Copilot SDK native prebuilds for ${copilotPackagePlatformArch}`
	);

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
