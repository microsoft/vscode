/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/task.contribution';
import 'vs/workbench/parts/tasks/browser/taskQuickOpen';

import * as nls from 'vs/nls';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import * as Objects from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import { Action } from 'vs/base/common/actions';
import * as Dom from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import * as Builder from 'vs/base/browser/builder';
import * as Types from 'vs/base/common/types';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { match } from 'vs/base/common/glob';
import { setTimeout } from 'vs/base/common/platform';
import { TerminateResponse, TerminateResponseCode } from 'vs/base/common/processes';
import * as strings from 'vs/base/common/strings';

import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { SyncActionDescriptor, MenuRegistry } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IMarkerService, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';


import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';

import jsonContributionRegistry = require('vs/platform/jsonschemas/common/jsonContributionRegistry');
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IStatusbarItem, IStatusbarRegistry, Extensions as StatusbarExtensions, StatusbarItemDescriptor, StatusbarAlignment } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';

import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IOutputService, IOutputChannelRegistry, Extensions as OutputExt, IOutputChannel } from 'vs/workbench/parts/output/common/output';

import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';

import { ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TaskRunnerConfiguration, TaskDescription, TaskSystemEvents } from 'vs/workbench/parts/tasks/common/taskSystem';
import { ITaskService, TaskServiceEvents } from 'vs/workbench/parts/tasks/common/taskService';
import { templates as taskTemplates } from 'vs/workbench/parts/tasks/common/taskTemplates';

import * as TaskConfig from 'vs/workbench/parts/tasks/common/taskConfiguration';
import { ProcessRunnerSystem } from 'vs/workbench/parts/tasks/node/processRunnerSystem';
import { TerminalTaskSystem } from './terminalTaskSystem';
import { ProcessRunnerDetector } from 'vs/workbench/parts/tasks/node/processRunnerDetector';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';

let $ = Builder.$;
let tasksCategory = nls.localize('tasksCategory', "Tasks");

abstract class OpenTaskConfigurationAction extends Action {

	private configurationService: IConfigurationService;
	private fileService: IFileService;

	private editorService: IWorkbenchEditorService;
	private contextService: IWorkspaceContextService;
	private outputService: IOutputService;
	private messageService: IMessageService;
	private quickOpenService: IQuickOpenService;

	constructor(id: string, label: string, @IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService, @IOutputService outputService: IOutputService,
		@IMessageService messageService: IMessageService, @IQuickOpenService quickOpenService: IQuickOpenService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationResolverService private configurationResolverService: IConfigurationResolverService) {

		super(id, label);
		this.configurationService = configurationService;
		this.editorService = editorService;
		this.fileService = fileService;
		this.contextService = contextService;
		this.outputService = outputService;
		this.messageService = messageService;
		this.quickOpenService = quickOpenService;


	}

	public run(event?: any): TPromise<IEditor> {
		if (!this.contextService.hasWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('ConfigureTaskRunnerAction.noWorkspace', 'Tasks are only available on a workspace folder.'));
			return TPromise.as(undefined);
		}
		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		let configFileCreated = false;
		return this.fileService.resolveFile(this.contextService.toResource('.vscode/tasks.json')).then((success) => {
			return success;
		}, (err: any) => {
			;
			return this.quickOpenService.pick(taskTemplates, { placeHolder: nls.localize('ConfigureTaskRunnerAction.quickPick.template', 'Select a Task Runner') }).then(selection => {
				if (!selection) {
					return undefined;
				}
				let contentPromise: TPromise<string>;
				if (selection.autoDetect) {
					const outputChannel = this.outputService.getChannel(TaskService.OutputChannelId);
					outputChannel.show(true);
					outputChannel.append(nls.localize('ConfigureTaskRunnerAction.autoDetecting', 'Auto detecting tasks for {0}', selection.id) + '\n');
					let detector = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService);
					contentPromise = detector.detect(false, selection.id).then((value) => {
						let config = value.config;
						if (value.stderr && value.stderr.length > 0) {
							value.stderr.forEach((line) => {
								outputChannel.append(line + '\n');
							});
							this.messageService.show(Severity.Warning, nls.localize('ConfigureTaskRunnerAction.autoDetect', 'Auto detecting the task system failed. Using default template. Consult the task output for details.'));
							return selection.content;
						} else if (config) {
							if (value.stdout && value.stdout.length > 0) {
								value.stdout.forEach(line => outputChannel.append(line + '\n'));
							}
							let content = JSON.stringify(config, null, '\t');
							content = [
								'{',
								'\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
								'\t// for the documentation about the tasks.json format',
							].join('\n') + content.substr(1);
							return content;
						} else {
							return selection.content;
						}
					});
				} else {
					contentPromise = TPromise.as(selection.content);
				}
				return contentPromise.then(content => {
					let editorConfig = this.configurationService.getConfiguration<any>();
					if (editorConfig.editor.insertSpaces) {
						content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + strings.repeat(' ', s2.length * editorConfig.editor.tabSize));
					}
					configFileCreated = true;
					return this.fileService.createFile(this.contextService.toResource('.vscode/tasks.json'), content);
				});
			});
		}).then((stat) => {
			if (!stat) {
				return undefined;
			}
			// // (2) Open editor with configuration file
			return this.editorService.openEditor({
				resource: stat.resource,
				options: {
					forceOpen: true,
					pinned: configFileCreated // pin only if config file is created #8727
				}
			}, sideBySide);
		}, (error) => {
			throw new Error(nls.localize('ConfigureTaskRunnerAction.failed', "Unable to create the 'tasks.json' file inside the '.vscode' folder. Consult the task output for details."));
		});
	}
}

