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

		// TODO: Dispose shell integration when terminal is disposed

		// TODO: Remove test code
		this.onDidChangeTerminalShellIntegration(e => {
			console.log('*** onDidChangeTerminalShellIntegration', e);
		});
		this.onDidStartTerminalShellExecution(async e => {
			console.log('*** onDidStartTerminalShellExecution', e);
			// new Promise<void>(r => {
			// 	(async () => {
			// 		for await (const d of e.createDataStream()) {
			// 			console.log('data2', d);
			// 		}
			// 	})();
			// });
			for await (const d of e.createDataStream()) {
				console.log('data', d);
			}
		});
		this.onDidEndTerminalShellExecution(e => {
			console.log('*** onDidEndTerminalShellExecution', e);
		});

		setTimeout(() => {
			Array.from(this._activeShellIntegrations.values())[0].value.executeCommand('echo hello');
		}, 4000);
	}

	public $acceptDidChangeShellIntegration(id: number): void {
		const terminal = this._extHostTerminalService.getTerminalById(id);
		if (!terminal) {
			return;
		}

		const apiTerminal = terminal.value;
		let shellIntegration = this._activeShellIntegrations.get(id);
		if (!shellIntegration) {
			shellIntegration = new InternalTerminalShellIntegration(terminal.value, this._onDidStartTerminalShellExecution);
			// TODO: These should be registered against the InternalTerminalShellIntegration instance, not ExtHostTerminalShellIntegration
			this._register(terminal.onWillDispose(() => this._activeShellIntegrations.get(id)?.dispose()));
			this._activeShellIntegrations.set(id, shellIntegration);
			this._register(shellIntegration.onDidRequestShellExecution(commandLine => {
				this._proxy.$executeCommand(id, commandLine);
			}));
			this._register(shellIntegration.onDidRequestEndExecution(e => this._onDidEndTerminalShellExecution.fire(e.value)));
			terminal.shellIntegration = shellIntegration.value;
		}
		this._onDidChangeTerminalShellIntegration.fire({
			terminal: apiTerminal,
			shellIntegration: shellIntegration.value
		});
	}

	public $acceptTerminalShellExecutionStart(id: number, commandLine: string, cwd: URI | string | undefined): void {
		// Force shellIntegration creation if it hasn't been created yet, this could when events
		// don't come through on startup
		if (!this._activeShellIntegrations.has(id)) {
			this.$acceptDidChangeShellIntegration(id);
		}
		this._activeShellIntegrations.get(id)?.startShellExecution(commandLine, cwd);
	}

	public $acceptTerminalShellExecutionEnd(id: number, exitCode: number | undefined): void {
		this._activeShellIntegrations.get(id)?.endShellExecution(exitCode);
	}

	public $acceptTerminalShellExecutionData(id: number, data: string): void {
		this._activeShellIntegrations.get(id)?.emitData(data);
	}
}

class InternalTerminalShellIntegration extends Disposable {
	private _currentExecution: InternalTerminalShellExecution | undefined;
	get currentExecution(): InternalTerminalShellExecution | undefined { return this._currentExecution; }

	private _ignoreNextExecution: boolean = false;

	readonly value: vscode.TerminalShellIntegration;

	protected readonly _onDidRequestShellExecution = this._register(new Emitter<string>());
	readonly onDidRequestShellExecution = this._onDidRequestShellExecution.event;
	protected readonly _onDidRequestEndExecution = this._register(new Emitter<InternalTerminalShellExecution>());
	readonly onDidRequestEndExecution = this._onDidRequestEndExecution.event;

	constructor(
		private readonly _terminal: vscode.Terminal,
		private readonly _onDidStartTerminalShellExecution: Emitter<vscode.TerminalShellExecution>
	) {
		super();

		const that = this;
		this.value = {
			// TODO: Fill in cwd
			cwd: undefined,
			executeCommand(commandLine): vscode.TerminalShellExecution {
				// TODO: Fill in cwd
				that._onDidRequestShellExecution.fire(commandLine);
				const execution = that.startShellExecution(commandLine, undefined).value;
				that._ignoreNextExecution = true;
				return execution;
				// TODO: Consume next shell execution so this one remains valid
			}
		};
	}

	startShellExecution(commandLine: string, cwd: URI | string | undefined): InternalTerminalShellExecution {
		if (this._ignoreNextExecution && this._currentExecution) {
			this._ignoreNextExecution = false;
		} else {
			if (this._currentExecution) {
				this._currentExecution.endExecution(undefined);
				this._onDidRequestEndExecution.fire(this._currentExecution);
			}
			this._currentExecution = new InternalTerminalShellExecution(this._terminal, commandLine, cwd);
			this._onDidStartTerminalShellExecution.fire(this._currentExecution.value);
		}
		return this._currentExecution;
	}

	emitData(data: string): void {
		this.currentExecution?.emitData(data);
	}

	endShellExecution(exitCode: number | undefined): void {
		if (this._currentExecution) {
			this._currentExecution.endExecution(exitCode);
			this._onDidRequestEndExecution.fire(this._currentExecution);
			this._currentExecution = undefined;
		}
	}
}

class InternalTerminalShellExecution {
	private _dataStream: ShellExecutionDataStream | undefined;

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
			createDataStream(): AsyncIterable<string> {
				return that._createDataStream();
			}
		};
	}

	private _createDataStream(): AsyncIterable<string> {
		if (!this._dataStream) {
			if (this._exitCodeResolve === undefined) {
				return AsyncIterableObject.EMPTY;
			}
			this._dataStream = new ShellExecutionDataStream();
		}
		return this._dataStream.createIterable();
	}

	emitData(data: string): void {
		this._dataStream?.emitData(data);
	}

	endExecution(exitCode: number | undefined): void {
		this._dataStream?.endExecution();
		this._dataStream = undefined;
		this._exitCodeResolve?.(exitCode);
		this._exitCodeResolve = undefined;
	}
}

class ShellExecutionDataStream extends Disposable {
	private _barrier: Barrier | undefined;
	private _emitters: AsyncIterableEmitter<string>[] = [];

	createIterable(): AsyncIterable<string> {
		const barrier = this._barrier = new Barrier();
		const iterable = new AsyncIterableObject<string>(async emitter => {
			this._emitters.push(emitter);
			await barrier.wait();
		});
		return iterable;
	}

	emitData(data: string): void {
		for (const emitter of this._emitters) {
			emitter.emitOne(data);
		}
	}

	endExecution(): void {
		this._barrier?.open();
		this._barrier = undefined;
	}
}
