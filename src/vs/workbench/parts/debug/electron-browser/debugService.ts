/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import mime = require('vs/base/common/mime');
import ee = require('vs/base/common/eventEmitter');
import uri from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import editor = require('vs/editor/common/editorCommon');
import aria = require('vs/base/browser/ui/aria/aria');
import { AIAdapter } from 'vs/base/node/aiAdapter';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybindingService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService, FileChangesEvent, FileChangeType, EventType } from 'vs/platform/files/common/files';
import { IEventService } from 'vs/platform/event/common/event';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import wbeditorcommon = require('vs/workbench/common/editor');
import debug = require('vs/workbench/parts/debug/common/debug');
import session = require('vs/workbench/parts/debug/node/rawDebugSession');
import model = require('vs/workbench/parts/debug/common/debugModel');
import { DebugStringEditorInput } from 'vs/workbench/parts/debug/browser/debugEditorInputs';
import viewmodel = require('vs/workbench/parts/debug/common/debugViewModel');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import { Repl } from 'vs/workbench/parts/debug/browser/repl';
import { BreakpointWidget } from 'vs/workbench/parts/debug/browser/breakpointWidget';
import { ConfigurationManager } from 'vs/workbench/parts/debug/node/debugConfigurationManager';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { ITaskService, TaskEvent, TaskType, TaskServiceEvents, ITaskSummary} from 'vs/workbench/parts/tasks/common/taskService';
import { TaskError, TaskErrors } from 'vs/workbench/parts/tasks/common/taskSystem';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITextFileService } from 'vs/workbench/parts/files/common/files';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWindowService, IBroadcast } from 'vs/workbench/services/window/electron-browser/windowService';
import { ILogEntry, PLUGIN_LOG_BROADCAST_CHANNEL, PLUGIN_ATTACH_BROADCAST_CHANNEL } from 'vs/workbench/services/thread/electron-browser/threadService';
import { ipcRenderer as ipc } from 'electron';

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';
const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';

export class DebugService extends ee.EventEmitter implements debug.IDebugService {
	public serviceId = debug.IDebugService;

