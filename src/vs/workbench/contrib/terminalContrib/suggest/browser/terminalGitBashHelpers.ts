/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Converts a Git Bash absolute path to a Windows absolute path.
 * Examples:
 *   "/"      => "C:\\"
 *   "/c/"    => "C:\\"
 *   "/c/Users/foo" => "C:\\Users\\foo"
 *   "/d/bar" => "D:\\bar"
 */
export function gitBashToWindowsPath(path: string, driveLetter?: string): string {
	// Dynamically determine the system drive (default to 'C:' if not set)
	const systemDrive = (driveLetter || 'C:').toUpperCase();
	// Handle root "/"
	if (path === '/') {
		return `${systemDrive}\\`;
	}
	const match = path.match(/^\/([a-zA-Z])(\/.*)?$/);
	if (match) {
		const drive = match[1].toUpperCase();
		const rest = match[2] ? match[2].replace(/\//g, '\\') : '\\';
		return `${drive}:${rest}`;
	}
	// Fallback: just replace slashes
	return path.replace(/\//g, '\\');
}

/**
 *
 * @param path A Windows-style absolute path (e.g., "C:\Users\foo").
 * Converts it to a Git Bash-style absolute path (e.g., "/c/Users/foo").
 * @returns The Git Bash-style absolute path.
 */
export function windowsToGitBashPath(path: string): string {
	// Convert Windows path (e.g. C:\Users\foo) to Git Bash path (e.g. /c/Users/foo)
	return path
		.replace(/^[a-zA-Z]:\\/, match => `/${match[0].toLowerCase()}/`)
		.replace(/\\/g, '/');
}
