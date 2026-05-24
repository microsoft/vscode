/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { win32 } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ITerminalSandboxResolvedNetworkDomains } from './terminalSandboxService.js';

export interface IWindowsMxcProcessConfig {
	commandLine: string;
	cwd?: string;
	env: string[];
	timeout: number;
}

export interface IWindowsMxcFilesystemConfig {
	readwritePaths: string[];
	readonlyPaths: string[];
	deniedPaths: string[];
}

export interface IWindowsMxcNetworkConfig {
	defaultPolicy: 'allow' | 'block';
	allowedHosts?: string[];
	blockedHosts?: string[];
}

export interface IWindowsMxcConfig {
	version: string;
	containerId: string;
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
	cwd: URI | undefined;
	tempDir: URI;
	allowNetwork: boolean;
	networkDomains: ITerminalSandboxResolvedNetworkDomains;
	allowReadPaths: string[];
	allowWritePaths: string[];
	denyReadPaths: string[];
	env: string[];
}

export const IWindowsMxcTerminalSandboxRuntime = createDecorator<IWindowsMxcTerminalSandboxRuntime>('windowsMxcTerminalSandboxRuntime');

export interface IWindowsMxcTerminalSandboxRuntime {
	readonly _serviceBrand: undefined;

	getExecutablePath(appRoot: string, arch: string | undefined): string;
	getRuntimeReadPaths(appRoot: string | undefined, executablePath: string | undefined): string[];
	createConfig(options: IWindowsMxcConfigOptions): IWindowsMxcConfig;
	wrapCommand(executablePath: string, configPath: string): string;
	wrapUnsandboxedCommand(command: string): string;
	toWindowsPath(uri: URI): string;
}

/**
 * Windows-only MXC integration for terminal sandboxing.
 *
 * This class is intentionally isolated from the SRT-backed runtime so it can be
 * removed once SRT supports Windows sandboxing.
 */
export class WindowsMxcTerminalSandboxRuntime implements IWindowsMxcTerminalSandboxRuntime {
	declare readonly _serviceBrand: undefined;

	private readonly _configVersion = '0.4.0-alpha';

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
			version: this._configVersion,
			containerId: 'vscode-terminal-sandbox',
			containment: 'process',
			lifecycle: {
				destroyOnExit: true,
				preservePolicy: false,
			},
			process: {
				commandLine: options.command,
				cwd: options.cwd ? this.toWindowsPath(options.cwd) : tempDirPath,
				env: [
					...options.env
				],
				timeout: 0,
			},
			filesystem: {
				readwritePaths: [...new Set([...options.allowWritePaths])],
				readonlyPaths: [...new Set([tempDirPath, ...options.allowReadPaths])],
				deniedPaths: options.denyReadPaths,
			},
			network: this._createNetworkConfig(options.allowNetwork, options.networkDomains),
			ui: {
				disable: false,
				clipboard: 'none',
				injection: false,
			},
		};
	}

	wrapCommand(executablePath: string, configPath: string): string {
		return `& ${this._quotePowerShellArgument(executablePath)} ${this._quotePowerShellArgument(configPath)}`;
	}

	wrapUnsandboxedCommand(command: string): string {
		return command;
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
			blockedHosts: networkDomains.deniedDomains
		};
	}

	private _quotePowerShellArgument(value: string): string {
		return `'${value.replace(/'/g, `''`)}'`;
	}
}
