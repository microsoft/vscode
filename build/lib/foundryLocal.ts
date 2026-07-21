/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Platform/architecture combinations for which Foundry Local (on-device chat
 * dictation) provides a native runtime. Keyed as `<nodePlatform>-<nodeArch>`,
 * matching the `foundry-local-sdk` prebuild directories and the renderer's
 * `SUPPORTED_TARGETS`.
 */
export const foundryLocalPlatforms = [
	'darwin-arm64',
	'linux-x64',
	'linux-arm64',
	'win32-x64',
	'win32-arm64',
];

function foundryLocalCoreDir(nodeModulesRoot: string, platformKey: string): string {
	return path.join(nodeModulesRoot, 'foundry-local-sdk', 'foundry-local-core', platformKey);
}

/** The native core library filenames Foundry Local requires for a platform. */
function requiredCoreFiles(platform: string): string[] {
	const ext = platform === 'win32' ? '.dll' : platform === 'darwin' ? '.dylib' : '.so';
	const libPrefix = platform === 'win32' ? '' : 'lib';
	return [
		`Microsoft.AI.Foundry.Local.Core${ext}`,
		`${libPrefix}onnxruntime${ext}`,
		`${libPrefix}onnxruntime-genai${ext}`,
	];
}

function hasCoreLibraries(nodeModulesRoot: string, platformKey: string, platform: string): boolean {
	const dir = foundryLocalCoreDir(nodeModulesRoot, platformKey);
	return requiredCoreFiles(platform).every(file => fs.existsSync(path.join(dir, file)));
}

/**
 * Ensures the Foundry Local native core libraries (Foundry Local Core +
 * onnxruntime + onnxruntime-genai) for the *target* platform/arch are present
 * before packaging.
 *
 * `foundry-local-sdk`'s install script only fetches the core libraries for the
 * build host's RID (it keys off `os.platform()`/`os.arch()`), but VS Code
 * packaging cross-builds targets — e.g. the arm64 Windows/Linux product jobs run
 * on x64 agents. Without this, an arm64 package would ship the host's x64 core
 * libraries while the arm64 addon looks for arm64 ones, and dictation would fail
 * to initialize on the shipped target.
 *
 * The SDK's `install-standard.cjs` derives the RID from `os.platform()`/
 * `os.arch()` at load time, so we run it in a child process with those spoofed
 * to the target, which fetches the target-RID libraries into
 * `foundry-local-core/<target>/`. The packaging filter then keeps only the
 * target directory (see `getFoundryLocalExcludeFilter` in gulpfile.vscode.ts).
 *
 * Failures throw to fail the build, since a package missing its dictation core
 * libraries would ship broken.
 */
export function ensureFoundryLocalCorePackage(platform: string, arch: string, nodeModulesRoot = 'node_modules'): void {
	const platformKey = `${platform}-${arch}`;
	if (!foundryLocalPlatforms.includes(platformKey)) {
		return;
	}

	if (hasCoreLibraries(nodeModulesRoot, platformKey, platform)) {
		return;
	}

	const installScript = path.join(nodeModulesRoot, 'foundry-local-sdk', 'script', 'install-standard.cjs');
	if (!fs.existsSync(installScript)) {
		throw new Error(`[foundry-local] install script not found at ${installScript}`);
	}

	// Spoof os.platform()/os.arch() to the target so the SDK installer computes
	// the target RID and writes into foundry-local-core/<target>/, then require
	// the installer (which reads those values at load time).
	const runner = [
		'const os = require("os");',
		`os.platform = () => ${JSON.stringify(platform)};`,
		`os.arch = () => ${JSON.stringify(arch)};`,
		`require(${JSON.stringify(path.resolve(installScript))});`,
	].join('\n');

	const result = cp.spawnSync(process.execPath, ['-e', runner], { stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`[foundry-local] failed to fetch core libraries for ${platformKey} (exit code ${result.status})`);
	}

	if (!hasCoreLibraries(nodeModulesRoot, platformKey, platform)) {
		throw new Error(`[foundry-local] core libraries for ${platformKey} still missing after install`);
	}
}
