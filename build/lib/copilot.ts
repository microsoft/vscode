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
 * Returns a glob filter that strips @github/copilot platform packages
 * for architectures other than the build target.
 *
 * For platforms the copilot SDK doesn't natively support (e.g. alpine, armhf),
 * ALL platform packages are stripped - that's fine because the SDK doesn't ship
 * binaries for those platforms anyway, and we replace them with VS Code's own.
 */
export function getCopilotExcludeFilter(platform: string, arch: string): string[] {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const targetPlatformArch = `${nodePlatform}-${nodeArch}`;
	const nonTargetPlatforms = copilotPlatforms.filter(p => p !== targetPlatformArch);

	// Strip wrong-architecture @github/copilot-{platform} packages.
	// All copilot prebuilds are stripped by .moduleignore; VS Code's own
	// node-pty is copied into the prebuilds location by a post-packaging task.
	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot-${p}/**`);

	return ['**', ...excludes];
}

/**
 * Copies VS Code's own node-pty binaries into the copilot SDK's
 * expected locations so the copilot CLI subprocess can find them at runtime.
 * The copilot-bundled prebuilds are stripped by .moduleignore;
 * this replaces them with the same binaries VS Code already ships, avoiding
 * new system dependency requirements.
 *
 * This works even for platforms the copilot SDK doesn't natively support
 * (e.g. alpine, armhf) because the SDK's native module loader simply
 * looks for `prebuilds/{process.platform}-{process.arch}/pty.node` - it
 * doesn't validate the platform against a supported list.
 *
 * Failures are logged but do not throw, to avoid breaking the build on
 * platforms where something unexpected happens.
 *
 * @param nodeModulesDir Absolute path to the node_modules directory that
 *   contains both the source binaries (node-pty) and the copilot SDK
 *   target directories.
 */
export function copyCopilotNativeDeps(platform: string, arch: string, nodeModulesDir: string): void {
	const { nodePlatform, nodeArch } = toNodePlatformArch(platform, arch);
	const platformArch = `${nodePlatform}-${nodeArch}`;

	const copilotBase = path.join(nodeModulesDir, '@github', 'copilot');
	if (!fs.existsSync(copilotBase)) {
		console.warn(`[copyCopilotNativeDeps] @github/copilot not found at ${copilotBase}, skipping`);
		return;
	}

	const nodePtySource = path.join(nodeModulesDir, 'node-pty', 'build', 'Release');
	if (!fs.existsSync(nodePtySource)) {
		console.warn(`[copyCopilotNativeDeps] node-pty source not found at ${nodePtySource}, skipping`);
		return;
	}

	try {
		// Copy node-pty (pty.node + spawn-helper on Unix, conpty.node + conpty/ on Windows)
		// into copilot prebuilds so the SDK finds them via loadNativeModule.
		const copilotPrebuildsDir = path.join(copilotBase, 'prebuilds', platformArch);
		fs.mkdirSync(copilotPrebuildsDir, { recursive: true });
		fs.cpSync(nodePtySource, copilotPrebuildsDir, { recursive: true });
		console.log(`[copyCopilotNativeDeps] Copied node-pty from ${nodePtySource} to ${copilotPrebuildsDir}`);
	} catch (err) {
		console.warn(`[copyCopilotNativeDeps] Failed to copy node-pty for ${platformArch}: ${err}`);
	}
}