class ConfigureTaskRunnerAction extends OpenTaskConfigurationAction {
	public static ID = 'workbench.action.tasks.configureTaskRunner';
	public static TEXT = nls.localize('ConfigureTaskRunnerAction.label', "Configure Task Runner");

	constructor(id: string, label: string, @IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService, @IOutputService outputService: IOutputService,
		@IMessageService messageService: IMessageService, @IQuickOpenService quickOpenService: IQuickOpenService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService) {
		super(id, label, configurationService, editorService, fileService, contextService,
			outputService, messageService, quickOpenService, environmentService, configurationResolverService);
	}

}

class ConfigureBuildTaskAction extends OpenTaskConfigurationAction {
	public static ID = 'workbench.action.tasks.configureBuildTask';
	public static TEXT = nls.localize('ConfigureBuildTaskAction.label', "Configure Build Task");

	constructor(id: string, label: string, @IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService, @IOutputService outputService: IOutputService,
		@IMessageService messageService: IMessageService, @IQuickOpenService quickOpenService: IQuickOpenService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService) {
		super(id, label, configurationService, editorService, fileService, contextService,
			outputService, messageService, quickOpenService, environmentService, configurationResolverService);
	}
}

class CloseMessageAction extends Action {

	public static ID = 'workbench.action.build.closeMessage';
	public static TEXT = nls.localize('CloseMessageAction.label', 'Close');

	public closeFunction: () => void;

	constructor() {
		super(CloseMessageAction.ID, CloseMessageAction.TEXT);
	}
	public run(): TPromise<void> {
		if (this.closeFunction) {
			this.closeFunction();
		}
		return TPromise.as(undefined);
	}
}

class ViewTerminalAction extends Action {

	public static ID = 'workbench.action.build.viewTerminal';
	public static TEXT = nls.localize('ShowTerminalAction.label', 'View Terminal');

	constructor( @ITerminalService private terminalService: ITerminalService) {
		super(ViewTerminalAction.ID, ViewTerminalAction.TEXT);
	}

	public run(): TPromise<void> {
		this.terminalService.showPanel();
		return TPromise.as(undefined);
	}
}

class StatusBarItem implements IStatusbarItem {

	private panelService: IPanelService;
	private markerService: IMarkerService;
	private taskService: ITaskService;
	private outputService: IOutputService;

	private intervalToken: any;
	private activeCount: number;
	private static progressChars: string = '|/-\\';

	constructor( @IPanelService panelService: IPanelService,
		@IMarkerService markerService: IMarkerService, @IOutputService outputService: IOutputService,
		@ITaskService taskService: ITaskService,
		@IPartService private partService: IPartService) {

		this.panelService = panelService;
		this.markerService = markerService;
		this.outputService = outputService;
		this.taskService = taskService;
		this.activeCount = 0;
	}

