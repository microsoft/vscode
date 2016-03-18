/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/task.contribution';
import 'vs/workbench/parts/tasks/browser/taskQuickOpen';

import * as nls from 'vs/nls';
import * as Env from 'vs/base/common/flags';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import * as Objects from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import { Action } from 'vs/base/common/actions';
import * as Dom from 'vs/base/browser/dom';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { EventEmitter, ListenerUnbind } from 'vs/base/common/eventEmitter';
import * as Builder from 'vs/base/browser/builder';
import * as Types from 'vs/base/common/types';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { match } from 'vs/base/common/glob';
import { setTimeout } from 'vs/base/common/platform';
import { TerminateResponse } from 'vs/base/common/processes';

import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEventService } from 'vs/platform/event/common/event';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IMarkerService, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService, ConfigurationServiceEventTypes } from 'vs/platform/configuration/common/configuration';
import { IFileService, FileChangesEvent, FileChangeType, EventType as FileEventType } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';

import jsonContributionRegistry = require('vs/platform/jsonschemas/common/jsonContributionRegistry');
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';

import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IStatusbarItem, IStatusbarRegistry, Extensions as StatusbarExtensions, StatusbarItemDescriptor, StatusbarAlignment }  from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';

import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';

import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';
import { ITextFileService, EventType } from 'vs/workbench/parts/files/common/files';
import { IOutputService, IOutputChannelRegistry, Extensions as OutputExt } from 'vs/workbench/parts/output/common/output';

import { ITaskSystem, ITaskSummary, ITaskRunResult, TaskError, TaskErrors, TaskConfiguration, TaskDescription, TaskSystemEvents } from 'vs/workbench/parts/tasks/common/taskSystem';
import { ITaskService, TaskServiceEvents } from 'vs/workbench/parts/tasks/common/taskService';
import { templates as taskTemplates } from 'vs/workbench/parts/tasks/common/taskTemplates';

import { LanguageServiceTaskSystem, LanguageServiceTaskConfiguration }  from 'vs/workbench/parts/tasks/common/languageServiceTaskSystem';
import * as FileConfig  from 'vs/workbench/parts/tasks/node/processRunnerConfiguration';
import { ProcessRunnerSystem } from 'vs/workbench/parts/tasks/node/processRunnerSystem';
import { ProcessRunnerDetector }  from 'vs/workbench/parts/tasks/node/processRunnerDetector';

let $ = Builder.$;

class AbstractTaskAction extends Action {

	protected taskService: ITaskService;
	protected telemetryService: ITelemetryService;

	constructor(id:string, label:string, @ITaskService taskService:ITaskService,
		@ITelemetryService telemetryService: ITelemetryService) {

		super(id, label);
		this.taskService = taskService;
		this.telemetryService = telemetryService;
	}
}

class BuildAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.build';
	public static TEXT = nls.localize('BuildAction.label','Run Build Task');

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, label, taskService, telemetryService);
	}

	public run(): Promise {
		return this.taskService.build();
	}
}

class TestAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.test';
	public static TEXT = nls.localize('TestAction.label','Run Test Task');

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, label, taskService, telemetryService);
	}

	public run(): Promise {
		return this.taskService.runTest();
	}
}

class RebuildAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.rebuild';
	public static TEXT = nls.localize('RebuildAction.label', 'Run Rebuild Task');

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, label, taskService, telemetryService);
	}

	public run(): Promise {
		return this.taskService.rebuild();
	}
}

class CleanAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.clean';
	public static TEXT = nls.localize('CleanAction.label', 'Run Clean Task');

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, label, taskService, telemetryService);
	}

	public run(): Promise {
		return this.taskService.clean();
	}
}

class ConfigureTaskRunnerAction extends Action {

