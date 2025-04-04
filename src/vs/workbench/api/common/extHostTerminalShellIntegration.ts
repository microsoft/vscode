/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { TerminalShellExecutionCommandLineConfidence } from './extHostTypes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostTerminalService } from './extHostTerminalService.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { URI, type UriComponents } from '../../../base/common/uri.js';
import { AsyncIterableObject, Barrier, type AsyncIterableEmitter } from '../../../base/common/async.js';

export interface IExtHostTerminalShellIntegration extends ExtHostTerminalShellIntegrationShape {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTerminalShellIntegration: Event<vscode.TerminalShellIntegrationChangeEvent>;
	readonly onDidStartTerminalShellExecution: Event<vscode.TerminalShellExecutionStartEvent>;
	readonly onDidEndTerminalShellExecution: Event<vscode.TerminalShellExecutionEndEvent>;
}
export const IExtHostTerminalShellIntegration = createDecorator<IExtHostTerminalShellIntegration>('IExtHostTerminalShellIntegration');

export class ExtHostTerminalShellIntegration extends Disposable implements IExtHostTerminalShellIntegration {

	readonly _serviceBrand: undefined;

	protected _proxy: MainThreadTerminalShellIntegrationShape;

	private _activeShellIntegrations: Map</*instanceId*/number, InternalTerminalShellIntegration> = new Map();

	protected readonly _onDidChangeTerminalShellIntegration = new Emitter<vscode.TerminalShellIntegrationChangeEvent>();
	readonly onDidChangeTerminalShellIntegration = this._onDidChangeTerminalShellIntegration.event;
	protected readonly _onDidStartTerminalShellExecution = new Emitter<vscode.TerminalShellExecutionStartEvent>();
	readonly onDidStartTerminalShellExecution = this._onDidStartTerminalShellExecution.event;
	protected readonly _onDidEndTerminalShellExecution = new Emitter<vscode.TerminalShellExecutionEndEvent>();
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
		// 	// 		for await (const d of e.execution.read()) {
		// 	// 			console.log('data2', d);
		// 	// 		}
		// 	// 	})();
		// 	// });
		// 	for await (const d of e.execution.read()) {
		// 		console.log('data', d);
		// 	}
		// });
		// this.onDidEndTerminalShellExecution(e => {
		// 	console.log('*** onDidEndTerminalShellExecution', e);
		// });
		// setTimeout(() => {
		// 	console.log('before executeCommand(\"echo hello\")');
		// 	Array.from(this._activeShellIntegrations.values())[0].value.executeCommand('echo hello');
		// 	console.log('after executeCommand(\"echo hello\")');
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
			shellIntegration.store.add(shellIntegration.onDidRequestEndExecution(e => this._onDidEndTerminalShellExecution.fire(e)));
			shellIntegration.store.add(shellIntegration.onDidRequestChangeShellIntegration(e => this._onDidChangeTerminalShellIntegration.fire(e)));
			terminal.shellIntegration = shellIntegration.value;
		}
		this._onDidChangeTerminalShellIntegration.fire({
			terminal: apiTerminal,
			shellIntegration: shellIntegration.value
		});
	}

	public $shellExecutionStart(instanceId: number, commandLineValue: string, commandLineConfidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean, cwd: UriComponents | undefined): void {
		// Force shellIntegration creation if it hasn't been created yet, this could when events
		// don't come through on startup
		if (!this._activeShellIntegrations.has(instanceId)) {
			this.$shellIntegrationChange(instanceId);
		}
		const commandLine: vscode.TerminalShellExecutionCommandLine = {
			value: commandLineValue,
			confidence: commandLineConfidence,
			isTrusted
		};
		this._activeShellIntegrations.get(instanceId)?.startShellExecution(commandLine, URI.revive(cwd));
	}

	public $shellExecutionEnd(instanceId: number, commandLineValue: string, commandLineConfidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean, exitCode: number | undefined): void {
		const commandLine: vscode.TerminalShellExecutionCommandLine = {
			value: commandLineValue,
			confidence: commandLineConfidence,
			isTrusted
		};
		this._activeShellIntegrations.get(instanceId)?.endShellExecution(commandLine, exitCode);
	}

	public $shellExecutionData(instanceId: number, data: string): void {
		this._activeShellIntegrations.get(instanceId)?.emitData(data);
	}

	public $shellEnvChange(instanceId: number, shellEnvKeys: string[], shellEnvValues: string[], isTrusted: boolean): void {
		this._activeShellIntegrations.get(instanceId)?.setEnv(shellEnvKeys, shellEnvValues, isTrusted);
	}

	public $cwdChange(instanceId: number, cwd: UriComponents | undefined): void {
		this._activeShellIntegrations.get(instanceId)?.setCwd(URI.revive(cwd));
	}

	public $closeTerminal(instanceId: number): void {
		this._activeShellIntegrations.get(instanceId)?.dispose();
		this._activeShellIntegrations.delete(instanceId);
	}
}

