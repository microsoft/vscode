/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal as XTermTerminal } from 'vscode-xterm';
import { ITerminalInstance, IWindowsShellHelper, ITerminalProcessManager, ITerminalConfigHelper, ITerminalChildProcess, IShellLaunchConfig } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment } from 'vs/base/common/platform';

export const ITerminalInstanceService = createDecorator<ITerminalInstanceService>('terminalInstanceService');

export interface ITerminalInstanceService {
	_serviceBrand: any;

	getXtermConstructor(): Promise<typeof XTermTerminal>;
	createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper;
	createTerminalProcessManager(id: number, configHelper: ITerminalConfigHelper): ITerminalProcessManager;
	createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess;
}

export interface IBrowserTerminalConfigHelper extends ITerminalConfigHelper {
	panelContainer: HTMLElement;
}