	public static ID = 'workbench.action.tasks.configureTaskRunner';
	public static TEXT = nls.localize('ConfigureTaskRunnerAction.label', 'Configure Task Runner');

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
		@IMessageService messageService: IMessageService, @IQuickOpenService quickOpenService: IQuickOpenService) {

		super(id, label);
		this.configurationService = configurationService;
		this.editorService = editorService;
		this.fileService = fileService;
		this.contextService = contextService;
		this.outputService = outputService;
		this.messageService = messageService;
		this.quickOpenService = quickOpenService;
	}

	public run(event?:any): TPromise<IEditor> {
		if (!this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('ConfigureTaskRunnerAction.noWorkspace', 'Tasks are only available on a workspace folder.'));
			return TPromise.as(undefined);
		}
		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		return this.fileService.resolveFile(this.contextService.toResource('.vscode/tasks.json')).then((success) => {
			return success;
		}, (err:any) => {
			;
			return this.quickOpenService.pick(taskTemplates, { placeHolder: nls.localize('ConfigureTaskRunnerAction.quickPick.template', 'Select a Task Runner')}).then(selection => {
				if (!selection) {
					return undefined;
				}
				let contentPromise: TPromise<string>;
				if (selection.autoDetect) {
					this.outputService.showOutput(TaskService.OutputChannel);
					this.outputService.append(TaskService.OutputChannel, nls.localize('ConfigureTaskRunnerAction.autoDetecting', 'Auto detecting tasks for {0}', selection.id) + '\n');
					let detector = new ProcessRunnerDetector(this.fileService, this.contextService, new SystemVariables(this.editorService, this.contextService));
					contentPromise = detector.detect(false, selection.id).then((value) => {
						let config = value.config;
						if (value.stderr && value.stderr.length > 0) {
							value.stderr.forEach((line) => {
								this.outputService.append(TaskService.OutputChannel, line + '\n');
							});
							this.messageService.show(Severity.Warning, nls.localize('ConfigureTaskRunnerAction.autoDetect', 'Auto detecting the task system failed. Using default template. Consult the task output for details.'));
							return selection.content;
						} else if (config) {
							if (value.stdout && value.stdout.length > 0) {
								value.stdout.forEach(line => this.outputService.append(TaskService.OutputChannel, line + '\n'));
							}
							let content = JSON.stringify(config, null, '\t');
							content = [
								'{',
									'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
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
					forceOpen: true
				}
			}, sideBySide);
		}, (error) => {
			throw new Error(nls.localize('ConfigureTaskRunnerAction.failed', "Unable to create the 'tasks.json' file inside the '.vscode' folder. Consult the task output for details."));
		});
	}
}

class CloseMessageAction extends Action {

	public static ID = 'workbench.action.build.closeMessage';
	public static TEXT = nls.localize('CloseMessageAction.label', 'Close');

	public closeFunction: () => void;

	constructor() {
		super(CloseMessageAction.ID, CloseMessageAction.TEXT);
	}
	public run(): Promise {
		if (this.closeFunction) {
			this.closeFunction();
		}
		return TPromise.as(null);
	}
}

class TerminateAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.terminate';
	public static TEXT = nls.localize('TerminateAction.label', 'Terminate Running Task');

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, label, taskService, telemetryService);
	}

	public run(): Promise {
		return this.taskService.isActive().then((active) => {
			if (active) {
				return this.taskService.terminate().then((response) => {
					if (response.success) {
						return;
					} else {
						return Promise.wrapError(nls.localize('TerminateAction.failed', 'Failed to terminate running task'));
					}
				});
			}
		});
	}
}

class ShowLogAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.showLog';
	public static TEXT = nls.localize('ShowLogAction.label', 'Show Task Log');

	private outputService: IOutputService;

	constructor(id: string, label: string, @ITaskService taskService:ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IOutputService outputService:IOutputService) {

		super(id, label, taskService, telemetryService);
		this.outputService = outputService;
	}

	public run(): Promise {
		return this.outputService.showOutput(TaskService.OutputChannel);
	}
}

class RunTaskAction extends Action {

	public static ID = 'workbench.action.tasks.runTask';
	public static TEXT = nls.localize('RunTaskAction.label', "Run Task");
	private quickOpenService: IQuickOpenService;

	constructor(id: string, label: string, @IQuickOpenService quickOpenService:IQuickOpenService) {
		super(id, label);
		this.quickOpenService = quickOpenService;
	}

	public run(event?:any): Promise {
		this.quickOpenService.show('task ');
		return TPromise.as(null);
	}
}


class StatusBarItem implements IStatusbarItem {

	private quickOpenService: IQuickOpenService;
	private markerService: IMarkerService;
	private taskService:ITaskService;
	private outputService: IOutputService;

	private intervalToken: any;
	private activeCount: number;
	private static progressChars:string = '|/-\\';