	public render(container: HTMLElement): IDisposable {

		let callOnDispose: IDisposable[] = [],
			element = document.createElement('div'),
			// icon = document.createElement('a'),
			progress = document.createElement('div'),
			label = document.createElement('a'),
			error = document.createElement('div'),
			warning = document.createElement('div'),
			info = document.createElement('div');

		Dom.addClass(element, 'task-statusbar-item');

		// dom.addClass(icon, 'task-statusbar-item-icon');
		// element.appendChild(icon);

		Dom.addClass(progress, 'task-statusbar-item-progress');
		element.appendChild(progress);
		progress.innerHTML = StatusBarItem.progressChars[0];
		$(progress).hide();

		Dom.addClass(label, 'task-statusbar-item-label');
		element.appendChild(label);
		element.title = nls.localize('problems', "Problems");

		Dom.addClass(error, 'task-statusbar-item-label-error');
		error.innerHTML = '0';
		label.appendChild(error);

		Dom.addClass(warning, 'task-statusbar-item-label-warning');
		warning.innerHTML = '0';
		label.appendChild(warning);

		Dom.addClass(info, 'task-statusbar-item-label-info');
		label.appendChild(info);
		$(info).hide();

		//		callOnDispose.push(dom.addListener(icon, 'click', (e:MouseEvent) => {
		//			this.outputService.showOutput(TaskService.OutputChannel, e.ctrlKey || e.metaKey, true);
		//		}));

		callOnDispose.push(Dom.addDisposableListener(label, 'click', (e: MouseEvent) => {
			const panel = this.panelService.getActivePanel();
			if (panel && panel.getId() === Constants.MARKERS_PANEL_ID) {
				this.partService.setPanelHidden(true);
			} else {
				this.panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
			}
		}));

		let updateStatus = (element: HTMLDivElement, stats: number): boolean => {
			if (stats > 0) {
				element.innerHTML = stats.toString();
				$(element).show();
				return true;
			} else {
				$(element).hide();
				return false;
			}
		};


		let manyMarkers = nls.localize('manyMarkers', "99+");
		let updateLabel = (stats: MarkerStatistics) => {
			error.innerHTML = stats.errors < 100 ? stats.errors.toString() : manyMarkers;
			warning.innerHTML = stats.warnings < 100 ? stats.warnings.toString() : manyMarkers;
			updateStatus(info, stats.infos);
		};

		this.markerService.onMarkerChanged((changedResources) => {
			updateLabel(this.markerService.getStatistics());
		});

		callOnDispose.push(this.taskService.addListener2(TaskServiceEvents.Active, () => {
			this.activeCount++;
			if (this.activeCount === 1) {
				let index = 1;
				let chars = StatusBarItem.progressChars;
				progress.innerHTML = chars[0];
				this.intervalToken = setInterval(() => {
					progress.innerHTML = chars[index];
					index++;
					if (index >= chars.length) {
						index = 0;
					}
				}, 50);
				$(progress).show();
			}
		}));

		callOnDispose.push(this.taskService.addListener2(TaskServiceEvents.Inactive, (data: TaskServiceEventData) => {
			// Since the exiting of the sub process is communicated async we can't order inactive and terminate events.
			// So try to treat them accordingly.
			if (this.activeCount > 0) {
				this.activeCount--;
				if (this.activeCount === 0) {
					$(progress).hide();
					if (this.intervalToken) {
						clearInterval(this.intervalToken);
						this.intervalToken = null;
					}
				}
			}
		}));

		callOnDispose.push(this.taskService.addListener2(TaskServiceEvents.Terminated, () => {
			if (this.activeCount !== 0) {
				$(progress).hide();
				if (this.intervalToken) {
					clearInterval(this.intervalToken);
					this.intervalToken = null;
				}
				this.activeCount = 0;
			}
		}));

		container.appendChild(element);

		return {
			dispose: () => {
				callOnDispose = dispose(callOnDispose);
			}
		};
	}
}

interface TaskServiceEventData {
	error?: any;
}

class NullTaskSystem extends EventEmitter implements ITaskSystem {
	public build(): ITaskExecuteResult {
		return {
			kind: TaskExecuteKind.Started,
			promise: TPromise.as<ITaskSummary>({})
		};
	}
	public rebuild(): ITaskExecuteResult {
		return {
			kind: TaskExecuteKind.Started,
			promise: TPromise.as<ITaskSummary>({})
		};
	}
	public clean(): ITaskExecuteResult {
		return {
			kind: TaskExecuteKind.Started,
			promise: TPromise.as<ITaskSummary>({})
		};
	}
	public runTest(): ITaskExecuteResult {
		return {
			kind: TaskExecuteKind.Started,
			promise: TPromise.as<ITaskSummary>({})
		};
	}
	public run(taskIdentifier: string): ITaskExecuteResult {
		return {
			kind: TaskExecuteKind.Started,
			promise: TPromise.as<ITaskSummary>({})
		};
	}
	public isActive(): TPromise<boolean> {
		return TPromise.as(false);
	}
	public isActiveSync(): boolean {
		return false;
	}
	public canAutoTerminate(): boolean {
		return true;
	}
	public terminate(): TPromise<TerminateResponse> {
		return TPromise.as<TerminateResponse>({ success: true });
	}
	public tasks(): TPromise<TaskDescription[]> {
		return TPromise.as<TaskDescription[]>([]);
	}
}

