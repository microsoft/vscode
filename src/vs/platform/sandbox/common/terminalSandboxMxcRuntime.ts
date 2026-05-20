/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { win32 } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import type { ITerminalSandboxResolvedNetworkDomains } from './terminalSandboxService.js';

interface IWindowsMxcProcessConfig {
	commandLine: string;
	cwd?: string;
	env: string[];
	timeout: number;
}

interface IWindowsMxcFilesystemConfig {
	readwritePaths: string[];
	readonlyPaths: string[];
	deniedPaths: string[];
}

interface IWindowsMxcNetworkConfig {
	defaultPolicy: 'allow' | 'block';
	allowedHosts?: string[];
	blockedHosts?: string[];
}

interface IWindowsMxcConfig {
	version: string;
	containment: 'process';
	lifecycle: {
		destroyOnExit: boolean;
		preservePolicy: boolean;
	};
	process: IWindowsMxcProcessConfig;
	filesystem: IWindowsMxcFilesystemConfig;
	network: IWindowsMxcNetworkConfig;
	ui: {
		disable: boolean;
		clipboard: 'none';
		injection: boolean;
	};
}

export interface IWindowsMxcConfigOptions {
	command: string;
	shell: string | undefined;
	cwd: URI | undefined;
	tempDir: URI;
	allowNetwork: boolean;
	networkDomains: ITerminalSandboxResolvedNetworkDomains;
	allowReadPaths: string[];
	allowWritePaths: string[];
	denyReadPaths: string[];
	env: string[];
}

/**
 * Windows-only MXC integration for terminal sandboxing.
 *
 * This class is intentionally isolated from the SRT-backed runtime so it can be
 * removed once SRT supports Windows sandboxing.
 */
export class WindowsMxcTerminalSandboxRuntime {
	private static readonly _configVersion = '0.4.0-alpha';

	getExecutablePath(appRoot: string, arch: string | undefined): string {
		const binArch = arch === 'arm64' ? 'arm64' : 'x64';
		return win32.join(appRoot, 'node_modules', '@microsoft', 'mxc-sdk', 'bin', binArch, 'wxc-exec.exe');
	}

	getRuntimeReadPaths(appRoot: string | undefined, executablePath: string | undefined): string[] {
		const paths: string[] = [];
		if (appRoot) {
			paths.push(appRoot);
		}
		if (executablePath) {
			paths.push(executablePath, win32.dirname(executablePath));
		}
		return [...new Set(paths)];
	}

	createConfig(options: IWindowsMxcConfigOptions): IWindowsMxcConfig {
		const tempDirPath = this.toWindowsPath(options.tempDir);
		return {
			version: WindowsMxcTerminalSandboxRuntime._configVersion,
			containment: 'process',
			lifecycle: {
				destroyOnExit: true,
				preservePolicy: false,
			},
			process: {
				commandLine: this._createProcessCommandLine(options.command, options.shell),
				cwd: options.cwd ? this.toWindowsPath(options.cwd) : tempDirPath,
				env: [
					`TEMP=${tempDirPath}`,
					`TMP=${tempDirPath}`,
					...options.env
				],
				timeout: 0,
			},
			filesystem: {
				readwritePaths: options.allowWritePaths,
				readonlyPaths: options.allowReadPaths,
				deniedPaths: []
				// deniedPaths: options.denyReadPaths,
			},
			network: this._createNetworkConfig(options.allowNetwork, options.networkDomains),
			ui: {
				disable: false,
				clipboard: 'none',
				injection: false,
			},
		};
	}

	wrapCommand(executablePath: string, configPath: string, shell: string | undefined): string {
		if (this._isCmd(shell)) {
			return `${this._quoteCmdArgument(executablePath)} --debug --log-file debug.json ${this._quoteCmdArgument(configPath)}`;
		}
		return `& ${this._quotePowerShellArgument(executablePath)} --debug --log-file debug.json ${this._quotePowerShellArgument(configPath)}`;
	}

	wrapUnsandboxedCommand(command: string, tempDir: URI | undefined, shell: string | undefined): string {
		if (!tempDir) {
			return command;
		}

		const tempDirPath = this.toWindowsPath(tempDir);
		if (this._isCmd(shell)) {
			return `set ${this._quoteCmdArgument(`TEMP=${tempDirPath}`)} && set ${this._quoteCmdArgument(`TMP=${tempDirPath}`)} && ${command}`;
		}
		return `$env:TEMP=${this._quotePowerShellArgument(tempDirPath)}; $env:TMP=${this._quotePowerShellArgument(tempDirPath)}; ${command}`;
	}

	toWindowsPath(uri: URI): string {
		let value: string;
		if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
			value = `\\\\${uri.authority}${uri.path}`;
		} else if (/^\/[a-zA-Z]:/.test(uri.path)) {
			value = uri.path.slice(1);
		} else {
			value = uri.fsPath;
		}
		return value.replace(/\//g, '\\');
	}

	private _createNetworkConfig(allowNetwork: boolean, networkDomains: ITerminalSandboxResolvedNetworkDomains): IWindowsMxcNetworkConfig {
		if (allowNetwork) {
			return { defaultPolicy: 'allow' };
		}

		return {
			defaultPolicy: 'block',
			allowedHosts: networkDomains.allowedDomains,
			blockedHosts: networkDomains.deniedDomains,
		};
	}

	private _isCmd(shell: string | undefined): boolean {
		const shellName = shell ? win32.basename(shell).toLowerCase() : '';
		return shellName === 'cmd' || shellName === 'cmd.exe';
	}

	private _isPowerShell(shell: string | undefined): boolean {
		const shellName = shell ? win32.basename(shell).toLowerCase().replace(/\.exe$/, '') : '';
		return shellName === 'powershell' || shellName === 'pwsh' || shellName === 'powershell-preview' || shellName === 'pwsh-preview';
	}

	private _createProcessCommandLine(command: string, shell: string | undefined): string {
		if (this._isPowerShell(shell)) {
			return `${this._quoteWindowsProcessArgument(shell!)} -Command ${this._quoteWindowsProcessArgument(command)}`;
		}

		const cmdShell = shell && this._isCmd(shell) ? shell : 'cmd.exe';
		return `${this._quoteWindowsProcessArgument(cmdShell)} /d /s /c ${this._quoteCmdArgument(command)}`;
	}

	private _quoteWindowsProcessArgument(value: string): string {
		if (value.length > 0 && !/[\s"]/.test(value)) {
			return value;
		}
		return `"${value.replace(/(\\*)"/g, `$1$1\\"`).replace(/\\+$/g, `$&$&`)}"`;
	}

	private _quotePowerShellArgument(value: string): string {
		return `'${value.replace(/'/g, `''`)}'`;
	}

	private _quoteCmdArgument(value: string): string {
		return `"${value.replace(/"/g, `""`)}"`;
	}
}
