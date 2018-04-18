/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import pkg from 'vs/platform/node/package';
import Uri from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

/**
 * This module contains utility functions related to the environment, cwd and paths.
 */

export function mergeEnvironments(parent: IStringDictionary<string>, other: IStringDictionary<string>) {
	if (!other) {
		return;
	}

	// On Windows apply the new values ignoring case, while still retaining
	// the case of the original key.
	if (platform.isWindows) {
		for (let configKey in other) {
			let actualKey = configKey;
			for (let envKey in parent) {
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

function _mergeEnvironmentValue(env: IStringDictionary<string>, key: string, value: string | null) {
	if (typeof value === 'string') {
		env[key] = value;
	} else {
		delete env[key];
	}
}

export function createTerminalEnv(parentEnv: IStringDictionary<string>, shell: IShellLaunchConfig, cwd: string, locale: string, cols?: number, rows?: number): IStringDictionary<string> {
	const env = { ...parentEnv };
	if (shell.env) {
		mergeEnvironments(env, shell.env);
	}

	env['PTYPID'] = process.pid.toString();
	env['PTYSHELL'] = shell.executable;
	env['TERM_PROGRAM'] = 'vscode';
	env['TERM_PROGRAM_VERSION'] = pkg.version;
	if (shell.args) {
		if (typeof shell.args === 'string') {
			env[`PTYSHELLCMDLINE`] = shell.args;
		} else {
			shell.args.forEach((arg, i) => env[`PTYSHELLARG${i}`] = arg);
		}
	}
	env['PTYCWD'] = cwd;
	env['LANG'] = _getLangEnvVariable(locale);
	if (cols && rows) {
		env['PTYCOLS'] = cols.toString();
		env['PTYROWS'] = rows.toString();
	}
	env['AMD_ENTRYPOINT'] = 'vs/workbench/parts/terminal/node/terminalProcess';
	return env;
}

export function resolveConfigurationVariables(configurationResolverService: IConfigurationResolverService, env: IStringDictionary<string>, lastActiveWorkspaceRoot: IWorkspaceFolder): IStringDictionary<string> {
	Object.keys(env).forEach((key) => {
		if (typeof env[key] === 'string') {
			env[key] = configurationResolverService.resolve(lastActiveWorkspaceRoot, env[key]);
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

export function getCwd(shell: IShellLaunchConfig, root: Uri, configHelper: ITerminalConfigHelper): string {
	if (shell.cwd) {
		return shell.cwd;
	}

	let cwd: string;

	// TODO: Handle non-existent customCwd
	if (!shell.ignoreConfigurationCwd) {
		// Evaluate custom cwd first
		const customCwd = configHelper.config.cwd;
		if (customCwd) {
			if (paths.isAbsolute(customCwd)) {
				cwd = customCwd;
			} else if (root) {
				cwd = paths.normalize(paths.join(root.fsPath, customCwd));
			}
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
