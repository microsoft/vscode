/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment, isLinux } from './platform.js';

/**
 * Options to be passed to the external program or shell.
 */
export interface CommandOptions {
	/**
	 * The current working directory of the executed program or shell.
	 * If omitted VSCode's current workspace root is used.
	 */
	cwd?: string;

	/**
	 * The environment of the executed program or shell. If omitted
	 * the parent process' environment is used.
	 */
	env?: { [key: string]: string };
}

export interface Executable {
	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command: string;

	/**
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 */
	isShellCommand: boolean;

	/**
	 * The arguments passed to the command.
	 */
	args: string[];

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: CommandOptions;
}

export interface ForkOptions extends CommandOptions {
	execArgv?: string[];
}

export const enum Source {
	stdout,
	stderr
}

/**
 * The data send via a success callback
 */
export interface SuccessData {
	error?: Error;
	cmdCode?: number;
	terminated?: boolean;
}

/**
 * The data send via a error callback
 */
export interface ErrorData {
	error?: Error;
	terminated?: boolean;
	stdout?: string;
	stderr?: string;
}

export interface TerminateResponse {
	success: boolean;
	code?: TerminateResponseCode;
	error?: any;
}

export const enum TerminateResponseCode {
	Success = 0,
	Unknown = 1,
	AccessDenied = 2,
	ProcessNotFound = 3,
}

export interface ProcessItem {
	name: string;
	cmd: string;
	pid: number;
	ppid: number;
	load: number;
	mem: number;

	children?: ProcessItem[];
}

/**
 * Sanitizes a VS Code process environment by removing all Electron/VS Code-related values.
 */
export function sanitizeProcessEnvironment(env: IProcessEnvironment, ...preserve: string[]): void {
	const set = preserve.reduce<Record<string, boolean>>((set, key) => {
		set[key] = true;
		return set;
	}, {});
	const keysToRemove = [
		/^ELECTRON_.+$/,
		/^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,
		/^SNAP(|_.*)$/,
		/^GDK_PIXBUF_.+$/,
	];
	const envKeys = Object.keys(env);
	envKeys
		.filter(key => !set[key])
		.forEach(envKey => {
			for (let i = 0; i < keysToRemove.length; i++) {
				if (envKey.search(keysToRemove[i]) !== -1) {
					delete env[envKey];
					break;
				}
			}
		});
}

/**
 * Remove dangerous environment variables that have caused crashes
 * in forked processes (i.e. in ELECTRON_RUN_AS_NODE processes)
 *
 * @param env The env object to change
 */
export function removeDangerousEnvVariables(env: IProcessEnvironment | undefined): void {
	if (!env) {
		return;
	}

	// Unset `DEBUG`, as an invalid value might lead to process crashes
	// See https://github.com/microsoft/vscode/issues/130072
	delete env['DEBUG'];

	// Strip flags from `NODE_OPTIONS` that can be used to load and run arbitrary
	// code, or to attach a debugger, in forked Node processes (for example
	// `--require`, `--import`, `--inspect`), while preserving benign tuning flags
	// such as `--max-old-space-size`.
	// See https://github.com/microsoft/vscode/issues/231076
	const nodeOptions = env['NODE_OPTIONS'];
	if (typeof nodeOptions === 'string') {
		const sanitized = sanitizeNodeOptions(nodeOptions);
		if (sanitized) {
			env['NODE_OPTIONS'] = sanitized;
		} else {
			delete env['NODE_OPTIONS'];
		}
	}

	if (isLinux) {
		// Unset `LD_PRELOAD`, as it might lead to process crashes
		// See https://github.com/microsoft/vscode/issues/134177
		delete env['LD_PRELOAD'];
	}
}

// https://nodejs.org/api/cli.html#node_optionsoptions
// `NODE_OPTIONS` flags that can be abused to load and execute arbitrary code, or
// to attach a debugger, in a forked Node.js process. Node accepts the value of a
// code-loading flag either as `--flag=value` or as a separate `--flag value`
// token, so both forms are accounted for when filtering.
const dangerousNodeOptions = new Set<string>([
	// Code loading and execution
	'--require', '-r',
	'--import',
	'--loader', '--experimental-loader',
	'--eval', '-e',
	// Debugger / inspector
	'--inspect', '--inspect-brk', '--inspect-port',
	'--inspect-publish-uid', '--inspect-wait',
	'--debug', '--debug-brk',
]);

/**
 * Removes code-injection and debugger flags from a `NODE_OPTIONS` value while
 * preserving benign flags. The value is tokenized the way Node.js parses
 * `NODE_OPTIONS` so that a flag value supplied as a separate `--flag value`
 * token is removed together with its flag and no dangling tokens are left
 * behind.
 *
 * @returns The sanitized value, or `undefined` if nothing safe remains.
 */
function sanitizeNodeOptions(nodeOptions: string): string | undefined {
	const tokens = splitNodeOptions(nodeOptions);
	const kept: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.startsWith('-')) {
			const equals = token.indexOf('=');
			const name = equals === -1 ? token : token.slice(0, equals);
			if (dangerousNodeOptions.has(name)) {
				// When the value is supplied as a separate token (no `=`), drop it
				// too so it cannot be reinterpreted or left behind as a stray
				// argument that breaks process startup.
				if (equals === -1 && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
					i++;
				}
				continue;
			}
		}
		kept.push(token);
	}
	if (kept.length === 0) {
		return undefined;
	}
	return kept.map(quoteNodeOption).join(' ');
}

/**
 * Splits a `NODE_OPTIONS` value into tokens the same way Node.js does: arguments
 * are separated by spaces, double quotes group characters (including spaces),
 * and a backslash escapes the following character while inside double quotes.
 */
function splitNodeOptions(nodeOptions: string): string[] {
	const tokens: string[] = [];
	let current: string | undefined;
	let inQuotes = false;
	for (let i = 0; i < nodeOptions.length; i++) {
		let char = nodeOptions[i];
		if (char === '\\' && inQuotes && i + 1 < nodeOptions.length) {
			char = nodeOptions[++i];
		} else if (char === '"') {
			inQuotes = !inQuotes;
			continue;
		} else if (char === ' ' && !inQuotes) {
			if (current !== undefined) {
				tokens.push(current);
				current = undefined;
			}
			continue;
		}
		current = current === undefined ? char : current + char;
	}
	if (current !== undefined) {
		tokens.push(current);
	}
	return tokens;
}

/**
 * Quotes a token for inclusion in a `NODE_OPTIONS` value. Only tokens containing
 * a space need quoting; `"` and `\` are escaped so the value round-trips through
 * Node's parser unchanged.
 */
function quoteNodeOption(token: string): string {
	if (token.indexOf(' ') === -1) {
		return token;
	}
	return `"${token.replace(/["\\]/g, '\\$&')}"`;
}
