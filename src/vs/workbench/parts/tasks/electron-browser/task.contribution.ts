/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/task.contribution';
import 'vs/workbench/parts/tasks/browser/taskQuickOpen';
import 'vs/workbench/parts/tasks/browser/terminateQuickOpen';
import 'vs/workbench/parts/tasks/browser/restartQuickOpen';

import * as nls from 'vs/nls';

import { TPromise } from 'vs/base/common/winjs.base';
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
import { TerminateResponse, TerminateResponseCode } from 'vs/base/common/processes';
import * as strings from 'vs/base/common/strings';
import { ValidationStatus, ValidationState } from 'vs/base/common/parsers';
import * as UUID from 'vs/base/common/uuid';

import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { SyncActionDescriptor, MenuRegistry } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IMarkerService, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ProblemMatcherRegistry } from 'vs/platform/markers/common/problemMatcher';


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

import { ITaskSystem, ITaskResolver, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TaskSystemEvents } from 'vs/workbench/parts/tasks/common/taskSystem';
import { Task, TaskSet, TaskGroup, ExecutionEngine, ShowOutput } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService, TaskServiceEvents, ITaskProvider } from 'vs/workbench/parts/tasks/common/taskService';
import { templates as taskTemplates } from 'vs/workbench/parts/tasks/common/taskTemplates';

import * as TaskConfig from 'vs/workbench/parts/tasks/common/taskConfiguration';
import { ProcessTaskSystem } from 'vs/workbench/parts/tasks/node/processTaskSystem';
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
	public run(task: Task): ITaskExecuteResult {
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
	public getActiveTasks(): Task[] {
		return [];
	}
	public canAutoTerminate(): boolean {
		return true;
	}
	public terminate(task: string | Task): TPromise<TerminateResponse> {
		return TPromise.as<TerminateResponse>({ success: true });
	}
	public terminateAll(): TPromise<TerminateResponse> {
		return TPromise.as<TerminateResponse>({ success: true });
	}
}

class ProblemReporter implements TaskConfig.IProblemReporter {

	private _validationStatus: ValidationStatus;

	constructor(private _outputChannel: IOutputChannel) {
		this._validationStatus = new ValidationStatus();
	}

	public info(message: string): void {
		this._validationStatus.state = ValidationState.Info;
		this._outputChannel.append(message + '\n');
	}

	public warn(message: string): void {
		this._validationStatus.state = ValidationState.Warning;
		this._outputChannel.append(message + '\n');
	}

	public error(message: string): void {
		this._validationStatus.state = ValidationState.Error;
		this._outputChannel.append(message + '\n');
	}

	public fatal(message: string): void {
		this._validationStatus.state = ValidationState.Fatal;
		this._outputChannel.append(message + '\n');
	}

	public get status(): ValidationStatus {
		return this._validationStatus;
	}

	public clearOutput(): void {
		this._outputChannel.clear();
	}
}

interface WorkspaceTaskResult {
	set: TaskSet;
	hasErrors: boolean;
}

interface WorkspaceConfigurationResult {
	config: TaskConfig.ExternalTaskRunnerConfiguration;
	hasErrors: boolean;
}

class TaskService extends EventEmitter implements ITaskService {

	// private static autoDetectTelemetryName: string = 'taskServer.autoDetect';

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

	private _configHasErrors: boolean;
	private _workspaceTasksPromise: TPromise<TaskSet>;

	private _taskSystem: ITaskSystem;

	private taskSystemListeners: IDisposable[];
	private clearTaskSystemPromise: boolean;
	private outputChannel: IOutputChannel;

	private providers: Map<number, ITaskProvider>;

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
		@ITerminalService private terminalService: ITerminalService,
		@IWorkbenchEditorService private workbenchEditorService: IWorkbenchEditorService
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

