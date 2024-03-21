/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { Emitter, type Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
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

	private _activeShellIntegrations: Map</*instanceId*/number, InternalTerminalShellIntegration> = new Map();

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

		// Clean up listeners
		this._register(toDisposable(() => {
			for (const [_, integration] of this._activeShellIntegrations) {
				integration.dispose();
			}
			this._activeShellIntegrations.clear();
		}));

		// Convenient test code:
		// this.onDidChangeTerminalShellIntegration(e => {
		// 	console.log('*** onDidChangeTerminalShellIntegration', e);
		// });
		// this.onDidStartTerminalShellExecution(async e => {
		// 	console.log('*** onDidStartTerminalShellExecution', e);
		// 	// new Promise<void>(r => {
		// 	// 	(async () => {
		// 	// 		for await (const d of e.createDataStream()) {
		// 	// 			console.log('data2', d);
		// 	// 		}
		// 	// 	})();
		// 	// });
		// 	for await (const d of e.createDataStream()) {
		// 		console.log('data', d);
		// 	}
		// });
		// this.onDidEndTerminalShellExecution(e => {
		// 	console.log('*** onDidEndTerminalShellExecution', e);
		// });
		// setTimeout(() => {
		// 	Array.from(this._activeShellIntegrations.values())[0].value.executeCommand('echo hello');
		// }, 4000);
	}

	public $shellIntegrationChange(instanceId: number): void {
		const terminal = this._extHostTerminalService.getTerminalById(instanceId);
		if (!terminal) {
			return;
		}

		const apiTerminal = terminal.value;
		let shellIntegration = this._activeShellIntegrations.get(instanceId);
		if (!shellIntegration) {
			shellIntegration = new InternalTerminalShellIntegration(terminal.value, this._onDidStartTerminalShellExecution);
			this._activeShellIntegrations.set(instanceId, shellIntegration);
			shellIntegration.store.add(terminal.onWillDispose(() => this._activeShellIntegrations.get(instanceId)?.dispose()));
			shellIntegration.store.add(shellIntegration.onDidRequestShellExecution(commandLine => this._proxy.$executeCommand(instanceId, commandLine)));
			shellIntegration.store.add(shellIntegration.onDidRequestEndExecution(e => this._onDidEndTerminalShellExecution.fire(e.value)));
			shellIntegration.store.add(shellIntegration.onDidRequestChangeShellIntegration(e => this._onDidChangeTerminalShellIntegration.fire(e)));
			terminal.shellIntegration = shellIntegration.value;
		}
		this._onDidChangeTerminalShellIntegration.fire({
			terminal: apiTerminal,
			shellIntegration: shellIntegration.value
		});
	}

	public $shellExecutionStart(instanceId: number, commandLine: string, cwd: URI | string | undefined): void {
		// Force shellIntegration creation if it hasn't been created yet, this could when events
		// don't come through on startup
		if (!this._activeShellIntegrations.has(instanceId)) {
			this.$shellIntegrationChange(instanceId);
		}
		this._activeShellIntegrations.get(instanceId)?.startShellExecution(commandLine, cwd);
	}

	public $shellExecutionEnd(instanceId: number, commandLine: string | undefined, exitCode: number | undefined): void {
		this._activeShellIntegrations.get(instanceId)?.endShellExecution(commandLine, exitCode);
	}

	public $shellExecutionData(instanceId: number, data: string): void {
		this._activeShellIntegrations.get(instanceId)?.emitData(data);
	}

	public $cwdChange(instanceId: number, cwd: string): void {
		this._activeShellIntegrations.get(instanceId)?.setCwd(cwd);
	}

	public $closeTerminal(instanceId: number): void {
		this._activeShellIntegrations.get(instanceId)?.dispose();
		this._activeShellIntegrations.delete(instanceId);

	}
}

class InternalTerminalShellIntegration extends Disposable {
	private _currentExecution: InternalTerminalShellExecution | undefined;
	get currentExecution(): InternalTerminalShellExecution | undefined { return this._currentExecution; }

	private _ignoreNextExecution: boolean = false;
	private _cwd: URI | string | undefined;

	readonly store: DisposableStore = this._register(new DisposableStore());

	readonly value: vscode.TerminalShellIntegration;

	protected readonly _onDidRequestChangeShellIntegration = this._register(new Emitter<vscode.TerminalShellIntegrationChangeEvent>());
	readonly onDidRequestChangeShellIntegration = this._onDidRequestChangeShellIntegration.event;
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
			get cwd(): URI | string | undefined {
				return that._cwd;
			},
			executeCommand(commandLine): vscode.TerminalShellExecution {
				that._onDidRequestShellExecution.fire(commandLine);
				const execution = that.startShellExecution(commandLine, that._cwd).value;
				that._ignoreNextExecution = true;
				return execution;
			}
		};
	}

	startShellExecution(commandLine: string, cwd: URI | string | undefined): InternalTerminalShellExecution {
		if (this._ignoreNextExecution && this._currentExecution) {
			this._ignoreNextExecution = false;
		} else {
			if (this._currentExecution) {
				this._currentExecution.endExecution(undefined, undefined);
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

	endShellExecution(commandLine: string | undefined, exitCode: number | undefined): void {
		if (this._currentExecution) {
			this._currentExecution.endExecution(commandLine, exitCode);
			this._onDidRequestEndExecution.fire(this._currentExecution);
			this._currentExecution = undefined;
		}
	}

	setCwd(cwd: URI | string): void {
		let wasChanged = false;
		if (URI.isUri(this._cwd)) {
			if (this._cwd.toString() !== cwd.toString()) {
				wasChanged = true;
			}
		} else if (this._cwd !== cwd) {
			wasChanged = true;
		}
		if (wasChanged) {
			this._cwd = cwd;
			this._onDidRequestChangeShellIntegration.fire({ terminal: this._terminal, shellIntegration: this.value });
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
		private _commandLine: string | undefined,
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
			get commandLine(): string | undefined {
				return that._commandLine;
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

	endExecution(commandLine: string | undefined, exitCode: number | undefined): void {
		if (commandLine) {
			this._commandLine = commandLine;
		}
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
