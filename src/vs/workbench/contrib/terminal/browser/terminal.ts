/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal as XTermTerminal } from 'vscode-xterm';
import { ITerminalInstance, IWindowsShellHelper, ITerminalProcessManager, ITerminalConfigHelper, ITerminalChildProcess, IShellLaunchConfig } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';

export const ITerminalInstanceService = createDecorator<ITerminalInstanceService>('terminalInstanceService');

export interface ITerminalInstanceService {
	_serviceBrand: any;

	getXtermConstructor(): Promise<typeof XTermTerminal>;
	createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper;
	createTerminalProcessManager(id: number, configHelper: ITerminalConfigHelper): ITerminalProcessManager;
	createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess;
	getRemoteOperatingSystem(): Promise<OperatingSystem | undefined>;
	getRemoteUserHome(): Promise<URI | undefined>;
}

export interface IBrowserTerminalConfigHelper extends ITerminalConfigHelper {
	panelContainer: HTMLElement;
}