interface IExecutionProperties {
	isMultiLine: boolean;
	unresolvedCommandLines: string[] | undefined;
}

export class InternalTerminalShellIntegration extends Disposable {
	private _pendingExecutions: InternalTerminalShellExecution[] = [];
	private _pendingEndingExecution: InternalTerminalShellExecution | undefined;

	private _currentExecutionProperties: IExecutionProperties | undefined;
	private _currentExecution: InternalTerminalShellExecution | undefined;
	get currentExecution(): InternalTerminalShellExecution | undefined { return this._currentExecution; }


	private _env: vscode.TerminalShellIntegrationEnvironment | undefined;
	private _cwd: URI | undefined;

	readonly store: DisposableStore = this._register(new DisposableStore());

	readonly value: vscode.TerminalShellIntegration;

	protected readonly _onDidRequestChangeShellIntegration = this._register(new Emitter<vscode.TerminalShellIntegrationChangeEvent>());
	readonly onDidRequestChangeShellIntegration = this._onDidRequestChangeShellIntegration.event;
	protected readonly _onDidRequestShellExecution = this._register(new Emitter<string>());
	readonly onDidRequestShellExecution = this._onDidRequestShellExecution.event;
	protected readonly _onDidRequestEndExecution = this._register(new Emitter<vscode.TerminalShellExecutionEndEvent>());
	readonly onDidRequestEndExecution = this._onDidRequestEndExecution.event;
	protected readonly _onDidRequestNewExecution = this._register(new Emitter<string>());
	readonly onDidRequestNewExecution = this._onDidRequestNewExecution.event;

