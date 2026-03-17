/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export const copilotPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
	'win32-arm64', 'win32-x64',
];

/**
 * Returns a glob filter that strips @github/copilot platform packages and
 * prebuilt native modules for architectures other than the build target.
 * On stable builds, all copilot SDK dependencies are stripped entirely.
 */
export function getCopilotExcludeFilter(platform: string, arch: string, quality: string | undefined): string[] {
	const targetPlatformArch = `${platform}-${arch}`;
	const nonTargetPlatforms = copilotPlatforms.filter(p => p !== targetPlatformArch);

	// Strip wrong-architecture @github/copilot-{platform} packages.
	// All copilot prebuilds are stripped by .moduleignore; VS Code's own
	// node-pty is copied into the prebuilds location by a post-packaging task.
	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@github/copilot-${p}/**`);

	// Strip agent host SDK dependencies entirely from stable builds
	if (quality === 'stable') {
		excludes.push(
			'!**/node_modules/@github/copilot/**',
			'!**/node_modules/@github/copilot-sdk/**',
			'!**/node_modules/@github/copilot-*/**',
		);
	}

	return ['**', ...excludes];
}

/**
 * Copies VS Code's own node-pty binaries into the copilot SDK's
 * expected locations so the copilot CLI subprocess can find them at runtime.
 * The copilot-bundled prebuilds are stripped by .moduleignore;
 * this replaces them with the same binaries VS Code already ships, avoiding
 * new system dependency requirements.
 *
 * node-pty: `prebuilds/{platform}-{arch}/` (pty.node + spawn-helper)
 *
 * @param nodeModulesDir Absolute path to the node_modules directory that
 *   contains both the source binaries (node-pty) and the copilot SDK
 *   target directories.
 */
export function copyCopilotNativeDeps(platform: string, arch: string, quality: string | undefined, nodeModulesDir: string): void {
	// On stable builds the copilot SDK is stripped entirely -- nothing to copy into.
	if (quality === 'stable') {
		console.log(`[copyCopilotNativeDeps] Skipping -- stable build`);
		return;
	}

	const copilotBase = path.join(nodeModulesDir, '@github', 'copilot');
	const platformArch = `${platform === 'win32' ? 'win32' : platform}-${arch}`;

	const nodePtySource = path.join(nodeModulesDir, 'node-pty', 'build', 'Release');

	// Fail-fast: source binaries must exist on non-stable builds.
	if (!fs.existsSync(nodePtySource)) {
		throw new Error(`[copyCopilotNativeDeps] node-pty source not found at ${nodePtySource}`);
	}

	// Copy node-pty (pty.node + spawn-helper) into copilot prebuilds
	const copilotPrebuildsDir = path.join(copilotBase, 'prebuilds', platformArch);
	fs.mkdirSync(copilotPrebuildsDir, { recursive: true });
	fs.cpSync(nodePtySource, copilotPrebuildsDir, { recursive: true });
	console.log(`[copyCopilotNativeDeps] Copied node-pty from ${nodePtySource} to ${copilotPrebuildsDir}`);
}