	constructor(@IQuickOpenService quickOpenService:IQuickOpenService,
		@IMarkerService markerService:IMarkerService, @IOutputService outputService:IOutputService,
		@ITaskService taskService:ITaskService) {

		this.quickOpenService = quickOpenService;
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

		callOnDispose.push(Dom.addDisposableListener(label, 'click', (e:MouseEvent) => {
			this.quickOpenService.show('!');
		}));

		let updateStatus = (element:HTMLDivElement, stats:number): boolean => {
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

		callOnDispose.push(this.taskService.addListener2(TaskServiceEvents.Inactive, (data:TaskServiceEventData) => {
			this.activeCount--;
			if (this.activeCount === 0) {
				$(progress).hide();
				clearInterval(this.intervalToken);
				this.intervalToken = null;
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
				callOnDispose = disposeAll(callOnDispose);
			}
		};
	}
}

interface TaskServiceEventData {
	error?: any;
}

class TaskService extends EventEmitter implements ITaskService {
	public serviceId = ITaskService;
	public static SERVICE_ID: string = 'taskService';
	public static OutputChannel:string = 'Tasks';

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
	private eventService: IEventService;
	private modelService: IModelService;
	private extensionService: IExtensionService;
	private quickOpenService: IQuickOpenService;

	private _taskSystemPromise: TPromise<ITaskSystem>;
	private _taskSystem: ITaskSystem;
	private taskSystemListeners: ListenerUnbind[];
	private clearTaskSystemPromise: boolean;

	private fileChangesListener: ListenerUnbind;

	constructor(@IModeService modeService: IModeService, @IConfigurationService configurationService: IConfigurationService,
		@IMarkerService markerService: IMarkerService, @IOutputService outputService: IOutputService,
		@IMessageService messageService: IMessageService, @IWorkbenchEditorService editorService:IWorkbenchEditorService,
		@IFileService fileService:IFileService, @IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService, @ITextFileService textFileService:ITextFileService,
		@ILifecycleService lifecycleService: ILifecycleService, @IEventService eventService: IEventService,
		@IModelService modelService: IModelService, @IExtensionService extensionService: IExtensionService,
		@IQuickOpenService quickOpenService: IQuickOpenService) {

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
		this.eventService = eventService;
		this.modelService = modelService;
		this.extensionService = extensionService;
		this.quickOpenService = quickOpenService;

		this.taskSystemListeners = [];
		this.clearTaskSystemPromise = false;
		this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, () => {
			this.emit(TaskServiceEvents.ConfigChanged);
			if (this._taskSystem && this._taskSystem.isActiveSync()) {
				this.clearTaskSystemPromise = true;
			} else {
				this._taskSystem = null;
				this._taskSystemPromise = null;
			}
			this.disposeTaskSystemListeners();
		});

		lifecycleService.addBeforeShutdownParticipant(this);
	}

	private disposeTaskSystemListeners(): void {
		this.taskSystemListeners.forEach(unbind => unbind());
		this.taskSystemListeners = [];
	}

	private disposeFileChangesListener(): void {
		if (this.fileChangesListener) {
			this.fileChangesListener();
			this.fileChangesListener = null;
		}
	}

	private get taskSystemPromise(): TPromise<ITaskSystem> {
		if (!this._taskSystemPromise) {
			let variables = new SystemVariables(this.editorService, this.contextService);
			let clearOutput = true;
			this._taskSystemPromise = this.configurationService.loadConfiguration('tasks').then((config: TaskConfiguration) => {
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
						this.outputService.append(TaskService.OutputChannel, nls.localize('TaskSystem.invalidTaskJson', 'Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task.\n'));
						this.outputService.showOutput(TaskService.OutputChannel, true);
						return TPromise.wrapError({});
					}
				}
				let configPromise: TPromise<TaskConfiguration>;
				if (config) {
					if (this.isRunnerConfig(config) && this.hasDetectorSupport(<FileConfig.ExternalTaskRunnerConfiguration>config)) {
						let fileConfig = <FileConfig.ExternalTaskRunnerConfiguration>config;
						configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, variables, fileConfig).detect(true).then((value) => {
							clearOutput = this.printStderr(value.stderr);
							let detectedConfig = value.config;
							if (!detectedConfig) {
								return config;
							}
							let result: FileConfig.ExternalTaskRunnerConfiguration = Objects.clone(fileConfig);
							let configuredTasks: IStringDictionary<FileConfig.TaskDescription> = Object.create(null);
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
						configPromise = TPromise.as<TaskConfiguration>(config);
					}
				} else {
					configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, variables).detect(true).then((value) => {
						clearOutput = this.printStderr(value.stderr);
						return value.config;
					});
				}
				return configPromise.then((config) => {
					if (!config) {
						this._taskSystemPromise = null;
						throw new TaskError(Severity.Info, nls.localize('TaskSystem.noConfiguration', 'No task runner configured.'), TaskErrors.NotConfigured);
					}
					let result: ITaskSystem = null;
					if (config.buildSystem === 'service') {
						result = new LanguageServiceTaskSystem(<LanguageServiceTaskConfiguration>config, this.telemetryService, this.modeService);
					} else if (this.isRunnerConfig(config)) {
						result = new ProcessRunnerSystem(<FileConfig.ExternalTaskRunnerConfiguration>config, variables, this.markerService, this.modelService, this.telemetryService, this.outputService, TaskService.OutputChannel, clearOutput);
					}
					if (result === null) {
						this._taskSystemPromise = null;
						throw new TaskError(Severity.Info, nls.localize('TaskSystem.noBuildType', "No valid task runner configured. Supported task runners are 'service' and 'program'."), TaskErrors.NoValidTaskRunner);
					}
					this.taskSystemListeners.push(result.addListener(TaskSystemEvents.Active, (event) => this.emit(TaskServiceEvents.Active, event)));
					this.taskSystemListeners.push(result.addListener(TaskSystemEvents.Inactive, (event) => this.emit(TaskServiceEvents.Inactive, event)));
					this._taskSystem = result;
					return result;
				}, (err: any) => {
					this.handleError(err);
					return Promise.wrapError(err);
				});
			});
		}
		return this._taskSystemPromise;
	}

