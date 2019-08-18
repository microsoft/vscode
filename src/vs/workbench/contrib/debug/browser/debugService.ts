/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { URI as uri } from 'vs/base/common/uri';
import { first, distinct } from 'vs/base/common/arrays';
import * as errors from 'vs/base/common/errors';
import severity from 'vs/base/common/severity';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint, Breakpoint, Expression, DataBreakpoint } from 'vs/workbench/contrib/debug/common/debugModel';
import { ViewModel } from 'vs/workbench/contrib/debug/common/debugViewModel';
import * as debugactions from 'vs/workbench/contrib/debug/browser/debugActions';
import { ConfigurationManager } from 'vs/workbench/contrib/debug/browser/debugConfigurationManager';
import Constants from 'vs/workbench/contrib/markers/browser/constants';
import { ITaskService, ITaskSummary } from 'vs/workbench/contrib/tasks/common/taskService';
import { TaskError } from 'vs/workbench/contrib/tasks/common/taskSystem';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/contrib/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { parse, getFirstFrame } from 'vs/base/common/console';
import { TaskEvent, TaskEventKind, TaskIdentifier } from 'vs/workbench/contrib/tasks/common/tasks';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAction, Action } from 'vs/base/common/actions';
import { deepClone, equals } from 'vs/base/common/objects';
import { DebugSession } from 'vs/workbench/contrib/debug/browser/debugSession';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IDebugService, State, IDebugSession, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_MODE, IThread, IDebugConfiguration, VIEWLET_ID, REPL_ID, IConfig, ILaunch, IViewModel, IConfigurationManager, IDebugModel, IEnablement, IBreakpoint, IBreakpointData, ICompound, IGlobalConfig, IStackFrame, AdapterEndEvent, getStateLabel } from 'vs/workbench/contrib/debug/common/debug';
import { isExtensionHostDebugging } from 'vs/workbench/contrib/debug/common/debugUtils';
import { isErrorWithActions, createErrorWithActions } from 'vs/base/common/errorsWithActions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_DATA_BREAKPOINTS_KEY = 'debug.databreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';

function once(match: (e: TaskEvent) => boolean, event: Event<TaskEvent>): Event<TaskEvent> {
	return (listener, thisArgs = null, disposables?) => {
		const result = event(e => {
			if (match(e)) {
				result.dispose();
				return listener.call(thisArgs, e);
			}
		}, null, disposables);
		return result;
	};
}

const enum TaskRunResult {
	Failure,
	Success
}

export class DebugService implements IDebugService {
	_serviceBrand: any;

