/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import { guessMimeTypes, MIME_TEXT } from 'vs/base/common/mime';
import Event, { Emitter } from 'vs/base/common/event';
import uri from 'vs/base/common/uri';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Action } from 'vs/base/common/actions';
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import aria = require('vs/base/browser/ui/aria/aria');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybinding';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService, FileChangesEvent, FileChangeType, EventType } from 'vs/platform/files/common/files';
import { IEventService } from 'vs/platform/event/common/event';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import wbeditorcommon = require('vs/workbench/common/editor');
import debug = require('vs/workbench/parts/debug/common/debug');
import session = require('vs/workbench/parts/debug/node/rawDebugSession');
import model = require('vs/workbench/parts/debug/common/debugModel');
import { DebugStringEditorInput } from 'vs/workbench/parts/debug/browser/debugEditorInputs';
import viewmodel = require('vs/workbench/parts/debug/common/debugViewModel');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import { ConfigurationManager } from 'vs/workbench/parts/debug/node/debugConfigurationManager';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { ITaskService, TaskEvent, TaskType, TaskServiceEvents, ITaskSummary} from 'vs/workbench/parts/tasks/common/taskService';
import { TaskError, TaskErrors } from 'vs/workbench/parts/tasks/common/taskSystem';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITextFileService } from 'vs/workbench/parts/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWindowService, IBroadcast } from 'vs/workbench/services/window/electron-browser/windowService';
import { ILogEntry, EXTENSION_LOG_BROADCAST_CHANNEL, EXTENSION_ATTACH_BROADCAST_CHANNEL, EXTENSION_TERMINATE_BROADCAST_CHANNEL } from 'vs/workbench/services/thread/electron-browser/threadService';
import { ipcRenderer as ipc } from 'electron';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';
const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';

export class DebugService implements debug.IDebugService {
	public _serviceBrand: any;

	private _state: debug.State;
	private _onDidChangeState: Emitter<debug.State>;
	private session: session.RawDebugSession;
	private model: model.Model;
	private viewModel: viewmodel.ViewModel;
	private configurationManager: ConfigurationManager;
	private customTelemetryService: ITelemetryService;
	private lastTaskEvent: TaskEvent;
	private toDispose: lifecycle.IDisposable[];
	private toDisposeOnSessionEnd: lifecycle.IDisposable[];
	private inDebugMode: IKeybindingContextKey<boolean>;
	private breakpointsToSendOnResourceSaved: { [uri: string]: boolean };

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
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IEventService eventService: IEventService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionService private extensionService: IExtensionService,
		@IMarkerService private markerService: IMarkerService,
		@ITaskService private taskService: ITaskService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.toDispose = [];
		this.toDisposeOnSessionEnd = [];
		this.session = null;
		this.breakpointsToSendOnResourceSaved = {};
		this._state = debug.State.Inactive;
		this._onDidChangeState = new Emitter<debug.State>();