	private printStderr(stderr: string[]): boolean {
		let result = true;
		if (stderr && stderr.length > 0) {
			stderr.forEach((line) => {
				result = false;
				this.outputService.append(TaskService.OutputChannel, line + '\n');
			});
			this.outputService.showOutput(TaskService.OutputChannel, true);
		}
		return result;
	}

	private isRunnerConfig(config: TaskConfiguration): boolean {
		return !config.buildSystem || config.buildSystem === 'program';
	}

	private hasDetectorSupport(config: FileConfig.ExternalTaskRunnerConfiguration): boolean {
		if (!config.command) {
			return false;
		}
		return ProcessRunnerDetector.supports(config.command);
	}

	public configureAction(): Action {
		return new ConfigureTaskRunnerAction(ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT,
			this.configurationService, this.editorService, this.fileService, this.contextService,
			this.outputService, this.messageService, this.quickOpenService);
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

	private executeTarget(fn: (taskSystem: ITaskSystem) => ITaskRunResult): TPromise<ITaskSummary> {
		return this.textFileService.saveAll().then((value) => {
			return this.taskSystemPromise.
				then((taskSystem) => {
					return taskSystem.isActive().then((active) => {
						if (!active) {
							return fn(taskSystem);
						} else {
							throw new TaskError(Severity.Warning, nls.localize('TaskSystem.active', 'There is an active running task right now. Terminate it first before executing another task.'), TaskErrors.RunningTask);
						}
					});
				}).
				then((runResult: ITaskRunResult) => {
					if (runResult.restartOnFileChanges) {
						let pattern = runResult.restartOnFileChanges;
						this.fileChangesListener = this.eventService.addListener(FileEventType.FILE_CHANGES, (event: FileChangesEvent) => {
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
					return runResult.promise.then((value) => {
						if (this.clearTaskSystemPromise) {
							this._taskSystemPromise = null;
							this.clearTaskSystemPromise = false;
						}
						return value;
					});
				}, (err: any) => {
					this.handleError(err);
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
		return TPromise.as( { success: true} );
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

	private handleError(err:any):void {
		let showOutput = true;
		if (err instanceof TaskError) {
			let buildError = <TaskError>err;
			let needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
			let needsTerminate = buildError.code === TaskErrors.RunningTask;
			if (needsConfig || needsTerminate) {
				let closeAction = new CloseMessageAction();
				let action = needsConfig
					? this.configureAction()
					: new TerminateAction(TerminateAction.ID, TerminateAction.TEXT, this, this.telemetryService);

				closeAction.closeFunction = this.messageService.show(buildError.severity, { message: buildError.message, actions: [closeAction, action ] });
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
			this.outputService.showOutput(TaskService.OutputChannel, true);
		}
	}
}

export class TaskServiceParticipant implements IWorkbenchContribution {
	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		// Force loading the language worker service
		this.instantiationService.getInstance(ITaskService);
	}
	public getId(): string {
		return 'vs.taskService';
	}
}

let tasksCategory = nls.localize('tasksCategory', "Tasks");
let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT), tasksCategory);
if (Env.enableTasks) {

	// Task Service
	registerSingleton(ITaskService, TaskService);

	// Actions
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(BuildAction, BuildAction.ID, BuildAction.TEXT, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B }), tasksCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(TestAction, TestAction.ID, TestAction.TEXT, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }), tasksCategory);
	// workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(RebuildAction, RebuildAction.ID, RebuildAction.TEXT), tasksCategory);
	// workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CleanAction, CleanAction.ID, CleanAction.TEXT), tasksCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(TerminateAction, TerminateAction.ID, TerminateAction.TEXT), tasksCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowLogAction, ShowLogAction.ID, ShowLogAction.TEXT), tasksCategory);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(RunTaskAction, RunTaskAction.ID, RunTaskAction.TEXT), tasksCategory);

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
	outputChannelRegistry.registerChannel(TaskService.OutputChannel);

	(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(TaskServiceParticipant);

	// tasks.json validation
	let schemaId = 'vscode://schemas/tasks';
	let schema : IJSONSchema =
		{
			'id': schemaId,
			'description': 'Task definition file',
			'type': 'object',
			'default': {
				'version': '0.1.0',
				'command': 'myCommand',
				'isShellCommand': false,
				'args': [],
				'showOutput': 'always',
				'tasks': [
					{
						'taskName': 'build',
						'showOutput': 'silent',
						'isBuildCommand': true,
						'problemMatcher': ['$tsc', '$lessCompile']
					}
				]
			},
			'definitions': {
				'showOutputType': {
					'type': 'string',
					'enum': ['always', 'silent', 'never'],
					'default': 'silent'
				},
				'patternType': {
					'anyOf': [
						{
							'type': 'string',
							'enum': ['$tsc', '$tsc-watch' ,'$msCompile', '$lessCompile', '$gulp-tsc', '$cpp', '$csc', '$vb', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish']
						},
						{
							'$ref': '#/definitions/pattern'
						},
						{
							'type': 'array',
							'items': {
								'$ref': '#/definitions/pattern'
							}
						}
					]
				},
				'pattern': {
					'default': {
						'regexp': '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
						'file': 1,
						'location': 2,
						'message': 3
					},
					'additionalProperties': false,
					'properties': {
						'regexp': {
							'type': 'string',
							'description': nls.localize('JsonSchema.pattern.regexp', 'The regular expression to find an error, warning or info in the output.')
						},
						'file': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.file', 'The match group index of the filename. If omitted 1 is used.')
						},
						'location': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.location', 'The match group index of the problem\'s location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted line and column is assumed.')
						},
						'line': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.line', 'The match group index of the problem\'s line. Defaults to 2')
						},
						'column': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.column', 'The match group index of the problem\'s column. Defaults to 3')
						},
						'endLine': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.endLine', 'The match group index of the problem\'s end line. Defaults to undefined')
						},
						'endColumn': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.endColumn', 'The match group index of the problem\'s end column. Defaults to undefined')
						},
						'severity': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.severity', 'The match group index of the problem\'s severity. Defaults to undefined')
						},
						'code': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.code', 'The match group index of the problem\'s code. Defaults to undefined')
						},
						'message': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.pattern.message', 'The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.')
						},
						'loop': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.pattern.loop', 'In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.')
						}
					}
				},
				'problemMatcherType': {
					'oneOf': [
						{
							'type': 'string',
							'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish']
						},
						{
							'$ref': '#/definitions/problemMatcher'
						},
						{
							'type': 'array',
							'items': {
								'anyOf': [
									{
										'$ref': '#/definitions/problemMatcher'
									},
									{
										'type': 'string',
										'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish']
									}
								]
							}
						}
					]
				},
				'watchingPattern': {
					'type': 'object',
					'additionalProperties': false,
					'properties': {
						'regexp': {
							'type': 'string',
							'description': nls.localize('JsonSchema.watchingPattern.regexp', 'The regular expression to detect the begin or end of a watching task.')
						},
						'file': {
							'type': 'integer',
							'description': nls.localize('JsonSchema.watchingPattern.file', 'The match group index of the filename. Can be omitted.')
						},
					}
				},
				'problemMatcher': {
					'type': 'object',
					'additionalProperties': false,
					'properties': {
						'base': {
							'type': 'string',
							'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish'],
							'description': nls.localize('JsonSchema.problemMatcher.base', 'The name of a base problem matcher to use.')
						},
						'owner': {
							'type': 'string',
							'description': nls.localize('JsonSchema.problemMatcher.owner', 'The owner of the problem inside Code. Can be omitted if base is specified. Defaults to \'external\' if omitted and base is not specified.')
						},
						'severity': {
							'type': 'string',
							'enum': ['error', 'warning', 'info'],
							'description': nls.localize('JsonSchema.problemMatcher.severity', 'The default severity for captures problems. Is used if the pattern doesn\'t define a match group for severity.')
						},
						'applyTo': {
							'type': 'string',
							'enum': ['allDocuments', 'openDocuments', 'closedDocuments'],
							'description': nls.localize('JsonSchema.problemMatcher.applyTo', 'Controls if a problem reported on a text document is applied only to open, closed or all documents.')
						},
						'pattern': {
							'$ref': '#/definitions/patternType',
							'description': nls.localize('JsonSchema.problemMatcher.pattern', 'A problem pattern or the name of a predefined problem pattern. Can be omitted if base is specified.')
						},
						'fileLocation': {
							'oneOf': [
								{
									'type': 'string',
									'enum': ['absolute', 'relative']
								},
								{
									'type': 'array',
									'items': {
										'type': 'string'
									}
								}
							],
							'description': nls.localize('JsonSchema.problemMatcher.fileLocation', 'Defines how file names reported in a problem pattern should be interpreted.')
						},
						'watching': {
							'type': 'object',
							'additionalProperties': false,
							'properties': {
								'activeOnStart': {
									'type': 'boolean',
									'description': nls.localize('JsonSchema.problemMatcher.watching.activeOnStart', 'If set to true the watcher is in active mode when the task starts. This is equals of issuing a line that matches the beginPattern')
								},
								'beginsPattern': {
									'oneOf': [
										{
											'type': 'string'
										},
										{
											'type': '#/definitions/watchingPattern'
										}
									],
									'description': nls.localize('JsonSchema.problemMatcher.watching.beginsPattern', 'If matched in the output the start of a watching task is signaled.')
								},
								'endsPattern': {
									'oneOf': [
										{
											'type': 'string'
										},
										{
											'type': '#/definitions/watchingPattern'
										}
									],
									'description': nls.localize('JsonSchema.problemMatcher.watching.endsPattern', 'If matched in the output the end of a watching task is signaled.')
								}
							}
						},
						'watchedTaskBeginsRegExp': {
							'type': 'string',
							'description': nls.localize('JsonSchema.problemMatcher.watchedBegin', 'A regular expression signaling that a watched tasks begins executing triggered through file watching.')
						},
						'watchedTaskEndsRegExp': {
							'type': 'string',
							'description': nls.localize('JsonSchema.problemMatcher.watchedEnd', 'A regular expression signaling that a watched tasks ends executing.')
						}
					}
				},
				'baseTaskRunnerConfiguration': {
					'type': 'object',
					'properties': {
						'command': {
							'type': 'string',
							'description': nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
						},
						'isShellCommand': {
							'type': 'boolean',
							'default': true,
							'description': nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
						},
						'args': {
							'type': 'array',
							'description': nls.localize('JsonSchema.args', 'Additional arguments passed to the command.'),
							'items': {
								'type': 'string'
							}
						},
						'options': {
							'type': 'object',
							'description': nls.localize('JsonSchema.options', 'Additional command options'),
							'properties': {
								'cwd': {
									'type': 'string',
									'description': nls.localize('JsonSchema.options.cwd', 'The current working directory of the executed program or script. If omitted Code\'s current workspace root is used.')
								},
								'env': {
									'type': 'object',
									'additionalProperties': {
										'type': 'string'
									},
									'description': nls.localize('JsonSchema.options.env', 'The environment of the executed program or shell. If omitted the parent process\' environment is used.')
								}
							},
							'additionalProperties': {
								'type': ['string', 'array', 'object']
							}
						},
						'showOutput': {
							'$ref': '#/definitions/showOutputType',
							'description': nls.localize('JsonSchema.showOutput', 'Controls whether the output of the running task is shown or not. If omitted \'always\' is used.')
						},
						'isWatching': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.watching', 'Whether the executed task is kept alive and is watching the file system.'),
							'default': true
						},
						'promptOnClose': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.promptOnClose', 'Whether the user is prompted when VS Code closes with a running background task.'),
							'default': false
						},
						'echoCommand': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.echoCommand', 'Controls whether the executed command is echoed to the output. Default is false.'),
							'default': true
						},
						'suppressTaskName': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.suppressTaskName', 'Controls whether the task name is added as an argument to the command. Default is false.'),
							'default': true
						},
						'taskSelector': {
							'type': 'string',
							'description': nls.localize('JsonSchema.taskSelector', 'Prefix to indicate that an argument is task.')
						},
						'problemMatcher': {
							'$ref': '#/definitions/problemMatcherType',
							'description': nls.localize('JsonSchema.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
						},
						'tasks': {
							'type': 'array',
							'description': nls.localize('JsonSchema.tasks', 'The task configurations. Usually these are enrichments of task already defined in the external task runner.'),
							'items': {
								'type': 'object',
								'$ref': '#/definitions/taskDescription'
							}
						}
					}
				},
				'taskDescription': {
					'type': 'object',
					'required': ['taskName'],
					'additionalProperties': false,
					'properties': {
						'taskName': {
							'type': 'string',
							'description': nls.localize('JsonSchema.tasks.taskName', "The task's name")
						},
						'args': {
							'type': 'array',
							'description': nls.localize('JsonSchema.tasks.args', 'Additional arguments passed to the command when this task is invoked.'),
							'items': {
								'type': 'string'
							}
						},
						'suppressTaskName': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.tasks.suppressTaskName', 'Controls whether the task name is added as an argument to the command. If omitted the globally defined value is used.'),
							'default': true
						},
						'showOutput': {
							'$ref': '#/definitions/showOutputType',
							'description': nls.localize('JsonSchema.tasks.showOutput', 'Controls whether the output of the running task is shown or not. If omitted the globally defined value is used.')
						},
						'echoCommand': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.echoCommand', 'Controls whether the executed command is echoed to the output. Default is false.'),
							'default': true
						},
						'isWatching': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.tasks.watching', 'Whether the executed task is kept alive and is watching the file system.'),
							'default': true
						},
						'isBuildCommand': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.tasks.build', 'Maps this task to Code\'s default build command.'),
							'default': true
						},
						'isTestCommand': {
							'type': 'boolean',
							'description': nls.localize('JsonSchema.tasks.test', 'Maps this task to Code\'s default test command.'),
							'default': true
						},
						'problemMatcher': {
							'$ref': '#/definitions/problemMatcherType',
							'description': nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
						}
					},
					'defaultSnippets': [
						{
							'label': 'Empty task',
							'body': {
								'taskName': '{{taskName}}'
							}
						}
					]
				}
			},
			'allOf': [
				{
					'type': 'object',
					'required': ['version'],
					'properties': {
						'version': {
							'type': 'string',
							'enum': ['0.1.0'],
							'description': nls.localize('JsonSchema.version', 'The config\'s version number')
						},
						'windows': {
							'$ref': '#/definitions/baseTaskRunnerConfiguration',
							'description': nls.localize('JsonSchema.windows', 'Windows specific build configuration')
						},
						'osx': {
							'$ref': '#/definitions/baseTaskRunnerConfiguration',
							'description': nls.localize('JsonSchema.mac', 'Mac specific build configuration')
						},
						'linux': {
							'$ref': '#/definitions/baseTaskRunnerConfiguration',
							'description': nls.localize('JsonSchema.linux', 'Linux specific build configuration')
						}
					}
				},
				{
					'$ref': '#/definitions/baseTaskRunnerConfiguration'
				}
			]
		};
	let jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
	jsonRegistry.registerSchema(schemaId, schema);
	jsonRegistry.addSchemaFileAssociation('/.vscode/tasks.json', schemaId);
}
