/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import pkg from 'vs/platform/node/package';
import { URI as Uri } from 'vs/base/common/uri';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IShellLaunchConfig, ITerminalEnvironment } from 'vs/workbench/parts/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

/**
 * This module contains utility functions related to the environment, cwd and paths.
 */

export function mergeEnvironments(parent: platform.IProcessEnvironment, other?: ITerminalEnvironment): void {
	if (!other) {
		return;
	}

	// On Windows apply the new values ignoring case, while still retaining
	// the case of the original key.
	if (platform.isWindows) {
		for (const configKey in other) {
			let actualKey = configKey;
			for (const envKey in parent) {
				if (configKey.toLowerCase() === envKey.toLowerCase()) {
					actualKey = envKey;
					break;
				}
			}
			const value = other[configKey];
			_mergeEnvironmentValue(parent, actualKey, value);
		}
	} else {
		Object.keys(other).forEach((key) => {
			const value = other[key];
			_mergeEnvironmentValue(parent, key, value);
		});
	}
}

function _mergeEnvironmentValue(env: ITerminalEnvironment, key: string, value: string | null): void {
	if (typeof value === 'string') {
		env[key] = value;
	} else {
		delete env[key];
	}
}

export function sanitizeEnvironment(env: ITerminalEnvironment): void {
	// Remove keys based on strings
	const keysToRemove = [
		'ELECTRON_ENABLE_STACK_DUMPING',
		'ELECTRON_ENABLE_LOGGING',
		'ELECTRON_NO_ASAR',
		'ELECTRON_NO_ATTACH_CONSOLE',
		'ELECTRON_RUN_AS_NODE',
		'GOOGLE_API_KEY',
		'VSCODE_CLI',
		'VSCODE_DEV',
		'VSCODE_IPC_HOOK',
		'VSCODE_LOGS',
		'VSCODE_NLS_CONFIG',
		'VSCODE_NODE_CACHED_DATA_DIR',
		'VSCODE_PORTABLE',
		'VSCODE_PID',
		'VSCODE_PREVENT_FOREIGN_INSPECT'
	];
	keysToRemove.forEach((key) => {
		if (env[key]) {
			delete env[key];
		}
	});
}

export function addTerminalEnvironmentKeys(env: ITerminalEnvironment, locale: string | undefined, setLocaleVariables: boolean): void {
	env['TERM_PROGRAM'] = 'vscode';
	env['TERM_PROGRAM_VERSION'] = pkg.version;
	if (setLocaleVariables) {
		env['LANG'] = _getLangEnvVariable(locale);
	}
}

export function resolveConfigurationVariables(configurationResolverService: IConfigurationResolverService, env: ITerminalEnvironment, lastActiveWorkspaceRoot: IWorkspaceFolder | null): ITerminalEnvironment {
	Object.keys(env).forEach((key) => {
		const value = env[key];
		if (typeof value === 'string' && lastActiveWorkspaceRoot !== null) {
			env[key] = configurationResolverService.resolve(lastActiveWorkspaceRoot, value);
		}
	});
	return env;
}

function _getLangEnvVariable(locale?: string) {
	const parts = locale ? locale.split('-') : [];
	const n = parts.length;
	if (n === 0) {
		// Fallback to en_US to prevent possible encoding issues.
		return 'en_US.UTF-8';
	}
	if (n === 1) {
		// app.getLocale can return just a language without a variant, fill in the variant for
		// supported languages as many shells expect a 2-part locale.
		const languageVariants = {
			de: 'DE',
			en: 'US',
			es: 'ES',
			fi: 'FI',
			fr: 'FR',
			it: 'IT',
			ja: 'JP',
			ko: 'KR',
			pl: 'PL',
			ru: 'RU',
			zh: 'CN'
		};
		if (parts[0] in languageVariants) {
			parts.push(languageVariants[parts[0]]);
		}
	} else {
		// Ensure the variant is uppercase
		parts[1] = parts[1].toUpperCase();
	}
	return parts.join('_') + '.UTF-8';
}

export function getCwd(shell: IShellLaunchConfig, root?: Uri, customCwd?: string): string {
	if (shell.cwd) {
		return (typeof shell.cwd === 'object') ? shell.cwd.path : shell.cwd;
	}

	let cwd: string | undefined;

	// TODO: Handle non-existent customCwd
	if (!shell.ignoreConfigurationCwd && customCwd) {
		if (paths.isAbsolute(customCwd)) {
			cwd = customCwd;
		} else if (root) {
			cwd = paths.normalize(paths.join(root.fsPath, customCwd));
		}
	}

	// If there was no custom cwd or it was relative with no workspace
	if (!cwd) {
		cwd = root ? root.fsPath : os.homedir();
	}

	return _sanitizeCwd(cwd);
}

function _sanitizeCwd(cwd: string): string {
	// Make the drive letter uppercase on Windows (see #9448)
	if (platform.platform === platform.Platform.Windows && cwd && cwd[1] === ':') {
		return cwd[0].toUpperCase() + cwd.substr(1);
	}
	return cwd;
}

/**
 * Adds quotes to a path if it contains whitespaces
 */
export function preparePathForTerminal(path: string): string {
	if (platform.isWindows) {
		if (/\s+/.test(path)) {
			return `"${path}"`;
		}
		return path;
	}
	path = path.replace(/(%5C|\\)/g, '\\\\');
	const charsToEscape = [
		' ', '\'', '"', '?', ':', ';', '!', '*', '(', ')', '{', '}', '[', ']'
	];
	for (let i = 0; i < path.length; i++) {
		const indexOfChar = charsToEscape.indexOf(path.charAt(i));
		if (indexOfChar >= 0) {
			path = `${path.substring(0, i)}\\${path.charAt(i)}${path.substring(i + 1)}`;
			i++; // Skip char due to escape char being added
		}
	}
	return path;
}