	constructor(
		private readonly _terminal: vscode.Terminal,
		private readonly _onDidStartTerminalShellExecution: Emitter<vscode.TerminalShellExecutionStartEvent>
	) {
		super();

		const that = this;
		this.value = {
			get cwd(): URI | undefined {
				return that._cwd;
			},
			get env(): vscode.TerminalShellIntegrationEnvironment | undefined {
				if (!that._env) {
					return undefined;
				}
				return Object.freeze({
					isTrusted: that._env.isTrusted,
					value: Object.freeze({ ...that._env.value })
				});
			},
			// executeCommand(commandLine: string): vscode.TerminalShellExecution;
			// executeCommand(executable: string, args: string[]): vscode.TerminalShellExecution;
			executeCommand(commandLineOrExecutable: string, args?: string[]): vscode.TerminalShellExecution {
				let commandLineValue = commandLineOrExecutable;
				if (args) {
					for (const arg of args) {
						const wrapInQuotes = !arg.match(/["'`]/) && arg.match(/\s/);
						if (wrapInQuotes) {
							commandLineValue += ` "${arg}"`;
						} else {
							commandLineValue += ` ${arg}`;
						}
					}
				}

				that._onDidRequestShellExecution.fire(commandLineValue);
				// Fire the event in a microtask to allow the extension to use the execution before
				// the start event fires
				const commandLine: vscode.TerminalShellExecutionCommandLine = {
					value: commandLineValue,
					confidence: TerminalShellExecutionCommandLineConfidence.High,
					isTrusted: true
				};
				const execution = that.requestNewShellExecution(commandLine, that._cwd).value;
				return execution;
			}
		};
	}

	requestNewShellExecution(commandLine: vscode.TerminalShellExecutionCommandLine, cwd: URI | undefined) {
		const execution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
		const unresolvedCommandLines = splitAndSanitizeCommandLine(commandLine.value);
		if (unresolvedCommandLines.length > 1) {
			this._currentExecutionProperties = {
				isMultiLine: true,
				unresolvedCommandLines: splitAndSanitizeCommandLine(commandLine.value),
			};
		}
		this._pendingExecutions.push(execution);
		this._onDidRequestNewExecution.fire(commandLine.value);
		return execution;
	}

	startShellExecution(commandLine: vscode.TerminalShellExecutionCommandLine, cwd: URI | undefined): undefined {
		// Since an execution is starting, fire the end event for any execution that is awaiting to
		// end. When this happens it means that the data stream may not be flushed and therefore may
		// fire events after the end event.
		if (this._pendingEndingExecution) {
			this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._pendingEndingExecution.value, exitCode: undefined });
			this._pendingEndingExecution = undefined;
		}

		if (this._currentExecution) {
			// If the current execution is multi-line, check if this command line is part of it.
			if (this._currentExecutionProperties?.isMultiLine && this._currentExecutionProperties.unresolvedCommandLines) {
				const subExecutionResult = isSubExecution(this._currentExecutionProperties.unresolvedCommandLines, commandLine);
				if (subExecutionResult) {
					this._currentExecutionProperties.unresolvedCommandLines = subExecutionResult.unresolvedCommandLines;
					return;
				}
			}
			this._currentExecution.endExecution(undefined);
			this._currentExecution.flush();
			this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value, exitCode: undefined });
		}

		// Get the matching pending execution, how strict this is depends on the confidence of the
		// command line
		let currentExecution: InternalTerminalShellExecution | undefined;
		if (commandLine.confidence === TerminalShellExecutionCommandLineConfidence.High) {
			for (const [i, execution] of this._pendingExecutions.entries()) {
				if (execution.value.commandLine.value === commandLine.value) {
					currentExecution = execution;
					this._currentExecutionProperties = {
						isMultiLine: false,
						unresolvedCommandLines: undefined,
					};
					currentExecution = execution;
					this._pendingExecutions.splice(i, 1);
					break;
				} else {
					const subExecutionResult = isSubExecution(splitAndSanitizeCommandLine(execution.value.commandLine.value), commandLine);
					if (subExecutionResult) {
						this._currentExecutionProperties = {
							isMultiLine: true,
							unresolvedCommandLines: subExecutionResult.unresolvedCommandLines,
						};
						currentExecution = execution;
						this._pendingExecutions.splice(i, 1);
						break;
					}
				}
			}
		} else {
			currentExecution = this._pendingExecutions.shift();
		}

		// If there is no execution, create a new one
		if (!currentExecution) {
			// Fallback to the shell integration's cwd as the cwd may not have been restored after a reload
			currentExecution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
		}

		this._currentExecution = currentExecution;
		this._onDidStartTerminalShellExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value });
	}

	emitData(data: string): void {
		this.currentExecution?.emitData(data);
	}

	endShellExecution(commandLine: vscode.TerminalShellExecutionCommandLine | undefined, exitCode: number | undefined): void {
		// If the current execution is multi-line, don't end it until the next command line is
		// confirmed to not be a part of it.
		if (this._currentExecutionProperties?.isMultiLine) {
			if (this._currentExecutionProperties.unresolvedCommandLines && this._currentExecutionProperties.unresolvedCommandLines.length > 0) {
				return;
			}
		}

		if (this._currentExecution) {
			const commandLineForEvent = this._currentExecutionProperties?.isMultiLine ? this._currentExecution.value.commandLine : commandLine;
			this._currentExecution.endExecution(commandLineForEvent);
			const currentExecution = this._currentExecution;
			this._pendingEndingExecution = currentExecution;
			this._currentExecution = undefined;
			// IMPORTANT: Ensure the current execution's data events are flushed in order to
			// prevent data events firing after the end event fires.
			currentExecution.flush().then(() => {
				// Only fire if it's still the same execution, if it's changed it would have already
				// been fired.
				if (this._pendingEndingExecution === currentExecution) {
					this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: currentExecution.value, exitCode });
					this._pendingEndingExecution = undefined;
				}
			});
		}
	}

	setEnv(keys: string[], values: string[], isTrusted: boolean): void {
		const env: { [key: string]: string | undefined } = {};
		for (let i = 0; i < keys.length; i++) {
			env[keys[i]] = values[i];
		}
		this._env = { value: env, isTrusted };
		this._fireChangeEvent();
	}

	setCwd(cwd: URI | undefined): void {
		let wasChanged = false;
		if (URI.isUri(this._cwd)) {
			wasChanged = !URI.isUri(cwd) || this._cwd.toString() !== cwd.toString();
		} else if (this._cwd !== cwd) {
			wasChanged = true;
		}
		if (wasChanged) {
			this._cwd = cwd;
			this._fireChangeEvent();
		}
	}

	private _fireChangeEvent() {
		this._onDidRequestChangeShellIntegration.fire({ terminal: this._terminal, shellIntegration: this.value });
	}
}

