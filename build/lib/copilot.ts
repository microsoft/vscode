/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { ensureNpmPackage, type EnsureNpmPackageOptions } from './npmPackage.ts';

/**
 * The platforms that Copilot ships platform-specific packages for.
 */
export const copilotPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
	'linuxmusl-arm64', 'linuxmusl-x64',
	'win32-arm64', 'win32-x64',
];

/**
 * Product values that {@link renderCopilotShimLauncher} writes into `resources/win32/bin/copilot.sh`.
 */
export interface CopilotShimLauncherOptions {
	readonly commit: string;
	readonly quality: string;
	readonly applicationName: string;
	readonly dataFolderName: string;
	readonly serverDataFolderName: string;
}

/**
 * Renders the POSIX `copilot` launcher that Windows builds ship next to `copilot.exe` in `bin/copilot-shim`, so that
 * WSL, Git Bash, and Cygwin shells that use the Windows PATH get a `copilot` command, like `bin/code` next to `code.cmd`.
 */
export function renderCopilotShimLauncher(template: string, options: CopilotShimLauncherOptions): string {
	return template
		.replace(/@@COMMIT@@/g, () => options.commit)
		.replace(/@@QUALITY@@/g, () => options.quality)
		.replace(/@@APPNAME@@/g, () => options.applicationName)
		.replace(/@@DATAFOLDER@@/g, () => options.dataFolderName)
		.replace(/@@SERVERDATAFOLDER@@/g, () => options.serverDataFolderName);
}

export function getCopilotRuntimeVersion(nodeModulesRoot = 'node_modules'): string {
	const packageJsonPath = path.join(nodeModulesRoot, '@microsoft', 'copilot-sdk', 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { readonly copilotCliVersion?: string };
	const runtimeVersion = packageJson.copilotCliVersion;
	if (typeof runtimeVersion !== 'string' || !runtimeVersion) {
		throw new Error(`@microsoft/copilot-sdk is missing copilotCliVersion in ${packageJsonPath}.`);
	}

	return runtimeVersion;
}

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
	'builtin',
	'builtin-skills',
	'clipboard',
	'foundry-local-sdk',
	'pvrecorder',
	'webview',
];

const copilotOptionalNativePayloadFiles = [
	// Computer Use ships under plugins/computer-use/** in current
	// @microsoft/copilot-sdk platform packages. Do not productize it.
	'plugins/computer-use/**',
	'prebuilds/*/computer.node',
	'prebuilds/*/keytar.node',
	// macOS voice media-pause helper (MediaRemote adapter). Optional and
	// nested under prebuilds; keep it out of the product so universal
	// merge does not need to special-case the framework binary tree.
	'prebuilds/*/mediaremote-adapter/**',
];

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
 * Returns a glob filter that strips Copilot platform packages
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

	return [
		'**',
		...copilotPlatforms.map(p => `!**/node_modules/@github/copilot-${p}/**`),
		...nonTargetPlatforms.map(p => `!**/node_modules/@microsoft/copilot-sdk-${p}/**`),
	];
}

/**
 * Returns the SDK-owned runtime files that must survive app/remote packaging
 * for the target platform.
 *
 * .moduleignore strips all platform packages globally. Re-add the selected SDK
 * package while keeping optional native payloads out of the product build.
 */
export function getCopilotRuntimePrebuildFiles(platform: string, arch: string, nodeModulesRoot = 'node_modules'): string[] {
	const copilotPackagePlatformArch = toCopilotPackagePlatformArch(platform, arch);
	const copilotSdkPackageDir = path.posix.join(nodeModulesRoot, '@microsoft', `copilot-sdk-${copilotPackagePlatformArch}`);

	return [
		path.posix.join(copilotSdkPackageDir, '**'),
		...copilotOptionalNativePayloadDirs.map(dir => `!${path.posix.join(copilotSdkPackageDir, dir, '**')}`),
		...copilotOptionalNativePayloadFiles.map(file => `!${path.posix.join(copilotSdkPackageDir, file)}`),
	];
}

/**
 * Ensures the selected SDK platform package is present before packaging. npm
 * only installs host-compatible optional dependencies, but VS Code packaging
 * can cross-build targets such as darwin-x64 on arm64 hosts.
 */
export function ensureCopilotPlatformPackage(platform: string, arch: string, nodeModulesRoot = 'node_modules', options: EnsureNpmPackageOptions = {}): void {
	const copilotPackagePlatformArch = toCopilotPackagePlatformArch(platform, arch);
	if (!copilotPlatforms.includes(copilotPackagePlatformArch)) {
		return;
	}

	const packageName = `@microsoft/copilot-sdk-${copilotPackagePlatformArch}`;
	ensureNpmPackage(packageName, nodeModulesRoot, options);

	const packageDir = path.join(nodeModulesRoot, '@microsoft', `copilot-sdk-${copilotPackagePlatformArch}`);
	const requiredFiles = [
		'copilot-sdk/index.js',
		path.join('prebuilds', copilotPackagePlatformArch, platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime'),
		path.join('prebuilds', copilotPackagePlatformArch, 'runtime.node'),
	];
	const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(packageDir, file)));
	if (missingFiles.length > 0) {
		throw new Error(`[ensureCopilotPlatformPackage] ${packageName} is missing SDK runtime files: ${missingFiles.join(', ')}.`);
	}
}
