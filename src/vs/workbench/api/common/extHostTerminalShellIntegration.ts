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
import type { URI } from 'vs/base/common/uri';
import { AsyncIterableObject, Barrier, type AsyncIterableEmitter } from 'vs/base/common/async';

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

	private _activeShellIntegrations: Map<number, InternalTerminalShellIntegration> = new Map();
	private _activeShellExecutions: Map<number, InternalTerminalShellExecution> = new Map();

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

		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalShellIntegration);

		// TODO: Remove test code
		this.onDidChangeTerminalShellIntegration(e => {
			console.log('*** onDidChangeTerminalShellIntegration', e);
		});
		this.onDidStartTerminalShellExecution(async e => {
			console.log('*** onDidStartTerminalShellExecution', e);
			for await (const d of e.dataStream) {
				console.log('data', d);
			}
		});
		this.onDidEndTerminalShellExecution(e => {
			console.log('*** onDidEndTerminalShellExecution', e);
		});
	}

	public async $acceptDidChangeShellIntegration(id: number): Promise<void> {
		const terminal = this._extHostTerminalService.getTerminalById(id);
		if (terminal) {
			const apiTerminal = terminal.value;
			let shellIntegration = this._activeShellIntegrations.get(id);
			if (!shellIntegration) {
				shellIntegration = new InternalTerminalShellIntegration();
				terminal.shellIntegration = shellIntegration.value;
			}
			this._onDidChangeTerminalShellIntegration.fire({
				terminal: apiTerminal,
				shellIntegration: shellIntegration.value
			});
		}
	}

	public async $acceptTerminalShellExecutionStart(id: number, commandLine: string, cwd: URI | string | undefined): Promise<void> {
		const terminal = this._extHostTerminalService.getTerminalById(id);
		if (terminal) {
			// End any existing shell execution
			this._activeShellExecutions.get(id)?.endExecution(undefined);

			const shellExecution = new InternalTerminalShellExecution(terminal.value, commandLine, cwd);
			this._activeShellExecutions.set(id, shellExecution);
			this._onDidStartTerminalShellExecution.fire(shellExecution.value);
		}
	}

	public async $acceptTerminalShellExecutionEnd(id: number, exitCode: number | undefined): Promise<void> {
		this._activeShellExecutions.get(id)?.endExecution(exitCode);
		this._activeShellExecutions.delete(id);
	}

	public async $acceptTerminalShellExecutionData(id: number, data: string): Promise<void> {
		this._activeShellExecutions.get(id)?.emitData(data);
	}
}

class InternalTerminalShellIntegration {
	readonly value: vscode.TerminalShellIntegration;

	constructor() {
		// TODO: impl
		this.value = {
			cwd: undefined,
			executeCommand() {
				return null!;
			}
		};
	}
}

class InternalTerminalShellExecution {
	private _dataStreamBarrier: Barrier | undefined;
	private _dataStreamEmitter: AsyncIterableEmitter<string> | undefined;

	private readonly _exitCode: Promise<number | undefined>;
	private _exitCodeResolve: ((exitCode: number | undefined) => void) | undefined;

	readonly value: vscode.TerminalShellExecution;

	constructor(
		readonly terminal: vscode.Terminal,
		readonly commandLine: string,
		readonly cwd: URI | string | undefined,
	) {
		this._exitCode = new Promise<number | undefined>(resolve => {
			this._exitCodeResolve = resolve;
		});

		const that = this;
		this.value = {
			get terminal(): vscode.Terminal {
				return terminal;
			},
			get commandLine(): string {
				return commandLine;
			},
			get cwd(): URI | string | undefined {
				return cwd;
			},
			get exitCode(): Promise<number | undefined> {
				return that._exitCode;
			},
			get dataStream(): AsyncIterable<string> {
				return that._createDataStream();
			}
		};
	}

	private _createDataStream(): AsyncIterable<string> {
		// TODO: This must work correctly across multiple extensions
		const barrier = this._dataStreamBarrier = new Barrier();
		const iterable = new AsyncIterableObject<string>(async emitter => {
			this._dataStreamEmitter = emitter;
			await barrier.wait();
		});
		return iterable;
	}

	emitData(data: string): void {
		this._dataStreamEmitter?.emitOne(data);
	}

	endExecution(exitCode: number | undefined): void {
		this._dataStreamBarrier?.open();
		this._exitCodeResolve?.(exitCode);
		this._exitCodeResolve = undefined;
	}
}
