/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalInstance, IWindowsShellHelper, IShellLaunchConfig, ITerminalChildProcess, IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY } from 'vs/workbench/contrib/terminal/common/terminal';
import { WindowsShellHelper } from 'vs/workbench/contrib/terminal/node/windowsShellHelper';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment, isLinux, isMacintosh, isWindows, platform, Platform } from 'vs/base/common/platform';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { getSystemShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { Terminal as XTermTerminal } from 'xterm';
import { WebLinksAddon as XTermWebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import { readFile } from 'vs/base/node/pfs';
import { basename } from 'vs/base/common/path';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getDefaultShell, getDefaultShellArgs } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { StorageScope, IStorageService } from 'vs/platform/storage/common/storage';

let Terminal: typeof XTermTerminal;
let WebLinksAddon: typeof XTermWebLinksAddon;
let SearchAddon: typeof XTermSearchAddon;

export class TerminalInstanceService implements ITerminalInstanceService {
	public _serviceBrand: any;

	private _mainProcessParentEnv: IProcessEnvironment | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
	}

	public async getXtermConstructor(): Promise<typeof XTermTerminal> {
		if (!Terminal) {
			Terminal = (await import('xterm')).Terminal;
		}
		return Terminal;
	}

	public async getXtermWebLinksConstructor(): Promise<typeof XTermWebLinksAddon> {
		if (!WebLinksAddon) {
			WebLinksAddon = (await import('xterm-addon-web-links')).WebLinksAddon;
		}
		return WebLinksAddon;
	}

	public async getXtermSearchConstructor(): Promise<typeof XTermSearchAddon> {
		if (!SearchAddon) {
			SearchAddon = (await import('xterm-addon-search')).SearchAddon;
		}
		return SearchAddon;
	}

	public createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper {
		return new WindowsShellHelper(shellProcessId, instance, xterm);
	}

	public createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess {
		return this._instantiationService.createInstance(TerminalProcess, shellLaunchConfig, cwd, cols, rows, env, windowsEnableConpty);
	}

	private _isWorkspaceShellAllowed(): boolean {
		return this._storageService.getBoolean(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, StorageScope.WORKSPACE, false);
	}

	public getDefaultShellAndArgs(platformOverride: Platform = platform): Promise<{ shell: string, args: string[] | undefined }> {
		const isWorkspaceShellAllowed = this._isWorkspaceShellAllowed();
		const shell = getDefaultShell(
			(key) => this._configurationService.inspect(key),
			isWorkspaceShellAllowed,
			getSystemShell(platformOverride),
			process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
			process.env.windir,
			platformOverride
		);
		const args = getDefaultShellArgs(
			(key) => this._configurationService.inspect(key),
			isWorkspaceShellAllowed,
			platformOverride
		);
		return Promise.resolve({ shell, args });
	}

	public async getMainProcessParentEnv(): Promise<IProcessEnvironment> {
		if (this._mainProcessParentEnv) {
			return this._mainProcessParentEnv;
		}

		// For Linux use /proc/<pid>/status to get the parent of the main process and then fetch its
		// env using /proc/<pid>/environ.
		if (isLinux) {
			const mainProcessId = process.ppid;
			const codeProcessName = basename(process.argv[0]);
			let pid: number = 0;
			let ppid: number = mainProcessId;
			let name: string = codeProcessName;
			do {
				pid = ppid;
				const status = await readFile(`/proc/${pid}/status`, 'utf8');
				const splitByLine = status.split('\n');
				splitByLine.forEach(line => {
					if (line.indexOf('Name:') === 0) {
						name = line.replace(/^Name:\s+/, '');
					}
					if (line.indexOf('PPid:') === 0) {
						ppid = parseInt(line.replace(/^PPid:\s+/, ''));
					}
				});
			} while (name === codeProcessName);
			const rawEnv = await readFile(`/proc/${pid}/environ`, 'utf8');
			const env = {};
			rawEnv.split('\0').forEach(e => {
				const i = e.indexOf('=');
				env[e.substr(0, i)] = e.substr(i + 1);
			});
			this._mainProcessParentEnv = env;
		}

		// For macOS we want the "root" environment as shells by default run as login shells. It
		// doesn't appear to be possible to get the "root" environment as `ps eww -o command` for
		// PID 1 (the parent of the main process when launched from the dock/finder) returns no
		// environment, because of this we will fill in the root environment using a whitelist of
		// environment variables that we have.
		if (isMacintosh) {
			this._mainProcessParentEnv = {};
			// This list was generated by diffing launching a terminal with {} and the system
			// terminal launched from finder.
			const rootEnvVars = [
				'SHELL',
				'SSH_AUTH_SOCK',
				'Apple_PubSub_Socket_Render',
				'XPC_FLAGS',
				'XPC_SERVICE_NAME',
				'HOME',
				'LOGNAME',
				'TMPDIR'
			];
			rootEnvVars.forEach(k => {
				if (process.env[k]) {
					this._mainProcessParentEnv![k] = process.env[k]!;
				}
			});
		}

		// TODO: Windows should return a fresh environment block, might need native code?
		if (isWindows) {
			this._mainProcessParentEnv = process.env as IProcessEnvironment;
		}

		return this._mainProcessParentEnv!;
	}
}