		this._configHasErrors = false;
		this._workspaceTasksPromise = undefined;
		this.taskSystemListeners = [];
		this.clearTaskSystemPromise = false;
		this.outputChannel = this.outputService.getChannel(TaskService.OutputChannelId);
		this.providers = new Map<number, ITaskProvider>();
		this.configurationService.onDidUpdateConfiguration(() => {
			if (!this._taskSystem) {
				return;
			}
			this.updateWorkspaceTasks();
			let currentExecutionEngine = this._taskSystem instanceof TerminalTaskSystem
				? ExecutionEngine.Terminal
				: this._taskSystem instanceof ProcessTaskSystem
					? ExecutionEngine.Process
					: ExecutionEngine.Unknown;
			if (currentExecutionEngine !== this.getExecutionEngine()) {
				this.messageService.show(Severity.Info, nls.localize('TaskSystem.noHotSwap', 'Changing the task execution engine requires to restart VS Code. The change is ignored.'));
			}
		});
		lifecycleService.onWillShutdown(event => event.veto(this.beforeShutdown()));
		this.registerCommands();
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand('workbench.action.tasks.runTask', (accessor, arg) => {
			this.runTaskCommand(accessor, arg);
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.restartTask', (accessor, arg) => {
			this.runRestartTaskCommand(accessor, arg);
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

	private showOutput(): void {
		this.outputChannel.show(true);
	}

	private disposeTaskSystemListeners(): void {
		this.taskSystemListeners = dispose(this.taskSystemListeners);
	}

	public registerTaskProvider(handle: number, provider: ITaskProvider): void {
		if (!provider) {
			return;
		}
		this.providers.set(handle, provider);
	}

	public unregisterTaskProvider(handle: number): boolean {
		return this.providers.delete(handle);
	}

	public tasks(): TPromise<Task[]> {
		return this.getTaskSets().then((sets) => {
			let result: Task[] = [];
			for (let set of sets) {
				result.push(...set.tasks);
			}
			return result;
		});
	};

	public isActive(): TPromise<boolean> {
		if (!this._taskSystem) {
			return TPromise.as(false);
		}
		return this._taskSystem.isActive();
	}

	public getActiveTasks(): TPromise<Task[]> {
		if (!this._taskSystem) {
			return TPromise.as([]);
		}
		return TPromise.as(this._taskSystem.getActiveTasks());
	}


	public build(): TPromise<ITaskSummary> {
		return this.getTaskSets().then((values) => {
			let runnable = this.createRunnableTask(values, TaskGroup.Build);
			if (!runnable || !runnable.task) {
				throw new TaskError(Severity.Info, nls.localize('TaskService.noBuildTask', 'No build task defined. Mark a task with \'isBuildCommand\' in the tasks.json file.'), TaskErrors.NoBuildTask);
			}
			return this.executeTask(runnable.task, runnable.resolver);
		}).then(value => value, (error) => {
			this.handleError(error);
			return TPromise.wrapError(error);
		});
	}

	public rebuild(): TPromise<ITaskSummary> {
		return TPromise.wrapError<ITaskSummary>(new Error('Not implemented'));
	}

	public clean(): TPromise<ITaskSummary> {
		return TPromise.wrapError<ITaskSummary>(new Error('Not implemented'));
	}

	public runTest(): TPromise<ITaskSummary> {
		return this.getTaskSets().then((values) => {
			let runnable = this.createRunnableTask(values, TaskGroup.Test);
			if (!runnable || !runnable.task) {
				throw new TaskError(Severity.Info, nls.localize('TaskService.noTestTask', 'No test task defined. Mark a task with \'isTestCommand\' in the tasks.json file.'), TaskErrors.NoTestTask);
			}
			return this.executeTask(runnable.task, runnable.resolver);
		}).then(value => value, (error) => {
			this.handleError(error);
			return TPromise.wrapError(error);
		});
	}

	public run(task: string | Task): TPromise<ITaskSummary> {
		return this.getTaskSets().then((values) => {
			let resolver = this.createResolver(values);
			let requested: string;
			let toExecute: Task;
			if (Types.isString(task)) {
				requested = task;
				toExecute = resolver.resolve(task);
			} else {
				requested = task.name;
				toExecute = resolver.resolve(task._id);
			}
			if (!toExecute) {
				throw new TaskError(Severity.Info, nls.localize('TaskServer.noTask', 'Requested task {0} to execute not found.', requested), TaskErrors.TaskNotFound);
			} else {
				return this.executeTask(toExecute, resolver);
			}
		}).then(value => value, (error) => {
			this.handleError(error);
			return TPromise.wrapError(error);
		});
	}

	private createRunnableTask(sets: TaskSet[], group: TaskGroup): { task: Task; resolver: ITaskResolver } {
		let uuidMap: IStringDictionary<Task> = Object.create(null);
		let identifierMap: IStringDictionary<Task> = Object.create(null);

		let primaryTasks: Task[] = [];
		sets.forEach((set) => {
			set.tasks.forEach((task) => {
				uuidMap[task._id] = task;
				identifierMap[task.identifier] = task;
				if (group && task.group === group) {
					primaryTasks.push(task);
				}
			});
		});
		if (primaryTasks.length === 0) {
			return undefined;
		}
		let resolver: ITaskResolver = {
			resolve: (id: string) => {
				let result = uuidMap[id];
				if (result) {
					return result;
				}
				return identifierMap[id];
			}
		};
		if (primaryTasks.length === 1) {
			return { task: primaryTasks[0], resolver };
		} else {
			let id: string = UUID.generateUuid();
			let task: Task = {
				_id: id,
				name: id,
				identifier: id,
				dependsOn: primaryTasks.map(task => task._id),
				command: undefined,
				showOutput: ShowOutput.Never
			};
			return { task, resolver };
		}
	}

	private createResolver(sets: TaskSet[]): ITaskResolver {
		let uuidMap: IStringDictionary<Task> = Object.create(null);
		let identifierMap: IStringDictionary<Task> = Object.create(null);

		sets.forEach((set) => {
			set.tasks.forEach((task) => {
				uuidMap[task._id] = task;
				identifierMap[task.identifier] = task;
			});
		});
		return {
			resolve: (id: string) => {
				let result = uuidMap[id];
				if (result) {
					return result;
				}
				return identifierMap[id];
			}
		};
	}

	private executeTask(task: Task, resolver: ITaskResolver): TPromise<ITaskSummary> {
		return this.textFileService.saveAll().then((value) => { // make sure all dirty files are saved
			let executeResult = this.getTaskSystem().run(task, resolver);
			if (executeResult.kind === TaskExecuteKind.Active) {
				let active = executeResult.active;
				if (active.same && active.background) {
					this.messageService.show(Severity.Info, nls.localize('TaskSystem.activeSame', 'The task is already active and in watch mode. To terminate the task use `F1 > terminate task`'));
				} else {
					throw new TaskError(Severity.Warning, nls.localize('TaskSystem.active', 'There is already a task running. Terminate it first before executing another task.'), TaskErrors.RunningTask);
				}
			}
			return executeResult.promise;
		});
	}

	public restart(task: string | Task): void {
		if (!this._taskSystem) {
			return;
		}
		const id: string = Types.isString(task) ? task : task._id;
		this._taskSystem.terminate(id).then((response) => {
			if (response.success) {
				this.emit(TaskServiceEvents.Terminated, {});
				this.run(task);
			} else {
				this.messageService.show(Severity.Warning, nls.localize('TaskSystem.restartFailed', 'Failed to terminate and restart task {0}', Types.isString(task) ? task : task.name));
			}
			return response;
		});
	}

	public terminate(task: string | Task): TPromise<TerminateResponse> {
		if (!this._taskSystem) {
			return TPromise.as({ success: true });
		}
		const id: string = Types.isString(task) ? task : task._id;
		return this._taskSystem.terminate(id).then((response) => {
			if (response.success) {
				this.emit(TaskServiceEvents.Terminated, {});
			}
			return response;
		});
	}

	public terminateAll(): TPromise<TerminateResponse> {
		if (!this._taskSystem) {
			return TPromise.as({ success: true });
		}
		return this._taskSystem.terminateAll().then((response) => {
			this.emit(TaskServiceEvents.Terminated, {});
			return response;
		});
	}

	private getTaskSystem(): ITaskSystem {
		if (this._taskSystem) {
			return this._taskSystem;
		}
		let engine = this.getExecutionEngine();
		if (engine === ExecutionEngine.Terminal) {
			this._taskSystem = new TerminalTaskSystem(
				this.terminalService, this.outputService, this.markerService,
				this.modelService, this.configurationResolverService, this.telemetryService,
				this.workbenchEditorService,
				TaskService.OutputChannelId
			);
		} else {
			let system = new ProcessTaskSystem(
				this.markerService, this.modelService, this.telemetryService, this.outputService,
				this.configurationResolverService, TaskService.OutputChannelId,
			);
			system.hasErrors(this._configHasErrors);
			this._taskSystem = system;
		}
		this.taskSystemListeners.push(this._taskSystem.addListener2(TaskSystemEvents.Active, (event) => this.emit(TaskServiceEvents.Active, event)));
		this.taskSystemListeners.push(this._taskSystem.addListener2(TaskSystemEvents.Inactive, (event) => this.emit(TaskServiceEvents.Inactive, event)));
		return this._taskSystem;
	}

	private getTaskSets(): TPromise<TaskSet[]> {
		return new TPromise<TaskSet[]>((resolve, reject) => {
			let result: TaskSet[] = [];
			let counter: number = 0;
			let done = (value: TaskSet) => {
				if (value) {
					result.push(value);
				}
				if (--counter === 0) {
					resolve(result);
				}
			};
			let error = () => {
				if (--counter === 0) {
					resolve(result);
				}
			};
			if (this.getExecutionEngine() === ExecutionEngine.Terminal) {
				this.providers.forEach((provider) => {
					counter++;
					provider.provideTasks().done(done, error);
				});
			}
			// Do this last since the then of a resolved promise returns immediatelly.
			counter++;
			this.getWorkspaceTasks().done(done, error);
		});
	}

	private getWorkspaceTasks(): TPromise<TaskSet> {
		if (this._workspaceTasksPromise) {
			return this._workspaceTasksPromise;
		}
		this._workspaceTasksPromise = this.computeWorkspaceTasks().then(value => {
			this._configHasErrors = value.hasErrors;
			if (this._taskSystem instanceof ProcessTaskSystem) {
				this._taskSystem.hasErrors(this._configHasErrors);
			}
			return value.set;
		});
		return this._workspaceTasksPromise;
	}

	private updateWorkspaceTasks(): void {
		this._workspaceTasksPromise = this.computeWorkspaceTasks().then(value => {
			this._configHasErrors = value.hasErrors;
			return value.set;
		});
	}

	private computeWorkspaceTasks(): TPromise<WorkspaceTaskResult> {
		let configPromise: TPromise<WorkspaceConfigurationResult>;
		{
			let { config, hasParseErrors } = this.getConfiguration();
			if (hasParseErrors) {
				return TPromise.as({ set: undefined, hasErrors: true });
			}
			if (config) {
				let engine = TaskConfig.ExecutionEngine.from(config);
				if (engine === ExecutionEngine.Process && this.hasDetectorSupport(config)) {
					configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService, config).detect(true).then((value): WorkspaceConfigurationResult => {
						let hasErrors = this.printStderr(value.stderr);
						let detectedConfig = value.config;
						if (!detectedConfig) {
							return { config, hasErrors };
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
						return { config: result, hasErrors };
					});
				} else {
					configPromise = TPromise.as({ config, hasErrors: false });
				}
			} else {
				configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService).detect(true).then((value) => {
					let hasErrors = this.printStderr(value.stderr);
					return { config: value.config, hasErrors };
				});
			}
		}
		return configPromise.then((resolved) => {
			return ProblemMatcherRegistry.onReady().then((): WorkspaceTaskResult => {
				if (!resolved || !resolved.config) {
					return { set: undefined, hasErrors: resolved !== void 0 ? resolved.hasErrors : false };
				}
				let problemReporter = new ProblemReporter(this.outputChannel);
				let parseResult = TaskConfig.parse(resolved.config, problemReporter);
				let hasErrors = false;
				if (!parseResult.validationStatus.isOK()) {
					hasErrors = true;
					this.showOutput();
				}
				if (problemReporter.status.isFatal()) {
					problemReporter.fatal(nls.localize('TaskSystem.configurationErrors', 'Error: the provided task configuration has validation errors and can\'t not be used. Please correct the errors first.'));
					return { set: undefined, hasErrors };
				}
				return { set: { tasks: parseResult.tasks }, hasErrors };
			});
		});
	}

	private getExecutionEngine(): ExecutionEngine {
		let { config } = this.getConfiguration();
		if (!config) {
			return ExecutionEngine.Process;
		}
		return TaskConfig.ExecutionEngine.from(config);
	}

	private getConfiguration(): { config: TaskConfig.ExternalTaskRunnerConfiguration; hasParseErrors: boolean } {
		let result = this.configurationService.getConfiguration<TaskConfig.ExternalTaskRunnerConfiguration>('tasks');
		if (!result) {
			return { config: undefined, hasParseErrors: false };
		}
		let parseErrors: string[] = (result as any).$parseErrors;
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
				this.showOutput();
				return { config: undefined, hasParseErrors: true };
			}
		}
		return { config: result, hasParseErrors: false };
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
		return this._taskSystem instanceof TerminalTaskSystem;
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

