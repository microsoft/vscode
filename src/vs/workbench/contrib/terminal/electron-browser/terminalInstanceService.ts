/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalInstance, IWindowsShellHelper, IShellLaunchConfig, ITerminalChildProcess } from 'vs/workbench/contrib/terminal/common/terminal';
import { WindowsShellHelper } from 'vs/workbench/contrib/terminal/node/windowsShellHelper';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment, Platform } from 'vs/base/common/platform';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { getDefaultShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { Terminal as XTermTerminal } from 'xterm';
import { WebLinksAddon as XTermWebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';

let Terminal: typeof XTermTerminal;
let WebLinksAddon: typeof XTermWebLinksAddon;
let SearchAddon: typeof XTermSearchAddon;

/**
 * A service used by TerminalInstance (and components owned by it) that allows it to break its
 * dependency on electron-browser and node layers, while at the same time avoiding a cyclic
 * dependency on ITerminalService.
 */
export class TerminalInstanceService implements ITerminalInstanceService {
	public _serviceBrand: any;

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
}