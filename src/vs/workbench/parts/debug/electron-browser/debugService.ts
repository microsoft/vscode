/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path = require('path');
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import mime = require('vs/base/common/mime');
import paths = require('vs/base/common/paths');
import ee = require('vs/base/common/eventEmitter');
import uri from 'vs/base/common/uri';
import arrays = require('vs/base/common/arrays');
import actions = require('vs/base/common/actions');
import json = require('vs/base/common/json');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import platformplatform = require('vs/platform/platform');
import editor = require('vs/editor/common/editorCommon');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import jsonContributionRegistry = require('vs/languages/json/common/jsonContributionRegistry');
import wbeditorcommon = require('vs/workbench/common/editor');
import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';
import debug = require('vs/workbench/parts/debug/common/debug');
import session = require('vs/workbench/parts/debug/node/rawDebugSession');
import model = require('vs/workbench/parts/debug/common/debugModel');
import debuginputs = require('vs/workbench/parts/debug/browser/debugEditorInputs');
import viewmodel = require('vs/workbench/parts/debug/common/debugViewModel');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { Repl } from 'vs/workbench/parts/debug/browser/replEditor';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { Position } from 'vs/platform/editor/common/editor';
import { ITaskService , TaskEvent, TaskType, TaskServiceEvents} from 'vs/workbench/parts/tasks/common/taskService';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITextFileService } from 'vs/workbench/parts/files/common/files';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService, FileChangesEvent, FileChangeType, EventType } from 'vs/platform/files/common/files';
import { IEventService } from 'vs/platform/event/common/event';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPluginService, IPluginDescription } from 'vs/platform/plugins/common/plugins';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybindingService';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';
import { IWindowService, IBroadcast } from 'vs/workbench/services/window/electron-browser/windowService';
import { ILogEntry, PLUGIN_LOG_BROADCAST_CHANNEL } from 'vs/workbench/services/thread/electron-browser/threadService';

var DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
var DEBUG_BREAKPOINTS_ACTIVATED_KEY = 'debug.breakpointactivated';
var DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
var DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';
var DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';

var jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>platformplatform.Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(debug.schemaId, debug.schema);
jsonRegistry.addSchemaFileAssociation('/.vscode/launch.json', debug.schemaId);

export class DebugService extends ee.EventEmitter implements debug.IDebugService {
	public serviceId = debug.IDebugService;

	private taskService: ITaskService;
	private state: debug.State;
	private session: session.RawDebugSession;
	private model: model.Model;
	private viewModel: viewmodel.ViewModel;
	private toDispose: lifecycle.IDisposable[];
	private debugStringEditorInputs: debuginputs.DebugStringEditorInput[];
	private systemVariables: SystemVariables;
	private adapters: Adapter[];
	private allModeIdsForBreakpoints: { [key: string]: boolean };
	private lastTaskEvent: TaskEvent;
	private configuration: debug.IConfig;

	private inDebugMode: IKeybindingContextKey<boolean>;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService:ITextFileService,
		@IViewletService private viewletService:IViewletService,
		@IFileService private fileService: IFileService,
		@IMessageService private messageService: IMessageService,
		@IPartService private partService: IPartService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowService private windowService: IWindowService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IEventService private eventService: IEventService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService:IInstantiationService,
		@IPluginService private pluginService: IPluginService,
		@IOutputService private outputService: IOutputService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super();

		this.toDispose = [];
		this.debugStringEditorInputs = [];
		this.adapters = [];
		this.allModeIdsForBreakpoints = {};
		this.session = null;
		this.state = debug.State.Inactive;
		// There is a cycle if taskService gets injected, use a workaround.
		this.taskService = this.instantiationService.getInstance(ITaskService);

		if (this.contextService.getWorkspace()) {
			this.systemVariables = new SystemVariables(this.editorService, this.contextService);
		} else {
			this.state = debug.State.Disabled;
		}
		this.inDebugMode = keybindingService.createKey(debug.CONTEXT_IN_DEBUG_MODE, false);

