/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { NativeParsedArgs } from '../common/argv.js';

// This file used to be a pure JS file and was always
// importing `path` from node.js even though we ship
// our own version of the library and prefer to use
// that.
// However, resolution of user-data-path is critical
// and while our version of `path` is a copy of node.js
// one, you never know. As such, preserve the use of
// the built-in `path` lib for the time being.
// eslint-disable-next-line local/code-import-patterns
import { resolve, isAbsolute, join } from 'path';

const cwd = process.env['VSCODE_CWD'] || process.cwd();

/**
 * Returns the user data path to use with some rules:
 * - respect portable mode
 * - respect VSCODE_APPDATA environment variable
 * - respect --user-data-dir CLI argument
 */
export function getUserDataPath(cliArgs: NativeParsedArgs, productName: string): string {
	const userDataPath = doGetUserDataPath(cliArgs, productName);
	const pathsToResolve = [userDataPath];

	// If the user-data-path is not absolute, make
	// sure to resolve it against the passed in
	// current working directory. We cannot use the
	// node.js `path.resolve()` logic because it will
	// not pick up our `VSCODE_CWD` environment variable
	// (https://github.com/microsoft/vscode/issues/120269)
	if (!isAbsolute(userDataPath)) {
		pathsToResolve.unshift(cwd);
	}

	return resolve(...pathsToResolve);
}

function doGetUserDataPath(cliArgs: NativeParsedArgs, productName: string): string {

	// 0. Running out of sources has a fixed productName
	if (process.env['VSCODE_DEV']) {
		productName = 'code-oss-dev';
	}

	// 1. Support portable mode
	const portablePath = process.env['VSCODE_PORTABLE'];
	if (portablePath) {
		return join(portablePath, 'user-data');
	}

	// 2. Support global VSCODE_APPDATA environment variable
	let appDataPath = process.env['VSCODE_APPDATA'];
	if (appDataPath) {
		return join(appDataPath, productName);
	}

	// With Electron>=13 --user-data-dir switch will be propagated to
	// all processes https://github.com/electron/electron/blob/1897b14af36a02e9aa7e4d814159303441548251/shell/browser/electron_browser_client.cc#L546-L553
	// Check VSCODE_PORTABLE and VSCODE_APPDATA before this case to get correct values.
	// 3. Support explicit --user-data-dir
	const cliPath = cliArgs['user-data-dir'];
	if (cliPath) {
		return cliPath;
	}

	// 4. Otherwise check per platform
	switch (process.platform) {
		case 'win32':
			appDataPath = process.env['APPDATA'];
			if (!appDataPath) {
				const userProfile = process.env['USERPROFILE'];
				if (typeof userProfile !== 'string') {
					throw new Error('Windows: Unexpected undefined %USERPROFILE% environment variable');
				}

				appDataPath = join(userProfile, 'AppData', 'Roaming');
			}
			break;
		case 'darwin':
			appDataPath = join(homedir(), 'Library', 'Application Support');
			break;
		case 'linux':
			appDataPath = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
			break;
		default:
			throw new Error('Platform not supported');
	}

	return join(appDataPath, productName);
}
