/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import { generateUuid } from 'vs/base/common/uuid';
import uri from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
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
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { RawDebugSession } from 'vs/workbench/parts/debug/electron-browser/rawDebugSession';
import { Model, ExceptionBreakpoint, FunctionBreakpoint, Breakpoint, Expression, OutputNameValueElement, ExpressionContainer, Process } from 'vs/workbench/parts/debug/common/debugModel';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import * as debugactions from 'vs/workbench/parts/debug/browser/debugActions';
import { ConfigurationManager } from 'vs/workbench/parts/debug/electron-browser/debugConfigurationManager';
import { ToggleMarkersPanelAction } from 'vs/workbench/parts/markers/browser/markersPanelActions';
import { ITaskService, TaskEvent, TaskType, TaskServiceEvents, ITaskSummary } from 'vs/workbench/parts/tasks/common/taskService';
import { TaskError } from 'vs/workbench/parts/tasks/common/taskSystem';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILogEntry, EXTENSION_LOG_BROADCAST_CHANNEL, EXTENSION_ATTACH_BROADCAST_CHANNEL, EXTENSION_TERMINATE_BROADCAST_CHANNEL, EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL, EXTENSION_RELOAD_BROADCAST_CHANNEL } from 'vs/platform/extensions/common/extensionHost';
import { IBroadcastService, IBroadcast } from "vs/platform/broadcast/electron-browser/broadcastService";

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';

interface StartSessionResult {
	status: 'ok' | 'initialConfiguration' | 'saveConfiguration';
	content?: string;
};

export class DebugService implements debug.IDebugService {
	public _serviceBrand: any;

