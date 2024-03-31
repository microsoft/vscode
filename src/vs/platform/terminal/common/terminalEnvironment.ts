/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem, OS } from 'vs/base/common/platform';
import type { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';

/**
 * Aggressively escape non-windows paths to prepare for being sent to a shell. This will do some
 * escaping inaccurately to be careful about possible script injection via the file path. For
 * example, we're trying to prevent this sort of attack: `/foo/file$(echo evil)`.
 */
export function escapeNonWindowsPath(path: string): string {
	let newPath = path;
	if (newPath.includes('\\')) {
		newPath = newPath.replace(/\\/g, '\\\\');
	}
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<\"\']/g;
	newPath = newPath.replace(bannedChars, '');
	return `'${newPath}'`;
}

/**
 * Collapses the user's home directory into `~` if it exists within the path, this gives a shorter
 * path that is more suitable within the context of a terminal.
 */
export function collapseTildePath(path: string | undefined, userHome: string | undefined, separator: string): string {
	if (!path) {
		return '';
	}
	if (!userHome) {
		return path;
	}
	// Trim the trailing separator from the end if it exists
	if (userHome.match(/[\/\\]$/)) {
		userHome = userHome.slice(0, userHome.length - 1);
	}
	const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
	const normalizedUserHome = userHome.replace(/\\/g, '/').toLowerCase();
	if (!normalizedPath.includes(normalizedUserHome)) {
		return path;
	}
	return `~${separator}${path.slice(userHome.length + 1)}`;
}

/**
 * Sanitizes a cwd string, removing any wrapping quotes and making the Windows drive letter
 * uppercase.
 * @param cwd The directory to sanitize.
 */
export function sanitizeCwd(cwd: string): string {
	// Sanity check that the cwd is not wrapped in quotes (see #160109)
	if (cwd.match(/^['"].*['"]$/)) {
		cwd = cwd.substring(1, cwd.length - 1);
	}
	// Make the drive letter uppercase on Windows (see #9448)
	if (OS === OperatingSystem.Windows && cwd && cwd[1] === ':') {
		return cwd[0].toUpperCase() + cwd.substring(1);
	}
	return cwd;
}

/**
 * Determines whether the given shell launch config should use the environment variable collection.
 * @param slc The shell launch config to check.
 */
export function shouldUseEnvironmentVariableCollection(slc: IShellLaunchConfig): boolean {
	return !slc.strictEnv;
}
