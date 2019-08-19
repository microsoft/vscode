/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import severity from 'vs/base/common/severity';
import { Event, Emitter } from 'vs/base/common/event';
import { CompletionItem, completionKindFromString } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IDebugSession, IConfig, IThread, IRawModelUpdate, IDebugService, IRawStoppedDetails, State, LoadedSourceEvent, IFunctionBreakpoint, IExceptionBreakpoint, IBreakpoint, IExceptionInfo, AdapterEndEvent, IDebugger, VIEWLET_ID, IDebugConfiguration, IReplElement, IStackFrame, IExpression, IReplElementSource, IDataBreakpoint } from 'vs/workbench/contrib/debug/common/debug';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { mixin } from 'vs/base/common/objects';
import { Thread, ExpressionContainer, DebugModel } from 'vs/workbench/contrib/debug/common/debugModel';
import { RawDebugSession } from 'vs/workbench/contrib/debug/browser/rawDebugSession';
import { IProductService } from 'vs/platform/product/common/product';
import { IWorkspaceFolder, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { generateUuid } from 'vs/base/common/uuid';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ReplModel } from 'vs/workbench/contrib/debug/common/replModel';
import { onUnexpectedError } from 'vs/base/common/errors';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class DebugSession implements IDebugSession {

	private id: string;
	private _subId: string | undefined;
	private raw: RawDebugSession | undefined;
	private initialized = false;

	private sources = new Map<string, Source>();
	private threads = new Map<number, Thread>();
	private rawListeners: IDisposable[] = [];
	private fetchThreadsScheduler: RunOnceScheduler | undefined;
	private repl: ReplModel;

	private readonly _onDidChangeState = new Emitter<void>();
	private readonly _onDidEndAdapter = new Emitter<AdapterEndEvent>();

	private readonly _onDidLoadedSource = new Emitter<LoadedSourceEvent>();
	private readonly _onDidCustomEvent = new Emitter<DebugProtocol.Event>();

	private readonly _onDidChangeREPLElements = new Emitter<void>();

	constructor(
		private _configuration: { resolved: IConfig, unresolved: IConfig | undefined },
		public root: IWorkspaceFolder,
		private model: DebugModel,
		private _parentSession: IDebugSession | undefined,
		@IDebugService private readonly debugService: IDebugService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWindowService private readonly windowService: IWindowService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewletService private readonly viewletService: IViewletService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		this.id = generateUuid();
		this.repl = new ReplModel(this);
	}

	getId(): string {
		return this.id;
	}

	setSubId(subId: string | undefined) {
		this._subId = subId;
	}

	get subId(): string | undefined {
		return this._subId;
	}

	get configuration(): IConfig {
		return this._configuration.resolved;
	}

	get unresolvedConfiguration(): IConfig | undefined {
		return this._configuration.unresolved;
	}

	get parentSession(): IDebugSession | undefined {
		return this._parentSession;
	}

	setConfiguration(configuration: { resolved: IConfig, unresolved: IConfig | undefined }) {
		this._configuration = configuration;
	}

	getLabel(): string {
		const includeRoot = this.workspaceContextService.getWorkspace().folders.length > 1;
		return includeRoot && this.root ? `${this.configuration.name} (${resources.basenameOrAuthority(this.root.uri)})` : this.configuration.name;
	}

	get state(): State {
		if (!this.initialized) {
			return State.Initializing;
		}
		if (!this.raw) {
			return State.Inactive;
		}

		const focusedThread = this.debugService.getViewModel().focusedThread;
		if (focusedThread && focusedThread.session === this) {
			return focusedThread.stopped ? State.Stopped : State.Running;
		}
		if (this.getAllThreads().some(t => t.stopped)) {
			return State.Stopped;
		}

		return State.Running;
	}

	get capabilities(): DebugProtocol.Capabilities {
		return this.raw ? this.raw.capabilities : Object.create(null);
	}

	//---- events
	get onDidChangeState(): Event<void> {
		return this._onDidChangeState.event;
	}

	get onDidEndAdapter(): Event<AdapterEndEvent> {
		return this._onDidEndAdapter.event;
	}

	get onDidChangeReplElements(): Event<void> {
		return this._onDidChangeREPLElements.event;
	}

	//---- DAP events

	get onDidCustomEvent(): Event<DebugProtocol.Event> {
		return this._onDidCustomEvent.event;
	}

	get onDidLoadedSource(): Event<LoadedSourceEvent> {
		return this._onDidLoadedSource.event;
	}

	//---- DAP requests

	/**
	 * create and initialize a new debug adapter for this session
	 */
	initialize(dbgr: IDebugger): Promise<void> {

		if (this.raw) {
			// if there was already a connection make sure to remove old listeners
			this.shutdown();
		}

		return dbgr.getCustomTelemetryService().then(customTelemetryService => {

			return dbgr.createDebugAdapter(this).then(debugAdapter => {

				this.raw = new RawDebugSession(debugAdapter, dbgr, this.telemetryService, customTelemetryService, this.windowsService);

				return this.raw.start().then(() => {

					this.registerListeners();

					return this.raw!.initialize({
						clientID: 'vscode',
						clientName: this.productService.nameLong,
						adapterID: this.configuration.type,
						pathFormat: 'path',
						linesStartAt1: true,
						columnsStartAt1: true,
						supportsVariableType: true, // #8858
						supportsVariablePaging: true, // #9537
						supportsRunInTerminalRequest: true, // #10574
						locale: platform.locale
					}).then(() => {
						this.initialized = true;
						this._onDidChangeState.fire();
						this.model.setExceptionBreakpoints(this.raw!.capabilities.exceptionBreakpointFilters || []);
					});
				});
			});
		}).then(undefined, err => {
			this.initialized = true;
			this._onDidChangeState.fire();
			return Promise.reject(err);
		});
	}

	/**
	 * launch or attach to the debuggee
	 */
	launchOrAttach(config: IConfig): Promise<void> {
		if (this.raw) {

			// __sessionID only used for EH debugging (but we add it always for now...)
			config.__sessionId = this.getId();

			return this.raw.launchOrAttach(config).then(result => {
				return undefined;
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	/**
	 * end the current debug adapter session
	 */
	terminate(restart = false): Promise<void> {
		if (this.raw) {
			if (this.raw.capabilities.supportsTerminateRequest && this._configuration.resolved.request === 'launch') {
				return this.raw.terminate(restart).then(response => {
					return undefined;
				});
			}
			return this.raw.disconnect(restart).then(response => {
				return undefined;
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	/**
	 * end the current debug adapter session
	 */
	disconnect(restart = false): Promise<void> {
		if (this.raw) {
			return this.raw.disconnect(restart).then(response => {
				return undefined;
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	/**
	 * restart debug adapter session
	 */
	restart(): Promise<void> {
		if (this.raw) {
			return this.raw.restart().then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	sendBreakpoints(modelUri: URI, breakpointsToSend: IBreakpoint[], sourceModified: boolean): Promise<void> {

		if (!this.raw) {
			return Promise.reject(new Error('no debug adapter'));
		}

		if (!this.raw.readyForBreakpoints) {
			return Promise.resolve(undefined);
		}

		const source = this.getSourceForUri(modelUri);
		let rawSource: DebugProtocol.Source;
		if (source) {
			rawSource = source.raw;
		} else {
			const data = Source.getEncodedDebugData(modelUri);
			rawSource = { name: data.name, path: data.path, sourceReference: data.sourceReference };
		}

		if (breakpointsToSend.length && !rawSource.adapterData) {
			rawSource.adapterData = breakpointsToSend[0].adapterData;
		}
		// Normalize all drive letters going out from vscode to debug adapters so we are consistent with our resolving #43959
		if (rawSource.path) {
			rawSource.path = normalizeDriveLetter(rawSource.path);
		}

		return this.raw.setBreakpoints({
			source: rawSource,
			lines: breakpointsToSend.map(bp => bp.sessionAgnosticData.lineNumber),
			breakpoints: breakpointsToSend.map(bp => ({ line: bp.sessionAgnosticData.lineNumber, column: bp.sessionAgnosticData.column, condition: bp.condition, hitCondition: bp.hitCondition, logMessage: bp.logMessage })),
			sourceModified
		}).then(response => {
			if (response && response.body) {
				const data = new Map<string, DebugProtocol.Breakpoint>();
				for (let i = 0; i < breakpointsToSend.length; i++) {
					data.set(breakpointsToSend[i].getId(), response.body.breakpoints[i]);
				}

				this.model.setBreakpointSessionData(this.getId(), data);
			}
		});
	}

	sendFunctionBreakpoints(fbpts: IFunctionBreakpoint[]): Promise<void> {
		if (this.raw) {
			if (this.raw.readyForBreakpoints) {
				return this.raw.setFunctionBreakpoints({ breakpoints: fbpts }).then(response => {
					if (response && response.body) {
						const data = new Map<string, DebugProtocol.Breakpoint>();
						for (let i = 0; i < fbpts.length; i++) {
							data.set(fbpts[i].getId(), response.body.breakpoints[i]);
						}
						this.model.setBreakpointSessionData(this.getId(), data);
					}
				});
			}

			return Promise.resolve(undefined);
		}

		return Promise.reject(new Error('no debug adapter'));
	}

	sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): Promise<void> {
		if (this.raw) {
			if (this.raw.readyForBreakpoints) {
				return this.raw.setExceptionBreakpoints({ filters: exbpts.map(exb => exb.filter) }).then(() => undefined);
			}
			return Promise.resolve(undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	dataBreakpointInfo(name: string, variablesReference?: number): Promise<{ dataId: string | null, description: string, canPersist?: boolean }> {
		if (this.raw) {
			if (this.raw.readyForBreakpoints) {
				return this.raw.dataBreakpointInfo({ name, variablesReference }).then(response => response.body);
			}
			return Promise.reject(new Error(nls.localize('sessionNotReadyForBreakpoints', "Session is not ready for breakpoints")));
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	sendDataBreakpoints(dataBreakpoints: IDataBreakpoint[]): Promise<void> {
		if (this.raw) {
			if (this.raw.readyForBreakpoints) {
				return this.raw.setDataBreakpoints({ breakpoints: dataBreakpoints }).then(response => {
					if (response && response.body) {
						const data = new Map<string, DebugProtocol.Breakpoint>();
						for (let i = 0; i < dataBreakpoints.length; i++) {
							data.set(dataBreakpoints[i].getId(), response.body.breakpoints[i]);
						}
						this.model.setBreakpointSessionData(this.getId(), data);
					}
				});
			}
			return Promise.resolve(undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	customRequest(request: string, args: any): Promise<DebugProtocol.Response> {
		if (this.raw) {
			return this.raw.custom(request, args);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	stackTrace(threadId: number, startFrame: number, levels: number): Promise<DebugProtocol.StackTraceResponse> {
		if (this.raw) {
			return this.raw.stackTrace({ threadId, startFrame, levels });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	exceptionInfo(threadId: number): Promise<IExceptionInfo | undefined> {
		if (this.raw) {
			return this.raw.exceptionInfo({ threadId }).then(response => {
				if (response) {
					return {
						id: response.body.exceptionId,
						description: response.body.description,
						breakMode: response.body.breakMode,
						details: response.body.details
					};
				}
				return undefined;
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	scopes(frameId: number): Promise<DebugProtocol.ScopesResponse> {
		if (this.raw) {
			return this.raw.scopes({ frameId });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	variables(variablesReference: number, filter: 'indexed' | 'named' | undefined, start: number | undefined, count: number | undefined): Promise<DebugProtocol.VariablesResponse> {
		if (this.raw) {
			return this.raw.variables({ variablesReference, filter, start, count });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	evaluate(expression: string, frameId: number, context?: string): Promise<DebugProtocol.EvaluateResponse> {
		if (this.raw) {
			return this.raw.evaluate({ expression, frameId, context });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	restartFrame(frameId: number, threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.restartFrame({ frameId }, threadId).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	next(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.next({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	stepIn(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.stepIn({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	stepOut(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.stepOut({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	stepBack(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.stepBack({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	continue(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.continue({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	reverseContinue(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.reverseContinue({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	pause(threadId: number): Promise<void> {
		if (this.raw) {
			return this.raw.pause({ threadId }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	terminateThreads(threadIds?: number[]): Promise<void> {
		if (this.raw) {
			return this.raw.terminateThreads({ threadIds }).then(() => undefined);
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	setVariable(variablesReference: number, name: string, value: string): Promise<DebugProtocol.SetVariableResponse> {
		if (this.raw) {
			return this.raw.setVariable({ variablesReference, name, value });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	gotoTargets(source: DebugProtocol.Source, line: number, column?: number): Promise<DebugProtocol.GotoTargetsResponse> {
		if (this.raw) {
			return this.raw.gotoTargets({ source, line, column });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	goto(threadId: number, targetId: number): Promise<DebugProtocol.GotoResponse> {
		if (this.raw) {
			return this.raw.goto({ threadId, targetId });
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	loadSource(resource: URI): Promise<DebugProtocol.SourceResponse> {

		if (!this.raw) {
			return Promise.reject(new Error('no debug adapter'));
		}

		const source = this.getSourceForUri(resource);
		let rawSource: DebugProtocol.Source;
		if (source) {
			rawSource = source.raw;
		} else {
			// create a Source

			let sourceRef: number | undefined;
			if (resource.query) {
				const data = Source.getEncodedDebugData(resource);
				sourceRef = data.sourceReference;
			}

			rawSource = {
				path: resource.with({ scheme: '', query: '' }).toString(true),	// Remove debug: scheme
				sourceReference: sourceRef
			};
		}

		return this.raw.source({ sourceReference: rawSource.sourceReference || 0, source: rawSource });
	}

	getLoadedSources(): Promise<Source[]> {
		if (this.raw) {
			return this.raw.loadedSources({}).then(response => {
				if (response.body && response.body.sources) {
					return response.body.sources.map(src => this.getSource(src));
				} else {
					return [];
				}
			}, () => {
				return [];
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	completions(frameId: number | undefined, text: string, position: Position, overwriteBefore: number): Promise<CompletionItem[]> {
		if (this.raw) {
			return this.raw.completions({
				frameId,
				text,
				column: position.column,
				line: position.lineNumber
			}).then(response => {

				const result: CompletionItem[] = [];
				if (response && response.body && response.body.targets) {
					response.body.targets.forEach(item => {
						if (item && item.label) {
							result.push({
								label: item.label,
								insertText: item.text || item.label,
								kind: completionKindFromString(item.type || 'property'),
								filterText: (item.start && item.length) ? text.substr(item.start, item.length).concat(item.label) : undefined,
								range: Range.fromPositions(position.delta(0, -(item.length || overwriteBefore)), position)
							});
						}
					});
				}

				return result;
			});
		}
		return Promise.reject(new Error('no debug adapter'));
	}

	//---- threads

	getThread(threadId: number): Thread | undefined {
		return this.threads.get(threadId);
	}

	getAllThreads(): IThread[] {
		const result: IThread[] = [];
		this.threads.forEach(t => result.push(t));
		return result;
	}

	clearThreads(removeThreads: boolean, reference: number | undefined = undefined): void {
		if (reference !== undefined && reference !== null) {
			const thread = this.threads.get(reference);
			if (thread) {
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

	rawUpdate(data: IRawModelUpdate): void {
		const threadIds: number[] = [];
		data.threads.forEach(thread => {
			threadIds.push(thread.id);
			if (!this.threads.has(thread.id)) {
				// A new thread came in, initialize it.
				this.threads.set(thread.id, new Thread(this, thread.name, thread.id));
			} else if (thread.name) {
				// Just the thread name got updated #18244
				const oldThread = this.threads.get(thread.id);
				if (oldThread) {
					oldThread.name = thread.name;
				}
			}
		});
		this.threads.forEach(t => {
			// Remove all old threads which are no longer part of the update #75980
			if (threadIds.indexOf(t.threadId) === -1) {
				this.threads.delete(t.threadId);
			}
		});

		const stoppedDetails = data.stoppedDetails;
		if (stoppedDetails) {
			// Set the availability of the threads' callstacks depending on
			// whether the thread is stopped or not
			if (stoppedDetails.allThreadsStopped) {
				this.threads.forEach(thread => {
					thread.stoppedDetails = thread.threadId === stoppedDetails.threadId ? stoppedDetails : { reason: undefined };
					thread.stopped = true;
					thread.clearCallStack();
				});
			} else {
				const thread = typeof stoppedDetails.threadId === 'number' ? this.threads.get(stoppedDetails.threadId) : undefined;
				if (thread) {
					// One thread is stopped, only update that thread.
					thread.stoppedDetails = stoppedDetails;
					thread.clearCallStack();
					thread.stopped = true;
				}
			}
		}
	}

	private fetchThreads(stoppedDetails?: IRawStoppedDetails): Promise<void> {
		return this.raw ? this.raw.threads().then(response => {
			if (response && response.body && response.body.threads) {
				this.model.rawUpdate({
					sessionId: this.getId(),
					threads: response.body.threads,
					stoppedDetails
				});
			}
		}) : Promise.resolve(undefined);
	}

	//---- private

	private registerListeners(): void {
		if (!this.raw) {
			return;
		}

		this.rawListeners.push(this.raw.onDidInitialize(() => {
			aria.status(nls.localize('debuggingStarted', "Debugging started."));
			const sendConfigurationDone = () => {
				if (this.raw && this.raw.capabilities.supportsConfigurationDoneRequest) {
					return this.raw.configurationDone().then(undefined, e => {
						// Disconnect the debug session on configuration done error #10596
						if (this.raw) {
							this.raw.disconnect();
						}
						if (e.command !== 'canceled' && e.message !== 'canceled') {
							this.notificationService.error(e);
						}
					});
				}

				return undefined;
			};

			// Send all breakpoints
			this.debugService.sendAllBreakpoints(this).then(sendConfigurationDone, sendConfigurationDone)
				.then(() => this.fetchThreads());
		}));

		this.rawListeners.push(this.raw.onDidStop(event => {
			this.fetchThreads(event.body).then(() => {
				const thread = typeof event.body.threadId === 'number' ? this.getThread(event.body.threadId) : undefined;
				if (thread) {
					// Call fetch call stack twice, the first only return the top stack frame.
					// Second retrieves the rest of the call stack. For performance reasons #25605
					const promises = this.model.fetchCallStack(<Thread>thread);
					const focus = () => {
						if (!event.body.preserveFocusHint && thread.getCallStack().length) {
							this.debugService.focusStackFrame(undefined, thread);
							if (thread.stoppedDetails) {
								if (this.configurationService.getValue<IDebugConfiguration>('debug').openDebug === 'openOnDebugBreak') {
									this.viewletService.openViewlet(VIEWLET_ID);
								}

								if (this.configurationService.getValue<IDebugConfiguration>('debug').focusWindowOnBreak) {
									this.windowService.focusWindow();
								}
							}
						}
					};

					promises.topCallStack.then(focus);
					promises.wholeCallStack.then(() => {
						if (!this.debugService.getViewModel().focusedStackFrame) {
							// The top stack frame can be deemphesized so try to focus again #68616
							focus();
						}
					});
				}
			}).then(() => this._onDidChangeState.fire());
		}));

		this.rawListeners.push(this.raw.onDidThread(event => {
			if (event.body.reason === 'started') {
				// debounce to reduce threadsRequest frequency and improve performance
				if (!this.fetchThreadsScheduler) {
					this.fetchThreadsScheduler = new RunOnceScheduler(() => {
						this.fetchThreads();
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

		this.rawListeners.push(this.raw.onDidTerminateDebugee(event => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (event.body && event.body.restart) {
				this.debugService.restartSession(this, event.body.restart).then(undefined, onUnexpectedError);
			} else if (this.raw) {
				this.raw.disconnect();
			}
		}));

		this.rawListeners.push(this.raw.onDidContinued(event => {
			const threadId = event.body.allThreadsContinued !== false ? undefined : event.body.threadId;
			this.model.clearThreads(this.getId(), false, threadId);
			this._onDidChangeState.fire();
		}));

		let outpuPromises: Promise<void>[] = [];
		this.rawListeners.push(this.raw.onDidOutput(event => {
			if (!event.body || !this.raw) {
				return;
			}

			const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
			if (event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the debug extension provided the telemetry key
				// and the user opted in telemetry
				if (this.raw.customTelemetryService && this.telemetryService.isOptedIn) {
					// __GDPR__TODO__ We're sending events in the name of the debug extension and we can not ensure that those are declared correctly.
					this.raw.customTelemetryService.publicLog(event.body.output, event.body.data);
				}

				return;
			}

			// Make sure to append output in the correct order by properly waiting on preivous promises #33822
			const waitFor = outpuPromises.slice();
			const source = event.body.source && event.body.line ? {
				lineNumber: event.body.line,
				column: event.body.column ? event.body.column : 1,
				source: this.getSource(event.body.source)
			} : undefined;
			if (event.body.variablesReference) {
				const container = new ExpressionContainer(this, event.body.variablesReference, generateUuid());
				outpuPromises.push(container.getChildren().then(children => {
					return Promise.all(waitFor).then(() => children.forEach(child => {
						// Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
						(<any>child).name = null;
						this.appendToRepl(child, outputSeverity, source);
					}));
				}));
			} else if (typeof event.body.output === 'string') {
				Promise.all(waitFor).then(() => this.appendToRepl(event.body.output, outputSeverity, source));
			}
			Promise.all(outpuPromises).then(() => outpuPromises = []);
		}));

		this.rawListeners.push(this.raw.onDidBreakpoint(event => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
			const functionBreakpoint = this.model.getFunctionBreakpoints().filter(bp => bp.idFromAdapter === id).pop();

			if (event.body.reason === 'new' && event.body.breakpoint.source && event.body.breakpoint.line) {
				const source = this.getSource(event.body.breakpoint.source);
				const bps = this.model.addBreakpoints(source.uri, [{
					column: event.body.breakpoint.column,
					enabled: true,
					lineNumber: event.body.breakpoint.line,
				}], false);
				if (bps.length === 1) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[bps[0].getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), data);
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
					const data = new Map<string, DebugProtocol.Breakpoint>([[breakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), data);
				}
				if (functionBreakpoint) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[functionBreakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), data);
				}
			}
		}));

		this.rawListeners.push(this.raw.onDidLoadedSource(event => {
			this._onDidLoadedSource.fire({
				reason: event.body.reason,
				source: this.getSource(event.body.source)
			});
		}));

		this.rawListeners.push(this.raw.onDidCustomEvent(event => {
			this._onDidCustomEvent.fire(event);
		}));

		this.rawListeners.push(this.raw.onDidExitAdapter(event => {
			this.initialized = true;
			this._onDidEndAdapter.fire(event);
		}));
	}

	shutdown(): void {
		dispose(this.rawListeners);
		if (this.raw) {
			this.raw.disconnect();
		}
		this.raw = undefined;
		this.model.clearThreads(this.getId(), true);
		this._onDidChangeState.fire();
	}

	//---- sources

	getSourceForUri(uri: URI): Source | undefined {
		return this.sources.get(this.getUriKey(uri));
	}

	getSource(raw?: DebugProtocol.Source): Source {
		let source = new Source(raw, this.getId());
		const uriKey = this.getUriKey(source.uri);
		const found = this.sources.get(uriKey);
		if (found) {
			source = found;
			// merge attributes of new into existing
			source.raw = mixin(source.raw, raw);
			if (source.raw && raw) {
				// Always take the latest presentation hint from adapter #42139
				source.raw.presentationHint = raw.presentationHint;
			}
		} else {
			this.sources.set(uriKey, source);
		}

		return source;
	}

	private getUriKey(uri: URI): string {
		// TODO: the following code does not make sense if uri originates from a different platform
		return platform.isLinux ? uri.toString() : uri.toString().toLowerCase();
	}

	// REPL

	getReplElements(): IReplElement[] {
		return this.repl.getReplElements();
	}

	removeReplExpressions(): void {
		this.repl.removeReplExpressions();
		this._onDidChangeREPLElements.fire();
	}

	addReplExpression(stackFrame: IStackFrame | undefined, name: string): Promise<void> {
		const viewModel = this.debugService.getViewModel();
		return this.repl.addReplExpression(stackFrame, name)
			.then(() => this._onDidChangeREPLElements.fire())
			// Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
			.then(() => this.debugService.focusStackFrame(viewModel.focusedStackFrame, viewModel.focusedThread, viewModel.focusedSession));
	}

	appendToRepl(data: string | IExpression, severity: severity, source?: IReplElementSource): void {
		this.repl.appendToRepl(data, severity, source);
		this._onDidChangeREPLElements.fire();
	}

	logToRepl(sev: severity, args: any[], frame?: { uri: URI, line: number, column: number }) {
		this.repl.logToRepl(sev, args, frame);
		this._onDidChangeREPLElements.fire();
	}
}
