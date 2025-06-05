/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem, OS } from '../../../base/common/platform.js';
import type { IShellLaunchConfig, TerminalShellType, PosixShellType, WindowsShellType, GeneralShellType } from './terminal.js';

/**
 * Aggressively escape non-windows paths to prepare for being sent to a shell. This will do some
 * escaping inaccurately to be careful about possible script injection via the file path. For
 * example, we're trying to prevent this sort of attack: `/foo/file$(echo evil)`.
 */
export function escapeNonWindowsPath(path: string, shellType?: TerminalShellType): string {
	let newPath = path;
	if (newPath.includes('\\')) {
		newPath = newPath.replace(/\\/g, '\\\\');
	}

	// Shell-specific escaping
	switch (shellType) {
		case PosixShellType.Bash:
		case PosixShellType.Sh:
		case PosixShellType.Zsh:
		case WindowsShellType.GitBash:
			return escapeForPosixShell(newPath);
		case PosixShellType.Fish:
			return escapeForFishShell(newPath);
		case GeneralShellType.PowerShell:
			// PowerShell should be handled separately in preparePathForShell
			// but if we get here, use PowerShell escaping
			return escapeForPowerShell(newPath);
		default:
			// Default to POSIX shell escaping for unknown shells
			return escapeForPosixShell(newPath);
	}
}

/**
 * Escape path for POSIX-compatible shells (bash, sh, zsh, git bash)
 */
function escapeForPosixShell(path: string): string {
	let newPath = path;
	
	// Remove dangerous characters except single and double quotes, which we'll escape properly
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<]/g;
	newPath = newPath.replace(bannedChars, '');
	
	// If the path contains both single and double quotes, we need to use different escaping
	if (newPath.includes("'") && newPath.includes('"')) {
		// For paths with both quote types, escape using $'...' syntax
		// This allows us to escape single quotes with \'
		newPath = newPath.replace(/'/g, "\\'");
		return `$'${newPath}'`;
	} else if (newPath.includes("'")) {
		// Only single quotes: use the standard POSIX method
		newPath = newPath.replace(/'/g, "'\\''");
		return `'${newPath}'`;
	} else {
		// No single quotes (may have double quotes): wrap in single quotes
		return `'${newPath}'`;
	}
}

/**
 * Escape path for Fish shell
 */
function escapeForFishShell(path: string): string {
	let newPath = path;
	
	// Remove dangerous characters except quotes
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<]/g;
	newPath = newPath.replace(bannedChars, '');
	
	// If the path contains both single and double quotes, use double quotes and escape inner double quotes
	if (newPath.includes("'") && newPath.includes('"')) {
		newPath = newPath.replace(/"/g, '\\"');
		return `"${newPath}"`;
	} else if (newPath.includes("'")) {
		// Only single quotes: escape with backslashes
		newPath = newPath.replace(/'/g, "\\'");
		return `'${newPath}'`;
	} else {
		// No single quotes (may have double quotes): wrap in single quotes
		return `'${newPath}'`;
	}
}

/**
 * Escape path for PowerShell
 */
function escapeForPowerShell(path: string): string {
	let newPath = path;
	
	// Remove dangerous characters except quotes
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<]/g;
	newPath = newPath.replace(bannedChars, '');
	
	// If the path contains both single and double quotes, use double quotes and escape inner double quotes
	if (newPath.includes("'") && newPath.includes('"')) {
		newPath = newPath.replace(/"/g, '`"');
		return `"${newPath}"`;
	} else if (newPath.includes("'")) {
		// Only single quotes: use double single quotes to escape
		newPath = newPath.replace(/'/g, "''");
		return `'${newPath}'`;
	} else {
		// No single quotes (may have double quotes): wrap in single quotes
		return `'${newPath}'`;
	}
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