class TaskService extends EventEmitter implements ITaskService {
	public _serviceBrand: any;
	public static SERVICE_ID: string = 'taskService';
	public static OutputChannelId: string = 'tasks';
	public static OutputChannelLabel: string = nls.localize('tasks', "Tasks");

	private modeService: IModeService;
	private configurationService: IConfigurationService;
	private markerService: IMarkerService;
	private outputService: IOutputService;
	private messageService: IMessageService;
	private fileService: IFileService;
	private telemetryService: ITelemetryService;
	private editorService: IWorkbenchEditorService;
	private contextService: IWorkspaceContextService;
	private textFileService: ITextFileService;
	private modelService: IModelService;
	private extensionService: IExtensionService;
	private quickOpenService: IQuickOpenService;

	private _taskSystemPromise: TPromise<ITaskSystem>;
	private _taskSystem: ITaskSystem;
	private _inTerminal: boolean;
	private taskSystemListeners: IDisposable[];
	private clearTaskSystemPromise: boolean;
	private outputChannel: IOutputChannel;

	private fileChangesListener: IDisposable;

	constructor( @IModeService modeService: IModeService, @IConfigurationService configurationService: IConfigurationService,
		@IMarkerService markerService: IMarkerService, @IOutputService outputService: IOutputService,
		@IMessageService messageService: IMessageService, @IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService, @IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService, @ITextFileService textFileService: ITextFileService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IModelService modelService: IModelService, @IExtensionService extensionService: IExtensionService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationResolverService private configurationResolverService: IConfigurationResolverService,
		@ITerminalService private terminalService: ITerminalService
	) {

		super();
		this.modeService = modeService;
		this.configurationService = configurationService;
		this.markerService = markerService;
		this.outputService = outputService;
		this.messageService = messageService;
		this.editorService = editorService;
		this.fileService = fileService;
		this.contextService = contextService;
		this.telemetryService = telemetryService;
		this.textFileService = textFileService;
		this.modelService = modelService;
		this.extensionService = extensionService;
		this.quickOpenService = quickOpenService;

		this._inTerminal = undefined;
		this.taskSystemListeners = [];
		this.clearTaskSystemPromise = false;
		this.outputChannel = this.outputService.getChannel(TaskService.OutputChannelId);
		this.configurationService.onDidUpdateConfiguration(() => {
			// We don't have a task system yet. So nothing to do.
			if (!this._taskSystemPromise && !this._taskSystem) {
				return;
			}
			if (this._inTerminal !== void 0) {
				let config = this.configurationService.getConfiguration<TaskConfig.ExternalTaskRunnerConfiguration>('tasks');
				let engine = TaskConfig.ExecutionEngine.from(config);
				if (this._inTerminal && engine === TaskConfig.ExecutionEngine.OutputPanel || !this._inTerminal && engine === TaskConfig.ExecutionEngine.Terminal) {
					this.messageService.show(Severity.Info, nls.localize('TaskSystem.noHotSwap', 'Changing the task execution engine requires to restart VS Code. The change is ignored.'));
				}
			}
			this.emit(TaskServiceEvents.ConfigChanged);
			if (this._inTerminal) {
				this.createConfiguration().then((config) => {
					if (!config) {
						return;
					}
					if (this._taskSystem) {
						(this._taskSystem as TerminalTaskSystem).setConfiguration(config);
					} else {
						this._taskSystem = null;
						this._taskSystemPromise = null;
					}
				});
			} else {
				if (this._taskSystem && this._taskSystem.isActiveSync()) {
					this.clearTaskSystemPromise = true;
				} else {
					this._taskSystem = null;
					this._taskSystemPromise = null;
				}
				this.disposeTaskSystemListeners();
			}
		});

		lifecycleService.onWillShutdown(event => event.veto(this.beforeShutdown()));
		this.registerCommands();
	}


