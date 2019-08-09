/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal as XTermTerminal } from 'xterm';
import { WebLinksAddon as XTermWebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import { ITerminalInstance, IWindowsShellHelper, ITerminalConfigHelper, ITerminalChildProcess, IShellLaunchConfig, IDefaultShellAndArgsRequest } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment, Platform } from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';

export const ITerminalInstanceService = createDecorator<ITerminalInstanceService>('terminalInstanceService');

/**
 * A service used by TerminalInstance (and components owned by it) that allows it to break its
 * dependency on electron-browser and node layers, while at the same time avoiding a cyclic
 * dependency on ITerminalService.
 */
export interface ITerminalInstanceService {
	_serviceBrand: any;

	// These events are optional as the requests they make are only needed on the browser side
	onRequestDefaultShellAndArgs?: Event<IDefaultShellAndArgsRequest>;

	getXtermConstructor(): Promise<typeof XTermTerminal>;
	getXtermWebLinksConstructor(): Promise<typeof XTermWebLinksAddon>;
	getXtermSearchConstructor(): Promise<typeof XTermSearchAddon>;
	createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper;
	createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess;

	getDefaultShellAndArgs(useAutomationShell: boolean, platformOverride?: Platform): Promise<{ shell: string, args: string[] | string | undefined }>;
	getMainProcessParentEnv(): Promise<IProcessEnvironment>;
}

export interface IBrowserTerminalConfigHelper extends ITerminalConfigHelper {
	panelContainer: HTMLElement | undefined;
}
