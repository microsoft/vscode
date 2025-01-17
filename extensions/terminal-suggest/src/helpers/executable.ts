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
	'.cpl',   // Control Panel extension
	'.msc',   // Microsoft Management Console file
	'.scr',   // Screensaver file
	'.ps1',   // PowerShell script
	'.vbs',   // VBScript file
	'.js',    // JScript file
	'.wsf',   // Windows Script File
	'.msi',   // Windows Installer package
	'.msp',   // Windows Installer patch
	'.pif',   // Program Information File
	'.gadget',// Windows Gadget
	'.hta',   // HTML Application
	'.jar',   // Java Archive (requires Java runtime)
	'.py',    // Python script (requires Python interpreter)
	'.rb',    // Ruby script (requires Ruby interpreter)
	'.pl',    // Perl script (requires Perl interpreter)
	'.sh',    // Shell script (via WSL or third-party tools)
	'.ksh',   // KornShell script (via WSL or compatible shells)
	'.inf',   // Setup Information File
	'.scf',   // Shell Command File
	'.lnk',   // Shortcut file
	'.url',   // Internet shortcut
	'.vb',    // VBScript file
	'.vbe',   // VBScript Encoded Script file
	'.wsh',   // Windows Script Host settings file
	'.msh',   // Microsoft Shell script
	'.msh1',  // Monad Shell script
	'.msh2',  // Monad Shell script
	'.mshxml',// Monad Shell XML script
	'.msh1xml',// Monad Shell XML script
	'.msh2xml' // Monad Shell XML script
];
