/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { win32 } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IWindowsMxcConfig, IWindowsMxcPolicyContainment, IWindowsMxcSandboxPolicy } from './sandboxHelperService.js';
import type { ITerminalSandboxResolvedNetworkDomains } from './terminalSandboxService.js';

export interface IWindowsMxcConfigOptions {
	command: string;
	shell?: string;
	cwd: URI | undefined;
	tempDir: URI;
	schemaVersion?: string;
	allowNetwork: boolean;
	networkDomains: ITerminalSandboxResolvedNetworkDomains;
	allowReadPaths: string[];
	allowWritePaths: string[];
	denyReadPaths: string[];
	env: string[];
}

export type IWindowsMxcBuildSandboxPayload = (commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment) => Promise<IWindowsMxcConfig | undefined>;

export const IWindowsMxcTerminalSandboxRuntime = createDecorator<IWindowsMxcTerminalSandboxRuntime>('windowsMxcTerminalSandboxRuntime');

export interface IWindowsMxcTerminalSandboxRuntime {
	readonly _serviceBrand: undefined;

	getExecutablePath(appRoot: string, arch: string | undefined): string;
	getRuntimeReadPaths(appRoot: string | undefined, executablePath: string | undefined): string[];
	createConfig(options: IWindowsMxcConfigOptions, buildSandboxPayload: IWindowsMxcBuildSandboxPayload): Promise<IWindowsMxcConfig>;
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
	private readonly _containerName = 'vscode-terminal-sandbox';

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

	async createConfig(options: IWindowsMxcConfigOptions, buildSandboxPayload: IWindowsMxcBuildSandboxPayload): Promise<IWindowsMxcConfig> {
		const tempDirPath = this.toWindowsPath(options.tempDir);
		const shell = options.shell
			? this._quoteWindowsCommandLineArgument(options.shell)
			: 'pwsh.exe';
		const commandLine = `${shell} -NoProfile -ExecutionPolicy Bypass -Command ${this._quoteWindowsCommandLineArgument(options.command)}`;
		const cwd = options.cwd ? this.toWindowsPath(options.cwd) : tempDirPath;
		const policy: IWindowsMxcSandboxPolicy = {
			version: options.schemaVersion ?? this._configVersion,
			timeoutMs: 0,
			filesystem: {
				readwritePaths: [...new Set(options.allowWritePaths.map(path => this._normalizeWindowsPath(path)))],
				readonlyPaths: [...new Set([tempDirPath, ...(options.shell && win32.isAbsolute(options.shell) ? [win32.dirname(options.shell)] : []), ...options.allowReadPaths].map(path => this._normalizeWindowsPath(path)))],
				deniedPaths: [...new Set(options.denyReadPaths.map(path => this._normalizeWindowsPath(path)))],
			},
			network: this._createNetworkPolicy(options.allowNetwork, options.networkDomains),
			ui: {
				allowWindows: true,
				clipboard: 'none',
				allowInputInjection: false,
			},
		};

		const config = await buildSandboxPayload(commandLine, policy, cwd, this._containerName);
		if (!config?.process) {
			throw new Error('Unable to build Windows MXC sandbox payload');
		}

		config.process.env = [...options.env];

		return config;
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
		return this._normalizeWindowsPath(value);
	}

	private _normalizeWindowsPath(path: string): string {
		return path.replace(/\//g, '\\');
	}

	private _createNetworkPolicy(allowNetwork: boolean, networkDomains: ITerminalSandboxResolvedNetworkDomains): NonNullable<IWindowsMxcSandboxPolicy['network']> {
		const allowedHosts = networkDomains.allowedDomains.length > 0 ? networkDomains.allowedDomains : undefined;
		const blockedHosts = networkDomains.deniedDomains.length > 0 ? networkDomains.deniedDomains : undefined;
		const allowOutbound = allowNetwork || !!allowedHosts?.length;
		const network: NonNullable<IWindowsMxcSandboxPolicy['network']> = {
			allowOutbound,
		};
		if (allowOutbound && allowedHosts) {
			network.allowedHosts = allowedHosts;
		}
		if (allowOutbound && blockedHosts) {
			network.blockedHosts = blockedHosts;
		}
		return network;
	}

	private _quotePowerShellArgument(value: string): string {
		return `'${value.replace(/'/g, `''`)}'`;
	}

	private _quoteWindowsCommandLineArgument(value: string): string {
		return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, '$&$&')}"`;
	}
}
