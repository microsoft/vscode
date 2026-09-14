/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IV8RuntimeCompatibility {
	readonly platform: NodeJS.Platform;
	readonly architecture: string;
	readonly electronVersion?: string;
}

/**
 * Returns V8 flags needed to avoid known runtime crashes without overriding an
 * explicit user choice.
 */
export function getV8CompatibilityFlags(runtime: IV8RuntimeCompatibility, configuredFlags: readonly string[]): string[] {
	if (runtime.platform !== 'darwin' || runtime.architecture !== 'arm64' || getMajorVersion(runtime.electronVersion) !== 42) {
		return [];
	}

	if (configuredFlags.some(hasExplicitMaglevFlag)) {
		return [];
	}

	// Electron 42 can hit V8 Maglev SIGTRAP crashes on macOS ARM64. The V8 fix
	// ships with Electron 43, so this compatibility flag is bounded to 42.
	return ['--no-maglev'];
}

function hasExplicitMaglevFlag(flags: string): boolean {
	return flags.trim().split(/\s+/).some(flag =>
		flag === '--maglev' ||
		flag.startsWith('--maglev=') ||
		flag === '--no-maglev' ||
		flag.startsWith('--no-maglev=')
	);
}

function getMajorVersion(version: string | undefined): number | undefined {
	if (!version) {
		return undefined;
	}

	const majorVersion = Number(version.split('.', 1)[0]);
	return Number.isNaN(majorVersion) || !Number.isInteger(majorVersion) ? undefined : majorVersion;
}
