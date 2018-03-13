/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import * as resources from 'vs/base/common/resources';
import * as strings from 'vs/base/common/strings';
import { generateUuid } from 'vs/base/common/uuid';
import uri from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import { first, distinct } from 'vs/base/common/arrays';
import { isObject, isUndefinedOrNull } from 'vs/base/common/types';
import * as errors from 'vs/base/common/errors';
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { RawDebugSession } from 'vs/workbench/parts/debug/electron-browser/rawDebugSession';
import { Model, ExceptionBreakpoint, FunctionBreakpoint, Breakpoint, Expression, RawObjectReplElement, ExpressionContainer, Process } from 'vs/workbench/parts/debug/common/debugModel';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import * as debugactions from 'vs/workbench/parts/debug/browser/debugActions';
import { ConfigurationManager } from 'vs/workbench/parts/debug/electron-browser/debugConfigurationManager';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import { ITaskService, ITaskSummary } from 'vs/workbench/parts/tasks/common/taskService';
import { TaskError } from 'vs/workbench/parts/tasks/common/taskSystem';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EXTENSION_LOG_BROADCAST_CHANNEL, EXTENSION_ATTACH_BROADCAST_CHANNEL, EXTENSION_TERMINATE_BROADCAST_CHANNEL, EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL, EXTENSION_RELOAD_BROADCAST_CHANNEL } from 'vs/platform/extensions/common/extensionHost';
import { IBroadcastService, IBroadcast } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { IRemoteConsoleLog, parse, getFirstFrame } from 'vs/base/node/console';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { TaskEvent, TaskEventKind } from 'vs/workbench/parts/tasks/common/tasks';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAction, Action } from 'vs/base/common/actions';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { RunOnceScheduler } from 'vs/base/common/async';
import product from 'vs/platform/node/product';

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';

export class DebugService implements debug.IDebugService {
	public _serviceBrand: any;

