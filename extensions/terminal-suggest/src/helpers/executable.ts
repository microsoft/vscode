/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { osIsWindows } from './os';
import * as fs from 'fs/promises';

export function isExecutable(filePath: string, configuredWindowsExecutableExtensions?: { [key: string]: boolean | undefined } | undefined): Promise<boolean> | boolean {
	if (osIsWindows()) {
		const resolvedWindowsExecutableExtensions = resolveWindowsExecutableExtensions(configuredWindowsExecutableExtensions);
		return resolvedWindowsExecutableExtensions.find(ext => filePath.endsWith(ext)) !== undefined;
	}
	return isExecutableUnix(filePath);
}

export async function isExecutableUnix(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		// On macOS/Linux, check if the executable bit is set
		return (stats.mode & 0o100) !== 0;
	} catch (error) {
		// If the file does not exist or cannot be accessed, it's not executable
		return false;
	}
}

let cachedWindowsExecutableExtensionsKey: string | undefined;
let cachedResolvedWindowsExecutableExtensions: string[] | undefined;

function resolveWindowsExecutableExtensions(configuredWindowsExecutableExtensions?: { [key: string]: boolean | undefined }): string[] {
	const cacheKey = getWindowsExecutableExtensionsCacheKey(configuredWindowsExecutableExtensions);
	if (cachedResolvedWindowsExecutableExtensions && cachedWindowsExecutableExtensionsKey === cacheKey) {
		return cachedResolvedWindowsExecutableExtensions;
	}

	const resolvedWindowsExecutableExtensions: string[] = [...windowsDefaultExecutableExtensions];
	const excluded = new Set<string>();
	const seen = new Set<string>();

	if (configuredWindowsExecutableExtensions) {
		for (const [key, value] of Object.entries(configuredWindowsExecutableExtensions)) {
			if (value === true) {
				resolvedWindowsExecutableExtensions.push(key);
			} else {
				excluded.add(key);
			}
		}
	}

	const filtered: string[] = [];
	for (const ext of resolvedWindowsExecutableExtensions) {
		if (excluded.has(ext) || seen.has(ext)) {
			continue;
		}
		seen.add(ext);
		filtered.push(ext);
	}

	cachedWindowsExecutableExtensionsKey = cacheKey;
	cachedResolvedWindowsExecutableExtensions = filtered;
	return filtered;
}

function getWindowsExecutableExtensionsCacheKey(configuredWindowsExecutableExtensions?: { [key: string]: boolean | undefined }): string | undefined {
	if (!configuredWindowsExecutableExtensions || Object.keys(configuredWindowsExecutableExtensions).length === 0) {
		return undefined;
	}

	let key = '';
	for (const ext of Object.keys(configuredWindowsExecutableExtensions).sort()) {
		const value = configuredWindowsExecutableExtensions[ext] === true ? '1' : '0';
		key += `${ext}:${value}|`;
	}
	return key;
}

export const windowsDefaultExecutableExtensions: string[] = [
	'.exe',   // Executable file
	'.bat',   // Batch file
	'.cmd',   // Command script
	'.com',   // Command file

	'.msi',   // Windows Installer package

	'.ps1',   // PowerShell script

	'.vbs',   // VBScript file
	'.js',    // JScript file
	'.jar',   // Java Archive (requires Java runtime)
	'.py',    // Python script (requires Python interpreter)
	'.rb',    // Ruby script (requires Ruby interpreter)
	'.pl',    // Perl script (requires Perl interpreter)
	'.sh',    // Shell script (via WSL or third-party tools)
];