	private sessionStates: Map<string, debug.State>;
	private _onDidChangeState: Emitter<debug.State>;
	private _onDidNewProcess: Emitter<debug.IProcess>;
	private _onDidEndProcess: Emitter<debug.IProcess>;
	private _onDidCustomEvent: Emitter<DebugProtocol.Event>;
	private model: Model;
	private viewModel: ViewModel;
	private allSessionIds: Set<string>;
	private configurationManager: ConfigurationManager;
	private customTelemetryService: ITelemetryService;
	private lastTaskEvent: TaskEvent;
	private toDispose: lifecycle.IDisposable[];
	private toDisposeOnSessionEnd: Map<string, lifecycle.IDisposable[]>;
	private inDebugMode: IContextKey<boolean>;
	private debugType: IContextKey<string>;
	private isNodeDebugType: IContextKey<boolean>;
	private debugState: IContextKey<string>;
	private breakpointsToSendOnResourceSaved: Set<string>;
	private launchJsonChanged: boolean;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IMessageService private messageService: IMessageService,
		@IPartService private partService: IPartService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IBroadcastService private broadcastService: IBroadcastService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionService private extensionService: IExtensionService,
		@IMarkerService private markerService: IMarkerService,
		@ITaskService private taskService: ITaskService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		this.toDispose = [];
		this.toDisposeOnSessionEnd = new Map<string, lifecycle.IDisposable[]>();
		this.breakpointsToSendOnResourceSaved = new Set<string>();
		this._onDidChangeState = new Emitter<debug.State>();
		this._onDidNewProcess = new Emitter<debug.IProcess>();
		this._onDidEndProcess = new Emitter<debug.IProcess>();
		this._onDidCustomEvent = new Emitter<DebugProtocol.Event>();
		this.sessionStates = new Map<string, debug.State>();
		this.allSessionIds = new Set<string>();

		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager);
		this.toDispose.push(this.configurationManager);
		this.inDebugMode = debug.CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
		this.debugType = debug.CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
		this.isNodeDebugType = debug.CONTEXT_IS_NODE_DEBUG_TYPE.bindTo(contextKeyService);
		this.debugState = debug.CONTEXT_DEBUG_STATE.bindTo(contextKeyService);

		this.model = new Model(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true), this.loadFunctionBreakpoints(),
			this.loadExceptionBreakpoints(), this.loadWatchExpressions());
		this.toDispose.push(this.model);
		this.viewModel = new ViewModel();

		this.registerListeners(lifecycleService);
	}

	private registerListeners(lifecycleService: ILifecycleService): void {
		this.toDispose.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		if (this.taskService) {
			this.toDispose.push(this.taskService.addListener(TaskServiceEvents.Active, (e: TaskEvent) => {
				this.lastTaskEvent = e;
			}));
			this.toDispose.push(this.taskService.addListener(TaskServiceEvents.Inactive, (e: TaskEvent) => {
				if (e.type === TaskType.SingleRun) {
					this.lastTaskEvent = null;
				}
			}));
			this.toDispose.push(this.taskService.addListener(TaskServiceEvents.Terminated, (e: TaskEvent) => {
				this.lastTaskEvent = null;
			}));
		}

		lifecycleService.onShutdown(this.store, this);
		lifecycleService.onShutdown(this.dispose, this);

		this.toDispose.push(this.broadcastService.onBroadcast(this.onBroadcast, this));
	}

	private onBroadcast(broadcast: IBroadcast): void {

		// attach: PH is ready to be attached to
		const process = this.model.getProcesses().filter(p => p.getId() === broadcast.payload.debugId).pop();
		const session = process ? <RawDebugSession>process.session : null;
		if (!this.allSessionIds.has(broadcast.payload.debugId)) {
			// Ignore attach events for sessions that never existed (wrong vscode windows)
			return;
		}

		if (broadcast.channel === EXTENSION_ATTACH_BROADCAST_CHANNEL) {
			if (session) {
				this.onSessionEnd(session);
			}

			const config = this.configurationManager.selectedLaunch.getConfiguration(this.configurationManager.selectedName);
			this.configurationManager.selectedLaunch.resolveConfiguration(config).done(resolvedConfig => {
				resolvedConfig.request = 'attach';
				resolvedConfig.port = broadcast.payload.port;
				this.doCreateProcess(this.configurationManager.selectedLaunch.workspaceUri, resolvedConfig, broadcast.payload.debugId);
			}, errors.onUnexpectedError);

			return;
		}

		if (session && broadcast.channel === EXTENSION_TERMINATE_BROADCAST_CHANNEL) {
			this.onSessionEnd(session);
			return;
		}

		// from this point on we require an active session
		if (!session) {
			return;
		}

		// an extension logged output, show it inside the REPL
		if (broadcast.channel === EXTENSION_LOG_BROADCAST_CHANNEL) {
			let extensionOutput: ILogEntry = broadcast.payload.logEntry;
			let sev = extensionOutput.severity === 'warn' ? severity.Warning : extensionOutput.severity === 'error' ? severity.Error : severity.Info;

			let args: any[] = [];
			try {
				let parsed = JSON.parse(extensionOutput.arguments);
				args.push(...Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
			} catch (error) {
				args.push(extensionOutput.arguments);
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
						this.logToRepl(simpleVals.join(' '), sev);
						simpleVals = [];
					}

					// show object
					this.logToRepl(new OutputNameValueElement((<any>a).prototype, a, nls.localize('snapshotObj', "Only primitive values are shown for this object.")), sev);
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
				this.logToRepl(simpleVals.join(' ') + '\n', sev);
			}
		}
	}

	private tryToAutoFocusStackFrame(thread: debug.IThread): TPromise<any> {
		const callStack = thread.getCallStack();
		if (!callStack.length || this.viewModel.focusedStackFrame) {
			return TPromise.as(null);
		}

		// focus first stack frame from top that has source location if no other stack frame is focussed
		const stackFrameToFocus = first(callStack, sf => sf.source && sf.source.available, undefined);
		if (!stackFrameToFocus) {
			return TPromise.as(null);
		}

		this.focusStackFrameAndEvaluate(stackFrameToFocus).done(null, errors.onUnexpectedError);
		if (thread.stoppedDetails) {
			this.windowService.focusWindow();
			aria.alert(nls.localize('debuggingPaused', "Debugging paused, reason {0}, {1} {2}", thread.stoppedDetails.reason, stackFrameToFocus.source ? stackFrameToFocus.source.name : '', stackFrameToFocus.range.startLineNumber));
		}

		return stackFrameToFocus.openInEditor(this.editorService);
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
						this.messageService.show(severity.Error, e.message);
					});
				}
			};

			this.sendAllBreakpoints(process).then(sendConfigurationDone, sendConfigurationDone)
				.done(() => this.fetchThreads(session), errors.onUnexpectedError);
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidStop(event => {
			this.updateStateAndEmit(session.getId(), debug.State.Stopped);
			const threadId = event.body.threadId;

			session.threads().then(response => {
				if (!response || !response.body || !response.body.threads) {
					return;
				}

				const rawThread = response.body.threads.filter(t => t.id === threadId).pop();
				this.model.rawUpdate({
					sessionId: session.getId(),
					thread: rawThread,
					threadId,
					stoppedDetails: event.body,
					allThreadsStopped: event.body.allThreadsStopped
				});

				const thread = process && process.getThread(threadId);
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
				this.fetchThreads(session).done(undefined, errors.onUnexpectedError);
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(session.getId(), true, event.body.threadId);
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidTerminateDebugee(event => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (session && session.getId() === event.body.sessionId) {
				if (event.body && event.body.restart && process) {
					this.restartProcess(process, event.body.restart).done(null, err => this.messageService.show(severity.Error, err.message));
				} else {
					session.disconnect().done(null, errors.onUnexpectedError);
				}
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidContinued(event => {
			const threadId = event.body.allThreadsContinued !== false ? undefined : event.body.threadId;
			this.model.clearThreads(session.getId(), false, threadId);
			if (this.viewModel.focusedProcess.getId() === session.getId()) {
				this.focusStackFrameAndEvaluate(null, this.viewModel.focusedProcess).done(null, errors.onUnexpectedError);
			}
			this.updateStateAndEmit(session.getId(), debug.State.Running);
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidOutput(event => {
			if (!event.body) {
				return;
			}

			const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
			if (event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the adapter provided the telemetry key
				// and the user opted in telemetry
				if (this.customTelemetryService && this.telemetryService.isOptedIn) {
					this.customTelemetryService.publicLog(event.body.output, event.body.data);
				}
			} else if (event.body.variablesReference) {
				const container = new ExpressionContainer(process, event.body.variablesReference, generateUuid());
				container.getChildren().then(children => {
					children.forEach(child => {
						// Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
						child.name = null;
						this.logToRepl(child, outputSeverity);
					});
				});
			} else if (typeof event.body.output === 'string') {
				this.logToRepl(event.body.output, outputSeverity);
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidBreakpoint(event => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
			if (breakpoint) {
				if (!breakpoint.column) {
					event.body.breakpoint.column = undefined;
				}
				this.model.updateBreakpoints({ [breakpoint.getId()]: event.body.breakpoint });
			} else {
				const functionBreakpoint = this.model.getFunctionBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
				if (functionBreakpoint) {
					this.model.updateFunctionBreakpoints({ [functionBreakpoint.getId()]: event.body.breakpoint });
				}
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidExitAdapter(event => {
			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			const process = this.viewModel.focusedProcess;
			if (process && session && process.getId() === session.getId() && strings.equalsIgnoreCase(process.configuration.type, 'extensionhost') && this.sessionStates.get(session.getId()) === debug.State.Running &&
				process && this.contextService.hasWorkspace() && process.configuration.noDebug) {
				this.broadcastService.broadcast({
					channel: EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL,
					payload: [process.session.root.fsPath]
				});
			}
			if (session && session.getId() === event.body.sessionId) {
				this.onSessionEnd(session);
			}
		}));

		this.toDisposeOnSessionEnd.get(session.getId()).push(session.onDidCustomEvent(event => {
			this._onDidCustomEvent.fire(event);
		}));
	}

	private fetchThreads(session: RawDebugSession): TPromise<any> {
		return session.threads().then(response => {
			if (response && response.body && response.body.threads) {
				response.body.threads.forEach(thread =>
					this.model.rawUpdate({
						sessionId: session.getId(),
						threadId: thread.id,
						thread
					}));
			}
		});
	}

	private loadBreakpoints(): Breakpoint[] {
		let result: Breakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: any) => {
				return new Breakpoint(uri.parse(breakpoint.uri.external || breakpoint.source.uri.external), breakpoint.lineNumber, breakpoint.column, breakpoint.enabled, breakpoint.condition, breakpoint.hitCondition);
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

	public get onDidCustomEvent(): Event<DebugProtocol.Event> {
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
		const stateLabel = debug.State[state];
		if (stateLabel) {
			this.debugState.set(stateLabel.toLowerCase());
		}
		this._onDidChangeState.fire(state);
	}

	public focusStackFrameAndEvaluate(stackFrame: debug.IStackFrame, process?: debug.IProcess, explicit?: boolean): TPromise<void> {
		if (!process) {
			const processes = this.model.getProcesses();
			process = stackFrame ? stackFrame.thread.process : processes.length ? processes[0] : null;
		}
		if (!stackFrame) {
			const threads = process ? process.getAllThreads() : null;
			const callStack = threads && threads.length ? threads[0].getCallStack() : null;
			stackFrame = callStack && callStack.length ? callStack[0] : null;
		}

		this.viewModel.setFocusedStackFrame(stackFrame, process, explicit);
		this.updateStateAndEmit();

		return this.model.evaluateWatchExpressions(process, stackFrame);
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

	public addBreakpoints(uri: uri, rawBreakpoints: debug.IRawBreakpoint[]): TPromise<void> {
		this.model.addBreakpoints(uri, rawBreakpoints);
		rawBreakpoints.forEach(rbp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", rbp.lineNumber, uri.fsPath)));

		return this.sendBreakpoints(uri);
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

	public addFunctionBreakpoint(): void {
		this.model.addFunctionBreakpoint('');
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
		this.telemetryService.publicLog('debugService/addReplExpression');
		return this.model.addReplExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, name)
			// Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
			.then(() => this.focusStackFrameAndEvaluate(this.viewModel.focusedStackFrame, this.viewModel.focusedProcess));
	}

	public removeReplExpressions(): void {
		this.model.removeReplExpressions();
	}

	public logToRepl(value: string | debug.IExpression, sev = severity.Info): void {
		if (typeof value === 'string' && '[2J'.localeCompare(value) === 0) {
			// [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
			this.model.removeReplExpressions();
		} else {
			this.model.appendToRepl(value, sev);
		}
	}

	public addWatchExpression(name: string): TPromise<void> {
		return this.model.addWatchExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, name);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return this.model.renameWatchExpression(this.viewModel.focusedProcess, this.viewModel.focusedStackFrame, id, newName);
	}

	public moveWatchExpression(id: string, position: number): void {
		this.model.moveWatchExpression(id, position);
	}

	public removeWatchExpressions(id?: string): void {
		this.model.removeWatchExpressions(id);
	}

	public startDebugging(root: uri, configOrName?: debug.IConfig | string, noDebug = false): TPromise<any> {

		// make sure to save all files and that the configuration is up to date
		return this.textFileService.saveAll().then(() => this.configurationService.reloadConfiguration().then(() =>
			this.extensionService.onReady().then(() => {
				if (this.model.getProcesses().length === 0) {
					this.removeReplExpressions();
				}
				this.launchJsonChanged = false;
				const manager = this.getConfigurationManager();
				const launch = root ? manager.getLaunches().filter(l => l.workspaceUri.toString() === root.toString()).pop() : undefined;

				let config: debug.IConfig, compound: debug.ICompound;
				if (!configOrName) {
					configOrName = this.configurationManager.selectedName;
				}
				if (typeof configOrName === 'string' && launch) {
					config = launch.getConfiguration(configOrName);
					compound = launch.getCompound(configOrName);
				} else if (typeof configOrName !== 'string') {
					config = configOrName;
				}
				if (launch) {
					manager.selectConfiguration(launch, typeof configOrName === 'string' ? configOrName : undefined, true);
				}

				if (compound) {
					if (!compound.configurations) {
						return TPromise.wrapError(new Error(nls.localize({ key: 'compoundMustHaveConfigurations', comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
							"Compound must have \"configurations\" attribute set in order to start multiple configurations.")));
					}

					return TPromise.join(compound.configurations.map(name => name !== compound.name ? this.startDebugging(root, name) : TPromise.as(null)));
				}
				if (configOrName && !config) {
					return TPromise.wrapError(new Error(nls.localize('configMissing', "Configuration '{0}' is missing in 'launch.json'.", configOrName)));
				}

				return manager.getStartSessionCommand(config ? config.type : undefined).then(commandAndType => {
					if (noDebug && config) {
						config.noDebug = true;
					}
					if (commandAndType && commandAndType.command) {
						const defaultConfig = noDebug ? { noDebug: true } : {};
						return this.commandService.executeCommand(commandAndType.command, config || defaultConfig, launch ? launch.workspaceUri : undefined).then((result: StartSessionResult) => {
							if (launch) {
								if (result && result.status === 'initialConfiguration') {
									return launch.openConfigFile(false, commandAndType.type);
								}

								if (result && result.status === 'saveConfiguration') {
									return this.fileService.updateContent(launch.uri, result.content).then(() => launch.openConfigFile(false));
								}
							}
							return undefined;
						});
					}

					if (config) {
						return this.createProcess(root, config);
					}
					if (launch && commandAndType) {
						return launch.openConfigFile(false, commandAndType.type);
					}

					return undefined;
				});
			})
		));
	}

	public findProcessByUUID(uuid: string): debug.IProcess | null {
		const processes = this.getModel().getProcesses();
		const result = processes.filter(process => process.getId() === uuid);
		if (result.length > 0) {
			return result[0];	// there can only be one
		}
		return null;
	}

	public createProcess(root: uri, config: debug.IConfig): TPromise<debug.IProcess> {
		return this.textFileService.saveAll().then(() =>
			(this.configurationManager.selectedLaunch ? this.configurationManager.selectedLaunch.resolveConfiguration(config) : TPromise.as(config)).then(resolvedConfig => {
				if (!resolvedConfig) {
					// User canceled resolving of interactive variables, silently return
					return undefined;
				}

				if (!this.configurationManager.getAdapter(resolvedConfig.type)) {
					const message = resolvedConfig.type ? nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", resolvedConfig.type) :
						nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration.");
					return TPromise.wrapError(errors.create(message, { actions: [this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL), CloseAction] }));
				}

				return this.runPreLaunchTask(resolvedConfig.preLaunchTask).then((taskSummary: ITaskSummary) => {
					const errorCount = resolvedConfig.preLaunchTask ? this.markerService.getStatistics().errors : 0;
					const successExitCode = taskSummary && taskSummary.exitCode === 0;
					const failureExitCode = taskSummary && taskSummary.exitCode !== undefined && taskSummary.exitCode !== 0;
					if (successExitCode || (errorCount === 0 && !failureExitCode)) {
						return this.doCreateProcess(root, resolvedConfig);
					}

					this.messageService.show(severity.Error, {
						message: errorCount > 1 ? nls.localize('preLaunchTaskErrors', "Build errors have been detected during preLaunchTask '{0}'.", resolvedConfig.preLaunchTask) :
							errorCount === 1 ? nls.localize('preLaunchTaskError', "Build error has been detected during preLaunchTask '{0}'.", resolvedConfig.preLaunchTask) :
								nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", resolvedConfig.preLaunchTask, taskSummary.exitCode),
						actions: [
							new Action('debug.continue', nls.localize('debugAnyway', "Debug Anyway"), null, true, () => {
								this.messageService.hideAll();
								return this.doCreateProcess(root, resolvedConfig);
							}),
							this.instantiationService.createInstance(ToggleMarkersPanelAction, ToggleMarkersPanelAction.ID, ToggleMarkersPanelAction.LABEL),
							CloseAction
						]
					});
					return undefined;
				}, (err: TaskError) => {
					this.messageService.show(err.severity, {
						message: err.message,
						actions: [
							this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL),
							this.taskService.configureAction(),
							CloseAction
						]
					});
				});
			}, err => {
				if (!this.contextService.hasWorkspace()) {
					return this.messageService.show(severity.Error, nls.localize('noFolderWorkspaceDebugError', "The active file can not be debugged. Make sure it is saved on disk and that you have a debug extension installed for that file type."));
				}

				return this.configurationManager.selectedLaunch.openConfigFile(false).then(openend => {
					if (openend) {
						this.messageService.show(severity.Info, nls.localize('NewLaunchConfig', "Please set up the launch configuration file for your application. {0}", err.message));
					}
				});
			})
		);
	}

	private doCreateProcess(root: uri, configuration: debug.IConfig, sessionId = generateUuid()): TPromise<debug.IProcess> {
		configuration.__sessionId = sessionId;
		this.allSessionIds.add(sessionId);
		this.updateStateAndEmit(sessionId, debug.State.Initializing);

		return this.telemetryService.getTelemetryInfo().then(info => {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = info.machineId;
			telemetryInfo['common.vscodesessionid'] = info.sessionId;
			return telemetryInfo;
		}).then(data => {
			const adapter = this.configurationManager.getAdapter(configuration.type);
			const { aiKey, type } = adapter;
			const publisher = adapter.extensionDescription.publisher;
			this.customTelemetryService = null;
			let client: TelemetryClient;

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

				this.customTelemetryService = new TelemetryService({ appender }, this.configurationService);
			}

			const session = this.instantiationService.createInstance(RawDebugSession, sessionId, configuration.debugServer, adapter, this.customTelemetryService, root);
			const process = this.model.addProcess(configuration, session);

			this.toDisposeOnSessionEnd.set(session.getId(), []);
			if (client) {
				this.toDisposeOnSessionEnd.get(session.getId()).push(client);
			}
			this.registerSessionListeners(process, session);

			return session.initialize({
				clientID: 'vscode',
				adapterID: configuration.type,
				pathFormat: 'path',
				linesStartAt1: true,
				columnsStartAt1: true,
				supportsVariableType: true, // #8858
				supportsVariablePaging: true, // #9537
				supportsRunInTerminalRequest: true // #10574
			}).then((result: DebugProtocol.InitializeResponse) => {
				this.model.setExceptionBreakpoints(session.capabilities.exceptionBreakpointFilters);
				return configuration.request === 'attach' ? session.attach(configuration) : session.launch(configuration);
			}).then((result: DebugProtocol.Response) => {
				if (session.disconnected) {
					return TPromise.as(null);
				}
				this.focusStackFrameAndEvaluate(null, process);

				const internalConsoleOptions = configuration.internalConsoleOptions || this.configurationService.getConfiguration<debug.IDebugConfiguration>('debug').internalConsoleOptions;
				if (internalConsoleOptions === 'openOnSessionStart' || (!this.viewModel.changedWorkbenchViewState && internalConsoleOptions === 'openOnFirstSessionStart')) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}

				if (!this.viewModel.changedWorkbenchViewState && (this.partService.isVisible(Parts.SIDEBAR_PART) || !this.contextService.hasWorkspace())) {
					// We only want to change the workbench view state on the first debug session #5738 and if the side bar is not hidden
					this.viewModel.changedWorkbenchViewState = true;
					this.viewletService.openViewlet(debug.VIEWLET_ID);
				}

				this.extensionService.activateByEvent(`onDebug:${configuration.type}`).done(null, errors.onUnexpectedError);
				this.inDebugMode.set(true);
				this.debugType.set(configuration.type);
				this.isNodeDebugType.set(configuration.type === 'node' || configuration.type === 'node2' || configuration.type === 'extensionHost');
				if (this.model.getProcesses().length > 1) {
					this.viewModel.setMultiProcessView(true);
				}
				this.updateStateAndEmit(session.getId(), debug.State.Running);
				this._onDidNewProcess.fire(process);

				return this.telemetryService.publicLog('debugSessionStart', {
					type: configuration.type,
					breakpointCount: this.model.getBreakpoints().length,
					exceptionBreakpoints: this.model.getExceptionBreakpoints(),
					watchExpressionsCount: this.model.getWatchExpressions().length,
					extensionName: `${adapter.extensionDescription.publisher}.${adapter.extensionDescription.name}`,
					isBuiltin: adapter.extensionDescription.isBuiltin,
					launchJsonExists: this.contextService.hasWorkspace() && !!this.configurationService.getConfiguration<debug.IGlobalConfig>('launch', { resource: root })
				});
			}).then(() => process, (error: any) => {
				if (error instanceof Error && error.message === 'Canceled') {
					// Do not show 'canceled' error messages to the user #7906
					return TPromise.as(null);
				}

				const errorMessage = error instanceof Error ? error.message : error;
				this.telemetryService.publicLog('debugMisconfiguration', { type: configuration ? configuration.type : undefined, error: errorMessage });
				this.updateStateAndEmit(session.getId(), debug.State.Inactive);
				if (!session.disconnected) {
					session.disconnect().done(null, errors.onUnexpectedError);
				}
				// Show the repl if some error got logged there #5870
				if (this.model.getReplElements().length > 0) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}

				const configureAction = this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL);
				const actions = (error.actions && error.actions.length) ? error.actions.concat([configureAction]) : [CloseAction, configureAction];
				this.messageService.show(severity.Error, { message: errorMessage, actions });
				return undefined;
			});
		});
	}

	private runPreLaunchTask(taskName: string): TPromise<ITaskSummary> {
		if (!taskName) {
			return TPromise.as(null);
		}

		// run a task before starting a debug session
		return this.taskService.getTask(taskName).then(task => {
			if (!task) {
				return TPromise.wrapError(errors.create(nls.localize('DebugTaskNotFound', "Could not find the preLaunchTask \'{0}\'.", taskName)));
			}

			// task is already running - nothing to do.
			if (this.lastTaskEvent && this.lastTaskEvent.taskId === task._id) {
				return TPromise.as(null);
			}

			if (this.lastTaskEvent) {
				// there is a different task running currently.
				return TPromise.wrapError(errors.create(nls.localize('differentTaskRunning', "The task '{0}' is already running. Cannot run pre-launch task '{1}'.", this.lastTaskEvent.taskName, taskName)));
			}

			// no task running, execute the preLaunchTask.
			const taskPromise = this.taskService.run(task).then(result => {
				this.lastTaskEvent = null;
				return result;
			}, err => {
				this.lastTaskEvent = null;
			});

			if (task.isBackground) {
				return new TPromise((c, e) => this.taskService.addOneTimeListener(TaskServiceEvents.Inactive, () => c(null)));
			}

			return taskPromise;
		});
	}

	public sourceIsNotAvailable(uri: uri): void {
		this.model.sourceIsNotAvailable(uri);
	}

	public restartProcess(process: debug.IProcess, restartData?: any): TPromise<any> {
		if (process.session.capabilities.supportsRestartRequest) {
			return this.textFileService.saveAll().then(() => process.session.custom('restart', null));
		}
		const focusedProcess = this.viewModel.focusedProcess;
		const preserveFocus = focusedProcess && process.getId() === focusedProcess.getId();

		return process.session.disconnect(true).then(() => {
			if (strings.equalsIgnoreCase(process.configuration.type, 'extensionHost')) {
				this.broadcastService.broadcast({
					channel: EXTENSION_RELOAD_BROADCAST_CHANNEL,
					payload: [process.session.root.fsPath]
				});
			}

			return new TPromise<void>((c, e) => {
				setTimeout(() => {
					// Read the configuration again if a launch.json has been changed, if not just use the inmemory configuration
					let config = process.configuration;
					if (this.launchJsonChanged && this.configurationManager.selectedLaunch) {
						this.launchJsonChanged = false;
						config = this.configurationManager.selectedLaunch.getConfiguration(process.configuration.name) || config;
						// Take the type from the process since the debug extension might overwrite it #21316
						config.type = process.configuration.type;
						config.noDebug = process.configuration.noDebug;
					}
					config.__restart = restartData;
					this.createProcess(process.session.root, config).then(() => c(null), err => e(err));
				}, 300);
			});
		}).then(() => {
			if (preserveFocus) {
				// Restart should preserve the focused process
				const restartedProcess = this.model.getProcesses().filter(p => p.configuration.name === process.configuration.name).pop();
				if (restartedProcess && restartedProcess !== this.viewModel.focusedProcess) {
					this.focusStackFrameAndEvaluate(null, restartedProcess);
				}
			}
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
		this.telemetryService.publicLog('debugSessionStop', {
			type: process && process.configuration.type,
			success: session.emittedStopped || !bpsExist,
			sessionLengthInSeconds: session.getLengthInSeconds(),
			breakpointCount: this.model.getBreakpoints().length,
			watchExpressionsCount: this.model.getWatchExpressions().length
		});

		this.model.removeProcess(session.getId());
		if (process && process.state !== debug.ProcessState.INACTIVE) {
			this._onDidEndProcess.fire(process);
		}

		this.toDisposeOnSessionEnd.set(session.getId(), lifecycle.dispose(this.toDisposeOnSessionEnd.get(session.getId())));
		const focusedProcess = this.viewModel.focusedProcess;
		if (focusedProcess && focusedProcess.getId() === session.getId()) {
			this.focusStackFrameAndEvaluate(null).done(null, errors.onUnexpectedError);
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
			this.isNodeDebugType.reset();
			this.viewModel.setMultiProcessView(false);

			if (this.partService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getConfiguration<debug.IDebugConfiguration>('debug').openExplorerOnEnd) {
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
			if (this.textFileService.isDirty(modelUri)) {
				// Only send breakpoints for a file once it is not dirty #8077
				this.breakpointsToSendOnResourceSaved.add(modelUri.toString());
				return TPromise.as(null);
			}

			const breakpointsToSend = this.model.getBreakpoints().filter(bp => this.model.areBreakpointsActivated() && bp.enabled && bp.uri.toString() === modelUri.toString());

			const source = process.sources.get(modelUri.toString());
			const rawSource = source ? source.raw : { path: paths.normalize(modelUri.fsPath, true), name: paths.basename(modelUri.fsPath) };

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
		this.model.removeBreakpoints(this.model.getBreakpoints().filter(bp =>
			fileChangesEvent.contains(bp.uri, FileChangeType.DELETED)));

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