	private readonly _onDidChangeState: Emitter<State>;
	private readonly _onDidNewSession: Emitter<IDebugSession>;
	private readonly _onWillNewSession: Emitter<IDebugSession>;
	private readonly _onDidEndSession: Emitter<IDebugSession>;
	private model: DebugModel;
	private viewModel: ViewModel;
	private configurationManager: ConfigurationManager;
	private toDispose: IDisposable[];
	private debugType: IContextKey<string>;
	private debugState: IContextKey<string>;
	private inDebugMode: IContextKey<boolean>;
	private breakpointsToSendOnResourceSaved: Set<string>;
	private initializing = false;
	private previousState: State | undefined;
	private initCancellationToken: CancellationTokenSource | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IMarkerService private readonly markerService: IMarkerService,
		@ITaskService private readonly taskService: ITaskService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionHostDebugService private readonly extensionHostDebugService: IExtensionHostDebugService
	) {
		this.toDispose = [];

		this.breakpointsToSendOnResourceSaved = new Set<string>();

		this._onDidChangeState = new Emitter<State>();
		this._onDidNewSession = new Emitter<IDebugSession>();
		this._onWillNewSession = new Emitter<IDebugSession>();
		this._onDidEndSession = new Emitter<IDebugSession>();

		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this);
		this.toDispose.push(this.configurationManager);

		this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
		this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeyService);
		this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);

		this.model = new DebugModel(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true), this.loadFunctionBreakpoints(),
			this.loadExceptionBreakpoints(), this.loadDataBreakpoints(), this.loadWatchExpressions(), this.textFileService);
		this.toDispose.push(this.model);

		this.viewModel = new ViewModel(contextKeyService);

		this.toDispose.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));
		this.lifecycleService.onShutdown(this.dispose, this);

		this.toDispose.push(this.extensionHostDebugService.onAttachSession(event => {
			const session = this.model.getSession(event.sessionId, true);
			if (session) {
				// EH was started in debug mode -> attach to it
				session.configuration.request = 'attach';
				session.configuration.port = event.port;
				session.setSubId(event.subId);
				this.launchOrAttachToSession(session).then(undefined, errors.onUnexpectedError);
			}
		}));
		this.toDispose.push(this.extensionHostDebugService.onTerminateSession(event => {
			const session = this.model.getSession(event.sessionId);
			if (session && session.subId === event.subId) {
				session.disconnect().then(undefined, errors.onUnexpectedError);
			}
		}));
		this.toDispose.push(this.extensionHostDebugService.onLogToSession(event => {
			const session = this.model.getSession(event.sessionId, true);
			if (session) {
				// extension logged output -> show it in REPL
				const sev = event.log.severity === 'warn' ? severity.Warning : event.log.severity === 'error' ? severity.Error : severity.Info;
				const { args, stack } = parse(event.log);
				const frame = !!stack ? getFirstFrame(stack) : undefined;
				session.logToRepl(sev, args, frame);
			}
		}));

		this.toDispose.push(this.viewModel.onDidFocusStackFrame(() => {
			this.onStateChange();
		}));
		this.toDispose.push(this.viewModel.onDidFocusSession(session => {
			const id = session ? session.getId() : undefined;
			this.model.setBreakpointsSessionId(id);
			this.onStateChange();
		}));
	}

	getModel(): IDebugModel {
		return this.model;
	}

	getViewModel(): IViewModel {
		return this.viewModel;
	}

	getConfigurationManager(): IConfigurationManager {
		return this.configurationManager;
	}

	sourceIsNotAvailable(uri: uri): void {
		this.model.sourceIsNotAvailable(uri);
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	//---- state management

	get state(): State {
		const focusedSession = this.viewModel.focusedSession;
		if (focusedSession) {
			return focusedSession.state;
		}

		return this.initializing ? State.Initializing : State.Inactive;
	}

	private startInitializingState() {
		if (!this.initializing) {
			this.initializing = true;
			this.onStateChange();
		}
	}

	private endInitializingState() {
		if (this.initCancellationToken) {
			this.initCancellationToken.cancel();
			this.initCancellationToken = undefined;
		}
		if (this.initializing) {
			this.initializing = false;
			this.onStateChange();
		}
	}

	private onStateChange(): void {
		const state = this.state;
		if (this.previousState !== state) {
			this.debugState.set(getStateLabel(state));
			this.inDebugMode.set(state !== State.Inactive);
			this.previousState = state;
			this._onDidChangeState.fire(state);
		}
	}

	get onDidChangeState(): Event<State> {
		return this._onDidChangeState.event;
	}

	get onDidNewSession(): Event<IDebugSession> {
		return this._onDidNewSession.event;
	}

	get onWillNewSession(): Event<IDebugSession> {
		return this._onWillNewSession.event;
	}

	get onDidEndSession(): Event<IDebugSession> {
		return this._onDidEndSession.event;
	}

	//---- life cycle management

	/**
	 * main entry point
	 * properly manages compounds, checks for errors and handles the initializing state.
	 */
	startDebugging(launch: ILaunch | undefined, configOrName?: IConfig | string, noDebug = false, parentSession?: IDebugSession): Promise<boolean> {

		this.startInitializingState();
		// make sure to save all files and that the configuration is up to date
		return this.extensionService.activateByEvent('onDebug').then(() => {
			return this.textFileService.saveAll().then(() => this.configurationService.reloadConfiguration(launch ? launch.workspace : undefined).then(() => {
				return this.extensionService.whenInstalledExtensionsRegistered().then(() => {

					let config: IConfig | undefined;
					let compound: ICompound | undefined;
					if (!configOrName) {
						configOrName = this.configurationManager.selectedConfiguration.name;
					}
					if (typeof configOrName === 'string' && launch) {
						config = launch.getConfiguration(configOrName);
						compound = launch.getCompound(configOrName);

						const sessions = this.model.getSessions();
						const alreadyRunningMessage = nls.localize('configurationAlreadyRunning', "There is already a debug configuration \"{0}\" running.", configOrName);
						if (sessions.some(s => s.configuration.name === configOrName && (!launch || !launch.workspace || !s.root || s.root.uri.toString() === launch.workspace.uri.toString()))) {
							return Promise.reject(new Error(alreadyRunningMessage));
						}
						if (compound && compound.configurations && sessions.some(p => compound!.configurations.indexOf(p.configuration.name) !== -1)) {
							return Promise.reject(new Error(alreadyRunningMessage));
						}
					} else if (typeof configOrName !== 'string') {
						config = configOrName;
					}

					if (compound) {
						// we are starting a compound debug, first do some error checking and than start each configuration in the compound
						if (!compound.configurations) {
							return Promise.reject(new Error(nls.localize({ key: 'compoundMustHaveConfigurations', comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
								"Compound must have \"configurations\" attribute set in order to start multiple configurations.")));
						}

						return Promise.all(compound.configurations.map(configData => {
							const name = typeof configData === 'string' ? configData : configData.name;
							if (name === compound!.name) {
								return Promise.resolve(false);
							}

							let launchForName: ILaunch | undefined;
							if (typeof configData === 'string') {
								const launchesContainingName = this.configurationManager.getLaunches().filter(l => !!l.getConfiguration(name));
								if (launchesContainingName.length === 1) {
									launchForName = launchesContainingName[0];
								} else if (launch && launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
									// If there are multiple launches containing the configuration give priority to the configuration in the current launch
									launchForName = launch;
								} else {
									return Promise.reject(new Error(launchesContainingName.length === 0 ? nls.localize('noConfigurationNameInWorkspace', "Could not find launch configuration '{0}' in the workspace.", name)
										: nls.localize('multipleConfigurationNamesInWorkspace', "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name)));
								}
							} else if (configData.folder) {
								const launchesMatchingConfigData = this.configurationManager.getLaunches().filter(l => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
								if (launchesMatchingConfigData.length === 1) {
									launchForName = launchesMatchingConfigData[0];
								} else {
									return Promise.reject(new Error(nls.localize('noFolderWithName', "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound!.name)));
								}
							}

							return this.createSession(launchForName, launchForName!.getConfiguration(name), noDebug, parentSession);
						})).then(values => values.every(success => !!success)); // Compound launch is a success only if each configuration launched successfully
					}

					if (configOrName && !config) {
						const message = !!launch ? nls.localize('configMissing', "Configuration '{0}' is missing in 'launch.json'.", typeof configOrName === 'string' ? configOrName : JSON.stringify(configOrName)) :
							nls.localize('launchJsonDoesNotExist', "'launch.json' does not exist.");
						return Promise.reject(new Error(message));
					}

					return this.createSession(launch, config, noDebug, parentSession);
				});
			}));
		}).then(success => {
			// make sure to get out of initializing state, and propagate the result
			this.endInitializingState();
			return success;
		}, err => {
			this.endInitializingState();
			return Promise.reject(err);
		});
	}

	/**
	 * gets the debugger for the type, resolves configurations by providers, substitutes variables and runs prelaunch tasks
	 */
	private createSession(launch: ILaunch | undefined, config: IConfig | undefined, noDebug: boolean, parentSession?: IDebugSession): Promise<boolean> {
		// We keep the debug type in a separate variable 'type' so that a no-folder config has no attributes.
		// Storing the type in the config would break extensions that assume that the no-folder case is indicated by an empty config.
		let type: string | undefined;
		if (config) {
			type = config.type;
		} else {
			// a no-folder workspace has no launch.config
			config = Object.create(null);
		}
		const unresolvedConfig = deepClone(config);

		if (noDebug) {
			config!.noDebug = true;
		}

		const debuggerThenable: Promise<void> = type ? Promise.resolve() : this.configurationManager.guessDebugger().then(dbgr => { type = dbgr && dbgr.type; });
		return debuggerThenable.then(() => {
			this.initCancellationToken = new CancellationTokenSource();
			return this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : undefined, type, config!, this.initCancellationToken.token).then(config => {
				// a falsy config indicates an aborted launch
				if (config && config.type) {
					return this.substituteVariables(launch, config).then(resolvedConfig => {

						if (!resolvedConfig) {
							// User canceled resolving of interactive variables, silently return
							return false;
						}

						if (!this.configurationManager.getDebugger(resolvedConfig.type) || (config.request !== 'attach' && config.request !== 'launch')) {
							let message: string;
							if (config.request !== 'attach' && config.request !== 'launch') {
								message = config.request ? nls.localize('debugRequestNotSupported', "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", 'request', config.request)
									: nls.localize('debugRequesMissing', "Attribute '{0}' is missing from the chosen debug configuration.", 'request');

							} else {
								message = resolvedConfig.type ? nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", resolvedConfig.type) :
									nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration.");
							}

							return this.showError(message).then(() => false);
						}

						const workspace = launch ? launch.workspace : undefined;
						return this.runTaskAndCheckErrors(workspace, resolvedConfig.preLaunchTask).then(result => {
							if (result === TaskRunResult.Success) {
								return this.doCreateSession(workspace, { resolved: resolvedConfig, unresolved: unresolvedConfig }, parentSession);
							}
							return false;
						});
					}, err => {
						if (err && err.message) {
							return this.showError(err.message).then(() => false);
						}
						if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
							return this.showError(nls.localize('noFolderWorkspaceDebugError', "The active file can not be debugged. Make sure it is saved and that you have a debug extension installed for that file type."))
								.then(() => false);
						}

						return launch && launch.openConfigFile(false, true, undefined, this.initCancellationToken ? this.initCancellationToken.token : undefined).then(() => false);
					});
				}

				if (launch && type && config === null) {	// show launch.json only for "config" being "null".
					return launch.openConfigFile(false, true, type, this.initCancellationToken ? this.initCancellationToken.token : undefined).then(() => false);
				}

				return false;
			});
		});
	}

	/**
	 * instantiates the new session, initializes the session, registers session listeners and reports telemetry
	 */
	private doCreateSession(root: IWorkspaceFolder | undefined, configuration: { resolved: IConfig, unresolved: IConfig | undefined }, parentSession?: IDebugSession): Promise<boolean> {

		const session = this.instantiationService.createInstance(DebugSession, configuration, root, this.model, parentSession);
		this.model.addSession(session);
		// register listeners as the very first thing!
		this.registerSessionListeners(session);

		// since the Session is now properly registered under its ID and hooked, we can announce it
		// this event doesn't go to extensions
		this._onWillNewSession.fire(session);

		const openDebug = this.configurationService.getValue<IDebugConfiguration>('debug').openDebug;
		// Open debug viewlet based on the visibility of the side bar and openDebug setting. Do not open for 'run without debug'
		if (!configuration.resolved.noDebug && (openDebug === 'openOnSessionStart' || (openDebug === 'openOnFirstSessionStart' && this.viewModel.firstSessionStart))) {
			this.viewletService.openViewlet(VIEWLET_ID).then(undefined, errors.onUnexpectedError);
		}

		return this.launchOrAttachToSession(session).then(() => {

			const internalConsoleOptions = session.configuration.internalConsoleOptions || this.configurationService.getValue<IDebugConfiguration>('debug').internalConsoleOptions;
			if (internalConsoleOptions === 'openOnSessionStart' || (this.viewModel.firstSessionStart && internalConsoleOptions === 'openOnFirstSessionStart')) {
				this.panelService.openPanel(REPL_ID, false);
			}

			this.viewModel.firstSessionStart = false;
			const showSubSessions = this.configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
			const sessions = this.model.getSessions();
			const shownSessions = showSubSessions ? sessions : sessions.filter(s => !s.parentSession);
			if (shownSessions.length > 1) {
				this.viewModel.setMultiSessionView(true);
			}

			// since the initialized response has arrived announce the new Session (including extensions)
			this._onDidNewSession.fire(session);

			return this.telemetryDebugSessionStart(root, session.configuration.type);
		}).then(() => true, (error: Error | string) => {

			if (errors.isPromiseCanceledError(error)) {
				// don't show 'canceled' error messages to the user #7906
				return Promise.resolve(false);
			}

			// Show the repl if some error got logged there #5870
			if (session && session.getReplElements().length > 0) {
				this.panelService.openPanel(REPL_ID, false);
			}

			if (session.configuration && session.configuration.request === 'attach' && session.configuration.__autoAttach) {
				// ignore attach timeouts in auto attach mode
				return Promise.resolve(false);
			}

			const errorMessage = error instanceof Error ? error.message : error;
			this.telemetryDebugMisconfiguration(session.configuration ? session.configuration.type : undefined, errorMessage);
			return this.showError(errorMessage, isErrorWithActions(error) ? error.actions : []).then(() => false);
		});
	}

	private launchOrAttachToSession(session: IDebugSession, focus = true): Promise<void> {
		const dbgr = this.configurationManager.getDebugger(session.configuration.type);
		return session.initialize(dbgr!).then(() => {
			return session.launchOrAttach(session.configuration).then(() => {
				if (focus) {
					this.focusStackFrame(undefined, undefined, session);
				}
			});
		}).then(undefined, err => {
			session.shutdown();
			return Promise.reject(err);
		});
	}

	private registerSessionListeners(session: IDebugSession): void {
		const sessionRunningScheduler = new RunOnceScheduler(() => {
			// Do not immediatly defocus the stack frame if the session is running
			if (session.state === State.Running && this.viewModel.focusedSession === session) {
				this.viewModel.setFocus(undefined, this.viewModel.focusedThread, session, false);
			}
		}, 200);
		this.toDispose.push(session.onDidChangeState(() => {
			if (session.state === State.Running && this.viewModel.focusedSession === session) {
				sessionRunningScheduler.schedule();
			}
			if (session === this.viewModel.focusedSession) {
				this.onStateChange();
			}
		}));

		this.toDispose.push(session.onDidEndAdapter(adapterExitEvent => {

			if (adapterExitEvent.error) {
				this.notificationService.error(nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly ({0})", adapterExitEvent.error.message || adapterExitEvent.error.toString()));
			}

			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			if (isExtensionHostDebugging(session.configuration) && session.state === State.Running && session.configuration.noDebug) {
				this.extensionHostDebugService.close(session.getId());
			}

			this.telemetryDebugSessionStop(session, adapterExitEvent);

			if (session.configuration.postDebugTask) {
				this.runTask(session.root, session.configuration.postDebugTask).then(undefined, err =>
					this.notificationService.error(err)
				);
			}
			session.shutdown();
			this.endInitializingState();
			this._onDidEndSession.fire(session);

			const focusedSession = this.viewModel.focusedSession;
			if (focusedSession && focusedSession.getId() === session.getId()) {
				this.focusStackFrame(undefined);
			}

			if (this.model.getSessions().length === 0) {
				this.viewModel.setMultiSessionView(false);

				if (this.layoutService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getValue<IDebugConfiguration>('debug').openExplorerOnEnd) {
					this.viewletService.openViewlet(EXPLORER_VIEWLET_ID);
				}
			}

		}));
	}

	restartSession(session: IDebugSession, restartData?: any): Promise<any> {
		return this.textFileService.saveAll().then(() => {
			const isAutoRestart = !!restartData;
			const runTasks: () => Promise<TaskRunResult> = () => {
				if (isAutoRestart) {
					// Do not run preLaunch and postDebug tasks for automatic restarts
					return Promise.resolve(TaskRunResult.Success);
				}

				return this.runTask(session.root, session.configuration.postDebugTask)
					.then(() => this.runTaskAndCheckErrors(session.root, session.configuration.preLaunchTask));
			};

			if (session.capabilities.supportsRestartRequest) {
				return runTasks().then(taskResult => taskResult === TaskRunResult.Success ? session.restart() : undefined);
			}

			if (isExtensionHostDebugging(session.configuration)) {
				return runTasks().then(taskResult => taskResult === TaskRunResult.Success ? this.extensionHostDebugService.reload(session.getId()) : undefined);
			}

			const shouldFocus = this.viewModel.focusedSession && session.getId() === this.viewModel.focusedSession.getId();
			// If the restart is automatic  -> disconnect, otherwise -> terminate #55064
			return (isAutoRestart ? session.disconnect(true) : session.terminate(true)).then(() => {

				return new Promise<void>((c, e) => {
					setTimeout(() => {
						runTasks().then(taskResult => {
							if (taskResult !== TaskRunResult.Success) {
								return;
							}

							// Read the configuration again if a launch.json has been changed, if not just use the inmemory configuration
							let needsToSubstitute = false;
							let unresolved: IConfig | undefined;
							const launch = session.root ? this.configurationManager.getLaunch(session.root.uri) : undefined;
							if (launch) {
								unresolved = launch.getConfiguration(session.configuration.name);
								if (unresolved && !equals(unresolved, session.unresolvedConfiguration)) {
									// Take the type from the session since the debug extension might overwrite it #21316
									unresolved.type = session.configuration.type;
									unresolved.noDebug = session.configuration.noDebug;
									needsToSubstitute = true;
								}
							}

							let substitutionThenable: Promise<IConfig | null | undefined> = Promise.resolve(session.configuration);
							if (launch && needsToSubstitute && unresolved) {
								this.initCancellationToken = new CancellationTokenSource();
								substitutionThenable = this.configurationManager.resolveConfigurationByProviders(launch.workspace ? launch.workspace.uri : undefined, unresolved.type, unresolved, this.initCancellationToken.token)
									.then(resolved => {
										if (resolved) {
											// start debugging
											return this.substituteVariables(launch, resolved);
										} else if (resolved === null) {
											// abort debugging silently and open launch.json
											return Promise.resolve(null);
										} else {
											// abort debugging silently
											return Promise.resolve(undefined);
										}
									});
							}
							substitutionThenable.then(resolved => {

								if (!resolved) {
									return c(undefined);
								}

								session.setConfiguration({ resolved, unresolved });
								session.configuration.__restart = restartData;

								this.launchOrAttachToSession(session, shouldFocus).then(() => {
									this._onDidNewSession.fire(session);
									c(undefined);
								}, err => e(err));
							});
						});
					}, 300);
				});
			});
		});
	}

	stopSession(session: IDebugSession): Promise<any> {

		if (session) {
			return session.terminate();
		}

		const sessions = this.model.getSessions();
		if (sessions.length === 0) {
			this.endInitializingState();
		}

		return Promise.all(sessions.map(s => s.terminate()));
	}

	private substituteVariables(launch: ILaunch | undefined, config: IConfig): Promise<IConfig | undefined> {
		const dbg = this.configurationManager.getDebugger(config.type);
		if (dbg) {
			let folder: IWorkspaceFolder | undefined = undefined;
			if (launch && launch.workspace) {
				folder = launch.workspace;
			} else {
				const folders = this.contextService.getWorkspace().folders;
				if (folders.length === 1) {
					folder = folders[0];
				}
			}
			return dbg.substituteVariables(folder, config).then(config => {
				return config;
			}, (err: Error) => {
				this.showError(err.message);
				return undefined;	// bail out
			});
		}
		return Promise.resolve(config);
	}

	private showError(message: string, errorActions: ReadonlyArray<IAction> = []): Promise<void> {
		const configureAction = this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL);
		const actions = [...errorActions, configureAction];
		return this.dialogService.show(severity.Error, message, actions.map(a => a.label).concat(nls.localize('cancel', "Cancel")), { cancelId: actions.length }).then(choice => {
			if (choice < actions.length) {
				return actions[choice].run();
			}

			return undefined;
		});
	}

	//---- task management

	private runTaskAndCheckErrors(root: IWorkspaceFolder | undefined, taskId: string | TaskIdentifier | undefined): Promise<TaskRunResult> {

		const debugAnywayAction = new Action('debug.debugAnyway', nls.localize('debugAnyway', "Debug Anyway"), undefined, true, () => Promise.resolve(TaskRunResult.Success));
		return this.runTask(root, taskId).then((taskSummary: ITaskSummary) => {
			const errorCount = taskId ? this.markerService.getStatistics().errors : 0;
			const successExitCode = taskSummary && taskSummary.exitCode === 0;
			const failureExitCode = taskSummary && taskSummary.exitCode !== undefined && taskSummary.exitCode !== 0;
			if (successExitCode || (errorCount === 0 && !failureExitCode)) {
				return <any>TaskRunResult.Success;
			}

			const taskLabel = typeof taskId === 'string' ? taskId : taskId ? taskId.name : '';
			const message = errorCount > 1
				? nls.localize('preLaunchTaskErrors', "Errors exist after running preLaunchTask '{0}'.", taskLabel)
				: errorCount === 1
					? nls.localize('preLaunchTaskError', "Error exists after running preLaunchTask '{0}'.", taskLabel)
					: nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", taskLabel, taskSummary.exitCode);

			const showErrorsAction = new Action('debug.showErrors', nls.localize('showErrors', "Show Errors"), undefined, true, () => {
				this.panelService.openPanel(Constants.MARKERS_PANEL_ID);
				return Promise.resolve(TaskRunResult.Failure);
			});

			return this.showError(message, [debugAnywayAction, showErrorsAction]);
		}, (err: TaskError) => {
			return this.showError(err.message, [debugAnywayAction, this.taskService.configureAction()]);
		});
	}

	private runTask(root: IWorkspaceFolder | undefined, taskId: string | TaskIdentifier | undefined): Promise<ITaskSummary | null> {
		if (!taskId) {
			return Promise.resolve(null);
		}
		if (!root) {
			return Promise.reject(new Error(nls.localize('invalidTaskReference', "Task '{0}' can not be referenced from a launch configuration that is in a different workspace folder.", typeof taskId === 'string' ? taskId : taskId.type)));
		}
		// run a task before starting a debug session
		return this.taskService.getTask(root, taskId).then(task => {
			if (!task) {
				const errorMessage = typeof taskId === 'string'
					? nls.localize('DebugTaskNotFoundWithTaskId', "Could not find the task '{0}'.", taskId)
					: nls.localize('DebugTaskNotFound', "Could not find the specified task.");
				return Promise.reject(createErrorWithActions(errorMessage));
			}

			// If a task is missing the problem matcher the promise will never complete, so we need to have a workaround #35340
			let taskStarted = false;
			const promise: Promise<ITaskSummary | null> = this.taskService.getActiveTasks().then(tasks => {
				if (tasks.filter(t => t._id === task._id).length) {
					// task is already running - nothing to do.
					return Promise.resolve(null);
				}
				once(e => ((e.kind === TaskEventKind.Active) || (e.kind === TaskEventKind.DependsOnStarted)) && e.taskId === task._id, this.taskService.onDidStateChange)(() => {
					// Task is active, so everything seems to be fine, no need to prompt after 10 seconds
					// Use case being a slow running task should not be prompted even though it takes more than 10 seconds
					taskStarted = true;
				});
				const taskPromise = this.taskService.run(task);
				if (task.configurationProperties.isBackground) {
					return new Promise((c, e) => once(e => e.kind === TaskEventKind.Inactive && e.taskId === task._id, this.taskService.onDidStateChange)(() => {
						taskStarted = true;
						c(null);
					}));
				}

				return taskPromise;
			});

			return new Promise((c, e) => {
				promise.then(result => {
					taskStarted = true;
					c(result);
				}, error => e(error));

				setTimeout(() => {
					if (!taskStarted) {
						const errorMessage = typeof taskId === 'string'
							? nls.localize('taskNotTrackedWithTaskId', "The specified task cannot be tracked.")
							: nls.localize('taskNotTracked', "The task '{0}' cannot be tracked.", JSON.stringify(taskId));
						e({ severity: severity.Error, message: errorMessage });
					}
				}, 10000);
			});
		});
	}

	//---- focus management

	focusStackFrame(stackFrame: IStackFrame | undefined, thread?: IThread, session?: IDebugSession, explicit?: boolean): void {
		if (!session) {
			if (stackFrame || thread) {
				session = stackFrame ? stackFrame.thread.session : thread!.session;
			} else {
				const sessions = this.model.getSessions();
				const stoppedSession = sessions.filter(s => s.state === State.Stopped).shift();
				session = stoppedSession || (sessions.length ? sessions[0] : undefined);
			}
		}

		if (!thread) {
			if (stackFrame) {
				thread = stackFrame.thread;
			} else {
				const threads = session ? session.getAllThreads() : undefined;
				const stoppedThread = threads && threads.filter(t => t.stopped).shift();
				thread = stoppedThread || (threads && threads.length ? threads[0] : undefined);
			}
		}

		if (!stackFrame) {
			if (thread) {
				const callStack = thread.getCallStack();
				stackFrame = first(callStack, sf => !!(sf && sf.source && sf.source.available && sf.source.presentationHint !== 'deemphasize'), undefined);
			}
		}

		if (stackFrame) {
			stackFrame.openInEditor(this.editorService, true).then(editor => {
				if (editor) {
					const control = editor.getControl();
					if (stackFrame && isCodeEditor(control) && control.hasModel()) {
						const model = control.getModel();
						if (stackFrame.range.startLineNumber <= model.getLineCount()) {
							const lineContent = control.getModel().getLineContent(stackFrame.range.startLineNumber);
							aria.alert(nls.localize('debuggingPaused', "Debugging paused {0}, {1} {2} {3}", thread && thread.stoppedDetails ? `, reason ${thread.stoppedDetails.reason}` : '', stackFrame.source ? stackFrame.source.name : '', stackFrame.range.startLineNumber, lineContent));
						}
					}
				}
			});
		}
		if (session) {
			this.debugType.set(session.configuration.type);
		} else {
			this.debugType.reset();
		}

		this.viewModel.setFocus(stackFrame, thread, session, !!explicit);
	}

	//---- watches

	addWatchExpression(name: string): void {
		const we = this.model.addWatchExpression(name);
		this.viewModel.setSelectedExpression(we);
		this.storeWatchExpressions();
	}

	renameWatchExpression(id: string, newName: string): void {
		this.model.renameWatchExpression(id, newName);
		this.storeWatchExpressions();
	}

	moveWatchExpression(id: string, position: number): void {
		this.model.moveWatchExpression(id, position);
		this.storeWatchExpressions();
	}

	removeWatchExpressions(id?: string): void {
		this.model.removeWatchExpressions(id);
		this.storeWatchExpressions();
	}

	//---- breakpoints

	async enableOrDisableBreakpoints(enable: boolean, breakpoint?: IEnablement): Promise<void> {
		if (breakpoint) {
			this.model.setEnablement(breakpoint, enable);
			if (breakpoint instanceof Breakpoint) {
				await this.sendBreakpoints(breakpoint.uri);
			} else if (breakpoint instanceof FunctionBreakpoint) {
				await this.sendFunctionBreakpoints();
			} else if (breakpoint instanceof DataBreakpoint) {
				await this.sendDataBreakpoints();
			} else {
				await this.sendExceptionBreakpoints();
			}
		} else {
			this.model.enableOrDisableAllBreakpoints(enable);
			await this.sendAllBreakpoints();
		}
		this.storeBreakpoints();
	}

	async addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[], context: string): Promise<IBreakpoint[]> {
		const breakpoints = this.model.addBreakpoints(uri, rawBreakpoints);
		breakpoints.forEach(bp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", bp.lineNumber, uri.fsPath)));
		breakpoints.forEach(bp => this.telemetryDebugAddBreakpoint(bp, context));

		await this.sendBreakpoints(uri);
		this.storeBreakpoints();
		return breakpoints;
	}

	async updateBreakpoints(uri: uri, data: Map<string, DebugProtocol.Breakpoint>, sendOnResourceSaved: boolean): Promise<void> {
		this.model.updateBreakpoints(data);
		if (sendOnResourceSaved) {
			this.breakpointsToSendOnResourceSaved.add(uri.toString());
		} else {
			await this.sendBreakpoints(uri);
		}
		this.storeBreakpoints();
	}

	async removeBreakpoints(id?: string): Promise<void> {
		const toRemove = this.model.getBreakpoints().filter(bp => !id || bp.getId() === id);
		toRemove.forEach(bp => aria.status(nls.localize('breakpointRemoved', "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
		const urisToClear = distinct(toRemove, bp => bp.uri.toString()).map(bp => bp.uri);

		this.model.removeBreakpoints(toRemove);

		await Promise.all(urisToClear.map(uri => this.sendBreakpoints(uri)));
		this.storeBreakpoints();
	}

	setBreakpointsActivated(activated: boolean): Promise<void> {
		this.model.setBreakpointsActivated(activated);
		if (activated) {
			this.storageService.store(DEBUG_BREAKPOINTS_ACTIVATED_KEY, 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE);
		}

		return this.sendAllBreakpoints();
	}

	addFunctionBreakpoint(name?: string, id?: string): void {
		const newFunctionBreakpoint = this.model.addFunctionBreakpoint(name || '', id);
		this.viewModel.setSelectedFunctionBreakpoint(newFunctionBreakpoint);
	}

	async renameFunctionBreakpoint(id: string, newFunctionName: string): Promise<void> {
		this.model.renameFunctionBreakpoint(id, newFunctionName);
		await this.sendFunctionBreakpoints();
		this.storeBreakpoints();
	}

	async removeFunctionBreakpoints(id?: string): Promise<void> {
		this.model.removeFunctionBreakpoints(id);
		await this.sendFunctionBreakpoints();
		this.storeBreakpoints();
	}

	async addDataBreakpoint(label: string, dataId: string, canPersist: boolean): Promise<void> {
		this.model.addDataBreakpoint(label, dataId, canPersist);
		await this.sendDataBreakpoints();

		this.storeBreakpoints();
	}

	async removeDataBreakpoints(id?: string): Promise<void> {
		this.model.removeDataBreakpoints(id);
		await this.sendDataBreakpoints();
		this.storeBreakpoints();
	}

	sendAllBreakpoints(session?: IDebugSession): Promise<any> {
		return Promise.all(distinct(this.model.getBreakpoints(), bp => bp.uri.toString()).map(bp => this.sendBreakpoints(bp.uri, false, session)))
			.then(() => this.sendFunctionBreakpoints(session))
			// send exception breakpoints at the end since some debug adapters rely on the order
			.then(() => this.sendExceptionBreakpoints(session));
	}

	private sendBreakpoints(modelUri: uri, sourceModified = false, session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getBreakpoints({ uri: modelUri, enabledOnly: true });

		return this.sendToOneOrAllSessions(session, s =>
			s.sendBreakpoints(modelUri, breakpointsToSend, sourceModified)
		);
	}

	private sendFunctionBreakpoints(session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());

		return this.sendToOneOrAllSessions(session, s => {
			return s.capabilities.supportsFunctionBreakpoints ? s.sendFunctionBreakpoints(breakpointsToSend) : Promise.resolve(undefined);
		});
	}

	private sendDataBreakpoints(session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getDataBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());

		return this.sendToOneOrAllSessions(session, s => {
			return s.capabilities.supportsDataBreakpoints ? s.sendDataBreakpoints(breakpointsToSend) : Promise.resolve(undefined);
		});
	}

	private sendExceptionBreakpoints(session?: IDebugSession): Promise<void> {
		const enabledExceptionBps = this.model.getExceptionBreakpoints().filter(exb => exb.enabled);

		return this.sendToOneOrAllSessions(session, s => {
			return s.sendExceptionBreakpoints(enabledExceptionBps);
		});
	}

	private sendToOneOrAllSessions(session: IDebugSession | undefined, send: (session: IDebugSession) => Promise<void>): Promise<void> {
		if (session) {
			return send(session);
		}
		return Promise.all(this.model.getSessions().map(s => send(s))).then(() => undefined);
	}

	private onFileChanges(fileChangesEvent: FileChangesEvent): void {
		const toRemove = this.model.getBreakpoints().filter(bp =>
			fileChangesEvent.contains(bp.uri, FileChangeType.DELETED));
		if (toRemove.length) {
			this.model.removeBreakpoints(toRemove);
		}

		fileChangesEvent.getUpdated().forEach(event => {

			if (this.breakpointsToSendOnResourceSaved.delete(event.resource.toString())) {
				this.sendBreakpoints(event.resource, true);
			}
		});
	}

	private loadBreakpoints(): Breakpoint[] {
		let result: Breakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: any) => {
				return new Breakpoint(uri.parse(breakpoint.uri.external || breakpoint.source.uri.external), breakpoint.lineNumber, breakpoint.column, breakpoint.enabled, breakpoint.condition, breakpoint.hitCondition, breakpoint.logMessage, breakpoint.adapterData, this.textFileService);
			});
		} catch (e) { }

		return result || [];
	}

	private loadFunctionBreakpoints(): FunctionBreakpoint[] {
		let result: FunctionBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((fb: any) => {
				return new FunctionBreakpoint(fb.name, fb.enabled, fb.hitCondition, fb.condition, fb.logMessage);
			});
		} catch (e) { }

		return result || [];
	}

	private loadExceptionBreakpoints(): ExceptionBreakpoint[] {
		let result: ExceptionBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: any) => {
				return new ExceptionBreakpoint(exBreakpoint.filter, exBreakpoint.label, exBreakpoint.enabled);
			});
		} catch (e) { }

		return result || [];
	}

	private loadDataBreakpoints(): DataBreakpoint[] {
		let result: DataBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_DATA_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((dbp: any) => {
				return new DataBreakpoint(dbp.label, dbp.dataId, true, dbp.enabled, dbp.hitCondition, dbp.condition, dbp.logMessage);
			});
		} catch (e) { }

		return result || [];
	}

	private loadWatchExpressions(): Expression[] {
		let result: Expression[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE, '[]')).map((watchStoredData: { name: string, id: string }) => {
				return new Expression(watchStoredData.name, watchStoredData.id);
			});
		} catch (e) { }

		return result || [];
	}

	private storeWatchExpressions(): void {
		const watchExpressions = this.model.getWatchExpressions();
		if (watchExpressions.length) {
			this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(watchExpressions.map(we => ({ name: we.name, id: we.getId() }))), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE);
		}
	}

	private storeBreakpoints(): void {
		const breakpoints = this.model.getBreakpoints();
		if (breakpoints.length) {
			this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(breakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const functionBreakpoints = this.model.getFunctionBreakpoints();
		if (functionBreakpoints.length) {
			this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(functionBreakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const dataBreakpoints = this.model.getDataBreakpoints().filter(dbp => dbp.canPersist);
		if (dataBreakpoints.length) {
			this.storageService.store(DEBUG_DATA_BREAKPOINTS_KEY, JSON.stringify(dataBreakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_DATA_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const exceptionBreakpoints = this.model.getExceptionBreakpoints();
		if (exceptionBreakpoints.length) {
			this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(exceptionBreakpoints), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}
	}

	//---- telemetry

	private telemetryDebugSessionStart(root: IWorkspaceFolder | undefined, type: string): Promise<void> {
		const dbgr = this.configurationManager.getDebugger(type);
		if (!dbgr) {
			return Promise.resolve();
		}

		const extension = dbgr.getMainExtensionDescriptor();
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
			type: type,
			breakpointCount: this.model.getBreakpoints().length,
			exceptionBreakpoints: this.model.getExceptionBreakpoints(),
			watchExpressionsCount: this.model.getWatchExpressions().length,
			extensionName: extension.identifier.value,
			isBuiltin: extension.isBuiltin,
			launchJsonExists: root && !!this.configurationService.getValue<IGlobalConfig>('launch', { resource: root.uri })
		});
	}

	private telemetryDebugSessionStop(session: IDebugSession, adapterExitEvent: AdapterEndEvent): Promise<any> {

		const breakpoints = this.model.getBreakpoints();

		/* __GDPR__
			"debugSessionStop" : {
				"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"sessionLengthInSeconds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		return this.telemetryService.publicLog('debugSessionStop', {
			type: session && session.configuration.type,
			success: adapterExitEvent.emittedStopped || breakpoints.length === 0,
			sessionLengthInSeconds: adapterExitEvent.sessionLengthInSeconds,
			breakpointCount: breakpoints.length,
			watchExpressionsCount: this.model.getWatchExpressions().length
		});
	}

	private telemetryDebugMisconfiguration(debugType: string | undefined, message: string): Promise<any> {
		/* __GDPR__
			"debugMisconfiguration" : {
				"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"error": { "classification": "CallstackOrException", "purpose": "FeatureInsight" }
			}
		*/
		return this.telemetryService.publicLog('debugMisconfiguration', {
			type: debugType,
			error: message
		});
	}

	private telemetryDebugAddBreakpoint(breakpoint: IBreakpoint, context: string): Promise<any> {
		/* __GDPR__
			"debugAddBreakpoint" : {
				"context": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"hasCondition": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"hasHitCondition": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"hasLogMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/

		return this.telemetryService.publicLog('debugAddBreakpoint', {
			context: context,
			hasCondition: !!breakpoint.condition,
			hasHitCondition: !!breakpoint.hitCondition,
			hasLogMessage: !!breakpoint.logMessage
		});
	}
}
