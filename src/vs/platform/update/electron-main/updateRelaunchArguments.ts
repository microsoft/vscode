/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { win32 } from '../../../base/common/path.js';
import { cwd } from '../../../base/common/process.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';

/**
 * Single-value string CLI arguments that define the installation's environment (data/extension dirs, locale, secret
 * storage, proxy, rendering, diagnostics). Preserved across an update relaunch so the relaunched instance does not fall
 * back to the defaults (e.g. an empty extensions dir). See #322663.
 */
const RELAUNCH_STRING_ARGUMENTS: readonly (keyof NativeParsedArgs)[] = [
	// Data & extension directories
	'user-data-dir',
	'extensions-dir',
	'builtin-extensions-dir',
	'extensions-download-dir',
	'shared-data-dir',
	'agents-user-data-dir',
	'agents-extensions-dir',
	'agent-plugins-dir',
	// Localization
	'locale',
	// Diagnostics
	'crash-reporter-directory',
	// Secret storage
	'password-store',
	// Proxy
	'proxy-server',
	'proxy-bypass-list',
	'proxy-pac-url',
	// Rendering / Chromium / tracing
	'force-device-scale-factor',
	'ozone-platform',
	'js-flags',
	'enable-tracing',
	'trace-startup-format',
	'trace-startup-file',
	'trace-startup-duration',
];

/**
 * Boolean CLI switches the user opted into for this installation (rendering, sandboxing, networking, persistent
 * opt-outs) and that should survive an update relaunch. See #322663.
 */
const RELAUNCH_FLAG_ARGUMENTS: readonly (keyof NativeParsedArgs)[] = [
	// Rendering / sandboxing
	'disable-gpu',
	'disable-lcd-text',
	'disable-chromium-sandbox',
	'disable-gpu-sandbox',
	'disable-dev-shm-usage',
	'enable-coi',
	'force-renderer-accessibility',
	'enable-rdp-display-tracking',
	// Networking
	'ignore-certificate-errors',
	'allow-insecure-localhost',
	// Persistent opt-outs / environment
	'disable-crash-reporter',
	'disable-telemetry',
	'disable-updates',
	'disable-workspace-trust',
	'disable-experiments',
	'disable-layout-restore',
	'use-inmemory-secretstorage',
];

const RELAUNCH_NEGATED_FLAG_ARGUMENTS = [
	'no-sandbox',
	'no-proxy-server',
] as const;

/**
 * Subset of {@link RELAUNCH_STRING_ARGUMENTS} whose values are file system paths. The installer relaunches the
 * application from the install directory, so relative values would resolve against a different working directory and
 * must be made absolute before they are carried forward.
 */
const RELAUNCH_PATH_ARGUMENTS: ReadonlySet<keyof NativeParsedArgs> = new Set([
	'user-data-dir',
	'extensions-dir',
	'builtin-extensions-dir',
	'extensions-download-dir',
	'shared-data-dir',
	'agents-user-data-dir',
	'agents-extensions-dir',
	'agent-plugins-dir',
	'crash-reporter-directory',
	'trace-startup-file',
]);

/**
 * Quotes a single argument per `CommandLineToArgvW` rules so it survives being appended to the relaunched `Code.exe`
 * command line even when it contains spaces or quotes (e.g. a path).
 */
export function quoteWindowsArgument(arg: string): string {
	if (arg.length > 0 && !/[ \t"]/.test(arg)) {
		return arg; // nothing to quote
	}

	let result = '"';
	let backslashes = 0;
	for (const ch of arg) {
		if (ch === '\\') {
			backslashes++;
		} else if (ch === '"') {
			result += '\\'.repeat(backslashes * 2 + 1) + '"';
			backslashes = 0;
		} else {
			result += '\\'.repeat(backslashes) + ch;
			backslashes = 0;
		}
	}
	result += '\\'.repeat(backslashes * 2) + '"';

	return result;
}

/**
 * Resolves a path-valued argument against the current working directory of this process, so it keeps pointing at the
 * same location once the installer relaunches the application from the install directory. Windows path semantics are
 * used explicitly because these arguments are only ever consumed by the Windows installer.
 */
function toAbsolutePath(value: string, currentWorkingDirectory: string): string {
	return win32.isAbsolute(value) ? value : win32.resolve(currentWorkingDirectory, value);
}

/**
 * Builds the Windows-quoted command line tail carrying the curated persistent arguments forward across an update
 * relaunch. Returns an empty string when there are no such arguments.
 */
export function getRelaunchArguments(args: NativeParsedArgs, rawArgs: readonly string[], currentWorkingDirectory: string = cwd()): string {
	const argv: string[] = [];

	for (const key of RELAUNCH_STRING_ARGUMENTS) {
		const value = args[key];
		if (typeof value === 'string' && value.length > 0) {
			argv.push(`--${key}=${RELAUNCH_PATH_ARGUMENTS.has(key) ? toAbsolutePath(value, currentWorkingDirectory) : value}`);
		}
	}

	for (const key of RELAUNCH_FLAG_ARGUMENTS) {
		if (args[key] === true) {
			argv.push(`--${key}`);
		}
	}

	// Everything after the `--` end-of-options marker is a positional argument (e.g. a file literally named
	// `--no-sandbox`) and must not be mistaken for a switch the user opted into.
	const endOfOptions = rawArgs.indexOf('--');
	const rawOptions = endOfOptions === -1 ? rawArgs : rawArgs.slice(0, endOfOptions);

	for (const key of RELAUNCH_NEGATED_FLAG_ARGUMENTS) {
		if (rawOptions.includes(`--${key}`)) {
			argv.push(`--${key}`);
		}
	}

	return argv.map(quoteWindowsArgument).join(' ');
}