	private registerCommands(): void {
		CommandsRegistry.registerCommand('workbench.action.tasks.runTask', (accessor, arg) => {
			this.runTaskCommand(accessor, arg);
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.terminate', (accessor, arg) => {
			this.runTerminateCommand();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.showLog', () => {
			if (!this.canRunCommand()) {
				return;
			}
			this.showOutput();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.build', () => {
			if (!this.canRunCommand()) {
				return;
			}
			this.build();
		});

		KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.tasks.build',
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
			when: undefined,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.test', () => {
			if (!this.canRunCommand()) {
				return;
			}
			this.runTest();
		});
	}

	public log(value: string): void {
		this.outputChannel.append(value + '\n');
	}

	private showOutput(): void {
		this.outputChannel.show(true);
	}

	private disposeTaskSystemListeners(): void {
		this.taskSystemListeners = dispose(this.taskSystemListeners);
	}

	private disposeFileChangesListener(): void {
		if (this.fileChangesListener) {
			this.fileChangesListener.dispose();
			this.fileChangesListener = null;
		}
	}

	private get taskSystemPromise(): TPromise<ITaskSystem> {
		if (!this._taskSystemPromise) {
			if (!this.contextService.hasWorkspace()) {
				this._taskSystem = new NullTaskSystem();
				this._taskSystemPromise = TPromise.as(this._taskSystem);
			} else {
				let hasError = false;
				this._taskSystemPromise = TPromise.as(this.configurationService.getConfiguration<TaskConfig.ExternalTaskRunnerConfiguration>('tasks')).then((config) => {
					let parseErrors: string[] = config ? (<any>config).$parseErrors : null;
					if (parseErrors) {
						let isAffected = false;
						for (let i = 0; i < parseErrors.length; i++) {
							if (/tasks\.json$/.test(parseErrors[i])) {
								isAffected = true;
								break;
							}
						}
						if (isAffected) {
							this.outputChannel.append(nls.localize('TaskSystem.invalidTaskJson', 'Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task.\n'));
							this.outputChannel.show(true);
							return TPromise.wrapError({});
						}
					}
					let configPromise: TPromise<TaskConfig.ExternalTaskRunnerConfiguration>;
					if (config) {
						let engine = TaskConfig.ExecutionEngine.from(config);
						if (engine === TaskConfig.ExecutionEngine.OutputPanel && this.hasDetectorSupport(config)) {
							configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService, config).detect(true).then((value) => {
								hasError = this.printStderr(value.stderr);
								let detectedConfig = value.config;
								if (!detectedConfig) {
									return config;
								}
								let result: TaskConfig.ExternalTaskRunnerConfiguration = Objects.clone(config);
								let configuredTasks: IStringDictionary<TaskConfig.TaskDescription> = Object.create(null);
								if (!result.tasks) {
									if (detectedConfig.tasks) {
										result.tasks = detectedConfig.tasks;
									}
								} else {
									result.tasks.forEach(task => configuredTasks[task.taskName] = task);
									detectedConfig.tasks.forEach((task) => {
										if (!configuredTasks[task.taskName]) {
											result.tasks.push(task);
										}
									});
								}
								return result;
							});
						} else {
							configPromise = TPromise.as(config);
						}
					} else {
						configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService).detect(true).then((value) => {
							hasError = this.printStderr(value.stderr);
							return value.config;
						});
					}
					return configPromise.then((config) => {
						if (!config) {
							this._taskSystemPromise = null;
							throw new TaskError(Severity.Info, nls.localize('TaskSystem.noConfiguration', 'No task runner configured.'), TaskErrors.NotConfigured);
						}
						let result: ITaskSystem = null;
						let parseResult = TaskConfig.parse(config, this);
						if (!parseResult.validationStatus.isOK()) {
							this.outputChannel.show(true);
							hasError = true;
						}
						if (parseResult.validationStatus.isFatal()) {
							throw new TaskError(Severity.Error, nls.localize('TaskSystem.fatalError', 'The provided task configuration has validation errors. See tasks output log for details.'), TaskErrors.ConfigValidationError);
						}
						if (parseResult.engine === TaskConfig.ExecutionEngine.OutputPanel) {
							this._inTerminal = false;
							result = new ProcessRunnerSystem(parseResult.configuration, this.markerService, this.modelService,
								this.telemetryService, this.outputService, this.configurationResolverService, TaskService.OutputChannelId, hasError);
						} else if (parseResult.engine === TaskConfig.ExecutionEngine.Terminal) {
							this._inTerminal = true;
							result = new TerminalTaskSystem(
								parseResult.configuration,
								this.terminalService, this.outputService, this.markerService,
								this.modelService, this.configurationResolverService, this.telemetryService,
								TaskService.OutputChannelId
							);
						}
						if (result === null) {
							this._taskSystemPromise = null;
							throw new TaskError(Severity.Info, nls.localize('TaskSystem.noBuildType', "No valid task runner configured. Supported task runners are 'service' and 'program'."), TaskErrors.NoValidTaskRunner);
						}
						this.taskSystemListeners.push(result.addListener2(TaskSystemEvents.Active, (event) => this.emit(TaskServiceEvents.Active, event)));
						this.taskSystemListeners.push(result.addListener2(TaskSystemEvents.Inactive, (event) => this.emit(TaskServiceEvents.Inactive, event)));
						this._taskSystem = result;
						return result;
					}, (err: any) => {
						this.handleError(err);
						return Promise.wrapError(err);
					});
				});
			}
		}
		return this._taskSystemPromise;
	}

	private createConfiguration(): TPromise<TaskRunnerConfiguration> {
		let config = this.configurationService.getConfiguration<TaskConfig.ExternalTaskRunnerConfiguration>('tasks');
		let parseErrors: string[] = config ? (<any>config).$parseErrors : null;
		if (parseErrors) {
			let isAffected = false;
			for (let i = 0; i < parseErrors.length; i++) {
				if (/tasks\.json$/.test(parseErrors[i])) {
					isAffected = true;
					break;
				}
			}
			if (isAffected) {
				this.log(nls.localize('TaskSystem.invalidTaskJson', 'Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task.\n'));
				this.showOutput();
				return TPromise.wrapError(undefined);
			}
		}
		let configPromise: TPromise<TaskConfig.ExternalTaskRunnerConfiguration>;
		if (config) {
			let engine = TaskConfig.ExecutionEngine.from(config);
			if (engine === TaskConfig.ExecutionEngine.OutputPanel && this.hasDetectorSupport(config)) {
				configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService, config).detect(true).then((value) => {
					this.printStderr(value.stderr);
					let detectedConfig = value.config;
					if (!detectedConfig) {
						return config;
					}
					let result: TaskConfig.ExternalTaskRunnerConfiguration = Objects.clone(config);
					let configuredTasks: IStringDictionary<TaskConfig.TaskDescription> = Object.create(null);
					if (!result.tasks) {
						if (detectedConfig.tasks) {
							result.tasks = detectedConfig.tasks;
						}
					} else {
						result.tasks.forEach(task => configuredTasks[task.taskName] = task);
						detectedConfig.tasks.forEach((task) => {
							if (!configuredTasks[task.taskName]) {
								result.tasks.push(task);
							}
						});
					}
					return result;
				});
			} else {
				configPromise = TPromise.as(config);
			}
		} else {
			configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService).detect(true).then((value) => {
				this.printStderr(value.stderr);
				return value.config;
			});
		}
		return configPromise.then((config) => {
			if (!config) {
				return undefined;
			}
			let parseResult = TaskConfig.parse(config, this);
			if (!parseResult.validationStatus.isOK()) {
				this.showOutput();
			}
			if (parseResult.validationStatus.isFatal()) {
				this.log(nls.localize('TaskSystem.configurationErrors', 'Error: the provided task configuration has validation errors and can\'t not be used. Please correct the errors first.'));
				return undefined;
			}
			return parseResult.configuration;
		});
	}

	private printStderr(stderr: string[]): boolean {
		let result = false;
		if (stderr && stderr.length > 0) {
			stderr.forEach((line) => {
				result = true;
				this.outputChannel.append(line + '\n');
			});
			this.outputChannel.show(true);
		}
		return result;
	}

	public inTerminal(): boolean {
		return this._inTerminal !== void 0 && this._inTerminal;
	}

	private hasDetectorSupport(config: TaskConfig.ExternalTaskRunnerConfiguration): boolean {
		if (!config.command) {
			return false;
		}
		return ProcessRunnerDetector.supports(config.command);
	}

	public configureAction(): Action {
		return new ConfigureTaskRunnerAction(ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT,
			this.configurationService, this.editorService, this.fileService, this.contextService,
			this.outputService, this.messageService, this.quickOpenService, this.environmentService, this.configurationResolverService);
	}

	private configureBuildTask(): Action {
		return new ConfigureBuildTaskAction(ConfigureBuildTaskAction.ID, ConfigureBuildTaskAction.TEXT,
			this.configurationService, this.editorService, this.fileService, this.contextService,
			this.outputService, this.messageService, this.quickOpenService, this.environmentService, this.configurationResolverService);
	}

	public build(): TPromise<ITaskSummary> {
		return this.executeTarget(taskSystem => taskSystem.build());
	}

	public rebuild(): TPromise<ITaskSummary> {
		return this.executeTarget(taskSystem => taskSystem.rebuild());
	}

	public clean(): TPromise<ITaskSummary> {
		return this.executeTarget(taskSystem => taskSystem.clean());
	}

	public runTest(): TPromise<ITaskSummary> {
		return this.executeTarget(taskSystem => taskSystem.runTest());
	}

	public run(taskIdentifier: string): TPromise<ITaskSummary> {
		return this.executeTarget(taskSystem => taskSystem.run(taskIdentifier));
	}

	private executeTarget(fn: (taskSystem: ITaskSystem) => ITaskExecuteResult): TPromise<ITaskSummary> {
		return this.textFileService.saveAll().then((value) => { // make sure all dirty files are saved
			return this.configurationService.reloadConfiguration().then(() => { // make sure configuration is up to date
				return this.taskSystemPromise.
					then((taskSystem) => {
						let executeResult = fn(taskSystem);
						if (executeResult.kind === TaskExecuteKind.Active) {
							let active = executeResult.active;
							if (active.same && active.background) {
								this.messageService.show(Severity.Info, nls.localize('TaskSystem.activeSame', 'The task is already active and in watch mode. To terminate the task use `F1 > terminate task`'));
							} else {
								throw new TaskError(Severity.Warning, nls.localize('TaskSystem.active', 'There is an active running task right now. Terminate it first before executing another task.'), TaskErrors.RunningTask);
							}
						}
						return executeResult;
					}).
					then((executeResult: ITaskExecuteResult) => {
						if (executeResult.kind === TaskExecuteKind.Started) {
							if (executeResult.started.restartOnFileChanges) {
								let pattern = executeResult.started.restartOnFileChanges;
								this.fileChangesListener = this.fileService.onFileChanges(event => {
									let needsRestart = event.changes.some((change) => {
										return (change.type === FileChangeType.ADDED || change.type === FileChangeType.DELETED) && !!match(pattern, change.resource.fsPath);
									});
									if (needsRestart) {
										this.terminate().done(() => {
											// We need to give the child process a change to stop.
											setTimeout(() => {
												this.executeTarget(fn);
											}, 2000);
										});
									}
								});
							}
							return executeResult.promise.then((value) => {
								if (this.clearTaskSystemPromise) {
									this._taskSystemPromise = null;
									this.clearTaskSystemPromise = false;
								}
								return value;
							});
						} else {
							return executeResult.promise;
						}
					}, (err: any) => {
						this.handleError(err);
					});
			});
		});
	}

	public isActive(): TPromise<boolean> {
		if (this._taskSystemPromise) {
			return this.taskSystemPromise.then(taskSystem => taskSystem.isActive());
		}
		return TPromise.as(false);
	}

	public terminate(): TPromise<TerminateResponse> {
		if (this._taskSystemPromise) {
			return this.taskSystemPromise.then(taskSystem => {
				return taskSystem.terminate();
			}).then(response => {
				if (response.success) {
					if (this.clearTaskSystemPromise) {
						this._taskSystemPromise = null;
						this.clearTaskSystemPromise = false;
					}
					this.emit(TaskServiceEvents.Terminated, {});
					this.disposeFileChangesListener();
				}
				return response;
			});
		}
		return TPromise.as({ success: true });
	}

	public tasks(): TPromise<TaskDescription[]> {
		return this.taskSystemPromise.then(taskSystem => taskSystem.tasks());
	}

	public beforeShutdown(): boolean | TPromise<boolean> {
		if (this._taskSystem && this._taskSystem.isActiveSync()) {
			if (this._taskSystem.canAutoTerminate() || this.messageService.confirm({
				message: nls.localize('TaskSystem.runningTask', 'There is a task running. Do you want to terminate it?'),
				primaryButton: nls.localize({ key: 'TaskSystem.terminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task")
			})) {
				return this._taskSystem.terminate().then((response) => {
					if (response.success) {
						this.emit(TaskServiceEvents.Terminated, {});
						this._taskSystem = null;
						this.disposeFileChangesListener();
						this.disposeTaskSystemListeners();
						return false; // no veto
					} else if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
						return !this.messageService.confirm({
							message: nls.localize('TaskSystem.noProcess', 'The launched task doesn\'t exist anymore. If the task spawned background processes exiting VS Code might result in orphaned processes. To avoid this start the last background process with a wait flag.'),
							primaryButton: nls.localize({ key: 'TaskSystem.exitAnyways', comment: ['&& denotes a mnemonic'] }, "&&Exit Anyways")
						});
					}
					return true; // veto
				}, (err) => {
					return true; // veto
				});
			} else {
				return true; // veto
			}
		}
		return false; // Nothing to do here
	}

	private getConfigureAction(code: TaskErrors): Action {
		switch (code) {
			case TaskErrors.NoBuildTask:
				return this.configureBuildTask();
			default:
				return this.configureAction();
		}
	}

	private handleError(err: any): void {
		let showOutput = true;
		if (err instanceof TaskError) {
			let buildError = <TaskError>err;
			let needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
			let needsTerminate = buildError.code === TaskErrors.RunningTask;
			if (needsConfig || needsTerminate) {
				let closeAction = new CloseMessageAction();
				let action: Action = needsConfig
					? this.getConfigureAction(buildError.code)
					: new Action(
						'workbench.action.tasks.terminate',
						nls.localize('TerminateAction.label', "Terminate Running Task"),
						undefined, true, () => { this.runTerminateCommand(); return TPromise.as<void>(undefined); });
				closeAction.closeFunction = this.messageService.show(buildError.severity, { message: buildError.message, actions: [action, closeAction] });
			} else {
				this.messageService.show(buildError.severity, buildError.message);
			}
		} else if (err instanceof Error) {
			let error = <Error>err;
			this.messageService.show(Severity.Error, error.message);
		} else if (Types.isString(err)) {
			this.messageService.show(Severity.Error, <string>err);
		} else {
			this.messageService.show(Severity.Error, nls.localize('TaskSystem.unknownError', 'An error has occurred while running a task. See task log for details.'));
		}
		if (showOutput) {
			this.outputChannel.show(true);
		}
	}

	private canRunCommand(): boolean {
		if (!this.contextService.hasWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('TaskService.noWorkspace', 'Tasks are only available on a workspace folder.'));
			return false;
		}
		return true;
	}

	private runTaskCommand(accessor: ServicesAccessor, arg: any): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (Types.isString(arg)) {
			this.tasks().then(tasks => {
				for (let task of tasks) {
					if (task.identifier === arg) {
						this.run(task.id);
					}
				}
			});
		} else {
			this.quickOpenService.show('task ');
		}
	}

	private runTerminateCommand(): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.inTerminal()) {
			this.messageService.show(Severity.Info, {
				message: nls.localize('TerminateAction.terminalSystem', 'The tasks are executed in the integrated terminal. Use the terminal to manage the tasks.'),
				actions: [new ViewTerminalAction(this.terminalService), new CloseMessageAction()]
			});
		} else {
			this.isActive().then((active) => {
				if (active) {
					this.terminate().then((response) => {
						if (response.success) {
							return undefined;
						} else if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
							this.messageService.show(Severity.Error, nls.localize('TerminateAction.noProcess', 'The launched process doesn\'t exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes.'));
							return undefined;
						} else {
							return Promise.wrapError(nls.localize('TerminateAction.failed', 'Failed to terminate running task'));
						}
					});
				}
			});
		}
	}
}