		this.model = new model.Model(this.loadBreakpoints(), this.storageService.getBoolean(DEBUG_BREAKPOINTS_ACTIVATED_KEY, StorageScope.WORKSPACE, true),
			this.loadExceptionBreakpoints(), this.loadWatchExpressions());
		this.viewModel = new viewmodel.ViewModel();
		this.setConfiguration(this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE, 'null'));
		this.registerListeners(eventService, lifecycleService);
	}

	private registerListeners(eventService: IEventService, lifecycleService: ILifecycleService): void {
		this.toDispose.push(eventService.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));
		debug.debuggersExtPoint.setHandler((extensions) => {

			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					const adapter = new Adapter(rawAdapter, this.systemVariables, extension.description.extensionFolderPath);
					const duplicate = this.adapters.filter(a => a.type === adapter.type)[0];
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						extension.collector.error(nls.localize('debugNoType', "Debug adapter 'type' can not be omitted and must be of type 'string'."));
					}

					if (duplicate) {
						Object.keys(adapter).forEach(attribute => {
							if (adapter[attribute]) {
								if (attribute === 'enableBreakpointsFor') {
									Object.keys(adapter.enableBreakpointsFor).forEach(languageId => duplicate.enableBreakpointsFor[languageId] = true);
								} else if (duplicate[attribute] && attribute !== 'type') {
									extension.collector.warn(nls.localize('duplicateDebuggerType', "Debug type '{0}' is already registered and has attribute '{1}', ignoring attribute '{1}'.", adapter.type, attribute));
								} else {
									duplicate[attribute] = adapter[attribute];
								}
							}
						});
					} else {
						this.adapters.push(adapter);
					}

					adapter.enableBreakpointsFor.languageIds.forEach(modeId => {
						this.allModeIdsForBreakpoints[modeId] = true;
					});
				});
			});

			// Update the schema to include all attributes and types from extensions.
			// debug.schema.properties['configurations'].items.properties.type.enum = this.adapters.map(adapter => adapter.type);
			this.adapters.forEach(adapter => {
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes) {
					debug.schema.properties['configurations'].items.oneOf.push(...schemaAttributes);
				}
			});
		});

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

		lifecycleService.onShutdown.add(this.store, this);
		lifecycleService.onShutdown.add(this.dispose, this);

		this.windowService.onBroadcast.add(this.onBroadcast, this);
	}

	private onBroadcast(broadcast: IBroadcast): void {
		let session = this.getActiveSession();
		if (!session || session.getType() !== 'extensionHost') {
			return; // we are only intersted if we have an active debug session for extensionHost
		}

		// A plugin logged output, show it inside the REPL
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

			// Add output for each argument logged
			let simpleVals: any[] = [];
			for (let i = 0; i < args.length; i++) {
				let a = args[i];

				// Undefined gets printed as 'undefined'
				if (typeof a === 'undefined') {
					simpleVals.push('undefined');
				}

				// Null gets printed as 'null'
				else if (a === null) {
					simpleVals.push('null');
				}

				// Objects & Arrays are special because we want to inspect them in the REPL
				else if (types.isObject(a) || Array.isArray(a)) {

					// Flush any existing simple values logged
					if (simpleVals.length) {
						this.logToRepl(simpleVals.join(' '), sev);
						simpleVals = [];
					}

					// Show object
					this.logToRepl(a, sev);
				}

				// String: watch out for % replacement directive
				// String substitution and formatting @ https://developer.chrome.com/devtools/docs/console
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

			// Flush simple values
			if (simpleVals.length) {
				this.logToRepl(simpleVals.join(' '), sev);
			}

			// Show repl
			this.revealRepl(true /* in background */).done(null, errors.onUnexpectedError);
		}
	}

	private registerSessionListeners(): void {
		this.toDispose.push(this.session.addListener2(debug.SessionEvents.INITIALIZED, (event: DebugProtocol.InitializedEvent) => {
			this.sendAllBreakpoints().done(null, errors.onUnexpectedError);
			this.sendExceptionBreakpoints().done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(this.session.addListener2(debug.SessionEvents.STOPPED, (event: DebugProtocol.StoppedEvent) => {
			this.setStateAndEmit(debug.State.Stopped, event.body.reason);
			var threadId = event.body.threadId;

			this.getThreadData(threadId).then(() => {
				this.session.stackTrace({ threadId: threadId, levels: 20 }).done((result) => {

					this.model.rawUpdate({ threadId: threadId, callStack: result.body.stackFrames, exception: event.body && event.body.reason === 'exception' });
					this.windowService.getWindow().focus();
					var callStack = this.model.getThreads()[threadId].callStack;
					if (callStack.length > 0) {
						this.setFocusedStackFrameAndEvaluate(callStack[0]);
						this.openOrRevealEditor(callStack[0].source, callStack[0].lineNumber, false, false).done(null, errors.onUnexpectedError);
					} else {
						this.setFocusedStackFrameAndEvaluate(null);
					}
				});
			}, errors.onUnexpectedError);
		}));

		this.toDispose.push(this.session.addListener2(debug.SessionEvents.CONTINUED, () => {
			this.model.clearThreads(false);
			this.setFocusedStackFrameAndEvaluate(null);
			this.setStateAndEmit(debug.State.Running);
		}));

		this.toDispose.push(this.session.addListener2(debug.SessionEvents.THREAD, (event: DebugProtocol.ThreadEvent) => {
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

		this.toDispose.push(this.session.addListener2(debug.SessionEvents.DEBUGEE_TERMINATED, (event: DebugProtocol.TerminatedEvent) => {
			// if there is some opaque data in the body of the terminate event, just pass it to the next launch request
			let extensionHostData = event.body ? event.body.extensionHost : undefined;

			if (extensionHostData) {
				this.restartSession(extensionHostData).done(null, errors.onUnexpectedError);
			} else if (this.session) {
				this.session.disconnect().done(null, errors.onUnexpectedError);
			}
		}));


		this.toDispose.push(this.session.addListener2(debug.SessionEvents.OUTPUT, (event: DebugProtocol.OutputEvent) => {
			if (event.body && typeof event.body.output === 'string' && event.body.output.length > 0) {
				this.onOutput(event);
			}
		}));

		this.toDispose.push(this.session.addListener2(debug.SessionEvents.SERVER_EXIT, e => {
			this.onSessionEnd();
		}));
	}

	private onOutput(event: DebugProtocol.OutputEvent): void {
		const outputSeverity = event.body.category === 'stderr' ? severity.Error : severity.Info;
		this.appendReplOutput(event.body.output, outputSeverity);
		this.revealRepl(true /* in background */).done(null, errors.onUnexpectedError);
	}

	private getThreadData(threadId: number): Promise {
		return this.model.getThreads()[threadId] ? Promise.as(true) :
			this.session.threads().then((response: DebugProtocol.ThreadsResponse) => {
				const thread = response.body.threads.filter(t => t.id === threadId).pop();
				if (!thread) {
					throw new Error('Did not get a thread from debug adapter with id ' + threadId);
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
				return new model.Breakpoint(new Source(breakpoint.source.name, breakpoint.source.uri, breakpoint.source.reference), breakpoint.desiredLineNumber || breakpoint.lineNumber, breakpoint.enabled);
			});
		} catch (e) {
			return [];
		}
	}

	private loadExceptionBreakpoints(): debug.IExceptionBreakpoint[] {
		var result: debug.IExceptionBreakpoint[] = null;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: any) => {
				return new model.ExceptionBreakpoint(exBreakpoint.name, exBreakpoint.enabled);
			});
		} catch (e) {
			result = [];
		}

		return result.length > 0 ? result : [new model.ExceptionBreakpoint('all', false), new model.ExceptionBreakpoint('uncaught', true)];
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

	public canSetBreakpointsIn(model: editor.IModel, lineNumber: number): boolean {
		if (model.getLineLastNonWhitespaceColumn(lineNumber) === 0) {
			return false;
		}
		if (model.getAssociatedResource().isInMemory()) {
			return false;
		}

		var mode = model ? model.getMode() : null;
		var modeId = mode ? mode.getId() : null;

		return !!this.allModeIdsForBreakpoints[modeId];
	}

	public getState(): debug.State {
		return this.state;
	}

	private setStateAndEmit(newState: debug.State, data?: any): void {
		this.state = newState;
		this.emit(debug.ServiceEvents.STATE_CHANGED, data);
	}

	public openConfigFile(sideBySide: boolean): TPromise<boolean> {
		const resource = uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '/.vscode/launch.json'));

		return this.fileService.resolveContent(resource).then(content => true, err =>
			this.getInitialConfigFileContent().then(content => {
				if (!content) {
					return false;
				}

				return this.fileService.updateContent(resource, content).then(() => true);
			}
		)).then(configFileCreated => {
			if (!configFileCreated) {
				return false;
			}
			this.telemetryService.publicLog('debugConfigure');

			return this.editorService.openEditor({
				resource: resource,
				options: {
					forceOpen: true
				}
			}, sideBySide).then(() => true);
		}, (error) => {
			throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error));
		});
	}

	public get enabled(): boolean {
		return !!this.contextService.getWorkspace();
	}

	public getConfiguration(): debug.IConfig {
		return this.configuration;
	}

	public setConfiguration(name: string, extensionHostData: any = null): Promise {
		return this.loadLaunchConfig().then(config => {
			if (!config || !config.configurations) {
				this.configuration = null;
				return;
			}

			// If the configuration name is not set yet, take the first launch config (can happen if debug viewlet has not been opened yet).
			const filtered = name ? config.configurations.filter(cfg => cfg.name === name) : [config.configurations[0]];

			// Massage configuration attributes - append workspace path to relatvie paths, substitute variables in paths.
			this.configuration = filtered.length === 1 ? filtered[0] : null;
			if (this.configuration && this.systemVariables) {
				this.configuration.debugServer = config.debugServer;
				this.configuration.outDir = this.resolvePath(this.systemVariables.resolve(this.configuration.outDir));
				this.configuration.address = this.configuration.address || 'localhost';
				this.configuration.program = this.resolvePath(this.systemVariables.resolve(this.configuration.program));
				this.configuration.stopOnEntry = this.configuration.stopOnEntry === undefined ? false : this.configuration.stopOnEntry;
				this.configuration.args = this.configuration.args && this.configuration.args.length > 0 ? this.systemVariables.resolve(this.configuration.args) : null;
				this.configuration.env = <{ [key: string]: string; }> this.systemVariables.resolve(this.configuration.env);
				this.configuration.cwd = this.resolvePath(this.systemVariables.resolve(this.configuration.cwd) || '.', false);
				this.configuration.runtimeExecutable = this.resolvePath(this.systemVariables.resolve(this.configuration.runtimeExecutable));
				this.configuration.runtimeArgs = this.configuration.runtimeArgs && this.configuration.runtimeArgs.length > 0 ? this.systemVariables.resolve(this.configuration.runtimeArgs) : null;
				this.configuration.outDir = this.resolvePath(this.configuration.outDir);
				// send opaque data back as part of the (undocumented) arguments of the launch request.
				this.configuration.extensionHostData = extensionHostData;
			}
		});
	}

	private getInitialConfigFileContent(): TPromise<string> {
		return this.quickOpenService.pick(this.adapters, { placeHolder: nls.localize('selectDebug', "Select Debug Environment") })
		.then(adapter => {
			if (!adapter) {
				return null;
			}

			return this.massageInitialConfigurations(adapter).then(() =>
				JSON.stringify({
					version: '0.2.0',
					configurations: adapter.initialConfigurations ? adapter.initialConfigurations : []
				}, null, '\t')
			)
		});
	}

	private massageInitialConfigurations(adapter: Adapter): Promise {
		if (!adapter || !adapter.initialConfigurations || adapter.type !== 'node') {
			return Promise.as(true);
		}

		// Check package.json for 'main' or 'scripts' so we generate a more pecise 'program' attribute in launch.json.
		const packageJsonUri = uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '/package.json'));
		return this.fileService.resolveContent(packageJsonUri).then(jsonContent => {
			try {
				const jsonObject = JSON.parse(jsonContent.value);
				if (jsonObject.main) {
					return jsonObject.main;
				} else if (jsonObject.scripts && typeof jsonObject.scripts.start === 'string') {
					return (<string>jsonObject.scripts.start).split(' ').pop();
				}

			} catch (error) { }

			return null;
		}, err => null).then(program => {
			adapter.initialConfigurations.forEach(config => {
				if (program && config["program"]) {
					config["program"] = program;
				}
			});
		});
	}

	public loadLaunchConfig(): TPromise<debug.IGlobalConfig> {
		return this.configurationService.loadConfiguration('launch');
	}

	public setFocusedStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame): void {
		this.viewModel.setFocusedStackFrame(focusedStackFrame);
		if (focusedStackFrame) {
			this.model.evaluateWatchExpressions(this.session, focusedStackFrame);
		} else {
			this.model.clearWatchExpressionValues();
		}
	}

	public setBreakpointsForModel(modelUri: uri, data: { lineNumber: number; enabled: boolean; }[]): Promise {
		this.model.setBreakpointsForModel(modelUri, data);
		return this.sendBreakpoints(modelUri);
	}

	public toggleBreakpoint(modelUri: uri, lineNumber: number): Promise {
		this.model.toggleBreakpoint(modelUri, lineNumber);
		return this.sendBreakpoints(modelUri);
	}

	public enableOrDisableAllBreakpoints(enabled: boolean): Promise {
		this.model.enableOrDisableAllBreakpoints(enabled);
		return this.sendAllBreakpoints();
	}

	public toggleEnablement(element: debug.IEnablement): Promise {
		this.model.toggleEnablement(element);
		if (element instanceof model.Breakpoint) {
			var breakpoint = <model.Breakpoint> element;
			return this.sendBreakpoints(breakpoint.source.uri);
		}

		return this.sendExceptionBreakpoints();
	}

	public clearBreakpoints(modelUri: uri = null): Promise {
		var urisToClear = modelUri ? [modelUri] : arrays.distinct(this.model.getBreakpoints(), bp => bp.source.uri.toString()).map(bp => bp.source.uri);
		this.model.clearBreakpoints(modelUri);

		return Promise.join(urisToClear.map(uri => this.sendBreakpoints(uri)));
	}

	public toggleBreakpointsActivated(): Promise {
		this.model.toggleBreakpointsActivated();
		return this.sendAllBreakpoints();
	}

	public addReplExpression(name: string): Promise {
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

	public addWatchExpression(name: string): Promise {
		return this.model.addWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), name);
	}

	public renameWatchExpression(id: string, newName: string): Promise {
		return this.model.renameWatchExpression(this.session, this.viewModel.getFocusedStackFrame(), id, newName);
	}

	public clearWatchExpressions(id?: string): void {
		this.model.clearWatchExpressions(id);
	}

	public createSession(extensionHostData?: any, openViewlet = true): Promise {
		this.textFileService.saveAll().done(null, errors.onUnexpectedError);
		if (!extensionHostData) {
			this.clearReplExpressions();
		}

		return this.pluginService.onReady().then(() => this.setConfiguration(this.configuration ? this.configuration.name : null, extensionHostData)).then(() => {
			if (!this.configuration) {
				return this.openConfigFile(false).then(openend => {
					if (openend) {
						this.messageService.show(severity.Info, nls.localize('NewLaunchConfig', "Please set up the launch configuration file to debug your application."));
					}
				});
			}

			var adapter = this.adapters.filter(adapter => adapter.type === this.configuration.type).pop();
			if (!adapter) {
				return Promise.wrapError(new Error(`Configured debug type '${ this.configuration.type }' is not supported.`));
			}

			return this.runPreLaunchTask(this.configuration).then(() => {
				this.session = new session.RawDebugSession(this.messageService, this.telemetryService, this.configuration.debugServer, adapter);
				this.registerSessionListeners();

				return this.session.initialize({
					adapterID: this.configuration.type,
					linesStartAt1: true,
					pathFormat: 'path'
				}).then((result: DebugProtocol.InitializeResponse) => {
					this.setStateAndEmit(debug.State.Initializing);
					return this.configuration.request === 'attach' ? this.session.attach(this.configuration) : this.session.launch(this.configuration);
				}).then((result: DebugProtocol.Response) => {
					if (openViewlet) {
						this.viewletService.openViewlet(debug.VIEWLET_ID);
					}
					this.partService.addClass('debugging');
					this.contextService.updateOptions('editor', {
						glyphMargin: true
					});
					this.inDebugMode.set(true);

					this.telemetryService.publicLog('debugSessionStart', { type: this.configuration.type, breakpointCount: this.model.getBreakpoints().length, exceptionBreakpoints: this.model.getExceptionBreakpoints() });
				}).then(undefined, (error: Error) => {
					this.telemetryService.publicLog('debugMisconfiguration', { type: this.configuration ? this.configuration.type : undefined });
					if (this.session) {
						this.session.disconnect();
					}

					return Promise.wrapError(errors.create(error.message, { actions: [CloseAction, this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL)] }));
				});
			});
		});
	}

	private runPreLaunchTask(config: debug.IConfig): Promise {
		// Only run the task if we are not reattaching (extensionHostData is defined).
		if (!config.preLaunchTask || config.extensionHostData) {
			return Promise.as(true);
		}

		// Run a build task before starting a debug session
		return this.taskService.tasks().then(descriptions => {
			let filteredTasks = descriptions.filter(task => task.name === config.preLaunchTask);
			if (filteredTasks.length !== 1) {
				this.messageService.show(severity.Warning, nls.localize('DebugTaskNotFound', "Could not find a unique task \'{0}\'. Make sure the task exists and that it has a unique name.", config.preLaunchTask));
				return Promise.as(true);
			}

			// Task is already running - nothing to do.
			if (this.lastTaskEvent && this.lastTaskEvent.taskName === config.preLaunchTask) {
				return Promise.as(true);
			}

			if (this.lastTaskEvent) {
				// There is a different task running currently.
				return Promise.wrapError(errors.create(nls.localize('differentTaskRunning', "There is a task {0} running. Can not run pre launch task {1}.", this.lastTaskEvent.taskName, config.preLaunchTask)));
			}

			// No task running, execute the preLaunchTask.
			this.outputService.showOutput('Tasks', true, true);

			const taskPromise = this.taskService.run(filteredTasks[0].id).then(result => {
				this.lastTaskEvent = null;
			}, err => {
				this.lastTaskEvent = null;
			});

			return filteredTasks[0].isWatching ? Promise.as(true) : taskPromise;
		});
	}

	public restartSession(extensionHostData?: any): Promise {
		return this.session ? this.session.disconnect(true).then(() => {
			new Promise(c => {
				setTimeout(() => {
					this.createSession(extensionHostData, false).then(() => c(true));
				}, 300);
			});
		}) : this.createSession(extensionHostData, false);
	}

	public getActiveSession(): debug.IRawDebugSession {
		return this.session;
	}

	private onSessionEnd(): void {
		try {
			this.debugStringEditorInputs = lifecycle.disposeAll(this.debugStringEditorInputs);
		} catch (e) {
			// An internal module might be open so the dispose can throw -> ignore and continue with stop session.
		}

		if (this.session) {
			var bpsExist = this.model.getBreakpoints().length > 0;
			this.telemetryService.publicLog('debugSessionStop', { type: this.session.getType(), success: this.session.emittedStopped || !bpsExist, sessionLengthInSeconds: this.session.getLengthInSeconds(), breakpointCount: this.model.getBreakpoints().length });
		}
		this.session = null;
		this.partService.removeClass('debugging');
		this.contextService.updateOptions('editor', {
			hover: true
		});
		this.editorService.focusEditor();

		this.model.clearThreads(true);
		this.setFocusedStackFrameAndEvaluate(null);
		this.setStateAndEmit(debug.State.Inactive);
		this.inDebugMode.reset();
	}

	public getModel(): debug.IModel {
		return this.model;
	}

	public getViewModel(): debug.IViewModel {
		return this.viewModel;
	}

	public openOrRevealEditor(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): Promise {
		const visibleEditors = this.editorService.getVisibleEditors();
		for (var i = 0; i < visibleEditors.length; i++) {
			const fileInput = wbeditorcommon.asFileEditorInput(visibleEditors[i].input);
			if (fileInput && fileInput.getResource().toString() === source.uri.toString()) {
				const control = <editorbrowser.ICodeEditor>visibleEditors[i].getControl();
				if (control) {
					control.revealLineInCenterIfOutsideViewport(lineNumber);
					control.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
					return this.editorService.openEditor(visibleEditors[i].input, wbeditorcommon.TextEditorOptions.create({ preserveFocus: preserveFocus, forceActive: true }), visibleEditors[i].position);
				}

				return Promise.as(null);
			}
		}

		if (source.inMemory) {
			// Internal module
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

	private sourceIsUnavailable(source: Source, sideBySide: boolean): Promise {
		this.model.sourceIsUnavailable(source);
		const editorInput = this.getDebugStringEditorInput(source, 'Source is not available.', 'text/plain');

		return this.editorService.openEditor(editorInput, wbeditorcommon.TextEditorOptions.create({ preserveFocus: true }), sideBySide);
	}

	public revealRepl(inBackground: boolean = false): Promise {
		let editors = this.editorService.getVisibleEditors();

		// First check if repl is already opened
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];
			if (editor.input instanceof debuginputs.ReplEditorInput) {
				if (!inBackground) {
					return this.editorService.focusEditor(editor);
				}

				return Promise.as(null);
			}
		}

		// Then find a position but try to not replace an existing file editor in any of the positions
		let position = Position.LEFT;
		let lastIndex = editors.length - 1;
		if (editors.length === 3) {
			position = wbeditorcommon.asFileEditorInput(editors[lastIndex].input, true) ? null : Position.RIGHT;
		} else if (editors.length === 2) {
			position = wbeditorcommon.asFileEditorInput(editors[lastIndex].input, true) ? Position.RIGHT : Position.CENTER;
		} else if (editors.length) {
			position = wbeditorcommon.asFileEditorInput(editors[lastIndex].input, true) ? Position.CENTER : Position.LEFT;
		}

		if (position === null) {
			return Promise.as(null); // could not find a good position, return
		}

		// open repl
		return this.editorService.openEditor(debuginputs.ReplEditorInput.getInstance(), wbeditorcommon.TextEditorOptions.create({ preserveFocus: inBackground }), position).then((editor: Repl) => {
			const elements = this.model.getReplElements();
			if (!inBackground && elements.length > 0) {
				return editor.reveal(elements[elements.length - 1]);
			}
		});
	}

	private getDebugStringEditorInput(source: Source, value: string, mtype: string): debuginputs.DebugStringEditorInput {
		var filtered = this.debugStringEditorInputs.filter(input => input.getResource().toString() === source.uri.toString());

		if (filtered.length === 0) {
			var result = this.instantiationService.createInstance(debuginputs.DebugStringEditorInput, source.name, source.uri, 'internal module', value, mtype, void 0);
			this.debugStringEditorInputs.push(result);
			return result;
		} else {
			return filtered[0];
		}
	}

	private resolvePath(p: string, showError = true): string {
		if (!p) {
			return null;
		}
		if (path.isAbsolute(p)) {
			return paths.normalize(p, true);
		}

		return paths.normalize(uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, p)).fsPath, true);
	}

	public sendAllBreakpoints(): Promise {
		return Promise.join(arrays.distinct(this.model.getBreakpoints(), bp => bp.source.uri.toString()).map(bp => this.sendBreakpoints(bp.source.uri)));
	}

	private sendBreakpoints(modelUri: uri): Promise {
		if (!this.session) {
			return Promise.as(null);
		}

		const breakpointsToSend = arrays.distinct(
			this.model.getBreakpoints().filter(bp => this.model.areBreakpointsActivated() && bp.enabled && bp.source.uri.toString() === modelUri.toString()),
			bp =>  `${ bp.desiredLineNumber }`
		);
		return this.session.setBreakpoints({ source: Source.fromUri(modelUri).toRawSource(), lines: breakpointsToSend.map(bp => bp.desiredLineNumber) }).then(response => {
			let index = 0;
			breakpointsToSend.forEach(bp => {
				const lineNumber = response.body.breakpoints[index++].line;
				if (bp.lineNumber != lineNumber) {
					this.model.setBreakpointLineNumber(bp, lineNumber);
				}
			});
		});
	}

	private sendExceptionBreakpoints(): Promise {
		if (this.session) {
			var enabledExBreakpoints = this.model.getExceptionBreakpoints().filter(exb => exb.enabled);
			return this.session.setExceptionBreakpoints({ filters: enabledExBreakpoints.map(exb => exb.name) });
		}
	}

	private onFileChanges(fileChangesEvent: FileChangesEvent): void {
		var breakpoints = this.model.getBreakpoints();
		var clearedUris: { [key: string]: boolean } = {};
		for (var i = 0; i < breakpoints.length; i++) {
			var uri = breakpoints[i].source.uri;
			var uriStr = uri.toString();
			if (!clearedUris[uriStr] && fileChangesEvent.contains(uri, FileChangeType.DELETED)) {
				this.clearBreakpoints(uri);
				clearedUris[uriStr] = true;
			}
		}
	}

	private store(): void {
		this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(this.model.getBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_BREAKPOINTS_ACTIVATED_KEY, this.model.areBreakpointsActivated() ? 'true' : 'false', StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(this.model.getExceptionBreakpoints()), StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.configuration ? this.configuration.name : null, StorageScope.WORKSPACE);
		this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(this.model.getWatchExpressions()), StorageScope.WORKSPACE);
	}

	public dispose(): void {
		if (this.session) {
			this.session.disconnect();
			this.session = null;
		}
		this.model.dispose();
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}