	private taskService: ITaskService;
	private state: debug.State;
	private session: session.RawDebugSession;
	private model: model.Model;
	private viewModel: viewmodel.ViewModel;
	private configurationManager: ConfigurationManager;
	private debugStringEditorInputs: DebugStringEditorInput[];
	private telemetryAdapter: AIAdapter;
	private lastTaskEvent: TaskEvent;
	private toDispose: lifecycle.IDisposable[];
	private toDisposeOnSessionEnd: lifecycle.IDisposable[];
	private inDebugMode: IKeybindingContextKey<boolean>;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IFileService private fileService: IFileService,
		@IMessageService private messageService: IMessageService,
		@IPartService private partService: IPartService,
		@IWindowService private windowService: IWindowService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEventService eventService: IEventService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService:IInstantiationService,
		@IExtensionService private extensionService: IExtensionService,
		@IMarkerService private markerService: IMarkerService
	) {
		super();

		this.toDispose = [];
		this.toDisposeOnSessionEnd = [];
		this.debugStringEditorInputs = [];
		this.session = null;
		this.state = debug.State.Inactive;
		// there is a cycle if taskService gets injected, use a workaround.
		this.taskService = this.instantiationService.getInstance(ITaskService);

		if (!this.contextService.getWorkspace()) {
			this.state = debug.State.Disabled;
		}
		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE, 'null'));
		this.inDebugMode = keybindingService.createKey(debug.CONTEXT_IN_DEBUG_MODE, false);

		this.model = new model.Model(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true), this.loadFunctionBreakpoints(),
			this.loadExceptionBreakpoints(), this.loadWatchExpressions());
		this.viewModel = new viewmodel.ViewModel();

		this.registerListeners(eventService, lifecycleService);
	}

	private registerListeners(eventService: IEventService, lifecycleService: ILifecycleService): void {
		this.toDispose.push(eventService.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));

		if (this.taskService) {
			this.toDispose.push(this.taskService.addListener2(TaskServiceEvents.Active, (e: TaskEvent) => {
				this.lastTaskEvent = e;
			}));
			this.toDispose.push(this.taskService.addListener2(TaskServiceEvents.Inactive, (e: TaskEvent) => {
				if (e.type === TaskType.SingleRun) {
					this.lastTaskEvent = null;
				}
			}));
			this.toDispose.push(this.taskService.addListener2(TaskServiceEvents.Terminated, (e: TaskEvent) => {
				this.lastTaskEvent = null;
			}));
		}

		lifecycleService.onShutdown(this.store, this);
		lifecycleService.onShutdown(this.dispose, this);

		this.windowService.onBroadcast(this.onBroadcast, this);
	}

	private onBroadcast(broadcast: IBroadcast): void {

		// attach: PH is ready to be attached to
		if (broadcast.channel === PLUGIN_ATTACH_BROADCAST_CHANNEL) {
			this.rawAttach(broadcast.payload.port);

			return;
		}

		// from this point on we require an active session
		let session = this.getActiveSession();
		if (!session || session.getType() !== 'extensionHost') {
			return; // we are only intersted if we have an active debug session for extensionHost
		}

		// a plugin logged output, show it inside the REPL
		if (broadcast.channel === PLUGIN_LOG_BROADCAST_CHANNEL) {
			let extensionOutput: ILogEntry = broadcast.payload;
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
				else if (types.isObject(a) || Array.isArray(a)) {

					// flush any existing simple values logged
					if (simpleVals.length) {
						this.logToRepl(simpleVals.join(' '), sev);
						simpleVals = [];
					}

					// show object
					this.logToRepl(a, sev);
				}

				// string: watch out for % replacement directive
				// string substitution and formatting @ https://developer.chrome.com/devtools/docs/console
				else if (typeof a === 'string') {
					let buf = '';

					for (let j = 0, len = a.length; j < len; j++) {
						if (a[j] === '%' && (a[j + 1] === 's' || a[j + 1] === 'i' || a[j + 1] === 'd')) {
							i++; // read over substitution
							buf += !types.isUndefinedOrNull(args[i]) ? args[i] : ''; // replace
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
			if (simpleVals.length) {
				this.logToRepl(simpleVals.join(' '), sev);
			}
		}
	}

	private registerSessionListeners(): void {
		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.INITIALIZED, (event: DebugProtocol.InitializedEvent) => {
			aria.status(nls.localize('debuggingStarted', "Debugging started."));
			this.sendAllBreakpoints().then(() => {
				if (this.session.capabilities.supportsConfigurationDoneRequest) {
					this.session.configurationDone().done(null, errors.onUnexpectedError);
				}
			});
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.STOPPED, (event: DebugProtocol.StoppedEvent) => {
			this.setStateAndEmit(debug.State.Stopped);
			const threadId = event.body.threadId;

			this.getThreadData(threadId).done(() => {
				let thread = this.model.getThreads()[threadId];

				this.model.rawUpdate({
					threadId: threadId,
					stoppedDetails: event.body,
					allThreadsStopped: event.body.allThreadsStopped
				});

				thread.getCallStack(this).then(callStack => {
					this.windowService.getWindow().focus();
					if (callStack.length > 0) {
						// focus first stack frame from top that has source location
						const stackFrameToFocus = arrays.first(callStack, sf => sf.source && sf.source.available, callStack[0]);
						this.setFocusedStackFrameAndEvaluate(stackFrameToFocus);
						aria.alert(nls.localize('debuggingPaused', "Debugging paused, reason {0}, {1} {2}", event.body.reason, stackFrameToFocus.source ? stackFrameToFocus.source.name : '', stackFrameToFocus.lineNumber));

						return this.openOrRevealEditor(stackFrameToFocus.source, stackFrameToFocus.lineNumber, false, false);
					} else {
						this.setFocusedStackFrameAndEvaluate(null);
					}
				});
			}, errors.onUnexpectedError);
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.CONTINUED, () => {
			aria.status(nls.localize('debuggingContinued', "Debugging continued."));
			this.model.continueThreads();
			this.setFocusedStackFrameAndEvaluate(null);
			this.setStateAndEmit(this.configurationManager.getConfiguration().noDebug ? debug.State.RunningNoDebug : debug.State.Running);
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.THREAD, (event: DebugProtocol.ThreadEvent) => {
			if (event.body.reason === 'started') {
				this.session.threads().done((result) => {
					const thread = result.body.threads.filter(thread => thread.id === event.body.threadId).pop();
					if (thread) {
						this.model.rawUpdate({
							threadId: thread.id,
							thread: thread
						});
					}
				}, errors.onUnexpectedError);
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(true, event.body.threadId);
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.DEBUGEE_TERMINATED, (event: DebugProtocol.TerminatedEvent) => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (this.session && this.session.getId() === (<any>event).sessionId) {
				if (event.body && typeof event.body.restart === 'boolean' && event.body.restart) {
					this.restartSession().done(null, err => this.messageService.show(severity.Error, err.message));
				} else {
					this.session.disconnect().done(null, errors.onUnexpectedError);
				}
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.OUTPUT, (event: DebugProtocol.OutputEvent) => {
			if (event.body && event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the adapter provided the telemetry key
				if (this.telemetryAdapter) {
					this.telemetryAdapter.log(event.body.output, event.body.data);
				}
			} else if (event.body && typeof event.body.output === 'string' && event.body.output.length > 0) {
				this.onOutput(event);
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.BREAKPOINT, (event: DebugProtocol.BreakpointEvent) => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
			if (breakpoint) {
				this.model.updateBreakpoints({ [breakpoint.getId()]: event.body.breakpoint });
			} else {
				const functionBreakpoint = this.model.getFunctionBreakpoints().filter(bp => bp.idFromAdapter === id).pop();
				if (functionBreakpoint) {
					this.model.updateFunctionBreakpoints({ [functionBreakpoint.getId()]: event.body.breakpoint });
				}
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.addListener2(debug.SessionEvents.SERVER_EXIT, event => {
			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			if (this.session.getType() === 'extensionHost' && this.state === debug.State.RunningNoDebug) {
				ipc.send('vscode:closeExtensionHostWindow', this.contextService.getWorkspace().resource.fsPath);
			}
			if (this.session && this.session.getId() === event.sessionId) {
				this.onSessionEnd();
			}
		}));
	}

	private onOutput(event: DebugProtocol.OutputEvent): void {
		const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
		this.appendReplOutput(event.body.output, outputSeverity);
	}

	private getThreadData(threadId: number): TPromise<void> {
		return this.model.getThreads()[threadId] ? TPromise.as(undefined) :
			this.session.threads().then((response: DebugProtocol.ThreadsResponse) => {
				const thread = response.body.threads.filter(t => t.id === threadId).pop();
				if (!thread) {
					throw new Error(nls.localize('debugNoThread', "Did not get a thread from debug adapter with id {0}.", threadId));
				}

				this.model.rawUpdate({
					threadId: thread.id,
					thread: thread
				});
			});
	}

	private loadBreakpoints(): debug.IBreakpoint[] {
		try {
			return JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: any) => {
				return new model.Breakpoint(new Source(breakpoint.source.raw ? breakpoint.source.raw : { path: uri.parse(breakpoint.source.uri).fsPath, name: breakpoint.source.name }),
					breakpoint.desiredLineNumber || breakpoint.lineNumber, breakpoint.enabled, breakpoint.condition);
			});
		} catch (e) {
			return [];
		}
	}

	private loadFunctionBreakpoints(): debug.IFunctionBreakpoint[] {
		try {
			return JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((fb: any) => {
				return new model.FunctionBreakpoint(fb.name, fb.enabled);
			});
		} catch (e) {
			return [];
		}
	}

	private loadExceptionBreakpoints(): debug.IExceptionBreakpoint[] {
		let result: debug.IExceptionBreakpoint[] = null;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: any) => {
				return new model.ExceptionBreakpoint(exBreakpoint.filter || exBreakpoint.name, exBreakpoint.label, exBreakpoint.enabled);
			});
		} catch (e) {
			result = [];
		}

		return result;
	}

	private loadWatchExpressions(): model.Expression[] {
		try {
			return JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE, '[]')).map((watch: any) => {
				return new model.Expression(watch.name, false, watch.id);
			});
		} catch (e) {
			return [];
		}
	}

	public getState(): debug.State {
		return this.state;
	}

	private setStateAndEmit(newState: debug.State): void {
		this.state = newState;
		this.emit(debug.ServiceEvents.STATE_CHANGED);
	}

	public get enabled(): boolean {
		return !!this.contextService.getWorkspace();
	}

	public setFocusedStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame): void {
		this.viewModel.setFocusedStackFrame(focusedStackFrame);
		if (focusedStackFrame) {
			this.model.evaluateWatchExpressions(this.session, focusedStackFrame);
		} else {
			this.model.clearWatchExpressionValues();
		}
	}

	public setBreakpointsForModel(modelUri: uri, rawData: debug.IRawBreakpoint[]): void {
		this.model.removeBreakpoints(
			this.model.getBreakpoints().filter(bp => bp.source.uri.toString() === modelUri.toString()));
		this.model.addBreakpoints(rawData);
	}

	public toggleBreakpoint(rawBreakpoint: debug.IRawBreakpoint): TPromise<void> {
		const breakpoint = this.model.getBreakpoints().filter(bp => bp.lineNumber === rawBreakpoint.lineNumber && bp.source.uri.toString() === rawBreakpoint.uri.toString()).pop();
		if (breakpoint) {
			this.model.removeBreakpoints([breakpoint]);
		} else {
			this.model.addBreakpoints([rawBreakpoint]);
		}

		return this.sendBreakpoints(rawBreakpoint.uri);
	}

	public enableOrDisableAllBreakpoints(enabled: boolean): TPromise<void>{
		this.model.enableOrDisableAllBreakpoints(enabled);
		return this.sendAllBreakpoints();
	}

	public toggleEnablement(element: debug.IEnablement): TPromise<void> {
		this.model.toggleEnablement(element);
		if (element instanceof model.Breakpoint) {
			const breakpoint = <model.Breakpoint> element;
			return this.sendBreakpoints(breakpoint.source.uri);
		} else if (element instanceof model.FunctionBreakpoint) {
			return this.sendFunctionBreakpoints();
		}

		return this.sendExceptionBreakpoints();
	}

	public removeAllBreakpoints(): TPromise<any> {
		const urisToClear = arrays.distinct(this.model.getBreakpoints(), bp => bp.source.uri.toString()).map(bp => bp.source.uri);
		this.model.removeBreakpoints(this.model.getBreakpoints());

		return TPromise.join(urisToClear.map(uri => this.sendBreakpoints(uri)));
	}

	public toggleBreakpointsActivated(): TPromise<void> {
		this.model.toggleBreakpointsActivated();
		return this.sendAllBreakpoints();
	}

	public editBreakpoint(editor: editorbrowser.ICodeEditor, lineNumber: number): TPromise<void> {
		if (BreakpointWidget.INSTANCE) {
			BreakpointWidget.INSTANCE.dispose();
		}

		this.instantiationService.createInstance(BreakpointWidget, editor, lineNumber);
		BreakpointWidget.INSTANCE.show({ lineNumber, column: 1 }, 2);

		return TPromise.as(null);
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
		return this.model.addReplExpression(this.session, this.viewModel.getFocusedStackFrame(), name);
	}

	public logToRepl(value: string, severity?: severity): void;
	public logToRepl(value: { [key: string]: any }, severity?: severity): void;
	public logToRepl(value: any, severity?: severity): void {
		this.model.logToRepl(value, severity);
	}

	public appendReplOutput(value: string, severity?: severity): void {
		this.model.appendReplOutput(value, severity);
	}

	public clearReplExpressions(): void {
		this.model.clearReplExpressions();
	}

	public addWatchExpression(name: string): TPromise<void> {
		return this.model.addWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), name);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return this.model.renameWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), id, newName);
	}

	public clearWatchExpressions(id?: string): void {
		this.model.clearWatchExpressions(id);
	}

	public createSession(noDebug: boolean, changeViewState = !this.partService.isSideBarHidden()): TPromise<any> {
		this.setStateAndEmit(debug.State.Initializing);
		this.clearReplExpressions();

		return this.textFileService.saveAll().then(() => this.extensionService.onReady()).then(() => this.setConfiguration(this.configurationManager.getConfigurationName())).then(() => {

			const configuration = this.configurationManager.getConfiguration();
			if (!configuration) {
				return this.configurationManager.openConfigFile(false).then(openend => {
					if (openend) {
						this.messageService.show(severity.Info, nls.localize('NewLaunchConfig', "Please set up the launch configuration file for your application."));
					}
				});
			}

			configuration.noDebug = noDebug;
			if (!this.configurationManager.getAdapter()) {
				this.emit(debug.ServiceEvents.TYPE_NOT_SUPPORTED, configuration.type);
				return configuration.type ? TPromise.wrapError(new Error(nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", configuration.type)))
					: TPromise.wrapError(errors.create(nls.localize('debugTypeMissing', "Missing property 'type' for the selected configuration in launch.json."),
						{ actions: [CloseAction, this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL)] }));
			}

			return this.runPreLaunchTask(configuration.preLaunchTask).then((taskSummary: ITaskSummary) => {
				const errorCount = configuration.preLaunchTask ? this.markerService.getStatistics().errors : 0;
				const failureExitCode = taskSummary && taskSummary.exitCode !== undefined && taskSummary.exitCode !== 0;
				if (errorCount === 0 && !failureExitCode) {
					return this.doCreateSession(configuration, changeViewState);
				}

				this.messageService.show(severity.Error, {
					message: errorCount > 1 ? nls.localize('preLaunchTaskErrors', "Errors detected while running the preLaunchTask '{0}'.", configuration.preLaunchTask) :
						errorCount === 1 ?  nls.localize('preLaunchTaskError', "Error detected while running the preLaunchTask '{0}'.", configuration.preLaunchTask) :
						nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", configuration.preLaunchTask, taskSummary.exitCode),
					actions: [CloseAction, new Action('debug.continue', nls.localize('continue', "Continue"), null, true, () => {
						this.messageService.hideAll();
						return this.doCreateSession(configuration, changeViewState);
					})]
				});
			}, (err: TaskError) => {
				if (err.code !== TaskErrors.NotConfigured) {
					throw err;
				}

				this.messageService.show(err.severity, {
					message: err.message,
					actions: [CloseAction, this.taskService.configureAction()]
				});
			});
		});
	}

	private doCreateSession(configuration: debug.IConfig, changeViewState: boolean): TPromise<any> {
		const key = this.configurationManager.getAdapter().aiKey;
		const telemetryInfo = Object.create(null);
		this.telemetryService.getTelemetryInfo().then(info => {
			telemetryInfo['common.vscodemachineid'] = info.machineId;
			telemetryInfo['common.vscodesessionid'] = info.sessionId;
		}, errors.onUnexpectedError);
		this.telemetryAdapter = new AIAdapter(key, this.configurationManager.getAdapter().type, null, telemetryInfo);
		this.session = new session.RawDebugSession(this.messageService, this.telemetryService, configuration.debugServer, this.configurationManager.getAdapter(), this.telemetryAdapter);

		this.registerSessionListeners();

		return this.session.initialize({
			adapterID: configuration.type,
			pathFormat: 'path',
			linesStartAt1: true,
			columnsStartAt1: true
		}).then((result: DebugProtocol.InitializeResponse) => {
			if (!this.session) {
				return TPromise.wrapError(new Error(nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly")));
			}

			this.model.setExceptionBreakpoints(this.session.capabilities.exceptionBreakpointFilters);
			return configuration.request === 'attach' ? this.session.attach(configuration) : this.session.launch(configuration);
		}).then((result: DebugProtocol.Response) => {
			if (changeViewState) {
				this.viewletService.openViewlet(debug.VIEWLET_ID);
				this.revealRepl(false).done(undefined, errors.onUnexpectedError);
			}
			this.partService.addClass('debugging');
			this.contextService.updateOptions('editor', {
				glyphMargin: true
			});
			this.inDebugMode.set(true);

			this.telemetryService.publicLog('debugSessionStart', { type: configuration.type, breakpointCount: this.model.getBreakpoints().length, exceptionBreakpoints: this.model.getExceptionBreakpoints(), watchExpressionsCount: this.model.getWatchExpressions().length });
		}).then(undefined, (error: any) => {
			this.telemetryService.publicLog('debugMisconfiguration', { type: configuration ? configuration.type : undefined });
			if (this.session) {
				this.session.disconnect();
			}

			const configureAction = this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL);
			const actions = (error.actions && error.actions.length) ? error.actions.concat([configureAction]) : [CloseAction, configureAction];
			return TPromise.wrapError(errors.create(error.message, { actions }));
		});
	}

	private runPreLaunchTask(taskName: string): TPromise<ITaskSummary> {
		if (!taskName) {
			return TPromise.as(null);
		}

		// run a task before starting a debug session
		return this.taskService.tasks().then(descriptions => {
			const filteredTasks = descriptions.filter(task => task.name === taskName);
			if (filteredTasks.length !== 1) {
				return TPromise.wrapError(errors.create(nls.localize('DebugTaskNotFound', "Could not find the preLaunchTask \'{0}\'.", taskName), {
					actions: [
						CloseAction,
						this.taskService.configureAction(),
						this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL)
					]
				}));
			}

			// task is already running - nothing to do.
			if (this.lastTaskEvent && this.lastTaskEvent.taskName === taskName) {
				return TPromise.as(null);
			}

			if (this.lastTaskEvent) {
				// there is a different task running currently.
				return TPromise.wrapError(errors.create(nls.localize('differentTaskRunning', "There is a task {0} running. Can not run pre launch task {1}.", this.lastTaskEvent.taskName, taskName)));
			}

			// no task running, execute the preLaunchTask.
			const taskPromise = this.taskService.run(filteredTasks[0].id).then(result => {
				this.lastTaskEvent = null;
				return result;
			}, err => {
				this.lastTaskEvent = null;
			});

			if (filteredTasks[0].isWatching) {
				return new TPromise((c, e) => this.taskService.addOneTimeListener(TaskServiceEvents.Inactive, () => c(null)));
			}

			return taskPromise;
		});
	}

	private rawAttach(port: number): TPromise<any> {
		if (this.session) {
			if (!this.session.isAttach) {
				return this.session.attach({ port });
			}

			this.session.disconnect().done(null, errors.onUnexpectedError);
		}

		const configuration = this.configurationManager.getConfiguration();
		this.setStateAndEmit(debug.State.Initializing);
		return this.doCreateSession({
			type: configuration.type,
			request: 'attach',
			port,
			sourceMaps: configuration.sourceMaps,
			outDir: configuration.outDir,
			debugServer: configuration.debugServer
		}, false);
	}

	public restartSession(): TPromise<any> {
		return this.session ? this.session.disconnect(true).then(() =>
			new TPromise<void>((c, e) => {
				setTimeout(() => {
					this.createSession(false, false).then(() => c(null), err => e(err));
				}, 300);
			})
		) : this.createSession(false, false);
	}

	public getActiveSession(): debug.IRawDebugSession {
		return this.session;
	}

	private onSessionEnd(): void {
		try {
			this.debugStringEditorInputs = lifecycle.disposeAll(this.debugStringEditorInputs);
		} catch (e) {
			// an internal module might be open so the dispose can throw -> ignore and continue with stop session.
		}

		if (this.session) {
			const bpsExist = this.model.getBreakpoints().length > 0;
			this.session.dispose();
			this.telemetryService.publicLog('debugSessionStop', {
				type: this.session.getType(),
				success: this.session.emittedStopped || !bpsExist,
				sessionLengthInSeconds: this.session.getLengthInSeconds(),
				breakpointCount: this.model.getBreakpoints().length,
				watchExpressionsCount: this.model.getWatchExpressions().length
			});
		}

		this.session = null;
		this.toDisposeOnSessionEnd = lifecycle.disposeAll(this.toDisposeOnSessionEnd);
		this.partService.removeClass('debugging');
		this.editorService.focusEditor();

		this.model.clearThreads(true);
		this.setFocusedStackFrameAndEvaluate(null);
		this.setStateAndEmit(debug.State.Inactive);

		// set breakpoints back to unverified since the session ended.
		// source reference changes across sessions, so we do not use it to persist the source.
		const data: {[id: string]: { line: number, verified: boolean } } = { };
		this.model.getBreakpoints().forEach(bp => {
			delete bp.source.raw.sourceReference;
			data[bp.getId()] = { line: bp.lineNumber, verified: false };
		});
		this.model.updateBreakpoints(data);

		if (this.telemetryAdapter) {
			this.telemetryAdapter.dispose();
			this.telemetryAdapter = null;
		}
		this.inDebugMode.reset();
	}

	public getModel(): debug.IModel {
		return this.model;
	}

	public getViewModel(): debug.IViewModel {
		return this.viewModel;
	}

	public openOrRevealEditor(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): TPromise<any> {
		const visibleEditors = this.editorService.getVisibleEditors();
		for (let i = 0; i < visibleEditors.length; i++) {
			const fileInput = wbeditorcommon.asFileEditorInput(visibleEditors[i].input);
			if ((fileInput && fileInput.getResource().toString() === source.uri.toString()) ||
				(visibleEditors[i].input instanceof DebugStringEditorInput && (<DebugStringEditorInput>visibleEditors[i].input).getResource().toString() === source.uri.toString())) {

				const control = <editorbrowser.ICodeEditor>visibleEditors[i].getControl();
				if (control) {
					control.revealLineInCenterIfOutsideViewport(lineNumber);
					control.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
					return this.editorService.openEditor(visibleEditors[i].input, wbeditorcommon.TextEditorOptions.create({ preserveFocus: preserveFocus, forceActive: true }), visibleEditors[i].position);
				}

				return TPromise.as(null);
			}
		}

		if (source.inMemory) {
			// internal module
			if (source.reference !== 0 && this.session) {
				return this.session.source({ sourceReference: source.reference }).then(response => {
					const editorInput = this.getDebugStringEditorInput(source, response.body.content, mime.guessMimeTypes(source.name)[0]);
					return this.editorService.openEditor(editorInput, wbeditorcommon.TextEditorOptions.create({
						selection: {
							startLineNumber: lineNumber,
							startColumn: 1,
							endLineNumber: lineNumber,
							endColumn: 1
						},
						preserveFocus: preserveFocus
					}), sideBySide);
				});
			}

			return this.sourceIsUnavailable(source, sideBySide);
		}

		return this.fileService.resolveFile(source.uri).then(() =>
			this.editorService.openEditor({
				resource: source.uri,
				options: {
					selection: {
						startLineNumber: lineNumber,
						startColumn: 1,
						endLineNumber: lineNumber,
						endColumn: 1
					},
					preserveFocus: preserveFocus
				}
			}, sideBySide), err => this.sourceIsUnavailable(source, sideBySide)
		);
	}

	private sourceIsUnavailable(source: Source, sideBySide: boolean): TPromise<any> {
		this.model.sourceIsUnavailable(source);
		const editorInput = this.getDebugStringEditorInput(source, nls.localize('debugSourceNotAvailable', "Source {0} is not available.", source.uri.fsPath), 'text/plain');

		return this.editorService.openEditor(editorInput, wbeditorcommon.TextEditorOptions.create({ preserveFocus: true }), sideBySide);
	}

	public revealRepl(focus = true): TPromise<void> {
		return this.panelService.openPanel(debug.REPL_ID, focus).then((repl: Repl) => {
			const elements = this.model.getReplElements();
			if (elements.length > 0) {
				return repl.reveal(elements[elements.length - 1]);
			}
		});
	}

	public canSetBreakpointsIn(model: editor.IModel): boolean {
		return this.configurationManager.canSetBreakpointsIn(model);
	}

	public getConfigurationName(): string {
		return this.configurationManager.getConfigurationName();
	}

	public setConfiguration(name: string): TPromise<void> {
		return this.configurationManager.setConfiguration(name).then(() => this.emit(debug.ServiceEvents.CONFIGURATION_CHANGED));
	}

	public openConfigFile(sideBySide: boolean): TPromise<boolean> {
		return this.configurationManager.openConfigFile(sideBySide);
	}

	public loadLaunchConfig(): TPromise<debug.IGlobalConfig> {
		return this.configurationManager.loadLaunchConfig();
	}

	private getDebugStringEditorInput(source: Source, value: string, mtype: string): DebugStringEditorInput {
		const filtered = this.debugStringEditorInputs.filter(input => input.getResource().toString() === source.uri.toString());

		if (filtered.length === 0) {
			const result = this.instantiationService.createInstance(DebugStringEditorInput, source.name, source.uri, source.origin, value, mtype, void 0);
			this.debugStringEditorInputs.push(result);
			return result;
		} else {
			return filtered[0];
		}
	}

	public sendAllBreakpoints(): TPromise<any> {
		return TPromise.join(arrays.distinct(this.model.getBreakpoints(), bp => bp.source.uri.toString()).map(bp => this.sendBreakpoints(bp.source.uri)))
			.then(() => this.sendFunctionBreakpoints())
			// send exception breakpoints at the end since some debug adapters rely on the order
			.then(() => this.sendExceptionBreakpoints());
	}

	private sendBreakpoints(modelUri: uri): TPromise<void> {
		if (!this.session || !this.session.readyForBreakpoints) {
			return TPromise.as(null);
		}

		const breakpointsToSend = arrays.distinct(
			this.model.getBreakpoints().filter(bp => this.model.areBreakpointsActivated() && bp.enabled && bp.source.uri.toString() === modelUri.toString()),
			bp => `${ bp.desiredLineNumber }`
		);
		const rawSource = breakpointsToSend.length > 0 ? breakpointsToSend[0].source.raw : Source.toRawSource(modelUri, null);

		return this.session.setBreakpoints({ source: rawSource, lines: breakpointsToSend.map(bp => bp.desiredLineNumber),
			breakpoints: breakpointsToSend.map(bp => ({ line: bp.desiredLineNumber, condition: bp.condition })) }).then(response => {

			const data: {[id: string]: { line?: number, verified: boolean } } = { };
			for (let i = 0; i < breakpointsToSend.length; i++) {
				data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
			}

			this.model.updateBreakpoints(data);
		});
	}

	private sendFunctionBreakpoints(): TPromise<void> {
		if (!this.session || !this.session.readyForBreakpoints || !this.session.capabilities.supportsFunctionBreakpoints) {
			return TPromise.as(null);
		}

		const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
		return this.session.setFunctionBreakpoints({ breakpoints: breakpointsToSend }).then(response => {
			const data: {[id: string]: { name?: string, verified?: boolean } } = { };
			for (let i = 0; i < breakpointsToSend.length; i++) {
				data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
			}

			this.model.updateFunctionBreakpoints(data);
		});
	}

	private sendExceptionBreakpoints(): TPromise<any> {
		if (!this.session || !this.session.readyForBreakpoints || this.model.getExceptionBreakpoints().length === 0) {
			return TPromise.as(null);
		}

		const enabledExceptionBps = this.model.getExceptionBreakpoints().filter(exb => exb.enabled);
		return this.session.setExceptionBreakpoints({ filters: enabledExceptionBps.map(exb => exb.filter) });
	}

	private onFileChanges(fileChangesEvent: FileChangesEvent): void {
		this.model.removeBreakpoints(this.model.getBreakpoints().filter(bp =>
			fileChangesEvent.contains(bp.source.uri, FileChangeType.DELETED)));
	}

	private store(): void {
		this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(this.model.getBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_BREAKPOINTS_ACTIVATED_KEY, this.model.areBreakpointsActivated() ? 'true' : 'false', StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(this.model.getFunctionBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(this.model.getExceptionBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.configurationManager.getConfigurationName(), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(this.model.getWatchExpressions()), StorageScope.WORKSPACE);
	}

	public dispose(): void {
		if (this.session) {
			this.session.disconnect();
			this.session = null;
		}
		this.model.dispose();
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		this.toDisposeOnSessionEnd = lifecycle.disposeAll(this.toDisposeOnSessionEnd);
	}
}