		if (!this.contextService.getWorkspace()) {
			this._state = debug.State.Disabled;
		}
		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE, 'null'));
		this.inDebugMode = keybindingService.createKey(debug.CONTEXT_IN_DEBUG_MODE, false);

		this.model = new model.Model(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true), this.loadFunctionBreakpoints(),
			this.loadExceptionBreakpoints(), this.loadWatchExpressions());
		this.toDispose.push(this.model);
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

		this.toDispose.push(this.windowService.onBroadcast(this.onBroadcast, this));
	}

	private onBroadcast(broadcast: IBroadcast): void {

		// attach: PH is ready to be attached to
		if (broadcast.channel === EXTENSION_ATTACH_BROADCAST_CHANNEL) {
			this.rawAttach(broadcast.payload.port);
			return;
		}

		if (broadcast.channel === EXTENSION_TERMINATE_BROADCAST_CHANNEL) {
			this.onSessionEnd();
			return;
		}

		// from this point on we require an active session
		let session = this.getActiveSession();
		if (!session || session.configuration.type !== 'extensionHost') {
			return; // we are only intersted if we have an active debug session for extensionHost
		}

		// a plugin logged output, show it inside the REPL
		if (broadcast.channel === EXTENSION_LOG_BROADCAST_CHANNEL) {
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
		this.toDisposeOnSessionEnd.push(this.session);
		this.toDisposeOnSessionEnd.push(this.session.onDidInitialize(event => {
			aria.status(nls.localize('debuggingStarted', "Debugging started."));
			this.sendAllBreakpoints().then(() => {
				if (this.session.configuration.capabilities.supportsConfigurationDoneRequest) {
					this.session.configurationDone().done(null, errors.onUnexpectedError);
				}
			});
		}));

		this.toDisposeOnSessionEnd.push(this.session.onDidStop(event => {
			this.setStateAndEmit(debug.State.Stopped);
			const threadId = event.body.threadId;

			this.getThreadData().done(() => {
				this.model.rawUpdate({
					threadId,
					stoppedDetails: event.body,
					allThreadsStopped: event.body.allThreadsStopped
				});

				const thread = this.model.getThreads()[threadId];
				thread.getCallStack(this).then(callStack => {
					if (callStack.length > 0) {
						// focus first stack frame from top that has source location
						const stackFrameToFocus = arrays.first(callStack, sf => sf.source && sf.source.available, callStack[0]);
						this.setFocusedStackFrameAndEvaluate(stackFrameToFocus, thread).done(null, errors.onUnexpectedError);
						this.windowService.getWindow().focus();
						aria.alert(nls.localize('debuggingPaused', "Debugging paused, reason {0}, {1} {2}", event.body.reason, stackFrameToFocus.source ? stackFrameToFocus.source.name : '', stackFrameToFocus.lineNumber));

						return this.openOrRevealSource(stackFrameToFocus.source, stackFrameToFocus.lineNumber, false, false);
					} else {
						this.setFocusedStackFrameAndEvaluate(null, thread).done(null, errors.onUnexpectedError);
					}
				});
			}, errors.onUnexpectedError);
		}));

		this.toDisposeOnSessionEnd.push(this.session.onDidThread(event => {
			if (event.body.reason === 'started') {
				this.getThreadData().done(null, errors.onUnexpectedError);
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(true, event.body.threadId);
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.onDidTerminateDebugee(event => {
			aria.status(nls.localize('debuggingStopped', "Debugging stopped."));
			if (this.session && this.session.getId() === event.body.sessionId) {
				if (event.body && typeof event.body.restart === 'boolean' && event.body.restart) {
					this.restartSession().done(null, err => this.messageService.show(severity.Error, err.message));
				} else {
					this.session.disconnect().done(null, errors.onUnexpectedError);
				}
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.onDidOutput(event => {
			if (event.body && event.body.category === 'telemetry') {
				// only log telemetry events from debug adapter if the adapter provided the telemetry key
				// and the user opted in telemetry
				if (this.customTelemetryService && this.telemetryService.isOptedIn) {
					this.customTelemetryService.publicLog(event.body.output, event.body.data);
				}
			} else if (event.body && typeof event.body.output === 'string' && event.body.output.length > 0) {
				this.onOutput(event);
			}
		}));

		this.toDisposeOnSessionEnd.push(this.session.onDidBreakpoint(event => {
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

		this.toDisposeOnSessionEnd.push(this.session.onDidExitAdapter(event => {
			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			if (this.session.configuration.type === 'extensionHost' && this._state === debug.State.RunningNoDebug) {
				ipc.send('vscode:closeExtensionHostWindow', this.contextService.getWorkspace().resource.fsPath);
			}
			if (this.session && this.session.getId() === event.body.sessionId) {
				this.onSessionEnd();
			}
		}));
	}

	private onOutput(event: DebugProtocol.OutputEvent): void {
		const outputSeverity = event.body.category === 'stderr' ? severity.Error : event.body.category === 'console' ? severity.Warning : severity.Info;
		this.appendReplOutput(event.body.output, outputSeverity);
	}

	private getThreadData(): TPromise<void> {
		return this.session.threads().then(response => {
			response.body.threads.forEach(thread => this.model.rawUpdate({ threadId: thread.id, thread }));
		});
	}

	private loadBreakpoints(): debug.IBreakpoint[] {
		let result: debug.IBreakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: any) => {
				return new model.Breakpoint(new Source(breakpoint.source.raw ? breakpoint.source.raw : { path: uri.parse(breakpoint.source.uri).fsPath, name: breakpoint.source.name }),
					breakpoint.desiredLineNumber || breakpoint.lineNumber, breakpoint.enabled, breakpoint.condition);
			});
		} catch (e) { }

		return result || [];
	}

	private loadFunctionBreakpoints(): debug.IFunctionBreakpoint[] {
		let result: debug.IFunctionBreakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((fb: any) => {
				return new model.FunctionBreakpoint(fb.name, fb.enabled);
			});
		} catch (e) { }

		return result || [];
	}

	private loadExceptionBreakpoints(): debug.IExceptionBreakpoint[] {
		let result: debug.IExceptionBreakpoint[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: any) => {
				return new model.ExceptionBreakpoint(exBreakpoint.filter || exBreakpoint.name, exBreakpoint.label, exBreakpoint.enabled);
			});
		} catch (e) { }

		return result || [];
	}

	private loadWatchExpressions(): model.Expression[] {
		let result: model.Expression[];
		try {
			result = JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE, '[]')).map((watch: any) => {
				return new model.Expression(watch.name, false, watch.id);
			});
		} catch (e) { }

		return result || [];
	}

	public get state(): debug.State {
		return this._state;
	}

	public get onDidChangeState(): Event<debug.State> {
		return this._onDidChangeState.event;
	}

	private setStateAndEmit(newState: debug.State): void {
		this._state = newState;
		this._onDidChangeState.fire(newState);
	}

	public get enabled(): boolean {
		return !!this.contextService.getWorkspace();
	}

	public setFocusedStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame, thread?: debug.IThread): TPromise<void> {
		if (!thread && focusedStackFrame) {
			thread = this.model.getThreads()[focusedStackFrame.threadId];
		}

		this.viewModel.setFocusedStackFrame(focusedStackFrame, thread);
		if (focusedStackFrame) {
			return this.model.evaluateWatchExpressions(this.session, focusedStackFrame);
		} else {
			this.model.clearWatchExpressionValues();
			return TPromise.as(null);
		}
	}

	public enableOrDisableBreakpoints(enable: boolean, breakpoint?: debug.IEnablement): TPromise<void> {
		if (breakpoint) {
			this.model.setEnablement(breakpoint, enable);
			if (breakpoint instanceof model.Breakpoint) {
				return this.sendBreakpoints((<model.Breakpoint>breakpoint).source.uri);
			} else if (breakpoint instanceof model.FunctionBreakpoint) {
				return this.sendFunctionBreakpoints();
			}

			return this.sendExceptionBreakpoints();
		}

		this.model.enableOrDisableAllBreakpoints(enable);
		return this.sendAllBreakpoints();
	}

	public addBreakpoints(rawBreakpoints: debug.IRawBreakpoint[]): TPromise<void[]> {
		this.model.addBreakpoints(rawBreakpoints);
		const uris = arrays.distinct(rawBreakpoints, raw => raw.uri.toString()).map(raw => raw.uri);
		rawBreakpoints.forEach(rbp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", rbp.lineNumber, rbp.uri.fsPath)));

		return TPromise.join(uris.map(uri => this.sendBreakpoints(uri)));
	}

	public removeBreakpoints(id?: string): TPromise<any> {
		const toRemove = this.model.getBreakpoints().filter(bp => !id || bp.getId() === id);
		toRemove.forEach(bp => aria.status(nls.localize('breakpointRemoved', "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.source.uri.fsPath)));
		const urisToClear = arrays.distinct(toRemove, bp => bp.source.uri.toString()).map(bp => bp.source.uri);

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
		const focussedStackFrame = this.viewModel.getFocusedStackFrame();
		return this.model.addReplExpression(this.session, focussedStackFrame, name)
			// Evaluate all watch expressions again since repl evaluation might have changed some.
			.then(() => this.setFocusedStackFrameAndEvaluate(focussedStackFrame));
	}

	public logToRepl(value: string | { [key: string]: any }, severity?: severity): void {
		this.model.logToRepl(value, severity);
	}

	public appendReplOutput(value: string, severity?: severity): void {
		this.model.appendReplOutput(value, severity);
	}

	public removeReplExpressions(): void {
		this.model.removeReplExpressions();
	}

	public setVariable(variable: debug.IExpression, value: string): TPromise<any> {
		if (!this.session || !(variable instanceof model.Variable)) {
			return TPromise.as(null);
		}

		return this.session.setVarialbe({
			name: variable.name,
			value,
			variablesReference: (<model.Variable>variable).parent.reference
		}).then(response => {
			variable.value = response.body.value;
			// Evaluate all watch expressions again since changing variable value might have changed some #8118.
			return this.setFocusedStackFrameAndEvaluate(this.viewModel.getFocusedStackFrame());
		}, err => {
			(<model.Variable>variable).errorMessage = err.message;
			// On error still show bad value so the user can fix it #8055
			(<model.Variable>variable).value = value;
		});
	}

	public addWatchExpression(name: string): TPromise<void> {
		return this.model.addWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), name);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return this.model.renameWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), id, newName);
	}

	public removeWatchExpressions(id?: string): void {
		this.model.removeWatchExpressions(id);
	}

	public createSession(noDebug: boolean, configuration?: debug.IConfig): TPromise<any> {
		this.removeReplExpressions();

		return this.textFileService.saveAll()							// make sure all dirty files are saved
			.then(() => this.configurationService.loadConfiguration()	// make sure configuration is up to date
			.then(() => this.extensionService.onReady()
			.then(() => this.configurationManager.setConfiguration(configuration || this.configurationManager.configurationName)
			.then(() => this.configurationManager.resolveInteractiveVariables())
			.then(resolvedConfiguration => {
				configuration = resolvedConfiguration;
				if (!configuration) {
					return this.configurationManager.openConfigFile(false).then(openend => {
						if (openend) {
							this.messageService.show(severity.Info, nls.localize('NewLaunchConfig', "Please set up the launch configuration file for your application."));
						}
					});
				}
				if (configuration.silentlyAbort) {
					return;
				}

				configuration.noDebug = noDebug;
				if (!this.configurationManager.adapter) {
					return configuration.type ? TPromise.wrapError(new Error(nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", configuration.type)))
						: TPromise.wrapError(errors.create(nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration."),
							{ actions: [CloseAction, this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL)] }));
				}

				return this.runPreLaunchTask(configuration.preLaunchTask).then((taskSummary: ITaskSummary) => {
					const errorCount = configuration.preLaunchTask ? this.markerService.getStatistics().errors : 0;
					const successExitCode = taskSummary && taskSummary.exitCode === 0;
					const failureExitCode = taskSummary && taskSummary.exitCode !== undefined && taskSummary.exitCode !== 0;
					if (successExitCode || (errorCount === 0 && !failureExitCode)) {
						return this.doCreateSession(configuration);
					}

					this.messageService.show(severity.Error, {
						message: errorCount > 1 ? nls.localize('preLaunchTaskErrors', "Build errors have been detected during preLaunchTask '{0}'.", configuration.preLaunchTask) :
							errorCount === 1 ? nls.localize('preLaunchTaskError', "Build error has been detected during preLaunchTask '{0}'.", configuration.preLaunchTask) :
								nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", configuration.preLaunchTask, taskSummary.exitCode),
						actions: [CloseAction, new Action('debug.continue', nls.localize('debugAnyway', "Debug Anyway"), null, true, () => {
							this.messageService.hideAll();
							return this.doCreateSession(configuration);
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
			}))));
	}

	private doCreateSession(configuration: debug.IExtHostConfig): TPromise<any> {
		this.setStateAndEmit(debug.State.Initializing);

		return this.telemetryService.getTelemetryInfo().then(info => {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = info.machineId;
			telemetryInfo['common.vscodesessionid'] = info.sessionId;
			return telemetryInfo;
		}).then(data => {
			const { aiKey, type } = this.configurationManager.adapter;
			const publisher = this.configurationManager.adapter.extensionDescription.publisher;
			this.customTelemetryService = null;

			if (aiKey) {
				const client = new Client(
					uri.parse(require.toUrl('bootstrap')).fsPath,
					{
						serverName: 'Debug Telemetry',
						timeout: 1000 * 60 * 5,
						args: [`${ publisher }.${ type }`, JSON.stringify(data), aiKey],
						env: {
							ATOM_SHELL_INTERNAL_RUN_AS_NODE: 1,
							PIPE_LOGGING: 'true',
							AMD_ENTRYPOINT: 'vs/workbench/parts/debug/node/telemetryApp'
						}
					}
				);

				const channel = client.getChannel('telemetryAppender');
				const appender = new TelemetryAppenderClient(channel);

				this.toDisposeOnSessionEnd.push(client);
				this.customTelemetryService = new TelemetryService({ appender }, this.configurationService);
			}

			this.session = this.instantiationService.createInstance(session.RawDebugSession, configuration.debugServer, this.configurationManager.adapter, this.customTelemetryService);
			this.registerSessionListeners();

			return this.session.initialize({
				adapterID: configuration.type,
				pathFormat: 'path',
				linesStartAt1: true,
				columnsStartAt1: true,
				supportsVariableType: true // #8858
			}).then((result: DebugProtocol.InitializeResponse) => {
				if (!this.session) {
					return TPromise.wrapError(new Error(nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly")));
				}

				this.model.setExceptionBreakpoints(this.session.configuration.capabilities.exceptionBreakpointFilters);
				return configuration.request === 'attach' ? this.session.attach(configuration) : this.session.launch(configuration);
			}).then((result: DebugProtocol.Response) => {
				if (configuration.internalConsoleOptions === 'openOnSessionStart' || (!this.viewModel.changedWorkbenchViewState && configuration.internalConsoleOptions !== 'neverOpen')) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}

				if (!this.viewModel.changedWorkbenchViewState && !this.partService.isSideBarHidden()) {
					// We only want to change the workbench view state on the first debug session #5738 and if the side bar is not hidden
					this.viewModel.changedWorkbenchViewState = true;
					this.viewletService.openViewlet(debug.VIEWLET_ID);
				}

				// Do not change status bar to orange if we are just running without debug.
				if (!configuration.noDebug) {
					this.partService.addClass('debugging');
				}
				this.extensionService.activateByEvent(`onDebug:${configuration.type}`).done(null, errors.onUnexpectedError);
				this.contextService.updateOptions('editor', {
					glyphMargin: true
				});
				this.inDebugMode.set(true);
				this.lazyTransitionToRunningState();

				this.telemetryService.publicLog('debugSessionStart', {
					type: configuration.type,
					breakpointCount: this.model.getBreakpoints().length,
					exceptionBreakpoints: this.model.getExceptionBreakpoints(),
					watchExpressionsCount: this.model.getWatchExpressions().length,
					extensionName: `${ this.configurationManager.adapter.extensionDescription.publisher }.${ this.configurationManager.adapter.extensionDescription.name }`,
					isBuiltin: this.configurationManager.adapter.extensionDescription.isBuiltin
				});
			}).then(undefined, (error: any) => {
				if (error instanceof Error && error.message === 'Canceled') {
					// Do not show 'canceled' error messages to the user #7906
					return TPromise.as(null);
				}

				this.telemetryService.publicLog('debugMisconfiguration', { type: configuration ? configuration.type : undefined });
				this.setStateAndEmit(debug.State.Inactive);
				if (this.session) {
					this.session.disconnect();
				}
				// Show the repl if some error got logged there #5870
				if (this.model.getReplElements().length > 0) {
					this.panelService.openPanel(debug.REPL_ID, false).done(undefined, errors.onUnexpectedError);
				}

				const configureAction = this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL);
				const actions = (error.actions && error.actions.length) ? error.actions.concat([configureAction]) : [CloseAction, configureAction];
				return TPromise.wrapError(errors.create(error.message, { actions }));
			});
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
				return new TPromise((c, e) => this.taskService.addOneTimeDisposableListener(TaskServiceEvents.Inactive, () => c(null)));
			}

			return taskPromise;
		});
	}

	private rawAttach(port: number): TPromise<any> {
		if (this.session) {
			if (!this.session.configuration.isAttach) {
				return this.session.attach({ port });
			}

			this.session.disconnect().done(null, errors.onUnexpectedError);
		}

		this.setStateAndEmit(debug.State.Initializing);
		const configuration = <debug.IExtHostConfig>this.configurationManager.configuration;
		return this.doCreateSession({
			type: configuration.type,
			request: 'attach',
			port,
			sourceMaps: configuration.sourceMaps,
			outDir: configuration.outDir,
			debugServer: configuration.debugServer
		});
	}

	public restartSession(): TPromise<any> {
		return this.session ? this.session.disconnect(true).then(() =>
			new TPromise<void>((c, e) => {
				setTimeout(() => {
					this.createSession(false, null).then(() => c(null), err => e(err));
				}, 300);
			})
		) : this.createSession(false, null);
	}

	public getActiveSession(): debug.IRawDebugSession {
		return this.session;
	}

	private onSessionEnd(): void {
		if (this.session) {
			const bpsExist = this.model.getBreakpoints().length > 0;
			this.telemetryService.publicLog('debugSessionStop', {
				type: this.session.configuration.type,
				success: this.session.emittedStopped || !bpsExist,
				sessionLengthInSeconds: this.session.getLengthInSeconds(),
				breakpointCount: this.model.getBreakpoints().length,
				watchExpressionsCount: this.model.getWatchExpressions().length
			});
		}

		this.session = null;
		try {
			this.toDisposeOnSessionEnd = lifecycle.dispose(this.toDisposeOnSessionEnd);
		} catch (e) {
			// an internal module might be open so the dispose can throw -> ignore and continue with stop session.
		}

		this.partService.removeClass('debugging');

		this.model.clearThreads(true);
		this.setFocusedStackFrameAndEvaluate(null).done(null, errors.onUnexpectedError);
		this.setStateAndEmit(debug.State.Inactive);

		// set breakpoints back to unverified since the session ended.
		// source reference changes across sessions, so we do not use it to persist the source.
		const data: { [id: string]: { line: number, verified: boolean } } = {};
		this.model.getBreakpoints().forEach(bp => {
			delete bp.source.raw.sourceReference;
			data[bp.getId()] = { line: bp.lineNumber, verified: false };
		});
		this.model.updateBreakpoints(data);

		this.inDebugMode.reset();
	}

	public getModel(): debug.IModel {
		return this.model;
	}

	public getViewModel(): debug.IViewModel {
		return this.viewModel;
	}

	public openOrRevealSource(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): TPromise<any> {
		const visibleEditors = this.editorService.getVisibleEditors();
		for (let i = 0; i < visibleEditors.length; i++) {
			const fileInput = wbeditorcommon.asFileEditorInput(visibleEditors[i].input);
			if ((fileInput && fileInput.getResource().toString() === source.uri.toString()) ||
				(visibleEditors[i].input instanceof DebugStringEditorInput && (<DebugStringEditorInput>visibleEditors[i].input).getResource().toString() === source.uri.toString())) {

				const control = <editorbrowser.ICodeEditor>visibleEditors[i].getControl();
				if (control) {
					control.revealLineInCenterIfOutsideViewport(lineNumber);
					control.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
					this.editorGroupService.activateGroup(i);
					if (!preserveFocus) {
						this.editorGroupService.focusGroup(i);
					}
				}

				return TPromise.as(null);
			}
		}

		if (source.inMemory) {
			// internal module
			if (source.reference !== 0 && this.session) {
				return this.session.source({ sourceReference: source.reference }).then(response => {
					const mime = response.body.mimeType ? response.body.mimeType : guessMimeTypes(source.name)[0];
					return this.getDebugStringEditorInput(source, response.body.content, mime);
				}, (err: DebugProtocol.ErrorResponse) => {
					// Display the error from debug adapter using a temporary editor #8836
					return this.getDebugStringEditorInput(source, err.message, MIME_TEXT);
				}).then(editorInput => {
					return this.editorService.openEditor(editorInput, { preserveFocus, selection: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 } }, sideBySide);
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

		return this.editorService.openEditor(editorInput, { preserveFocus: true }, sideBySide);
	}

	public getConfigurationManager(): debug.IConfigurationManager {
		return this.configurationManager;
	}

	public next(threadId: number): TPromise<void> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.next({ threadId }).then(() => {
			this.lazyTransitionToRunningState(threadId);
		});
	}

	public stepIn(threadId: number): TPromise<void> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.stepIn({ threadId }).then(() => {
			this.lazyTransitionToRunningState(threadId);
		});
	}

	public stepOut(threadId: number): TPromise<void> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.stepOut({ threadId }).then(() => {
			this.lazyTransitionToRunningState(threadId);
		});
	}

	public stepBack(threadId: number): TPromise<void> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.stepBack({ threadId }).then(() => {
			this.lazyTransitionToRunningState(threadId);
		});
	}

	public continue(threadId: number): TPromise<void> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.continue({ threadId }).then(response => {
			const allThreadsContinued = response.body ? response.body.allThreadsContinued !== false : true;
			this.lazyTransitionToRunningState(allThreadsContinued ? undefined : threadId);
		});
	}

	public pause(threadId: number): TPromise<any> {
		if (!this.session) {
			return TPromise.as(null);
		}

		return this.session.pause({ threadId });
	}

	private lazyTransitionToRunningState(threadId?: number): void {
		let setNewFocusedStackFrameScheduler: RunOnceScheduler;
		const toDispose = this.session.onDidStop(e => {
			if (e.body.threadId === threadId || e.body.allThreadsStopped || !threadId) {
				setNewFocusedStackFrameScheduler.cancel();
			}
		});

		this.model.clearThreads(false, threadId);

		// Get a top stack frame of a stopped thread if there is any.
		const threads = this.model.getThreads();
		const stoppedReference = Object.keys(threads).filter(ref => threads[ref].stopped).pop();
		const stoppedThread = stoppedReference ? threads[parseInt(stoppedReference)] : null;
		const callStack = stoppedThread ? stoppedThread.getCachedCallStack() : null;
		const stackFrameToFocus = callStack && callStack.length > 0 ? callStack[0] : null;

		if (!stoppedThread) {
			this.setStateAndEmit(this.configurationManager.configuration.noDebug ? debug.State.RunningNoDebug : debug.State.Running);
		}

		// Do not immediatly set a new focused stack frame since that might cause unnecessery flickering
		// of the tree in the debug viewlet. Only set focused stack frame if no stopped event has arrived in 500ms.
		setNewFocusedStackFrameScheduler = new RunOnceScheduler(() => {
			toDispose.dispose();
			aria.status(nls.localize('debuggingContinued', "Debugging continued."));

			this.setFocusedStackFrameAndEvaluate(stackFrameToFocus).done(null, errors.onUnexpectedError);
		}, 500);
		setNewFocusedStackFrameScheduler.schedule();
	}

	private getDebugStringEditorInput(source: Source, value: string, mtype: string): DebugStringEditorInput {
		const result = this.instantiationService.createInstance(DebugStringEditorInput, source.name, source.uri, source.origin, value, mtype, void 0);
		this.toDisposeOnSessionEnd.push(result);
		return result;
	}

	private sendAllBreakpoints(): TPromise<any> {
		return TPromise.join(arrays.distinct(this.model.getBreakpoints(), bp => bp.source.uri.toString()).map(bp => this.sendBreakpoints(bp.source.uri)))
			.then(() => this.sendFunctionBreakpoints())
			// send exception breakpoints at the end since some debug adapters rely on the order
			.then(() => this.sendExceptionBreakpoints());
	}

	private sendBreakpoints(modelUri: uri, sourceModified = false): TPromise<void> {
		if (!this.session || !this.session.readyForBreakpoints) {
			return TPromise.as(null);
		}
		if (this.textFileService.isDirty(modelUri)) {
			// Only send breakpoints for a file once it is not dirty #8077
			this.breakpointsToSendOnResourceSaved[modelUri.toString()] = true;
			return TPromise.as(null);
		}

		const breakpointsToSend = arrays.distinct(
			this.model.getBreakpoints().filter(bp => this.model.areBreakpointsActivated() && bp.enabled && bp.source.uri.toString() === modelUri.toString()),
			bp => `${bp.desiredLineNumber}`
		);
		const rawSource = breakpointsToSend.length > 0 ? breakpointsToSend[0].source.raw : Source.toRawSource(modelUri, this.model);

		return this.session.setBreakpoints({
			source: rawSource,
			lines: breakpointsToSend.map(bp => bp.desiredLineNumber),
			breakpoints: breakpointsToSend.map(bp => ({ line: bp.desiredLineNumber, condition: bp.condition })),
			sourceModified
		}).then(response => {
			const data: { [id: string]: { line?: number, verified: boolean } } = {};
			for (let i = 0; i < breakpointsToSend.length; i++) {
				data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
			}

			this.model.updateBreakpoints(data);
		});
	}

	private sendFunctionBreakpoints(): TPromise<void> {
		if (!this.session || !this.session.readyForBreakpoints || !this.session.configuration.capabilities.supportsFunctionBreakpoints) {
			return TPromise.as(null);
		}

		const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
		return this.session.setFunctionBreakpoints({ breakpoints: breakpointsToSend }).then(response => {
			const data: { [id: string]: { name?: string, verified?: boolean } } = {};
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

		fileChangesEvent.getUpdated().forEach(event => {
			if (this.breakpointsToSendOnResourceSaved[event.resource.toString()]) {
				this.breakpointsToSendOnResourceSaved[event.resource.toString()] = false;
				this.sendBreakpoints(event.resource, true).done(null, errors.onUnexpectedError);
			}
		});

	}

	private store(): void {
		this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(this.model.getBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_BREAKPOINTS_ACTIVATED_KEY, this.model.areBreakpointsActivated() ? 'true' : 'false', StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(this.model.getFunctionBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(this.model.getExceptionBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.configurationManager.configurationName, StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(this.model.getWatchExpressions()), StorageScope.WORKSPACE);
	}

	public dispose(): void {
		this.toDisposeOnSessionEnd = lifecycle.dispose(this.toDisposeOnSessionEnd);
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
