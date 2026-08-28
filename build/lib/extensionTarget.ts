/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';

/**
 * Detects whether the current Linux system uses musl libc (Alpine Linux).
 * Mirrors the detection used in `node-vsce-sign` and the VS Code extension management.
 */
export function isAlpineLinux(): boolean {
	let content: string | undefined;
	for (const filePath of ['/etc/os-release', '/usr/lib/os-release']) {
		try {
			content = fs.readFileSync(filePath, 'utf8');
			break;
		} catch (err) {
			// ignore and try the next file
		}
	}
	return !!content && (content.match(/^ID=([^\u001b\r\n]*)/m) || [])[1] === 'alpine';
}

/**
 * The set of platform-specific marketplace target platforms, matching the `TargetPlatform` enum
 * in `src/vs/platform/extensions/common/extensions.ts` (excluding the non platform-specific
 * `web`/`universal`/`unknown`/`undefined` values).
 */
const supportedTargets = new Set([
	'win32-x64', 'win32-arm64',
	'linux-x64', 'linux-arm64', 'linux-armhf',
	'alpine-x64', 'alpine-arm64',
	'darwin-x64', 'darwin-arm64',
]);

/**
 * Normalizes an architecture (from `VSCODE_ARCH` or `process.arch`) to the suffix used
 * by the marketplace target platform identifiers.
 */
function toTargetArch(arch: string): string {
	switch (arch) {
		case 'arm': return 'armhf';
		default: return arch;
	}
}

/**
 * Returns the marketplace target platform (e.g. `win32-x64`, `linux-armhf`, `alpine-x64`)
 * for the given platform and architecture. Mirrors the `TargetPlatform` enum in
 * `src/vs/platform/extensions/common/extensions.ts`.
 *
 * @returns the target platform string, or `undefined` when the combination is not a supported
 * marketplace target (e.g. an unsupported OS or architecture such as `win32-ia32` or `linux-riscv64`).
 */
export function getExtensionTarget(platform: string, arch: string, isAlpine: () => boolean = isAlpineLinux): string | undefined {
	const targetArch = toTargetArch(arch);
	let target: string | undefined;
	switch (platform) {
		case 'darwin':
			target = `darwin-${targetArch}`;
			break;
		case 'win32':
			target = `win32-${targetArch}`;
			break;
		case 'linux':
			target = isAlpine() ? `alpine-${targetArch}` : `linux-${targetArch}`;
			break;
	}
	return target && supportedTargets.has(target) ? target : undefined;
}

/**
 * Reads an environment variable, ignoring empty values and unexpanded Azure Pipelines
 * macros (e.g. a literal `$(VSCODE_ARCH)` left in place when the variable is not defined).
 */
function readEnv(name: string): string | undefined {
	const value = process.env[name];
	if (!value || value.startsWith('$(')) {
		return undefined;
	}
	return value;
}

/**
 * Returns the marketplace target platform for the current build.
 *
 * Resolution order:
 * 1. `VSCODE_EXTENSION_TARGET` env, when set — an explicit override for cross-compilation
 *    scenarios where the target cannot be detected from the host (e.g. building the alpine
 *    target on a glibc host).
 * 2. `process.platform` + (`VSCODE_ARCH` ?? `process.arch`) + runtime alpine detection.
 */
export function getCurrentExtensionTarget(): string | undefined {
	const override = readEnv('VSCODE_EXTENSION_TARGET');
	if (override) {
		return override;
	}
	const arch = readEnv('VSCODE_ARCH') ?? process.arch;
	return getExtensionTarget(process.platform, arch);
}

/**
 * Derives the GitHub release asset name for a platform-specific extension from its name and
 * marketplace target platform. Platform-specific VS Code extensions are conventionally named
 * `<name>-<target>.vsix` where `<target>` is the marketplace target platform (e.g.
 * `my-ext-win32-x64.vsix`, `my-ext-linux-armhf.vsix`, `my-ext-darwin-arm64.vsix`).
 *
 * @throws when `target` is not a supported marketplace target platform.
 */
export function getPlatformSpecificAssetName(name: string, target: string): string {
	if (!supportedTargets.has(target)) {
		throw new Error(`Invalid target platform '${target}': expected one of [${[...supportedTargets]}]`);
	}
	return `${name}-${target}.vsix`;
}