	private sessionStates: Map<string, debug.State>;
	private _onDidChangeState: Emitter<debug.State>;
	private _onDidNewProcess: Emitter<debug.IProcess>;
	private _onDidEndProcess: Emitter<debug.IProcess>;
	private _onDidCustomEvent: Emitter<debug.DebugEvent>;
	private model: Model;
	private viewModel: ViewModel;
	private allProcesses: Map<string, debug.IProcess>;
	private configurationManager: ConfigurationManager;
	private toDispose: lifecycle.IDisposable[];
	private toDisposeOnSessionEnd: Map<string, lifecycle.IDisposable[]>;
	private inDebugMode: IContextKey<boolean>;
	private debugType: IContextKey<string>;
	private debugState: IContextKey<string>;
	private breakpointsToSendOnResourceSaved: Set<string>;
	private launchJsonChanged: boolean;
	private firstSessionStart: boolean;
	private skipRunningTask: boolean;
	private previousState: debug.State;
	private fetchThreadsSchedulers: Map<string, RunOnceScheduler>;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@INotificationService private notificationService: INotificationService,
		@IDialogService private dialogService: IDialogService,
		@IPartService private partService: IPartService,
		@IWindowService private windowService: IWindowService,
		@IBroadcastService private broadcastService: IBroadcastService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionService private extensionService: IExtensionService,
		@IMarkerService private markerService: IMarkerService,
		@ITaskService private taskService: ITaskService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.toDispose = [];
		this.toDisposeOnSessionEnd = new Map<string, lifecycle.IDisposable[]>();
		this.breakpointsToSendOnResourceSaved = new Set<string>();
		this._onDidChangeState = new Emitter<debug.State>();
		this._onDidNewProcess = new Emitter<debug.IProcess>();
		this._onDidEndProcess = new Emitter<debug.IProcess>();
		this._onDidCustomEvent = new Emitter<debug.DebugEvent>();
		this.sessionStates = new Map<string, debug.State>();
		this.allProcesses = new Map<string, debug.IProcess>();
		this.fetchThreadsSchedulers = new Map<string, RunOnceScheduler>();

		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager);
		this.toDispose.push(this.configurationManager);
		this.inDebugMode = debug.CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
		this.debugType = debug.CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
		this.debugState = debug.CONTEXT_DEBUG_STATE.bindTo(contextKeyService);

		this.model = new Model(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true), this.loadFunctionBreakpoints(),
			this.loadExceptionBreakpoints(), this.loadWatchExpressions());
		this.toDispose.push(this.model);
		this.viewModel = new ViewModel(contextKeyService);
		this.firstSessionStart = true;

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));
		this.lifecycleService.onShutdown(this.store, this);
		this.lifecycleService.onShutdown(this.dispose, this);
		this.toDispose.push(this.broadcastService.onBroadcast(this.onBroadcast, this));
	}

	private onBroadcast(broadcast: IBroadcast): void {

		// attach: PH is ready to be attached to
		const process = this.allProcesses.get(broadcast.payload.debugId);
		if (!process) {
			// Ignore attach events for sessions that never existed (wrong vscode windows)
			return;
		}
		const session = <RawDebugSession>process.session;

		if (broadcast.channel === EXTENSION_ATTACH_BROADCAST_CHANNEL) {
			this.onSessionEnd(session);

			process.configuration.request = 'attach';
			process.configuration.port = broadcast.payload.port;
			this.doCreateProcess(process.session.root, process.configuration, process.getId());
			return;
		}

		if (broadcast.channel === EXTENSION_TERMINATE_BROADCAST_CHANNEL) {
			this.onSessionEnd(session);
			return;
		}

		// an extension logged output, show it inside the REPL
		if (broadcast.channel === EXTENSION_LOG_BROADCAST_CHANNEL) {
			let extensionOutput: IRemoteConsoleLog = broadcast.payload.logEntry;
			let sev = extensionOutput.severity === 'warn' ? severity.Warning : extensionOutput.severity === 'error' ? severity.Error : severity.Info;

			const { args, stack } = parse(extensionOutput);
			let source: debug.IReplElementSource;
			if (stack) {
				const frame = getFirstFrame(stack);
				if (frame) {
					source = {
						column: frame.column,
						lineNumber: frame.line,
						source: process.getSource({
							name: resources.basenameOrAuthority(frame.uri),
							path: frame.uri.fsPath
						})
					};
				}
			}

			// add output for each argument logged
			let simpleVals: any[] = [];
			for (let i = 0; i < args.length; i++) {
				let a = args[i];

				// undefined gets printed as 'undefined'
				if (typeof a === 'undefined') {
					simpleVals.push('undefined');
				}

				// null gets printed as 'null'
				else if (a === null) {
					simpleVals.push('null');
				}

				// objects & arrays are special because we want to inspect them in the REPL
				else if (isObject(a) || Array.isArray(a)) {

					// flush any existing simple values logged
					if (simpleVals.length) {
						this.logToRepl(simpleVals.join(' '), sev, source);
						simpleVals = [];
					}

					// show object
					this.logToRepl(new RawObjectReplElement((<any>a).prototype, a, undefined, nls.localize('snapshotObj', "Only primitive values are shown for this object.")), sev, source);
				}

				// string: watch out for % replacement directive
				// string substitution and formatting @ https://developer.chrome.com/devtools/docs/console
				else if (typeof a === 'string') {
					let buf = '';

					for (let j = 0, len = a.length; j < len; j++) {
						if (a[j] === '%' && (a[j + 1] === 's' || a[j + 1] === 'i' || a[j + 1] === 'd')) {
							i++; // read over substitution
							buf += !isUndefinedOrNull(args[i]) ? args[i] : ''; // replace
							j++; // read over directive
						} else {
							buf += a[j];
						}
					}

					simpleVals.push(buf);
				}

				// number or boolean is joined together
				else {
					simpleVals.push(a);
				}
			}

			// flush simple values
			// always append a new line for output coming from an extension such that separate logs go to separate lines #23695
			if (simpleVals.length) {
				this.logToRepl(simpleVals.join(' ') + '\n', sev, source);
			}
		}
	}

	private tryToAutoFocusStackFrame(thread: debug.IThread): TPromise<any> {
		const callStack = thread.getCallStack();
		if (!callStack.length || (this.viewModel.focusedStackFrame && this.viewModel.focusedStackFrame.thread.getId() === thread.getId())) {
			return TPromise.as(null);
		}

		// focus first stack frame from top that has source location if no other stack frame is focused
		const stackFrameToFocus = first(callStack, sf => sf.source && sf.source.available, undefined);
		if (!stackFrameToFocus) {
			return TPromise.as(null);
		}

		this.focusStackFrame(stackFrameToFocus);
		if (thread.stoppedDetails) {
			this.windowService.focusWindow();
			aria.alert(nls.localize('debuggingPaused', "Debugging paused, reason {0}, {1} {2}", thread.stoppedDetails.reason, stackFrameToFocus.source ? stackFrameToFocus.source.name : '', stackFrameToFocus.range.startLineNumber));
		}

		return stackFrameToFocus.openInEditor(this.editorService, true);
	}

	private registerSessionListeners(process: Process, session: RawDebugSession): void {

		this.toDisposeOnSessionEnd.get(session.getId()).push(session);

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidInitialize(event => {
			aria.status(nls.localize('debuggingStarted', "Debugging started."));
			const sendConfigurationDone = () => {
				if (session && session.capabilities.supportsConfigurationDoneRequest) {
					return session.configurationDone().done(null, e => {
						// Disconnect the debug session on configuration done error #10596
						if (session) {
							session.disconnect().done(null, errors.onUnexpectedError);
						}
						this.notificationService.error(e.message);
					});
				}
			};

			this.sendAllBreakpoints(process).then(sendConfigurationDone, sendConfigurationDone)
				.done(() => this.fetchThreads(session), errors.onUnexpectedError);
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidStop(event => {
			this.updateStateAndEmit(session.getId(), debug.State.Stopped);
			this.fetchThreads(session, event.body).done(() => {
				const thread = process && process.getThread(event.body.threadId);
				if (thread) {
					// Call fetch call stack twice, the first only return the top stack frame.
					// Second retrieves the rest of the call stack. For performance reasons #25605
					this.model.fetchCallStack(thread).then(() => {
						return this.tryToAutoFocusStackFrame(thread);
					});
				}
			}, errors.onUnexpectedError);
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidThread(event => {
			if (event.body.reason === 'started') {
				// debounce to reduce threadsRequest frequency and improve performance
				let scheduler = this.fetchThreadsSchedulers.get(session.getId());
				if (!scheduler) {
					scheduler = new RunOnceScheduler(() => {
						this.fetchThreads(session).done(undefined, errors.onUnexpectedError);
					}, 100);
					this.fetchThreadsSchedulers.set(session.getId(), scheduler);
					this.toDisposeOnSessionEnd.get(session.getId()).push(scheduler);
				}
				if (!scheduler.isScheduled()) {
					scheduler.schedule();
				}
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(session.getId(), true, event.body.threadId);
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidTerminateDebugee(event => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (session && session.getId() === event.sessionId) {
				if (event.body && event.body.restart && process) {
					this.restartProcess(process, event.body.restart).done(null, err => this.notificationService.error(err.message));
				} else {
					session.disconnect().done(null, errors.onUnexpectedError);
				}
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidContinued(event => {
			const threadId = event.body.allThreadsContinued !== false ? undefined : event.body.threadId;
			this.model.clearThreads(session.getId(), false, threadId);
			if (this.viewModel.focusedProcess.getId() === session.getId()) {
				this.focusStackFrame(undefined, this.viewModel.focusedThread, this.viewModel.focusedProcess);
			}
			this.updateStateAndEmit(session.getId(), debug.State.Running);
		}));

		let outputPromises: TPromise<void>[] = [];
		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidOutput(event => {
			if (!event.body) {
				return;
			}

			const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
			if (event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the adapter provided the telemetry key
				// and the user opted in telemetry
				if (session.customTelemetryService && this.telemetryService.isOptedIn) {
					// __GDPR__TODO__ We're sending events in the name of the debug adapter and we can not ensure that those are declared correctly.
					session.customTelemetryService.publicLog(event.body.output, event.body.data);
				}

				return;
			}

			// Make sure to append output in the correct order by properly waiting on preivous promises #33822
			const waitFor = outputPromises.slice();
			const source = event.body.source ? {
				lineNumber: event.body.line,
				column: event.body.column,
				source: process.getSource(event.body.source)
			} : undefined;
			if (event.body.variablesReference) {
				const container = new ExpressionContainer(process, event.body.variablesReference, generateUuid());
				outputPromises.push(container.getChildren().then(children => {
					return TPromise.join(waitFor).then(() => children.forEach(child => {
						// Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
						child.name = null;
						this.logToRepl(child, outputSeverity, source);
					}));
				}));
			} else if (typeof event.body.output === 'string') {
				TPromise.join(waitFor).then(() => this.logToRepl(event.body.output, outputSeverity, source));
			}
			TPromise.join(outputPromises).then(() => outputPromises = []);
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidBreakpoint(event => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
			const functionBreakpoint = this.model.getFunctionBreakpoints().filter(bp => bp.idFromAdapter === id).pop();

			if (event.body.reason === 'new' && event.body.breakpoint.source) {
				const source = process.getSource(event.body.breakpoint.source);
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
					this.model.updateBreakpoints({ [breakpoint.getId()]: event.body.breakpoint });
				}
				if (functionBreakpoint) {
					this.model.updateFunctionBreakpoints({ [functionBreakpoint.getId()]: event.body.breakpoint });
				}
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidExitAdapter(event => {
			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			if (strings.equalsIgnoreCase(process.configuration.type, 'extensionhost') && this.sessionStates.get(session.getId()) === debug.State.Running &&
				process && process.session.root && process.configuration.noDebug) {
				this.broadcastService.broadcast({
					channel: EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL,
					payload: [process.session.root.uri.fsPath]
				});
			}
			if (session && session.getId() === event.sessionId) {
				this.onSessionEnd(session);
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidCustomEvent(event => {
			this._onDidCustomEvent.fire(event);
		}));
	}

	private fetchThreads(session: RawDebugSession, stoppedDetails?: debug.IRawStoppedDetails): TPromise<any> {
		return session.threads().then(response => {
			if (response && response.body && response.body.threads) {
				response.body.threads.forEach(thread => {
					this.model.rawUpdate({
						sessionId: session.getId(),
						threadId: thread.id,
						thread,
						stoppedDetails: stoppedDetails && thread.id === stoppedDetails.threadId ? stoppedDetails : undefined
					});
				});
			}
		});
	}

	private loadBreakpoints(): Breakpoint[] {
		let result: Breakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: any) => {
				return new Breakpoint(uri.parse(breakpoint.uri.external || breakpoint.source.uri.external), breakpoint.lineNumber, breakpoint.column, breakpoint.enabled, breakpoint.condition, breakpoint.hitCondition, breakpoint.adapterData);
			});
		} catch (e) { }

		return result || [];
	}

	private loadFunctionBreakpoints(): FunctionBreakpoint[] {
		let result: FunctionBreakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((fb: any) => {
				return new FunctionBreakpoint(fb.name, fb.enabled, fb.hitCondition);
			});
		} catch (e) { }

		return result || [];
	}

	private loadExceptionBreakpoints(): ExceptionBreakpoint[] {
		let result: ExceptionBreakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: any) => {
				return new ExceptionBreakpoint(exBreakpoint.filter || exBreakpoint.name, exBreakpoint.label, exBreakpoint.enabled);
			});
		} catch (e) { }

		return result || [];
	}

	private loadWatchExpressions(): Expression[] {
		let result: Expression[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE, '[]')).map((watchStoredData: { name: string, id: string }) => {
				return new Expression(watchStoredData.name, watchStoredData.id);
			});
		} catch (e) { }

		return result || [];
	}

	public get state(): debug.State {
		const focusedThread = this.viewModel.focusedThread;
		if (focusedThread && focusedThread.stopped) {
			return debug.State.Stopped;
		}
		const focusedProcess = this.viewModel.focusedProcess;
		if (focusedProcess && this.sessionStates.has(focusedProcess.getId())) {
			return this.sessionStates.get(focusedProcess.getId());
		}
		if (this.sessionStates.size > 0) {
			return debug.State.Initializing;
		}

		return debug.State.Inactive;
	}

	public get onDidChangeState(): Event<debug.State> {
		return this._onDidChangeState.event;
	}

	public get onDidNewProcess(): Event<debug.IProcess> {
		return this._onDidNewProcess.event;
	}

	public get onDidEndProcess(): Event<debug.IProcess> {
		return this._onDidEndProcess.event;
	}

	public get onDidCustomEvent(): Event<debug.DebugEvent> {
		return this._onDidCustomEvent.event;
	}

	private updateStateAndEmit(sessionId?: string, newState?: debug.State): void {
		if (sessionId) {
			if (newState === debug.State.Inactive) {
				this.sessionStates.delete(sessionId);
			} else {
				this.sessionStates.set(sessionId, newState);
			}
		}

		const state = this.state;
		if (this.previousState !== state) {
			const stateLabel = debug.State[state];
			if (stateLabel) {
				this.debugState.set(stateLabel.toLowerCase());
			}
			this.previousState = state;
			this._onDidChangeState.fire(state);
		}
	}

	public focusStackFrame(stackFrame: debug.IStackFrame, thread?: debug.IThread, process?: debug.IProcess, explicit?: boolean): void {
		if (!process) {
			if (stackFrame || thread) {
				process = stackFrame ? stackFrame.thread.process : thread.process;
			} else {
				const processes = this.model.getProcesses();
				process = processes.length ? processes[0] : undefined;
			}
		}

		if (!thread) {
			if (stackFrame) {
				thread = stackFrame.thread;
			} else {
				const threads = process ? process.getAllThreads() : undefined;
				thread = threads && threads.length ? threads[0] : undefined;
			}
		}

		if (!stackFrame) {
			if (thread) {
				const callStack = thread.getCallStack();
				stackFrame = callStack && callStack.length ? callStack[0] : null;
			}
		}

		this.viewModel.setFocus(stackFrame, thread, process, explicit);
		this.updateStateAndEmit();
	}

	public enableOrDisableBreakpoints(enable: boolean, breakpoint?: debug.IEnablement): TPromise<void> {
		if (breakpoint) {
			this.model.setEnablement(breakpoint, enable);
			if (breakpoint instanceof Breakpoint) {
				return this.sendBreakpoints(breakpoint.uri);
			} else if (breakpoint instanceof FunctionBreakpoint) {
				return this.sendFunctionBreakpoints();
			}

			return this.sendExceptionBreakpoints();
		}

		this.model.enableOrDisableAllBreakpoints(enable);
		return this.sendAllBreakpoints();
	}

	public addBreakpoints(uri: uri, rawBreakpoints: debug.IBreakpointData[]): TPromise<void> {
		this.model.addBreakpoints(uri, rawBreakpoints);
		rawBreakpoints.forEach(rbp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", rbp.lineNumber, uri.fsPath)));

		return this.sendBreakpoints(uri);
	}

	public updateBreakpoints(uri: uri, data: { [id: string]: DebugProtocol.Breakpoint }, sendOnResourceSaved: boolean): void {
		this.model.updateBreakpoints(data);
		if (sendOnResourceSaved) {
			this.breakpointsToSendOnResourceSaved.add(uri.toString());
		} else {
			this.sendBreakpoints(uri);
		}
	}

	public removeBreakpoints(id?: string): TPromise<any> {
		const toRemove = this.model.getBreakpoints().filter(bp => !id || bp.getId() === id);
		toRemove.forEach(bp => aria.status(nls.localize('breakpointRemoved', "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
		const urisToClear = distinct(toRemove, bp => bp.uri.toString()).map(bp => bp.uri);

		this.model.removeBreakpoints(toRemove);

		return TPromise.join(urisToClear.map(uri => this.sendBreakpoints(uri)));
	}

	public setBreakpointsActivated(activated: boolean): TPromise<void> {
		this.model.setBreakpointsActivated(activated);
		return this.sendAllBreakpoints();
	}

	public addFunctionBreakpoint(name?: string, id?: string): void {
		const newFunctionBreakpoint = this.model.addFunctionBreakpoint(name || '', id);
		this.viewModel.setSelectedFunctionBreakpoint(newFunctionBreakpoint);
	}

	public renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void> {
		this.model.updateFunctionBreakpoints({ [id]: { name: newFunctionName } });
		return this.sendFunctionBreakpoints();
	}

	public removeFunctionBreakpoints(id?: string): TPromise<void> {
		this.model.removeFunctionBreakpoints(id);
		return this.sendFunctionBreakpoints();
	}

	public addReplExpression(name: string): TPromise<void> {
		return this.model.addReplExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, name)
			// Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
			.then(() => this.focusStackFrame(this.viewModel.focusedStackFrame, this.viewModel.focusedThread, this.viewModel.focusedProcess));
	}

	public removeReplExpressions(): void {
		this.model.removeReplExpressions();
	}

	public logToRepl(value: string | debug.IExpression, sev = severity.Info, source?: debug.IReplElementSource): void {
		if (typeof value === 'string' && '[2J'.localeCompare(value) === 0) {
			// [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
			this.model.removeReplExpressions();
		} else {
			this.model.appendToRepl(value, sev, source);
		}
	}

	public addWatchExpression(name: string): void {
		const we = this.model.addWatchExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, name);
		this.viewModel.setSelectedExpression(we);
	}

	public renameWatchExpression(id: string, newName: string): void {
		return this.model.renameWatchExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, id, newName);
	}

	public moveWatchExpression(id: string, position: number): void {
		this.model.moveWatchExpression(id, position);
	}

	public removeWatchExpressions(id?: string): void {
		this.model.removeWatchExpressions(id);
	}

	public startDebugging(launch: debug.ILaunch, configOrName?: debug.IConfig | string, noDebug = false): TPromise<any> {

		// make sure to save all files and that the configuration is up to date
		return this.extensionService.activateByEvent('onDebug').then(() => this.textFileService.saveAll().then(() => this.configurationService.reloadConfiguration(launch ? launch.workspace : undefined).then(() =>
			this.extensionService.whenInstalledExtensionsRegistered().then(() => {
				if (this.model.getProcesses().length === 0) {
					this.removeReplExpressions();
					this.allProcesses.clear();
					this.model.getBreakpoints().forEach(bp => bp.verified = false);
				}
				this.launchJsonChanged = false;

				let config: debug.IConfig, compound: debug.ICompound;
				if (!configOrName) {
					configOrName = this.configurationManager.selectedConfiguration.name;
				}
				if (typeof configOrName === 'string' && launch) {
					config = launch.getConfiguration(configOrName);
					compound = launch.getCompound(configOrName);
				} else if (typeof configOrName !== 'string') {
					config = configOrName;
				}

				if (compound) {
					if (!compound.configurations) {
						return TPromise.wrapError(new Error(nls.localize({ key: 'compoundMustHaveConfigurations', comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
							"Compound must have \"configurations\" attribute set in order to start multiple configurations.")));
					}

					return TPromise.join(compound.configurations.map(configData => {
						const name = typeof configData === 'string' ? configData : configData.name;
						if (name === compound.name) {
							return TPromise.as(null);
						}

						let launchForName: debug.ILaunch;
						if (typeof configData === 'string') {
							const launchesContainingName = this.configurationManager.getLaunches().filter(l => !!l.getConfiguration(name));
							if (launchesContainingName.length === 1) {
								launchForName = launchesContainingName[0];
							} else if (launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
								// If there are multiple launches containing the configuration give priority to the configuration in the current launch
								launchForName = launch;
							} else {
								return TPromise.wrapError(new Error(launchesContainingName.length === 0 ? nls.localize('noConfigurationNameInWorkspace', "Could not find launch configuration '{0}' in the workspace.", name)
									: nls.localize('multipleConfigurationNamesInWorkspace', "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name)));
							}
						} else if (configData.folder) {
							const launchesMatchingConfigData = this.configurationManager.getLaunches().filter(l => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
							if (launchesMatchingConfigData.length === 1) {
								launchForName = launchesMatchingConfigData[0];
							} else {
								return TPromise.wrapError(new Error(nls.localize('noFolderWithName', "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound.name)));
							}
						}

						return this.startDebugging(launchForName, name, noDebug);
					}));
				}
				if (configOrName && !config) {
					const message = !!launch ? nls.localize('configMissing', "Configuration '{0}' is missing in 'launch.json'.", configOrName) :
						nls.localize('launchJsonDoesNotExist', "'launch.json' does not exist.");
					return TPromise.wrapError(new Error(message));
				}

				// We keep the debug type in a separate variable 'type' so that a no-folder config has no attributes.
				// Storing the type in the config would break extensions that assume that the no-folder case is indicated by an empty config.
				let type: string;
				if (config) {
					type = config.type;
				} else {
					// a no-folder workspace has no launch.config
					config = <debug.IConfig>{};
				}
				if (noDebug) {
					config.noDebug = true;
				}

				const sessionId = generateUuid();
				this.updateStateAndEmit(sessionId, debug.State.Initializing);
				const wrapUpState = () => {
					if (this.sessionStates.get(sessionId) === debug.State.Initializing) {
						this.updateStateAndEmit(sessionId, debug.State.Inactive);
					}
				};

				return (type ? TPromise.as(null) : this.configurationManager.guessAdapter().then(a => type = a && a.type)).then(() =>
					(type ? this.extensionService.activateByEvent(`onDebugResolve:${type}`) : TPromise.as(null)).then(() =>
						this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : undefined, type, config).then(config => {
							// a falsy config indicates an aborted launch
							if (config && config.type) {
								return this.createProcess(launch, config, sessionId);
							}

							if (launch) {
								return launch.openConfigFile(false, type).done(undefined, errors.onUnexpectedError);
							}
						})
					).then(() => wrapUpState(), err => {
						wrapUpState();
						return <any>TPromise.wrapError(err);
					}));
			})
		)));
	}

	private createProcess(launch: debug.ILaunch, config: debug.IConfig, sessionId: string): TPromise<void> {
		return this.textFileService.saveAll().then(() =>
			(launch ? launch.resolveConfiguration(config) : TPromise.as(config)).then(resolvedConfig => {
				if (!resolvedConfig) {
					// User canceled resolving of interactive variables, silently return
					return undefined;
				}

				if (!this.configurationManager.getAdapter(resolvedConfig.type) || (config.request !== 'attach' && config.request !== 'launch')) {
					let message: string;
					if (config.request !== 'attach' && config.request !== 'launch') {
						message = config.request ? nls.localize('debugRequestNotSupported', "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", 'request', config.request)
							: nls.localize('debugRequesMissing', "Attribute '{0}' is missing from the chosen debug configuration.", 'request');

					} else {
						message = resolvedConfig.type ? nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", resolvedConfig.type) :
							nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration.");
					}

					return this.showError(message);
				}

				this.toDisposeOnSessionEnd.set(sessionId, []);

				const workspace = launch ? launch.workspace : undefined;
				const debugAnywayAction = new Action('debug.debugAnyway', nls.localize('debugAnyway', "Debug Anyway"), undefined, true, () => {
					return this.doCreateProcess(workspace, resolvedConfig, sessionId);
				});

				return this.runTask(sessionId, workspace, resolvedConfig.preLaunchTask).then((taskSummary: ITaskSummary) => {
					const errorCount = resolvedConfig.preLaunchTask ? this.markerService.getStatistics().errors : 0;
					const successExitCode = taskSummary && taskSummary.exitCode === 0;
					const failureExitCode = taskSummary && taskSummary.exitCode !== undefined && taskSummary.exitCode !== 0;
					if (successExitCode || (errorCount === 0 && !failureExitCode)) {
						return this.doCreateProcess(workspace, resolvedConfig, sessionId);
					}

					const message = errorCount > 1 ? nls.localize('preLaunchTaskErrors', "Build errors have been detected during preLaunchTask '{0}'.", resolvedConfig.preLaunchTask) :
						errorCount === 1 ? nls.localize('preLaunchTaskError', "Build error has been detected during preLaunchTask '{0}'.", resolvedConfig.preLaunchTask) :
							nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", resolvedConfig.preLaunchTask, taskSummary.exitCode);

					const showErrorsAction = new Action('debug.showErrors', nls.localize('showErrors', "Show Errors"), undefined, true, () => {
						return this.panelService.openPanel(Constants.MARKERS_PANEL_ID).then(() => undefined);
					});

					return this.showError(message, [debugAnywayAction, showErrorsAction]);
				}, (err: TaskError) => {
					return this.showError(err.message, [debugAnywayAction, this.taskService.configureAction()]);
				});
			}, err => {
				if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					return this.showError(nls.localize('noFolderWorkspaceDebugError', "The active file can not be debugged. Make sure it is saved on disk and that you have a debug extension installed for that file type."));
				}

				return launch && launch.openConfigFile(false).then(editor => void 0);
			})
		);
	}

	private doCreateProcess(root: IWorkspaceFolder, configuration: debug.IConfig, sessionId: string): TPromise<debug.IProcess> {
		configuration.__sessionId = sessionId;
		this.inDebugMode.set(true);

		return this.telemetryService.getTelemetryInfo().then(info => {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = info.machineId;
			telemetryInfo['common.vscodesessionid'] = info.sessionId;
			return telemetryInfo;
		}).then(data => {
			const adapter = this.configurationManager.getAdapter(configuration.type);
			const { aiKey, type } = adapter;
			const publisher = adapter.extensionDescription.publisher;
			let client: TelemetryClient;

			let customTelemetryService: TelemetryService;
			if (aiKey) {
				client = new TelemetryClient(
					uri.parse(require.toUrl('bootstrap')).fsPath,
					{
						serverName: 'Debug Telemetry',
						timeout: 1000 * 60 * 5,
						args: [`${publisher}.${type}`, JSON.stringify(data), aiKey],
						env: {
							ELECTRON_RUN_AS_NODE: 1,
							PIPE_LOGGING: 'true',
							AMD_ENTRYPOINT: 'vs/workbench/parts/debug/node/telemetryApp'
						}
					}
				);

				const channel = client.getChannel('telemetryAppender');
				const appender = new TelemetryAppenderClient(channel);

				customTelemetryService = new TelemetryService({ appender }, this.configurationService);
			}

			const session = this.instantiationService.createInstance(RawDebugSession, sessionId, configuration.debugServer, adapter, customTelemetryService, root);
			const process = this.model.addProcess(configuration, session);
			this.allProcesses.set(process.getId(), process);

			if (client) {
				this.toDisposeOnSessionEnd.get(session.getId()).push(client);
			}
			this.registerSessionListeners(process, session);

			return session.initialize({
				clientID: 'vscode',
				clientName: product.nameLong,
				adapterID: configuration.type,
				pathFormat: 'path',
				linesStartAt1: true,
				columnsStartAt1: true,
				supportsVariableType: true, // #8858
				supportsVariablePaging: true, // #9537
				supportsRunInTerminalRequest: true, // #10574
				locale: platform.locale
			}).then((result: DebugProtocol.InitializeResponse) => {
				this.model.setExceptionBreakpoints(session.capabilities.exceptionBreakpointFilters);
				return configuration.request === 'attach' ? session.attach(configuration) : session.launch(configuration);
			}).then((result: DebugProtocol.Response) => {
				if (session.disconnected) {
					return TPromise.as(null);
				}
				this.focusStackFrame(undefined, undefined, process);
				this._onDidNewProcess.fire(process);

				const internalConsoleOptions = configuration.internalConsoleOptions || this.configurationService.getValue<debug.IDebugConfiguration>('debug').internalConsoleOptions;
				if (internalConsoleOptions === 'openOnSessionStart' || (this.firstSessionStart && internalConsoleOptions === 'openOnFirstSessionStart')) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}

				const openDebugOptions = this.configurationService.getValue<debug.IDebugConfiguration>('debug').openDebug;
				// Open debug viewlet based on the visibility of the side bar and openDebug setting
				if (openDebugOptions === 'openOnSessionStart' || (openDebugOptions === 'openOnFirstSessionStart' && this.firstSessionStart)) {
					this.viewletService.openViewlet(debug.VIEWLET_ID);
				}
				this.firstSessionStart = false;

				this.debugType.set(configuration.type);
				if (this.model.getProcesses().length > 1) {
					this.viewModel.setMultiProcessView(true);
				}
				this.updateStateAndEmit(session.getId(), debug.State.Running);

				/* __GDPR__
					"debugSessionStart" : {
						"type": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"exceptionBreakpoints": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"extensionName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
						"isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true},
						"launchJsonExists": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
					}
				*/
				return this.telemetryService.publicLog('debugSessionStart', {
					type: configuration.type,
					breakpointCount: this.model.getBreakpoints().length,
					exceptionBreakpoints: this.model.getExceptionBreakpoints(),
					watchExpressionsCount: this.model.getWatchExpressions().length,
					extensionName: adapter.extensionDescription.id,
					isBuiltin: adapter.extensionDescription.isBuiltin,
					launchJsonExists: root && !!this.configurationService.getValue<debug.IGlobalConfig>('launch', { resource: root.uri })
				});
			}).then(() => process, (error: Error | string) => {
				if (errors.isPromiseCanceledError(error)) {
					// Do not show 'canceled' error messages to the user #7906
					return TPromise.as(null);
				}

				const errorMessage = error instanceof Error ? error.message : error;
				/* __GDPR__
					"debugMisconfiguration" : {
						"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"error": { "classification": "CallstackOrException", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('debugMisconfiguration', { type: configuration ? configuration.type : undefined, error: errorMessage });
				this.updateStateAndEmit(session.getId(), debug.State.Inactive);
				if (!session.disconnected) {
					session.disconnect().done(null, errors.onUnexpectedError);
				} else if (process) {
					this.model.removeProcess(process.getId());
				}

				// Show the repl if some error got logged there #5870
				if (this.model.getReplElements().length > 0) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}
				if (this.model.getReplElements().length === 0) {
					this.inDebugMode.reset();
				}

				this.showError(errorMessage, errors.isErrorWithActions(error) ? error.actions : []);
				return undefined;
			});
		});
	}

	private showError(message: string, actions: IAction[] = []): TPromise<any> {
		const configureAction = this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL);
		actions.push(configureAction);
		return this.dialogService.show(severity.Error, message, actions.map(a => a.label).concat(nls.localize('cancel', "Cancel")), { cancelId: actions.length }).then(choice => {
			if (choice < actions.length) {
				return actions[choice].run();
			}

			return TPromise.as(null);
		});
	}

	private runTask(sessionId: string, root: IWorkspaceFolder, taskName: string): TPromise<ITaskSummary> {
		if (!taskName || this.skipRunningTask) {
			this.skipRunningTask = false;
			return TPromise.as(null);
		}

		// run a task before starting a debug session
		return this.taskService.getTask(root, taskName).then(task => {
			if (!task) {
				return TPromise.wrapError(errors.create(nls.localize('DebugTaskNotFound', "Could not find the task \'{0}\'.", taskName)));
			}

			function once(kind: TaskEventKind, event: Event<TaskEvent>): Event<TaskEvent> {
				return (listener, thisArgs = null, disposables?) => {
					const result = event(e => {
						if (e.kind === kind) {
							result.dispose();
							return listener.call(thisArgs, e);
						}
					}, null, disposables);
					return result;
				};
			}
			// If a task is missing the problem matcher the promise will never complete, so we need to have a workaround #35340
			let taskStarted = false;
			const promise = this.taskService.getActiveTasks().then(tasks => {
				if (tasks.filter(t => t._id === task._id).length) {
					// task is already running - nothing to do.
					return TPromise.as(null);
				}
				this.toDisposeOnSessionEnd.get(sessionId).push(
					once(TaskEventKind.Active, this.taskService.onDidStateChange)(() => {
						taskStarted = true;
					})
				);
				const taskPromise = this.taskService.run(task);
				if (task.isBackground) {
					return new TPromise((c, e) => this.toDisposeOnSessionEnd.get(sessionId).push(
						once(TaskEventKind.Inactive, this.taskService.onDidStateChange)(() => c(null)))
					);
				}

				return taskPromise;
			});

			return new TPromise((c, e) => {
				promise.then(result => {
					taskStarted = true;
					c(result);
				}, error => e(error));

				setTimeout(() => {
					if (!taskStarted) {
						e({ severity: severity.Error, message: nls.localize('taskNotTracked', "The task '{0}' cannot be tracked.", taskName) });
					}
				}, 10000);
			});
		});
	}

	public sourceIsNotAvailable(uri: uri): void {
		this.model.sourceIsNotAvailable(uri);
	}

	public restartProcess(process: debug.IProcess, restartData?: any): TPromise<any> {
		return this.textFileService.saveAll().then(() => {
			if (process.session.capabilities.supportsRestartRequest) {
				return <TPromise>process.session.custom('restart', null);
			}
			const focusedProcess = this.viewModel.focusedProcess;
			const preserveFocus = focusedProcess && process.getId() === focusedProcess.getId();
			// Do not run preLaunch and postDebug tasks for automatic restarts
			this.skipRunningTask = !!restartData;

			return process.session.disconnect(true).then(() => {
				if (strings.equalsIgnoreCase(process.configuration.type, 'extensionHost') && process.session.root) {
					return this.broadcastService.broadcast({
						channel: EXTENSION_RELOAD_BROADCAST_CHANNEL,
						payload: [process.session.root.uri.fsPath]
					});
				}

				return new TPromise<void>((c, e) => {
					setTimeout(() => {
						// Read the configuration again if a launch.json has been changed, if not just use the inmemory configuration
						let config = process.configuration;

						const launch = process.session.root ? this.configurationManager.getLaunch(process.session.root.uri) : undefined;
						if (this.launchJsonChanged && launch) {
							this.launchJsonChanged = false;
							config = launch.getConfiguration(process.configuration.name) || config;
							// Take the type from the process since the debug extension might overwrite it #21316
							config.type = process.configuration.type;
							config.noDebug = process.configuration.noDebug;
						}
						config.__restart = restartData;
						this.skipRunningTask = !!restartData;
						this.startDebugging(launch, config).then(() => c(null), err => e(err));
					}, 300);
				});
			}).then(() => {
				if (preserveFocus) {
					// Restart should preserve the focused process
					const restartedProcess = this.model.getProcesses().filter(p => p.configuration.name === process.configuration.name).pop();
					if (restartedProcess && restartedProcess !== this.viewModel.focusedProcess) {
						this.focusStackFrame(undefined, undefined, restartedProcess);
					}
				}
			});
		});
	}

	public stopProcess(process: debug.IProcess): TPromise<any> {
		if (process) {
			return process.session.disconnect(false, true);
		}

		const processes = this.model.getProcesses();
		if (processes.length) {
			return TPromise.join(processes.map(p => p.session.disconnect(false, true)));
		}

		this.sessionStates.clear();
		this._onDidChangeState.fire();
		return undefined;
	}

	private onSessionEnd(session: RawDebugSession): void {
		const bpsExist = this.model.getBreakpoints().length > 0;
		const process = this.model.getProcesses().filter(p => p.getId() === session.getId()).pop();
		/* __GDPR__
			"debugSessionStop" : {
				"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"sessionLengthInSeconds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('debugSessionStop', {
			type: process && process.configuration.type,
			success: session.emittedStopped || !bpsExist,
			sessionLengthInSeconds: session.getLengthInSeconds(),
			breakpointCount: this.model.getBreakpoints().length,
			watchExpressionsCount: this.model.getWatchExpressions().length
		});

		this.model.removeProcess(session.getId());
		if (process) {
			process.inactive = true;
			this._onDidEndProcess.fire(process);
			if (process.configuration.postDebugTask) {
				this.runTask(process.getId(), process.session.root, process.configuration.postDebugTask);
			}
		}

		this.toDisposeOnSessionEnd.set(session.getId(), lifecycle.dispose(this.toDisposeOnSessionEnd.get(session.getId())));
		const focusedProcess = this.viewModel.focusedProcess;
		if (focusedProcess && focusedProcess.getId() === session.getId()) {
			this.focusStackFrame(null);
		}
		this.updateStateAndEmit(session.getId(), debug.State.Inactive);

		if (this.model.getProcesses().length === 0) {
			// set breakpoints back to unverified since the session ended.
			const data: { [id: string]: { line: number, verified: boolean, column: number, endLine: number, endColumn: number } } = {};
			this.model.getBreakpoints().forEach(bp => {
				data[bp.getId()] = { line: bp.lineNumber, verified: false, column: bp.column, endLine: bp.endLineNumber, endColumn: bp.endColumn };
			});
			this.model.updateBreakpoints(data);

			this.inDebugMode.reset();
			this.debugType.reset();
			this.viewModel.setMultiProcessView(false);

			if (this.partService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getValue<debug.IDebugConfiguration>('debug').openExplorerOnEnd) {
				this.viewletService.openViewlet(EXPLORER_VIEWLET_ID).done(null, errors.onUnexpectedError);
			}
		}
	}

	public getModel(): debug.IModel {
		return this.model;
	}

	public getViewModel(): debug.IViewModel {
		return this.viewModel;
	}

	public getConfigurationManager(): debug.IConfigurationManager {
		return this.configurationManager;
	}

	private sendAllBreakpoints(process?: debug.IProcess): TPromise<any> {
		return TPromise.join(distinct(this.model.getBreakpoints(), bp => bp.uri.toString()).map(bp => this.sendBreakpoints(bp.uri, false, process)))
			.then(() => this.sendFunctionBreakpoints(process))
			// send exception breakpoints at the end since some debug adapters rely on the order
			.then(() => this.sendExceptionBreakpoints(process));
	}

	private sendBreakpoints(modelUri: uri, sourceModified = false, targetProcess?: debug.IProcess): TPromise<void> {

		const sendBreakpointsToProcess = (process: debug.IProcess): TPromise<void> => {
			const session = <RawDebugSession>process.session;
			if (!session.readyForBreakpoints) {
				return TPromise.as(null);
			}

			const breakpointsToSend = this.model.getBreakpoints().filter(bp => this.model.areBreakpointsActivated() && bp.enabled && bp.uri.toString() === modelUri.toString());

			const source = process.sources.get(modelUri.toString());
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
			rawSource.path = normalizeDriveLetter(rawSource.path);

			return session.setBreakpoints({
				source: rawSource,
				lines: breakpointsToSend.map(bp => bp.lineNumber),
				breakpoints: breakpointsToSend.map(bp => ({ line: bp.lineNumber, column: bp.column, condition: bp.condition, hitCondition: bp.hitCondition })),
				sourceModified
			}).then(response => {
				if (!response || !response.body) {
					return;
				}

				const data: { [id: string]: DebugProtocol.Breakpoint } = {};
				for (let i = 0; i < breakpointsToSend.length; i++) {
					data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
					if (!breakpointsToSend[i].column) {
						// If there was no column sent ignore the breakpoint column response from the adapter
						data[breakpointsToSend[i].getId()].column = undefined;
					}
				}

				this.model.updateBreakpoints(data);
			});
		};

		return this.sendToOneOrAllProcesses(targetProcess, sendBreakpointsToProcess);
	}

	private sendFunctionBreakpoints(targetProcess?: debug.IProcess): TPromise<void> {
		const sendFunctionBreakpointsToProcess = (process: debug.IProcess): TPromise<void> => {
			const session = <RawDebugSession>process.session;
			if (!session.readyForBreakpoints || !session.capabilities.supportsFunctionBreakpoints) {
				return TPromise.as(null);
			}

			const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
			return session.setFunctionBreakpoints({ breakpoints: breakpointsToSend }).then(response => {
				if (!response || !response.body) {
					return;
				}

				const data: { [id: string]: { name?: string, verified?: boolean } } = {};
				for (let i = 0; i < breakpointsToSend.length; i++) {
					data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
				}

				this.model.updateFunctionBreakpoints(data);
			});
		};

		return this.sendToOneOrAllProcesses(targetProcess, sendFunctionBreakpointsToProcess);
	}

	private sendExceptionBreakpoints(targetProcess?: debug.IProcess): TPromise<void> {
		const sendExceptionBreakpointsToProcess = (process: debug.IProcess): TPromise<any> => {
			const session = <RawDebugSession>process.session;
			if (!session.readyForBreakpoints || this.model.getExceptionBreakpoints().length === 0) {
				return TPromise.as(null);
			}

			const enabledExceptionBps = this.model.getExceptionBreakpoints().filter(exb => exb.enabled);
			return session.setExceptionBreakpoints({ filters: enabledExceptionBps.map(exb => exb.filter) });
		};

		return this.sendToOneOrAllProcesses(targetProcess, sendExceptionBreakpointsToProcess);
	}

	private sendToOneOrAllProcesses(process: debug.IProcess, send: (process: debug.IProcess) => TPromise<void>): TPromise<void> {
		if (process) {
			return send(process);
		}

		return TPromise.join(this.model.getProcesses().map(p => send(p))).then(() => void 0);
	}

	private onFileChanges(fileChangesEvent: FileChangesEvent): void {
		const toRemove = this.model.getBreakpoints().filter(bp =>
			fileChangesEvent.contains(bp.uri, FileChangeType.DELETED));
		if (toRemove.length) {
			this.model.removeBreakpoints(toRemove);
		}

		fileChangesEvent.getUpdated().forEach(event => {
			if (this.breakpointsToSendOnResourceSaved.has(event.resource.toString())) {
				this.breakpointsToSendOnResourceSaved.delete(event.resource.toString());
				this.sendBreakpoints(event.resource, true).done(null, errors.onUnexpectedError);
			}
			if (event.resource.toString().indexOf('.vscode/launch.json') >= 0) {
				this.launchJsonChanged = true;
			}
		});
	}

	private store(): void {
		const breakpoints = this.model.getBreakpoints();
		if (breakpoints.length) {
			this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(breakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		if (!this.model.areBreakpointsActivated()) {
			this.storageService.store(DEBUG_BREAKPOINTS_ACTIVATED_KEY, 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE);
		}

		const functionBreakpoints = this.model.getFunctionBreakpoints();
		if (functionBreakpoints.length) {
			this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(functionBreakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const exceptionBreakpoints = this.model.getExceptionBreakpoints();
		if (exceptionBreakpoints.length) {
			this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(exceptionBreakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const watchExpressions = this.model.getWatchExpressions();
		if (watchExpressions.length) {
			this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(watchExpressions.map(we => ({ name: we.name, id: we.getId() }))), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE);
		}
	}

	public dispose(): void {
		this.toDisposeOnSessionEnd.forEach(toDispose => lifecycle.dispose(toDispose));
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
