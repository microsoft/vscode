/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/**
 * The platforms that @github/copilot ships platform-specific packages for.
 * These are the `@github/copilot-{platform}` optional dependency packages.
 */
export const copilotPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
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
 * For platforms the copilot SDK doesn't natively support (e.g. alpine, armhf),
 * ALL platform packages are stripped - that's fine because the copilot CLI SDK
 * resolves `node-pty` from the embedder (VS Code) first via `hostRequire`,
 * falling back to its bundled copy only if the embedder can't provide it.
 */
export function getCopilotExcludeFilter(platform: string, arch: string): string[] {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const targetPlatformArch = `${nodePlatform}-${nodeArch}`;
	const nonTargetPlatforms = copilotPlatforms.filter(p => p !== targetPlatformArch);

	// Strip wrong-architecture @github/copilot-{platform} packages.
	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot-${p}/**`);

	return ['**', ...excludes];
}

/**
 * Returns the public @github/copilot-sdk runtime native addon files that must
 * survive app/remote packaging for the target platform.
 *
 * .moduleignore strips @github/copilot/prebuilds/** globally because the
 * internal extension SDK uses a copied sdk/prebuilds layout. Agent Host uses
 * the public SDK, whose runtime addon loader expects runtime.node in the root
 * prebuilds layout.
 */
export function getCopilotRuntimePrebuildFiles(platform: string, arch: string, nodeModulesRoot = 'node_modules'): string[] {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const targetPlatformArch = `${nodePlatform}-${nodeArch}`;
	const prebuildDir = path.posix.join(nodeModulesRoot, '@github', 'copilot', 'prebuilds', targetPlatformArch);

	return [
		path.posix.join(prebuildDir, 'runtime.node'),
	];
}

/**
 * Materializes the copilot CLI ripgrep shim directly inside the built-in copilot extension.
 *
 * This is used when copilot is shipped as a built-in extension so startup does
 * not need to create the shim at runtime. The destination layout matches the
 * runtime shim logic in the copilot extension:
 * - ripgrep:  node_modules/@github/copilot/sdk/ripgrep/bin/{platform-arch}
 * - marker:   node_modules/@github/copilot/shims.txt
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
	const tgrepPlatformArch = toCopilotTgrepPlatformArch(platform, arch);

	const extensionNodeModules = path.join(builtInCopilotExtensionDir, 'node_modules');
	const copilotBase = path.join(extensionNodeModules, '@github', 'copilot');
	const copilotSdkBase = path.join(copilotBase, 'sdk');
	if (!fs.existsSync(copilotSdkBase)) {
		throw new Error(`[prepareBuiltInCopilotRipgrepShim] Copilot SDK directory not found at ${copilotSdkBase}`);
	}
	pruneNonTargetCopilotSdkPrebuilds(platformArch, path.join(copilotSdkBase, 'prebuilds'), copilotPlatforms);
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
