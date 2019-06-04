/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Terminal as XTermTerminal } from 'xterm';
import { ITerminalInstance, IWindowsShellHelper, ITerminalConfigHelper, ITerminalProcessManager, IShellLaunchConfig, ITerminalChildProcess } from 'vs/workbench/contrib/terminal/common/terminal';
import { WindowsShellHelper } from 'vs/workbench/contrib/terminal/node/windowsShellHelper';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalProcessManager } from 'vs/workbench/contrib/terminal/browser/terminalProcessManager';
import { IProcessEnvironment, Platform } from 'vs/base/common/platform';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import * as typeAheadAddon from 'vs/workbench/contrib/terminal/browser/terminalTypeAheadAddon';
import { getDefaultShell } from 'vs/workbench/contrib/terminal/node/terminal';

let Terminal: typeof XTermTerminal;

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
			// Enable xterm.js legacy addons
			Terminal.applyAddon(typeAheadAddon);
			// Localize strings
			Terminal.strings.blankLine = nls.localize('terminal.integrated.a11yBlankLine', 'Blank line');
			Terminal.strings.promptLabel = nls.localize('terminal.integrated.a11yPromptLabel', 'Terminal input');
			Terminal.strings.tooMuchOutput = nls.localize('terminal.integrated.a11yTooMuchOutput', 'Too much output to announce, navigate to rows manually to read');
		}
		return Terminal;
	}

	public createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper {
		return new WindowsShellHelper(shellProcessId, instance, xterm);
	}

	public createTerminalProcessManager(id: number, configHelper: ITerminalConfigHelper): ITerminalProcessManager {
		return this._instantiationService.createInstance(TerminalProcessManager, id, configHelper);
	}

	public createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess {
		return this._instantiationService.createInstance(TerminalProcess, shellLaunchConfig, cwd, cols, rows, env, windowsEnableConpty);
	}

	public getDefaultShell(p: Platform): string {
		return getDefaultShell(p);
	}
}