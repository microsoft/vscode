/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { osIsWindows } from './os';
import * as fs from 'fs/promises';

export async function isExecutable(filePath: string): Promise<boolean> {
	if (osIsWindows()) {
		return windowsExecutableExtensions.find(ext => filePath.endsWith(ext)) !== undefined;
	}
	try {
		const stats = await fs.stat(filePath);
		// On macOS/Linux, check if the executable bit is set
		return (stats.mode & 0o100) !== 0;
	} catch (error) {
		// If the file does not exist or cannot be accessed, it's not executable
		return false;
	}
}
const windowsExecutableExtensions: string[] = [
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