class InternalTerminalShellExecution {
	readonly value: vscode.TerminalShellExecution;

	private _dataStream: ShellExecutionDataStream | undefined;
	private _isEnded: boolean = false;

	constructor(
		private _commandLine: vscode.TerminalShellExecutionCommandLine,
		readonly cwd: URI | undefined,
	) {
		const that = this;
		this.value = {
			get commandLine(): vscode.TerminalShellExecutionCommandLine {
				return that._commandLine;
			},
			get cwd(): URI | undefined {
				return that.cwd;
			},
			read(): AsyncIterable<string> {
				return that._createDataStream();
			}
		};
	}

	private _createDataStream(): AsyncIterable<string> {
		if (!this._dataStream) {
			if (this._isEnded) {
				return AsyncIterableObject.EMPTY;
			}
			this._dataStream = new ShellExecutionDataStream();
		}
		return this._dataStream.createIterable();
	}

	emitData(data: string): void {
		if (!this._isEnded) {
			this._dataStream?.emitData(data);
		}
	}

	endExecution(commandLine: vscode.TerminalShellExecutionCommandLine | undefined): void {
		if (commandLine) {
			this._commandLine = commandLine;
		}
		this._dataStream?.endExecution();
		this._isEnded = true;
	}

	async flush(): Promise<void> {
		if (this._dataStream) {
			await this._dataStream.flush();
			this._dataStream.dispose();
			this._dataStream = undefined;
		}
	}
}

class ShellExecutionDataStream extends Disposable {
	private _barrier: Barrier | undefined;
	private _iterables: AsyncIterableObject<string>[] = [];
	private _emitters: AsyncIterableEmitter<string>[] = [];

	createIterable(): AsyncIterable<string> {
		if (!this._barrier) {
			this._barrier = new Barrier();
		}
		const barrier = this._barrier;
		const iterable = new AsyncIterableObject<string>(async emitter => {
			this._emitters.push(emitter);
			await barrier.wait();
		});
		this._iterables.push(iterable);
		return iterable;
	}

	emitData(data: string): void {
		for (const emitter of this._emitters) {
			emitter.emitOne(data);
		}
	}

	endExecution(): void {
		this._barrier?.open();
	}

	async flush(): Promise<void> {
		await Promise.all(this._iterables.map(e => e.toPromise()));
	}
}

function splitAndSanitizeCommandLine(commandLine: string): string[] {
	return commandLine
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

/**
 * When executing something that the shell considers multiple commands, such as
 * a comment followed by a command, this needs to all be tracked under a single
 * execution.
 */
function isSubExecution(unresolvedCommandLines: string[], commandLine: vscode.TerminalShellExecutionCommandLine): { unresolvedCommandLines: string[] } | false {
	if (unresolvedCommandLines.length === 0) {
		return false;
	}
	const newUnresolvedCommandLines = [...unresolvedCommandLines];
	const subExecutionLines = splitAndSanitizeCommandLine(commandLine.value);
	if (newUnresolvedCommandLines && newUnresolvedCommandLines.length > 0) {
		// If all sub-execution lines are in the command line, this is part of the
		// multi-line execution.
		while (newUnresolvedCommandLines.length > 0) {
			if (newUnresolvedCommandLines[0] !== subExecutionLines[0]) {
				break;
			}
			newUnresolvedCommandLines.shift();
			subExecutionLines.shift();
		}

		if (subExecutionLines.length === 0) {
			return { unresolvedCommandLines: newUnresolvedCommandLines };
		}
	}
	return false;
}
