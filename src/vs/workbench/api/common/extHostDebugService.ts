/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ExtHostDebugServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtHostDebugService = createDecorator<IExtHostDebugService>('IExtHostDebugService');

export interface IExtHostDebugService extends ExtHostDebugServiceShape {

	readonly _serviceBrand: any;

	onDidStartDebugSession: Event<vscode.DebugSession>;
	onDidTerminateDebugSession: Event<vscode.DebugSession>;
	onDidChangeActiveDebugSession: Event<vscode.DebugSession | undefined>;
	activeDebugSession: vscode.DebugSession | undefined;
	activeDebugConsole: vscode.DebugConsole;
	onDidReceiveDebugSessionCustomEvent: Event<vscode.DebugSessionCustomEvent>;
	onDidChangeBreakpoints: Event<vscode.BreakpointsChangeEvent>;
	breakpoints: vscode.Breakpoint[];

	addBreakpoints(breakpoints0: vscode.Breakpoint[]): Promise<void>;
	removeBreakpoints(breakpoints0: vscode.Breakpoint[]): Promise<void>;
	startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration, parentSession?: vscode.DebugSession): Promise<boolean>;
	registerDebugConfigurationProvider(type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable;
	registerDebugAdapterDescriptorFactory(extension: IExtensionDescription, type: string, factory: vscode.DebugAdapterDescriptorFactory): vscode.Disposable;
	registerDebugAdapterTrackerFactory(type: string, factory: vscode.DebugAdapterTrackerFactory): vscode.Disposable;
}

