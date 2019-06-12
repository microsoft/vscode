/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalInstance, IWindowsShellHelper, IShellLaunchConfig, ITerminalChildProcess } from 'vs/workbench/contrib/terminal/common/terminal';
import { WindowsShellHelper } from 'vs/workbench/contrib/terminal/node/windowsShellHelper';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment, Platform, isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { getDefaultShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { Terminal as XTermTerminal } from 'xterm';
import { WebLinksAddon as XTermWebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import { readFile } from 'vs/base/node/pfs';
import { basename } from 'vs/base/common/path';

let Terminal: typeof XTermTerminal;
let WebLinksAddon: typeof XTermWebLinksAddon;
let SearchAddon: typeof XTermSearchAddon;

export class TerminalInstanceService implements ITerminalInstanceService {
	public _serviceBrand: any;

	private _mainProcessParentEnv: IProcessEnvironment | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
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

	public getDefaultShell(p: Platform): string {
		return getDefaultShell(p);
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

		// For macOS just return the root environment which seems to always be {}, this is the
		// parent of the main process when code is launched from the dock.
		if (isMacintosh) {
			this._mainProcessParentEnv = {};
		}

		// TODO: Windows should return a fresh environment block, might need native code?
		if (isWindows) {
			this._mainProcessParentEnv = process.env as IProcessEnvironment;
		}

		return this._mainProcessParentEnv!;
	}
}