/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Event } from 'vs/base/common/event';
import { ExtHostTerminalServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IExtHostTerminalService extends ExtHostTerminalServiceShape {

	_serviceBrand: any;

	activeTerminal: vscode.Terminal | undefined;
	terminals: vscode.Terminal[];

	onDidCloseTerminal: Event<vscode.Terminal>;
	onDidOpenTerminal: Event<vscode.Terminal>;
	onDidChangeActiveTerminal: Event<vscode.Terminal | undefined>;
	onDidChangeTerminalDimensions: Event<vscode.TerminalDimensionsChangeEvent>;
	onDidWriteTerminalData: Event<vscode.TerminalDataWriteEvent>;

	createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal;
	createTerminalFromOptions(options: vscode.TerminalOptions): vscode.Terminal;
	createExtensionTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;
	attachPtyToTerminal(id: number, pty: vscode.Pseudoterminal): void;
	getDefaultShell(useAutomationShell: boolean, configProvider: ExtHostConfigProvider): string;
}

export const IExtHostTerminalService = createDecorator<IExtHostTerminalService>('IExtHostTerminalService');
