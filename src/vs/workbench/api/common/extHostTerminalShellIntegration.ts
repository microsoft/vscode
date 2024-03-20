/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { Emitter, type Event } from 'vs/base/common/event';

export interface IExtHostTerminalShellIntegration extends ExtHostTerminalShellIntegrationShape {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTerminalShellIntegration: Event<vscode.TerminalShellIntegrationChangeEvent>;
	readonly onDidStartTerminalShellExecution: Event<vscode.TerminalShellExecution>;
	readonly onDidEndTerminalShellExecution: Event<vscode.TerminalShellExecution>;
}
export const IExtHostTerminalShellIntegration = createDecorator<IExtHostTerminalShellIntegration>('IExtHostTerminalShellIntegration');

export class ExtHostTerminalShellIntegration extends Disposable implements IExtHostTerminalShellIntegration {

	readonly _serviceBrand: undefined;

	protected _proxy: MainThreadTerminalShellIntegrationShape;

	protected readonly _onDidChangeTerminalShellIntegration = new Emitter<vscode.TerminalShellIntegrationChangeEvent>();
	readonly onDidChangeTerminalShellIntegration = this._onDidChangeTerminalShellIntegration.event;
	protected readonly _onDidStartTerminalShellExecution = new Emitter<vscode.TerminalShellExecution>();
	readonly onDidStartTerminalShellExecution = this._onDidStartTerminalShellExecution.event;
	protected readonly _onDidEndTerminalShellExecution = new Emitter<vscode.TerminalShellExecution>();
	readonly onDidEndTerminalShellExecution = this._onDidEndTerminalShellExecution.event;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostTerminalService private readonly _extHostTerminalService: IExtHostTerminalService,
	) {
		super();
		console.log('ExtHostTerminalShellIntegration#constructor');

		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalShellIntegration);
	}

	public async $acceptDidChangeShellIntegration(id: number): Promise<void> {
		const terminal = this._extHostTerminalService.getTerminalById(id);
		if (terminal) {
			const apiTerminal = terminal.value;
			let shellIntegration = apiTerminal.shellIntegration;
			if (!shellIntegration) {
				// TODO: Set it
				shellIntegration = apiTerminal.shellIntegration!;
			}
			this._onDidChangeTerminalShellIntegration.fire({
				terminal: apiTerminal,
				shellIntegration
			});
		}
	}

	public async $acceptTerminalShellExecutionStarted(id: number): Promise<void> {
		const terminal = this._extHostTerminalService.getTerminalById(id);
		if (terminal) {
			const shellExecution: vscode.TerminalShellExecution = {
				terminal: terminal.value,
				commandLine: null!,
				cwd: null!,
				dataStream: null!,
				exitCode: null!
			};
			this._onDidStartTerminalShellExecution.fire(shellExecution);
		}
	}
}
