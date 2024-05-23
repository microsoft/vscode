/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment, isLinux, isMacintosh } from 'vs/base/common/platform';

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

	if (isMacintosh) {
		// Unset `DYLD_LIBRARY_PATH`, as it leads to process crashes
		// See https://github.com/microsoft/vscode/issues/104525
		// See https://github.com/microsoft/vscode/issues/105848
		delete env['DYLD_LIBRARY_PATH'];
	}

	if (isLinux) {
		// Unset `LD_PRELOAD`, as it might lead to process crashes
		// See https://github.com/microsoft/vscode/issues/134177
		delete env['LD_PRELOAD'];
	}
}
