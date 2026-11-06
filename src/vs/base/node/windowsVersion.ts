/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { isWindows } from '../common/platform.js';

let versionInfo: { release: string; buildNumber: number } | undefined;

/**
 * Initializes the Windows version cache by reading from the registry.
 *
 * On Windows 8.1+, the `os.release()` function may return incorrect version numbers
 * due to the deprecated GetVersionEx API returning compatibility-shimmed values
 * when the application doesn't have a proper manifest. Reading from the registry
 * gives us the real version.
 *
 * See: https://github.com/microsoft/vscode/issues/197444
 */
export async function initWindowsVersionInfo() {
	if (versionInfo) {
		return;
	}

	if (!isWindows) {
		versionInfo = { release: os.release(), buildNumber: 0 };
		return;
	}

	let buildNumber: number | undefined;
	let release: string | undefined;
	try {
		const Registry = await import('@vscode/windows-registry');
		const versionKey = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';

		const build = Registry.GetStringRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentBuild');
		if (build !== undefined) {
			buildNumber = parseInt(build, 10);
			if (isNaN(buildNumber)) {
				buildNumber = undefined;
			}
		}

		const major = Registry.GetDWORDRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentMajorVersionNumber');
		const minor = Registry.GetDWORDRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentMinorVersionNumber');
		if (major !== undefined && minor !== undefined && build !== undefined) {
			release = `${major}.${minor}.${build}`;
		}
	} catch {
		// ignore
	} finally {
		versionInfo = {
			release: release || os.release(),
			buildNumber: buildNumber || getWindowsBuildNumberFromOsRelease()
		};
	}
}

/**
 * Gets Windows version information from the registry.
 * @returns The Windows version in Major.Minor.Build format (e.g., "10.0.19041")
 */
export async function getWindowsRelease(): Promise<string> {
	if (!versionInfo) {
		await initWindowsVersionInfo();
	}
	return versionInfo!.release;
}

/**
 * Gets the Windows build number from the registry.
 * @returns The Windows build number (e.g., 19041 for Windows 10 2004)
 */
export async function getWindowsBuildNumberAsync(): Promise<number> {
	if (!versionInfo) {
		await initWindowsVersionInfo();
	}
	return versionInfo!.buildNumber;
}

/**
 * Synchronous version of getWindowsBuildNumberAsync().
 * @returns The Windows build number (e.g., 19041 for Windows 10 2004)
 */
export function getWindowsBuildNumberSync(): number {
	if (versionInfo) {
		return versionInfo.buildNumber;
	} else {
		return isWindows ? getWindowsBuildNumberFromOsRelease() : 0;
	}
}

/**
 * Gets the cached Windows release string synchronously.
 * Falls back to os.release() if the cache hasn't been initialized yet.
 * @returns The Windows version in Major.Minor.Build format (e.g., "10.0.19041")
 */
export function getWindowsReleaseSync(): string {
	return versionInfo?.release ?? os.release();
}

/**
 * Parses the Windows build number from os.release().
 * This is used as a fallback when registry reading is not available.
 */
function getWindowsBuildNumberFromOsRelease(): number {
	const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
	if (osVersion && osVersion.length === 4) {
		return parseInt(osVersion[3], 10);
	}
	return 0;
}
