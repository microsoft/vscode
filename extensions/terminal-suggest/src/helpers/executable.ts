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


function resolveWindowsExecutableExtensions(configuredWindowsExecutableExtensions?: { [key: string]: boolean | undefined }): string[] {
	const resolvedWindowsExecutableExtensions: string[] = windowsDefaultExecutableExtensions;
	const excluded = new Set<string>();
	if (configuredWindowsExecutableExtensions) {
		for (const [key, value] of Object.entries(configuredWindowsExecutableExtensions)) {
			if (value === true) {
				resolvedWindowsExecutableExtensions.push(key);
			} else {
				excluded.add(key);
			}
		}
	}
	return Array.from(new Set(resolvedWindowsExecutableExtensions)).filter(ext => !excluded.has(ext));
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