let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT), 'Tasks: Configure Task Runner', tasksCategory);

MenuRegistry.addCommand({ id: 'workbench.action.tasks.showLog', title: nls.localize('ShowLogAction.label', "Show Task Log"), category: tasksCategory });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.runTask', title: nls.localize('RunTaskAction.label', "Run Task"), category: tasksCategory });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.terminate', title: nls.localize('TerminateAction.label', "Terminate Running Task"), category: tasksCategory });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.build', title: nls.localize('BuildAction.label', "Run Build Task"), category: tasksCategory });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.test', title: nls.localize('TestAction.label', "Run Test Task"), category: tasksCategory });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.rebuild', title: nls.localize('RebuildAction.label', 'Run Rebuild Task'), category: tasksCategory });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.clean', title: nls.localize('CleanAction.label', 'Run Clean Task'), category: tasksCategory });

// Task Service
registerSingleton(ITaskService, TaskService);

// Register Quick Open
(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/tasks/browser/taskQuickOpen',
		'QuickOpenHandler',
		'task ',
		nls.localize('taskCommands', "Run Task")
	)
);

// Status bar
let statusbarRegistry = <IStatusbarRegistry>Registry.as(StatusbarExtensions.Statusbar);
statusbarRegistry.registerStatusbarItem(new StatusbarItemDescriptor(StatusBarItem, StatusbarAlignment.LEFT, 50 /* Medium Priority */));

// Output channel
let outputChannelRegistry = <IOutputChannelRegistry>Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel(TaskService.OutputChannelId, TaskService.OutputChannelLabel);

// (<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(TaskServiceParticipant);

// tasks.json validation
let schemaId = 'vscode://schemas/tasks';
let schema: IJSONSchema = {
	id: schemaId,
	description: 'Task definition file',
	type: 'object',
	default: {
		version: '0.1.0',
		command: 'myCommand',
		isShellCommand: false,
		args: [],
		showOutput: 'always',
		tasks: [
			{
				taskName: 'build',
				showOutput: 'silent',
				isBuildCommand: true,
				problemMatcher: ['$tsc', '$lessCompile']
			}
		]
	}
};

import schemaVersion1 from './jsonSchema_v1';
import schemaVersion2 from './jsonSchema_v2';
schema.definitions = {
	...schemaVersion1.definitions,
	...schemaVersion2.definitions,
};
schema.oneOf = [...schemaVersion1.oneOf, ...schemaVersion2.oneOf];


let jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(schemaId, schema);
