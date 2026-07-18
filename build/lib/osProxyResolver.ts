/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ensureNpmPackage, type EnsureNpmPackageOptions } from './npmPackage.ts';

export const osProxyResolverPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm-gnueabihf', 'linux-arm64-gnu', 'linux-x64-gnu',
	'win32-arm64-msvc', 'win32-x64-msvc',
];

function toOSProxyResolverPlatform(platform: string, arch: string): string | undefined {
	switch (platform) {
		case 'darwin':
			return arch === 'arm64' || arch === 'x64' ? `darwin-${arch}` : undefined;
		case 'linux':
			switch (arch) {
				case 'arm':
				case 'armhf': return 'linux-arm-gnueabihf';
				case 'arm64': return 'linux-arm64-gnu';
				case 'x64': return 'linux-x64-gnu';
			}
			return undefined;
		case 'win32':
			return arch === 'arm64' || arch === 'x64' ? `win32-${arch}-msvc` : undefined;
	}
	return undefined;
}

export function getOSProxyResolverPlatformFiles(platform: string, arch: string, nodeModulesRoot = 'node_modules'): string[] {
	const target = toOSProxyResolverPlatform(platform, arch);
	return target ? [path.posix.join(nodeModulesRoot, '@vscode', `os-proxy-resolver-${target}`, '**')] : [];
}

export function getOSProxyResolverExcludeFilter(platform: string, arch: string): string[] {
	const target = toOSProxyResolverPlatform(platform, arch);
	return [
		'**',
		...osProxyResolverPlatforms
			.filter(candidate => candidate !== target)
			.map(candidate => `!**/node_modules/@vscode/os-proxy-resolver-${candidate}/**`),
	];
}

export function ensureOSProxyResolverPlatformPackage(platform: string, arch: string, nodeModulesRoot = 'node_modules', options: EnsureNpmPackageOptions = {}): void {
	const target = toOSProxyResolverPlatform(platform, arch);
	if (target) {
		ensureNpmPackage(`@vscode/os-proxy-resolver-${target}`, nodeModulesRoot, options);
	}
}
