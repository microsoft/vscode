/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import * as errors from 'vs/base/common/errors';
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter } from 'vs/base/common/event';
import { ISuggestion } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { ISession, IConfig, IThread, IRawModelUpdate, IDebugService, IRawStoppedDetails, State, IRawSession, LoadedSourceEvent, DebugEvent } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { mixin } from 'vs/base/common/objects';
import { Thread, ExpressionContainer, Model } from 'vs/workbench/parts/debug/common/debugModel';
import { RawDebugSession } from 'vs/workbench/parts/debug/electron-browser/rawDebugSession';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Debugger } from 'vs/workbench/parts/debug/node/debugger';
import product from 'vs/platform/node/product';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { generateUuid } from 'vs/base/common/uuid';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class Session implements ISession {

	private sources = new Map<string, Source>();
	private threads = new Map<number, Thread>();
	private rawListeners: IDisposable[] = [];
	private fetchThreadsScheduler: RunOnceScheduler;
	private _raw: RawDebugSession;
	private _state: State;
	private readonly _onDidLoadedSource = new Emitter<LoadedSourceEvent>();
	private readonly _onDidCustomEvent = new Emitter<DebugEvent>();
	private readonly _onDidChangeState = new Emitter<State>();
	private readonly _onDidExitAdapter = new Emitter<void>();

	constructor(
		private id: string,
		private _configuration: { resolved: IConfig, unresolved: IConfig },
		public root: IWorkspaceFolder,
		private model: Model,
		@IInstantiationService private instantiationService: IInstantiationService,
		@INotificationService private notificationService: INotificationService,
		@IDebugService private debugService: IDebugService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.state = State.Initializing;
	}

	get raw(): IRawSession {
		return this._raw;
	}

	get configuration(): IConfig {
		return this._configuration.resolved;
	}

	get unresolvedConfiguration(): IConfig {
		return this._configuration.unresolved;
	}

	getName(includeRoot: boolean): string {
		return includeRoot && this.root ? `${this.configuration.name} (${resources.basenameOrAuthority(this.root.uri)})` : this.configuration.name;
	}

	get state(): State {
		return this._state;
	}

	set state(value: State) {
		this._state = value;
		this._onDidChangeState.fire(value);
	}

	get onDidChangeState(): Event<State> {
		return this._onDidChangeState.event;
	}

	getId(): string {
		return this.id;
	}

	getSourceForUri(modelUri: uri): Source {
		return this.sources.get(modelUri.toString());
	}

	getSource(raw: DebugProtocol.Source): Source {
		let source = new Source(raw, this.getId());
		if (this.sources.has(source.uri.toString())) {
			source = this.sources.get(source.uri.toString());
			source.raw = mixin(source.raw, raw);
			if (source.raw && raw) {
				// Always take the latest presentation hint from adapter #42139
				source.raw.presentationHint = raw.presentationHint;
			}
		} else {
			this.sources.set(source.uri.toString(), source);
		}

		return source;
	}

	getThread(threadId: number): Thread {
		return this.threads.get(threadId);
	}

	getAllThreads(): IThread[] {
		const result: IThread[] = [];
		this.threads.forEach(t => result.push(t));
		return result;
	}

	getLoadedSources(): TPromise<Source[]> {
		return this._raw.loadedSources({}).then(response => {
			return response.body.sources.map(src => this.getSource(src));
		}, () => {
			return [];
		});
	}

	get onDidLoadedSource(): Event<LoadedSourceEvent> {
		return this._onDidLoadedSource.event;
	}

	get onDidCustomEvent(): Event<DebugEvent> {
		return this._onDidCustomEvent.event;
	}

	get onDidExitAdapter(): Event<void> {
		return this._onDidExitAdapter.event;
	}

	rawUpdate(data: IRawModelUpdate): void {

		if (data.thread && !this.threads.has(data.threadId)) {
			// A new thread came in, initialize it.
			this.threads.set(data.threadId, new Thread(this, data.thread.name, data.thread.id));
		} else if (data.thread && data.thread.name) {
			// Just the thread name got updated #18244
			this.threads.get(data.threadId).name = data.thread.name;
		}

		if (data.stoppedDetails) {
			// Set the availability of the threads' callstacks depending on
			// whether the thread is stopped or not
			if (data.stoppedDetails.allThreadsStopped) {
				this.threads.forEach(thread => {
					thread.stoppedDetails = thread.threadId === data.threadId ? data.stoppedDetails : { reason: undefined };
					thread.stopped = true;
					thread.clearCallStack();
				});
			} else if (this.threads.has(data.threadId)) {
				// One thread is stopped, only update that thread.
				const thread = this.threads.get(data.threadId);
				thread.stoppedDetails = data.stoppedDetails;
				thread.clearCallStack();
				thread.stopped = true;
			}
		}
	}

	clearThreads(removeThreads: boolean, reference: number = undefined): void {
		if (reference !== undefined && reference !== null) {
			if (this.threads.has(reference)) {
				const thread = this.threads.get(reference);
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;

				if (removeThreads) {
					this.threads.delete(reference);
				}
			}
		} else {
			this.threads.forEach(thread => {
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;
			});

			if (removeThreads) {
				this.threads.clear();
				ExpressionContainer.allValues.clear();
			}
		}
	}

	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]> {
		if (!this._raw.capabilities.supportsCompletionsRequest) {
			return TPromise.as([]);
		}

		return this._raw.completions({
			frameId,
			text,
			column: position.column,
			line: position.lineNumber
		}).then(response => {
			const result: ISuggestion[] = [];
			if (response && response.body && response.body.targets) {
				response.body.targets.forEach(item => {
					if (item && item.label) {
						result.push({
							label: item.label,
							insertText: item.text || item.label,
							type: item.type,
							filterText: item.start && item.length && text.substr(item.start, item.length).concat(item.label),
							overwriteBefore: item.length || overwriteBefore
						});
					}
				});
			}

			return result;
		}, () => []);
	}

	initialize(dbgr: Debugger): TPromise<void> {
		if (this._raw) {
			// If there was already a connection make sure to remove old listeners
			this.dispose();
		}

		return dbgr.getCustomTelemetryService().then(customTelemetryService => {
			this._raw = this.instantiationService.createInstance(RawDebugSession, this.id, this._configuration.resolved.debugServer, dbgr, customTelemetryService, this.root);
			this.registerListeners();

			return this._raw.initialize({
				clientID: 'vscode',
				clientName: product.nameLong,
				adapterID: this.configuration.type,
				pathFormat: 'path',
				linesStartAt1: true,
				columnsStartAt1: true,
				supportsVariableType: true, // #8858
				supportsVariablePaging: true, // #9537
				supportsRunInTerminalRequest: true, // #10574
				locale: platform.locale
			}).then(() => {
				this.model.addSession(this);
				this.state = State.Running;
				this.model.setExceptionBreakpoints(this._raw.capabilities.exceptionBreakpointFilters);
			});
		});
	}

	private registerListeners(): void {
		this.rawListeners.push(this._raw.onDidInitialize(() => {
			aria.status(nls.localize('debuggingStarted', "Debugging started."));
			const sendConfigurationDone = () => {
				if (this._raw && this._raw.capabilities.supportsConfigurationDoneRequest) {
					return this._raw.configurationDone().done(null, e => {
						// Disconnect the debug session on configuration done error #10596
						if (this._raw) {
							this._raw.disconnect().done(undefined, errors.onUnexpectedError);
						}
						this.notificationService.error(e.message);
					});
				}
			};

			// Send all breakpoints
			this.debugService.setBreakpointsActivated(true).then(sendConfigurationDone, sendConfigurationDone)
				.done(() => this.fetchThreads(), errors.onUnexpectedError);
		}));

		this.rawListeners.push(this._raw.onDidStop(event => {
			this.state = State.Stopped;
			this.fetchThreads(event.body).done(() => {
				const thread = this.getThread(event.body.threadId);
				if (thread) {
					// Call fetch call stack twice, the first only return the top stack frame.
					// Second retrieves the rest of the call stack. For performance reasons #25605
					this.model.fetchCallStack(<Thread>thread).then(() => {
						return !event.body.preserveFocusHint ? this.debugService.tryToAutoFocusStackFrame(thread) : undefined;
					});
				}
			}, errors.onUnexpectedError);
		}));

		this.rawListeners.push(this._raw.onDidThread(event => {
			if (event.body.reason === 'started') {
				// debounce to reduce threadsRequest frequency and improve performance
				if (!this.fetchThreadsScheduler) {
					this.fetchThreadsScheduler = new RunOnceScheduler(() => {
						this.fetchThreads().done(undefined, errors.onUnexpectedError);
					}, 100);
					this.rawListeners.push(this.fetchThreadsScheduler);
				}
				if (!this.fetchThreadsScheduler.isScheduled()) {
					this.fetchThreadsScheduler.schedule();
				}
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(this.getId(), true, event.body.threadId);
			}
		}));

		this.rawListeners.push(this._raw.onDidTerminateDebugee(event => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (event.body && event.body.restart) {
				this.debugService.restartSession(this, event.body.restart).done(null, err => this.notificationService.error(err.message));
			} else {
				this._raw.disconnect().done(undefined, errors.onUnexpectedError);
			}
		}));

		this.rawListeners.push(this._raw.onDidContinued(event => {
			const threadId = event.body.allThreadsContinued !== false ? undefined : event.body.threadId;
			this.model.clearThreads(this.getId(), false, threadId);
			this.state = State.Running;
		}));

		let outputPromises: TPromise<void>[] = [];
		this.rawListeners.push(this._raw.onDidOutput(event => {
			if (!event.body) {
				return;
			}

			const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
			if (event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the debug extension provided the telemetry key
				// and the user opted in telemetry
				if (this._raw.customTelemetryService && this.telemetryService.isOptedIn) {
					// __GDPR__TODO__ We're sending events in the name of the debug extension and we can not ensure that those are declared correctly.
					this._raw.customTelemetryService.publicLog(event.body.output, event.body.data);
				}

				return;
			}

			// Make sure to append output in the correct order by properly waiting on preivous promises #33822
			const waitFor = outputPromises.slice();
			const source = event.body.source ? {
				lineNumber: event.body.line,
				column: event.body.column ? event.body.column : 1,
				source: this.getSource(event.body.source)
			} : undefined;
			if (event.body.variablesReference) {
				const container = new ExpressionContainer(this, event.body.variablesReference, generateUuid());
				outputPromises.push(container.getChildren().then(children => {
					return TPromise.join(waitFor).then(() => children.forEach(child => {
						// Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
						child.name = null;
						this.debugService.logToRepl(child, outputSeverity, source);
					}));
				}));
			} else if (typeof event.body.output === 'string') {
				TPromise.join(waitFor).then(() => this.debugService.logToRepl(event.body.output, outputSeverity, source));
			}
			TPromise.join(outputPromises).then(() => outputPromises = []);
		}));

		this.rawListeners.push(this._raw.onDidBreakpoint(event => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
			const functionBreakpoint = this.model.getFunctionBreakpoints().filter(bp => bp.idFromAdapter === id).pop();

			if (event.body.reason === 'new' && event.body.breakpoint.source) {
				const source = this.getSource(event.body.breakpoint.source);
				const bps = this.model.addBreakpoints(source.uri, [{
					column: event.body.breakpoint.column,
					enabled: true,
					lineNumber: event.body.breakpoint.line,
				}], false);
				if (bps.length === 1) {
					this.model.updateBreakpoints({ [bps[0].getId()]: event.body.breakpoint });
				}
			}

			if (event.body.reason === 'removed') {
				if (breakpoint) {
					this.model.removeBreakpoints([breakpoint]);
				}
				if (functionBreakpoint) {
					this.model.removeFunctionBreakpoints(functionBreakpoint.getId());
				}
			}

			if (event.body.reason === 'changed') {
				if (breakpoint) {
					if (!breakpoint.column) {
						event.body.breakpoint.column = undefined;
					}
					this.model.setBreakpointSessionData(this.getId(), { [breakpoint.getId()]: event.body.breakpoint });
				}
				if (functionBreakpoint) {
					this.model.setBreakpointSessionData(this.getId(), { [functionBreakpoint.getId()]: event.body.breakpoint });
				}
			}
		}));

		this.rawListeners.push(this._raw.onDidLoadedSource(event => {
			this._onDidLoadedSource.fire({
				reason: event.body.reason,
				source: this.getSource(event.body.source)
			});
		}));

		this.rawListeners.push(this._raw.onDidCustomEvent(event => {
			this._onDidCustomEvent.fire(event);
		}));

		this.rawListeners.push(this._raw.onDidExitAdapter(() => this._onDidExitAdapter.fire()));
	}

	private fetchThreads(stoppedDetails?: IRawStoppedDetails): TPromise<any> {
		return this._raw.threads().then(response => {
			if (response && response.body && response.body.threads) {
				response.body.threads.forEach(thread => {
					this.model.rawUpdate({
						sessionId: this.getId(),
						threadId: thread.id,
						thread,
						stoppedDetails: stoppedDetails && thread.id === stoppedDetails.threadId ? stoppedDetails : undefined
					});
				});
			}
		});
	}

	dispose(): void {
		dispose(this.rawListeners);
		this.model.removeSession(this.getId());
		if (!this._raw.disconnected) {
			this._raw.disconnect().done(undefined, errors.onUnexpectedError);
		}
		this._raw = undefined;
	}
}