	public beforeShutdown(): boolean | TPromise<boolean> {
		if (this._taskSystem && this._taskSystem.isActiveSync()) {
			if (this._taskSystem.canAutoTerminate() || this.messageService.confirm({
				message: nls.localize('TaskSystem.runningTask', 'There is a task running. Do you want to terminate it?'),
				primaryButton: nls.localize({ key: 'TaskSystem.terminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task")
			})) {
				return this._taskSystem.terminateAll().then((response) => {
					if (response.success) {
						this.emit(TaskServiceEvents.Terminated, {});
						this._taskSystem = null;
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
						this.run(task);
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
			this.getActiveTasks().then((activeTasks) => {
				if (activeTasks.length === 0) {
					return;
				}
				if (activeTasks.length === 1) {
					this.terminate(activeTasks[0]);
				} else {
					this.quickOpenService.show('terminate task ');
				}
			});
		} else {
			this.isActive().then((active) => {
				if (active) {
					this.terminateAll().then((response) => {
						if (response.success) {
							return;
						}
						if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
							this.messageService.show(Severity.Error, nls.localize('TerminateAction.noProcess', 'The launched process doesn\'t exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes.'));
						} else {
							this.messageService.show(Severity.Error, nls.localize('TerminateAction.failed', 'Failed to terminate running task'));
						}
					});
				}
			});
		}
	}

	private runRestartTaskCommand(accessor: ServicesAccessor, arg: any): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.inTerminal()) {
			this.getActiveTasks().then((activeTasks) => {
				if (activeTasks.length === 0) {
					return;
				}
				if (activeTasks.length === 1) {
					this.restart(activeTasks[0]);
				} else {
					this.quickOpenService.show('restart task ');
				}
			});
		} else {
			this.getActiveTasks().then((activeTasks) => {
				if (activeTasks.length === 0) {
					return;
				}
				let task = activeTasks[0];
				this.restart(task);
			});
		}
	}
}


let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT), 'Configure Task Runner', tasksCategory);

MenuRegistry.addCommand({ id: 'workbench.action.tasks.showLog', title: { value: nls.localize('ShowLogAction.label', "Show Task Log"), original: 'Show Task Log' }, category: { value: tasksCategory, original: 'Tasks' } });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.runTask', title: { value: nls.localize('RunTaskAction.label', "Run Task"), original: 'Run Task' }, category: { value: tasksCategory, original: 'Tasks' } });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.restartTask', title: { value: nls.localize('RestartTaskAction.label', "Restart Task"), original: 'Restart Task' }, category: { value: tasksCategory, original: 'Tasks' } });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.terminate', title: { value: nls.localize('TerminateAction.label', "Terminate Running Task"), original: 'Terminate Running Task' }, category: { value: tasksCategory, original: 'Tasks' } });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.build', title: { value: nls.localize('BuildAction.label', "Run Build Task"), original: 'Run Build Task' }, category: { value: tasksCategory, original: 'Tasks' } });
MenuRegistry.addCommand({ id: 'workbench.action.tasks.test', title: { value: nls.localize('TestAction.label', "Run Test Task"), original: 'Run Test Task' }, category: { value: tasksCategory, original: 'Tasks' } });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.rebuild', title: nls.localize('RebuildAction.label', 'Run Rebuild Task'), category: tasksCategory });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.clean', title: nls.localize('CleanAction.label', 'Run Clean Task'), category: tasksCategory });

// Task Service
registerSingleton(ITaskService, TaskService);

// Register Quick Open
const quickOpenRegistry = (<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen));

quickOpenRegistry.registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/tasks/browser/taskQuickOpen',
		'QuickOpenHandler',
		'task ',
		nls.localize('quickOpen.task', "Run Task")
	)
);

quickOpenRegistry.registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/tasks/browser/terminateQuickOpen',
		'QuickOpenHandler',
		'terminate task ',
		nls.localize('quickOpen.terminateTask', "Terminate Task")
	)
);

quickOpenRegistry.registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/tasks/browser/restartQuickOpen',
		'QuickOpenHandler',
		'restart task ',
		nls.localize('quickOpen.restartTask', "Restart Task")
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
