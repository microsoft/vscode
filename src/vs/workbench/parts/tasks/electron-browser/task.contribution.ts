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
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IMarkerService, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

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

import { ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TaskRunnerConfiguration, TaskConfiguration, TaskDescription, TaskSystemEvents } from 'vs/workbench/parts/tasks/common/taskSystem';
import { ITaskService, TaskServiceEvents } from 'vs/workbench/parts/tasks/common/taskService';
import { templates as taskTemplates } from 'vs/workbench/parts/tasks/common/taskTemplates';

import * as FileConfig from 'vs/workbench/parts/tasks/node/processRunnerConfiguration';
import { ProcessRunnerSystem } from 'vs/workbench/parts/tasks/node/processRunnerSystem';
import { TerminalTaskSystem } from './terminalTaskSystem';
import { ProcessRunnerDetector } from 'vs/workbench/parts/tasks/node/processRunnerDetector';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';

let $ = Builder.$;

class AbstractTaskAction extends Action {

	protected taskService: ITaskService;
	protected telemetryService: ITelemetryService;
	protected messageService: IMessageService;
	protected contextService: IWorkspaceContextService;

	constructor(id: string, label: string, @ITaskService taskService: ITaskService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService) {

		super(id, label);
		this.taskService = taskService;
		this.telemetryService = telemetryService;
		this.messageService = messageService;
		this.contextService = contextService;
	}

	protected canRun(): boolean {
		if (!this.contextService.hasWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('AbstractTaskAction.noWorkspace', 'Tasks are only available on a workspace folder.'));
			return false;
		}
		return true;
	}
}

class BuildAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.build';
	public static TEXT = nls.localize('BuildAction.label', "Run Build Task");

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(id, label, taskService, telemetryService, messageService, contextService);
	}

	public run(): TPromise<ITaskSummary> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		return this.taskService.build();
	}
}

class TestAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.test';
	public static TEXT = nls.localize('TestAction.label', "Run Test Task");

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(id, label, taskService, telemetryService, messageService, contextService);
	}

	public run(): TPromise<ITaskSummary> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		return this.taskService.runTest();
	}
}

class RebuildAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.rebuild';
	public static TEXT = nls.localize('RebuildAction.label', 'Run Rebuild Task');

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(id, label, taskService, telemetryService, messageService, contextService);
	}

	public run(): TPromise<ITaskSummary> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		return this.taskService.rebuild();
	}
}

class CleanAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.clean';
	public static TEXT = nls.localize('CleanAction.label', 'Run Clean Task');

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(id, label, taskService, telemetryService, messageService, contextService);
	}

	public run(): TPromise<ITaskSummary> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		return this.taskService.clean();
	}
}

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

class TerminateAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.terminate';
	public static TEXT = nls.localize('TerminateAction.label', "Terminate Running Task");

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label, taskService, telemetryService, messageService, contextService);
	}

	public run(): TPromise<TerminateResponse> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		if (this.taskService.inTerminal()) {
			this.messageService.show(Severity.Info, {
				message: nls.localize('TerminateAction.terminalSystem', 'The tasks are executed in the integrated terminal. Use the terminal to manage the tasks.'),
				actions: [new ViewTerminalAction(this.terminalService), new CloseMessageAction()]
			});
			return undefined;
		} else {
			return this.taskService.isActive().then((active) => {
				if (active) {
					return this.taskService.terminate().then((response) => {
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
				return undefined;
			});
		}
	}
}

class ShowLogAction extends AbstractTaskAction {
	public static ID = 'workbench.action.tasks.showLog';
	public static TEXT = nls.localize('ShowLogAction.label', "Show Task Log");

	private outputService: IOutputService;

	constructor(id: string, label: string, @ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService,
		@IOutputService outputService: IOutputService) {

		super(id, label, taskService, telemetryService, messageService, contextService);
		this.outputService = outputService;
	}

	public run(): TPromise<IEditor> {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		return this.outputService.getChannel(TaskService.OutputChannelId).show(true);
	}
}

class RunTaskAction extends AbstractTaskAction {

	public static ID = 'workbench.action.tasks.runTask';
	public static TEXT = nls.localize('RunTaskAction.label', "Run Task");
	private quickOpenService: IQuickOpenService;

	constructor(id: string, label: string, @IQuickOpenService quickOpenService: IQuickOpenService,
		@ITaskService taskService: ITaskService, @ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(id, label, taskService, telemetryService, messageService, contextService);
		this.quickOpenService = quickOpenService;
	}

	public run(event?: any): Promise {
		if (!this.canRun()) {
			return TPromise.as(undefined);
		}
		this.quickOpenService.show('task ');
		return TPromise.as(null);
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
				let config = this.configurationService.getConfiguration<TaskConfiguration>('tasks');
				if (this._inTerminal && this.isRunnerConfig(config) || !this._inTerminal && this.isTerminalConfig(config)) {
					this.messageService.show(Severity.Info, nls.localize('TaskSystem.noHotSwap', 'Changing the task execution engine requires to restart VS Code. The change is ignored.'));
				}
			}
			this.emit(TaskServiceEvents.ConfigChanged);
			if (this._inTerminal) {
				this.readConfiguration().then((config) => {
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
				let clearOutput = true;
				this._taskSystemPromise = TPromise.as(this.configurationService.getConfiguration<TaskConfiguration>('tasks')).then((config: TaskConfiguration) => {
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
					let configPromise: TPromise<TaskConfiguration>;
					if (config) {
						if (this.isRunnerConfig(config) && this.hasDetectorSupport(<FileConfig.ExternalTaskRunnerConfiguration>config)) {
							let fileConfig = <FileConfig.ExternalTaskRunnerConfiguration>config;
							configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService, fileConfig).detect(true).then((value) => {
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
						configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService).detect(true).then((value) => {
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
						let parseResult = FileConfig.parse(<FileConfig.ExternalTaskRunnerConfiguration>config, this);
						if (!parseResult.validationStatus.isOK()) {
							this.outputChannel.show(true);
						}
						if (parseResult.validationStatus.isFatal()) {
							throw new TaskError(Severity.Error, nls.localize('TaskSystem.fatalError', 'The provided task configuration has validation errors. See tasks output log for details.'), TaskErrors.ConfigValidationError);
						}
						if (this.isRunnerConfig(config)) {
							this._inTerminal = false;
							result = new ProcessRunnerSystem(parseResult.configuration, this.markerService, this.modelService, this.telemetryService, this.outputService, this.configurationResolverService, TaskService.OutputChannelId, clearOutput);
						} else if (this.isTerminalConfig(config)) {
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

	private readConfiguration(): TPromise<TaskRunnerConfiguration> {
		let config = this.configurationService.getConfiguration<TaskConfiguration>('tasks');
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
		let configPromise: TPromise<TaskConfiguration>;
		if (config) {
			if (this.isRunnerConfig(config) && this.hasDetectorSupport(<FileConfig.ExternalTaskRunnerConfiguration>config)) {
				let fileConfig = <FileConfig.ExternalTaskRunnerConfiguration>config;
				configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService, fileConfig).detect(true).then((value) => {
					this.printStderr(value.stderr);
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
			configPromise = new ProcessRunnerDetector(this.fileService, this.contextService, this.configurationResolverService).detect(true).then((value) => {
				this.printStderr(value.stderr);
				return value.config;
			});
		}
		return configPromise.then((config) => {
			if (!config) {
				return undefined;
			}
			let parseResult = FileConfig.parse(<FileConfig.ExternalTaskRunnerConfiguration>config, this);
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
		let result = true;
		if (stderr && stderr.length > 0) {
			stderr.forEach((line) => {
				result = false;
				this.outputChannel.append(line + '\n');
			});
			this.outputChannel.show(true);
		}
		return result;
	}

	private isRunnerConfig(config: TaskConfiguration): boolean {
		return !config._runner || config._runner === 'program';
	}

	private isTerminalConfig(config: TaskConfiguration): boolean {
		return config._runner === 'terminal';
	}

	public inTerminal(): boolean {
		return this._inTerminal !== void 0 && this._inTerminal;
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
				let action = needsConfig
					? this.getConfigureAction(buildError.code)
					: new TerminateAction(TerminateAction.ID, TerminateAction.TEXT, this, this.telemetryService, this.messageService, this.contextService, this.terminalService);

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
}

let tasksCategory = nls.localize('tasksCategory', "Tasks");
let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT), 'Tasks: Configure Task Runner', tasksCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(BuildAction, BuildAction.ID, BuildAction.TEXT, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B }), 'Tasks: Run Build Task', tasksCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(TestAction, TestAction.ID, TestAction.TEXT), 'Tasks: Run Test Task', tasksCategory);
// workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(RebuildAction, RebuildAction.ID, RebuildAction.TEXT), tasksCategory);
// workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(CleanAction, CleanAction.ID, CleanAction.TEXT), tasksCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(TerminateAction, TerminateAction.ID, TerminateAction.TEXT), 'Tasks: Terminate Running Task', tasksCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowLogAction, ShowLogAction.ID, ShowLogAction.TEXT), 'Tasks: Show Task Log', tasksCategory);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(RunTaskAction, RunTaskAction.ID, RunTaskAction.TEXT), 'Tasks: Run Task', tasksCategory);

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
let schema: IJSONSchema =
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
				'enum': ['always', 'silent', 'never']
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
			'patternType': {
				'anyOf': [
					{
						'type': 'string',
						'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$cpp', '$csc', '$vb', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
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
						'description': nls.localize('JsonSchema.pattern.location', 'The match group index of the problem\'s location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.')
					},
					'line': {
						'type': 'integer',
						'description': nls.localize('JsonSchema.pattern.line', 'The match group index of the problem\'s line. Defaults to 2')
					},
					'column': {
						'type': 'integer',
						'description': nls.localize('JsonSchema.pattern.column', 'The match group index of the problem\'s line character. Defaults to 3')
					},
					'endLine': {
						'type': 'integer',
						'description': nls.localize('JsonSchema.pattern.endLine', 'The match group index of the problem\'s end line. Defaults to undefined')
					},
					'endColumn': {
						'type': 'integer',
						'description': nls.localize('JsonSchema.pattern.endColumn', 'The match group index of the problem\'s end line character. Defaults to undefined')
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
						'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
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
									'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
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
						'enum': ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go'],
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
						'anyOf': [
							{
								'type': 'boolean',
								'default': true,
								'description': nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
							},
							{
								'$ref': '#definitions/shellConfiguration'
							}
						]
					},
					'args': {
						'type': 'array',
						'description': nls.localize('JsonSchema.args', 'Additional arguments passed to the command.'),
						'items': {
							'type': 'string'
						}
					},
					'options': {
						'$ref': '#/definitions/options'
					},
					'showOutput': {
						'$ref': '#/definitions/showOutputType',
						'description': nls.localize('JsonSchema.showOutput', 'Controls whether the output of the running task is shown or not. If omitted \'always\' is used.')
					},
					'isWatching': {
						'type': 'boolean',
						'deprecationMessage': nls.localize('JsonSchema.watching.deprecation', 'Deprecated. Use isBackground instead.'),
						'description': nls.localize('JsonSchema.watching', 'Whether the executed task is kept alive and is watching the file system.'),
						'default': true
					},
					'isBackground': {
						'type': 'boolean',
						'description': nls.localize('JsonSchema.background', 'Whether the executed task is kept alive and is running in the background.'),
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
			'shellConfiguration': {
				'type': 'object',
				'additionalProperties': false,
				'properties': {
					'executable': {
						'type': 'string',
						'description': nls.localize('JsonSchema.shell.executable', 'The shell to be used.')
					},
					'args': {
						'type': 'array',
						'description': nls.localize('JsonSchema.shell.args', 'The shell arguments.'),
						'items': {
							'type': 'string'
						}
					}
				}
			},
			'commandConfiguration': {
				'type': 'object',
				'additionalProperties': false,
				'properties': {
					'command': {
						'type': 'string',
						'description': nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
					},
					'isShellCommand': {
						'anyOf': [
							{
								'type': 'boolean',
								'default': true,
								'description': nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
							},
							{
								'$ref': '#definitions/shellConfiguration'
							}
						]
					},
					'args': {
						'type': 'array',
						'description': nls.localize('JsonSchema.tasks.args', 'Arguments passed to the command when this task is invoked.'),
						'items': {
							'type': 'string'
						}
					},
					'options': {
						'$ref': '#/definitions/options'
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
					'command': {
						'type': 'string',
						'description': nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
					},
					'isShellCommand': {
						'anyOf': [
							{
								'type': 'boolean',
								'default': true,
								'description': nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
							},
							{
								'$ref': '#definitions/shellConfiguration'
							}
						]
					},
					'args': {
						'type': 'array',
						'description': nls.localize('JsonSchema.tasks.args', 'Arguments passed to the command when this task is invoked.'),
						'items': {
							'type': 'string'
						}
					},
					'options': {
						'$ref': '#/definitions/options'
					},
					'windows': {
						'$ref': '#/definitions/commandConfiguration',
						'description': nls.localize('JsonSchema.tasks.windows', 'Windows specific command configuration')
					},
					'osx': {
						'$ref': '#/definitions/commandConfiguration',
						'description': nls.localize('JsonSchema.tasks.mac', 'Mac specific command configuration')
					},
					'linux': {
						'$ref': '#/definitions/commandConfiguration',
						'description': nls.localize('JsonSchema.tasks.linux', 'Linux specific command configuration')
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
						'deprecationMessage': nls.localize('JsonSchema.tasks.watching.deprecation', 'Deprecated. Use isBackground instead.'),
						'description': nls.localize('JsonSchema.tasks.watching', 'Whether the executed task is kept alive and is watching the file system.'),
						'default': true
					},
					'isBackground': {
						'type': 'boolean',
						'description': nls.localize('JsonSchema.tasks.background', 'Whether the executed task is kept alive and is running in the background.'),
						'default': true
					},
					'promptOnClose': {
						'type': 'boolean',
						'description': nls.localize('JsonSchema.tasks.promptOnClose', 'Whether the user is prompted when VS Code closes with a running task.'),
						'default': false
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
							'taskName': '${1:taskName}'
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
						'description': nls.localize('JsonSchema.windows', 'Windows specific command configuration')
					},
					'osx': {
						'$ref': '#/definitions/baseTaskRunnerConfiguration',
						'description': nls.localize('JsonSchema.mac', 'Mac specific command configuration')
					},
					'linux': {
						'$ref': '#/definitions/baseTaskRunnerConfiguration',
						'description': nls.localize('JsonSchema.linux', 'Linux specific command configuration')
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
