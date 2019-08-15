/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import Severity from 'vs/base/common/severity';
import * as Objects from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { Action } from 'vs/base/common/actions';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as Types from 'vs/base/common/types';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { TerminateResponseCode } from 'vs/base/common/processes';
import * as strings from 'vs/base/common/strings';
import { ValidationStatus, ValidationState } from 'vs/base/common/parsers';
import * as UUID from 'vs/base/common/uuid';
import * as Platform from 'vs/base/common/platform';
import { LinkedMap, Touch } from 'vs/base/common/map';

import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ProblemMatcherRegistry, NamedProblemMatcher } from 'vs/workbench/contrib/tasks/common/problemMatcher';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IProgressService, IProgressOptions, ProgressLocation } from 'vs/platform/progress/common/progress';

import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService, IConfirmationResult } from 'vs/platform/dialogs/common/dialogs';

import { IModelService } from 'vs/editor/common/services/modelService';

import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import Constants from 'vs/workbench/contrib/markers/browser/constants';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IOutputService, IOutputChannel } from 'vs/workbench/contrib/output/common/output';

import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';

import { ITaskSystem, ITaskResolver, ITaskSummary, TaskExecuteKind, TaskError, TaskErrors, TaskTerminateResponse, TaskSystemInfo, ITaskExecuteResult } from 'vs/workbench/contrib/tasks/common/taskSystem';
import {
	Task, CustomTask, ConfiguringTask, ContributedTask, InMemoryTask, TaskEvent,
	TaskSet, TaskGroup, GroupType, ExecutionEngine, JsonSchemaVersion, TaskSourceKind,
	TaskSorter, TaskIdentifier, KeyedTaskIdentifier, TASK_RUNNING_STATE, TaskRunSource,
	KeyedTaskIdentifier as NKeyedTaskIdentifier, TaskDefinition
} from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, ITaskProvider, ProblemMatcherRunOptions, CustomizationProperties, TaskFilter, WorkspaceFolderTaskResult } from 'vs/workbench/contrib/tasks/common/taskService';
import { getTemplates as getTaskTemplates } from 'vs/workbench/contrib/tasks/common/taskTemplates';

import * as TaskConfig from '../common/taskConfiguration';
import { TerminalTaskSystem } from './terminalTaskSystem';

import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';

import { TaskDefinitionRegistry } from 'vs/workbench/contrib/tasks/common/taskDefinitionRegistry';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { RunAutomaticTasks } from 'vs/workbench/contrib/tasks/browser/runAutomaticTasks';

import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { format } from 'vs/base/common/jsonFormatter';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { ITextEditor } from 'vs/workbench/common/editor';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';

export namespace ConfigureTaskAction {
	export const ID = 'workbench.action.tasks.configureTaskRunner';
	export const TEXT = nls.localize('ConfigureTaskRunnerAction.label', "Configure Task");
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
}

export interface WorkspaceFolderConfigurationResult {
	workspaceFolder: IWorkspaceFolder;
	config: TaskConfig.ExternalTaskRunnerConfiguration | undefined;
	hasErrors: boolean;
}

interface TaskCustomizationTelemetryEvent {
	properties: string[];
}

class TaskMap {
	private _store: Map<string, Task[]> = new Map();

	constructor() {
	}

	public forEach(callback: (value: Task[], folder: string) => void): void {
		this._store.forEach(callback);
	}

	public get(workspaceFolder: IWorkspaceFolder | string): Task[] {
		let result: Task[] | undefined = Types.isString(workspaceFolder) ? this._store.get(workspaceFolder) : this._store.get(workspaceFolder.uri.toString());
		if (!result) {
			result = [];
			Types.isString(workspaceFolder) ? this._store.set(workspaceFolder, result) : this._store.set(workspaceFolder.uri.toString(), result);
		}
		return result;
	}

	public add(workspaceFolder: IWorkspaceFolder | string, ...task: Task[]): void {
		let values = Types.isString(workspaceFolder) ? this._store.get(workspaceFolder) : this._store.get(workspaceFolder.uri.toString());
		if (!values) {
			values = [];
			Types.isString(workspaceFolder) ? this._store.set(workspaceFolder, values) : this._store.set(workspaceFolder.uri.toString(), values);
		}
		values.push(...task);
	}

	public all(): Task[] {
		let result: Task[] = [];
		this._store.forEach((values) => result.push(...values));
		return result;
	}
}

interface TaskQuickPickEntry extends IQuickPickItem {
	task: Task | undefined | null;
}

export abstract class AbstractTaskService extends Disposable implements ITaskService {

	// private static autoDetectTelemetryName: string = 'taskServer.autoDetect';
	private static readonly RecentlyUsedTasks_Key = 'workbench.tasks.recentlyUsedTasks';
	private static readonly IgnoreTask010DonotShowAgain_key = 'workbench.tasks.ignoreTask010Shown';

	private static CustomizationTelemetryEventName: string = 'taskService.customize';
	public _serviceBrand: any;
	public static OutputChannelId: string = 'tasks';
	public static OutputChannelLabel: string = nls.localize('tasks', "Tasks");

	private static nextHandle: number = 0;

	private _schemaVersion: JsonSchemaVersion | undefined;
	private _executionEngine: ExecutionEngine | undefined;
	private _workspaceFolders: IWorkspaceFolder[] | undefined;
	private _ignoredWorkspaceFolders: IWorkspaceFolder[] | undefined;
	private _showIgnoreMessage?: boolean;
	private _providers: Map<number, ITaskProvider>;
	private _providerTypes: Map<number, string>;
	protected _taskSystemInfos: Map<string, TaskSystemInfo>;

	protected _workspaceTasksPromise?: Promise<Map<string, WorkspaceFolderTaskResult>>;

	protected _taskSystem?: ITaskSystem;
	protected _taskSystemListener?: IDisposable;
	private _recentlyUsedTasks: LinkedMap<string, string> | undefined;

	protected _taskRunningState: IContextKey<boolean>;

	protected _outputChannel: IOutputChannel;
	protected readonly _onDidStateChange: Emitter<TaskEvent>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMarkerService protected readonly markerService: IMarkerService,
		@IOutputService protected readonly outputService: IOutputService,
		@IPanelService private readonly panelService: IPanelService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService protected readonly fileService: IFileService,
		@IWorkspaceContextService protected readonly contextService: IWorkspaceContextService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IModelService protected readonly modelService: IModelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IConfigurationResolverService protected readonly configurationResolverService: IConfigurationResolverService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IStorageService private readonly storageService: IStorageService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWindowService private readonly _windowService: IWindowService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ITerminalInstanceService private readonly terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		super();

		this._workspaceTasksPromise = undefined;
		this._taskSystem = undefined;
		this._taskSystemListener = undefined;
		this._outputChannel = this.outputService.getChannel(AbstractTaskService.OutputChannelId)!;
		this._providers = new Map<number, ITaskProvider>();
		this._providerTypes = new Map<number, string>();
		this._taskSystemInfos = new Map<string, TaskSystemInfo>();
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => {
			if (!this._taskSystem && !this._workspaceTasksPromise) {
				return;
			}
			let folderSetup = this.computeWorkspaceFolderSetup();
			if (this.executionEngine !== folderSetup[2]) {
				if (this._taskSystem && this._taskSystem.getActiveTasks().length > 0) {
					this.notificationService.prompt(
						Severity.Info,
						nls.localize(
							'TaskSystem.noHotSwap',
							'Changing the task execution engine with an active task running requires to reload the Window'
						),
						[{
							label: nls.localize('reloadWindow', "Reload Window"),
							run: () => this._windowService.reloadWindow()
						}],
						{ sticky: true }
					);
					return;
				} else {
					this.disposeTaskSystemListeners();
					this._taskSystem = undefined;
				}
			}
			this.updateSetup(folderSetup);
			this.updateWorkspaceTasks();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(() => {
			if (!this._taskSystem && !this._workspaceTasksPromise) {
				return;
			}
			if (!this._taskSystem || this._taskSystem instanceof TerminalTaskSystem) {
				this._outputChannel.clear();
			}
			this.updateWorkspaceTasks(TaskRunSource.ConfigurationChange);
		}));
		this._taskRunningState = TASK_RUNNING_STATE.bindTo(contextKeyService);
		this._register(lifecycleService.onBeforeShutdown(event => event.veto(this.beforeShutdown())));
		this._onDidStateChange = this._register(new Emitter());
		this.registerCommands();
	}

	public get onDidStateChange(): Event<TaskEvent> {
		return this._onDidStateChange.event;
	}

	public get supportsMultipleTaskExecutions(): boolean {
		return this.inTerminal();
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand({
			id: 'workbench.action.tasks.runTask',
			handler: (accessor, arg) => {
				this.runTaskCommand(arg);
			},
			description: {
				description: 'Run Task',
				args: [{
					name: 'args',
					schema: {
						'type': 'string',
					}
				}]
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.reRunTask', (accessor, arg) => {
			this.reRunTaskCommand();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.restartTask', (accessor, arg) => {
			this.runRestartTaskCommand(arg);
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.terminate', (accessor, arg) => {
			this.runTerminateCommand(arg);
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
			this.runBuildCommand();
		});

		KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.tasks.build',
			weight: KeybindingWeight.WorkbenchContrib,
			when: undefined,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.test', () => {
			if (!this.canRunCommand()) {
				return;
			}
			this.runTestCommand();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureTaskRunner', () => {
			this.runConfigureTasks();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureDefaultBuildTask', () => {
			this.runConfigureDefaultBuildTask();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureDefaultTestTask', () => {
			this.runConfigureDefaultTestTask();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.showTasks', () => {
			this.runShowTasks();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.toggleProblems', () => {
			const panel = this.panelService.getActivePanel();
			if (panel && panel.getId() === Constants.MARKERS_PANEL_ID) {
				this.layoutService.setPanelHidden(true);
			} else {
				this.panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
			}
		});
	}

	private get workspaceFolders(): IWorkspaceFolder[] {
		if (!this._workspaceFolders) {
			this.updateSetup();
		}
		return this._workspaceFolders!;
	}

	private get ignoredWorkspaceFolders(): IWorkspaceFolder[] {
		if (!this._ignoredWorkspaceFolders) {
			this.updateSetup();
		}
		return this._ignoredWorkspaceFolders!;
	}

	protected get executionEngine(): ExecutionEngine {
		if (this._executionEngine === undefined) {
			this.updateSetup();
		}
		return this._executionEngine!;
	}

	private get schemaVersion(): JsonSchemaVersion {
		if (this._schemaVersion === undefined) {
			this.updateSetup();
		}
		return this._schemaVersion!;
	}

	private get showIgnoreMessage(): boolean {
		if (this._showIgnoreMessage === undefined) {
			this._showIgnoreMessage = !this.storageService.getBoolean(AbstractTaskService.IgnoreTask010DonotShowAgain_key, StorageScope.WORKSPACE, false);
		}
		return this._showIgnoreMessage;
	}

	private updateSetup(setup?: [IWorkspaceFolder[], IWorkspaceFolder[], ExecutionEngine, JsonSchemaVersion]): void {
		if (!setup) {
			setup = this.computeWorkspaceFolderSetup();
		}
		this._workspaceFolders = setup[0];
		if (this._ignoredWorkspaceFolders) {
			if (this._ignoredWorkspaceFolders.length !== setup[1].length) {
				this._showIgnoreMessage = undefined;
			} else {
				let set: Set<string> = new Set();
				this._ignoredWorkspaceFolders.forEach(folder => set.add(folder.uri.toString()));
				for (let folder of setup[1]) {
					if (!set.has(folder.uri.toString())) {
						this._showIgnoreMessage = undefined;
						break;
					}
				}
			}
		}
		this._ignoredWorkspaceFolders = setup[1];
		this._executionEngine = setup[2];
		this._schemaVersion = setup[3];
	}

	protected showOutput(runSource: TaskRunSource = TaskRunSource.User): void {
		if ((runSource === TaskRunSource.User) || (runSource === TaskRunSource.ConfigurationChange)) {
			this.notificationService.prompt(Severity.Warning, nls.localize('taskServiceOutputPrompt', 'There are task errors. See the output for details.'),
				[{
					label: nls.localize('showOutput', "Show output"),
					run: () => {
						this.outputService.showChannel(this._outputChannel.id, true);
					}
				}]);
		}
	}

	private disposeTaskSystemListeners(): void {
		if (this._taskSystemListener) {
			this._taskSystemListener.dispose();
		}
	}

	public registerTaskProvider(provider: ITaskProvider, type: string): IDisposable {
		if (!provider) {
			return {
				dispose: () => { }
			};
		}
		let handle = AbstractTaskService.nextHandle++;
		this._providers.set(handle, provider);
		this._providerTypes.set(handle, type);
		return {
			dispose: () => {
				this._providers.delete(handle);
				this._providerTypes.delete(handle);
			}
		};
	}

	public registerTaskSystem(key: string, info: TaskSystemInfo): void {
		this._taskSystemInfos.set(key, info);
	}

	public extensionCallbackTaskComplete(task: Task, result: number): Promise<void> {
		if (!this._taskSystem) {
			return Promise.resolve();
		}
		return this._taskSystem.customExecutionComplete(task, result);
	}

	public getTask(folder: IWorkspaceFolder | string, identifier: string | TaskIdentifier, compareId: boolean = false): Promise<Task | undefined> {
		const name = Types.isString(folder) ? folder : folder.name;
		if (this.ignoredWorkspaceFolders.some(ignored => ignored.name === name)) {
			return Promise.reject(new Error(nls.localize('TaskServer.folderIgnored', 'The folder {0} is ignored since it uses task version 0.1.0', name)));
		}
		const key: string | KeyedTaskIdentifier | undefined = !Types.isString(identifier)
			? TaskDefinition.createTaskIdentifier(identifier, console)
			: identifier;

		if (key === undefined) {
			return Promise.resolve(undefined);
		}
		return this.getGroupedTasks().then((map) => {
			const values = map.get(folder);
			if (!values) {
				return undefined;
			}
			for (const task of values) {
				if (task.matches(key, compareId)) {
					return task;
				}
			}
			return undefined;
		});
	}

	protected abstract versionAndEngineCompatible(filter?: TaskFilter): boolean;

	public tasks(filter?: TaskFilter): Promise<Task[]> {
		if (!this.versionAndEngineCompatible(filter)) {
			return Promise.resolve<Task[]>([]);
		}
		return this.getGroupedTasks(filter ? filter.type : undefined).then((map) => {
			if (!filter || !filter.type) {
				return map.all();
			}
			let result: Task[] = [];
			map.forEach((tasks) => {
				for (let task of tasks) {
					if (ContributedTask.is(task) && task.defines.type === filter.type) {
						result.push(task);
					} else if (CustomTask.is(task)) {
						if (task.type === filter.type) {
							result.push(task);
						} else {
							let customizes = task.customizes();
							if (customizes && customizes.type === filter.type) {
								result.push(task);
							}
						}
					}
				}
			});
			return result;
		});
	}

	public createSorter(): TaskSorter {
		return new TaskSorter(this.contextService.getWorkspace() ? this.contextService.getWorkspace().folders : []);
	}

	public isActive(): Promise<boolean> {
		if (!this._taskSystem) {
			return Promise.resolve(false);
		}
		return this._taskSystem.isActive();
	}

	public getActiveTasks(): Promise<Task[]> {
		if (!this._taskSystem) {
			return Promise.resolve([]);
		}
		return Promise.resolve(this._taskSystem.getActiveTasks());
	}

	public getRecentlyUsedTasks(): LinkedMap<string, string> {
		if (this._recentlyUsedTasks) {
			return this._recentlyUsedTasks;
		}
		this._recentlyUsedTasks = new LinkedMap<string, string>();
		let storageValue = this.storageService.get(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
		if (storageValue) {
			try {
				let values: string[] = JSON.parse(storageValue);
				if (Array.isArray(values)) {
					for (let value of values) {
						this._recentlyUsedTasks.set(value, value);
					}
				}
			} catch (error) {
				// Ignore. We use the empty result
			}
		}
		return this._recentlyUsedTasks;
	}

	private setRecentlyUsedTask(key: string): void {
		this.getRecentlyUsedTasks().set(key, key, Touch.AsOld);
		this.saveRecentlyUsedTasks();
	}

	private saveRecentlyUsedTasks(): void {
		if (!this._taskSystem || !this._recentlyUsedTasks) {
			return;
		}
		let values = this._recentlyUsedTasks.values();
		if (values.length > 30) {
			values = values.slice(0, 30);
		}
		this.storageService.store(AbstractTaskService.RecentlyUsedTasks_Key, JSON.stringify(values), StorageScope.WORKSPACE);
	}

	private openDocumentation(): void {
		this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?LinkId=733558'));
	}

	public build(): Promise<ITaskSummary> {
		return this.getGroupedTasks().then((tasks) => {
			let runnable = this.createRunnableTask(tasks, TaskGroup.Build);
			if (!runnable || !runnable.task) {
				if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noBuildTask1', 'No build task defined. Mark a task with \'isBuildCommand\' in the tasks.json file.'), TaskErrors.NoBuildTask);
				} else {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noBuildTask2', 'No build task defined. Mark a task with as a \'build\' group in the tasks.json file.'), TaskErrors.NoBuildTask);
				}
			}
			return this.executeTask(runnable.task, runnable.resolver);
		}).then(value => value, (error) => {
			this.handleError(error);
			return Promise.reject(error);
		});
	}

	public runTest(): Promise<ITaskSummary> {
		return this.getGroupedTasks().then((tasks) => {
			let runnable = this.createRunnableTask(tasks, TaskGroup.Test);
			if (!runnable || !runnable.task) {
				if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noTestTask1', 'No test task defined. Mark a task with \'isTestCommand\' in the tasks.json file.'), TaskErrors.NoTestTask);
				} else {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noTestTask2', 'No test task defined. Mark a task with as a \'test\' group in the tasks.json file.'), TaskErrors.NoTestTask);
				}
			}
			return this.executeTask(runnable.task, runnable.resolver);
		}).then(value => value, (error) => {
			this.handleError(error);
			return Promise.reject(error);
		});
	}

	public run(task: Task | undefined, options?: ProblemMatcherRunOptions, runSource: TaskRunSource = TaskRunSource.System): Promise<ITaskSummary> {
		if (!task) {
			throw new TaskError(Severity.Info, nls.localize('TaskServer.noTask', 'Task to execute is undefined'), TaskErrors.TaskNotFound);
		}
		return this.getGroupedTasks().then((grouped) => {
			let resolver = this.createResolver(grouped);
			if (options && options.attachProblemMatcher && this.shouldAttachProblemMatcher(task) && !InMemoryTask.is(task)) {
				return this.attachProblemMatcher(task).then((toExecute) => {
					if (toExecute) {
						return this.executeTask(toExecute, resolver);
					} else {
						return Promise.resolve(undefined);
					}
				});
			}
			return this.executeTask(task, resolver);
		}).then((value) => {
			if (runSource === TaskRunSource.User) {
				this.getWorkspaceTasks().then(workspaceTasks => {
					RunAutomaticTasks.promptForPermission(this, this.storageService, this.notificationService, workspaceTasks);
				});
			}
			return value;
		}, (error) => {
			this.handleError(error);
			return Promise.reject(error);
		});
	}

	private shouldAttachProblemMatcher(task: Task): boolean {
		if (!this.canCustomize(task)) {
			return false;
		}
		if (task.configurationProperties.group !== undefined && task.configurationProperties.group !== TaskGroup.Build) {
			return false;
		}
		if (task.configurationProperties.problemMatchers !== undefined && task.configurationProperties.problemMatchers.length > 0) {
			return false;
		}
		if (ContributedTask.is(task)) {
			return !task.hasDefinedMatchers && !!task.configurationProperties.problemMatchers && (task.configurationProperties.problemMatchers.length === 0);
		}
		if (CustomTask.is(task)) {
			let configProperties: TaskConfig.ConfigurationProperties = task._source.config.element;
			return configProperties.problemMatcher === undefined && !task.hasDefinedMatchers;
		}
		return false;
	}

	private attachProblemMatcher(task: ContributedTask | CustomTask): Promise<Task | undefined> {
		interface ProblemMatcherPickEntry extends IQuickPickItem {
			matcher: NamedProblemMatcher | undefined;
			never?: boolean;
			learnMore?: boolean;
		}
		let entries: QuickPickInput<ProblemMatcherPickEntry>[] = [];
		for (let key of ProblemMatcherRegistry.keys()) {
			let matcher = ProblemMatcherRegistry.get(key);
			if (matcher.deprecated) {
				continue;
			}
			if (matcher.name === matcher.label) {
				entries.push({ label: matcher.name, matcher: matcher });
			} else {
				entries.push({
					label: matcher.label,
					description: `$${matcher.name}`,
					matcher: matcher
				});
			}
		}
		if (entries.length > 0) {
			entries = entries.sort((a, b) => {
				if (a.label && b.label) {
					return a.label.localeCompare(b.label);
				} else {
					return 0;
				}
			});
			entries.unshift({ type: 'separator', label: nls.localize('TaskService.associate', 'associate') });
			entries.unshift(
				{ label: nls.localize('TaskService.attachProblemMatcher.continueWithout', 'Continue without scanning the task output'), matcher: undefined },
				{ label: nls.localize('TaskService.attachProblemMatcher.never', 'Never scan the task output'), matcher: undefined, never: true },
				{ label: nls.localize('TaskService.attachProblemMatcher.learnMoreAbout', 'Learn more about scanning the task output'), matcher: undefined, learnMore: true }
			);
			return this.quickInputService.pick(entries, {
				placeHolder: nls.localize('selectProblemMatcher', 'Select for which kind of errors and warnings to scan the task output'),
			}).then((selected) => {
				if (selected) {
					if (selected.learnMore) {
						this.openDocumentation();
						return undefined;
					} else if (selected.never) {
						this.customize(task, { problemMatcher: [] }, true);
						return task;
					} else if (selected.matcher) {
						let newTask = task.clone();
						let matcherReference = `$${selected.matcher.name}`;
						let properties: CustomizationProperties = { problemMatcher: [matcherReference] };
						newTask.configurationProperties.problemMatchers = [matcherReference];
						let matcher = ProblemMatcherRegistry.get(selected.matcher.name);
						if (matcher && matcher.watching !== undefined) {
							properties.isBackground = true;
							newTask.configurationProperties.isBackground = true;
						}
						this.customize(task, properties, true);
						return newTask;
					} else {
						return task;
					}
				} else {
					return undefined;
				}
			});
		}
		return Promise.resolve(task);
	}

	public getTasksForGroup(group: string): Promise<Task[]> {
		return this.getGroupedTasks().then((groups) => {
			let result: Task[] = [];
			groups.forEach((tasks) => {
				for (let task of tasks) {
					if (task.configurationProperties.group === group) {
						result.push(task);
					}
				}
			});
			return result;
		});
	}

	public needsFolderQualification(): boolean {
		return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
	}

	public canCustomize(task: Task): boolean {
		if (this.schemaVersion !== JsonSchemaVersion.V2_0_0) {
			return false;
		}
		if (CustomTask.is(task)) {
			return true;
		}
		if (ContributedTask.is(task)) {
			return !!task.getWorkspaceFolder();
		}
		return false;
	}

	private openEditorAtTask(resource: URI | undefined, task: TaskConfig.CustomTask | TaskConfig.ConfiguringTask | string | undefined): Promise<ITextEditor | null | undefined> {
		if (resource === undefined) {
			return Promise.resolve(undefined);
		}
		let selection: ITextEditorSelection | undefined;
		return this.fileService.readFile(resource).then(content => content.value).then(async content => {
			if (!content) {
				return undefined;
			}
			if (task) {
				const contentValue = content.toString();
				let stringValue: string;
				if (typeof task === 'string') {
					stringValue = task;
				} else {
					const model = (await this.textModelResolverService.createModelReference(resource)).object.textEditorModel;
					const { tabSize, insertSpaces } = model.getOptions();
					const eol = model.getEOL();
					const edits = format(JSON.stringify(task), undefined, { eol, tabSize, insertSpaces });
					let stringified = applyEdits(JSON.stringify(task), edits);
					const regex = new RegExp(eol + '\\t', 'g');
					stringified = stringified.replace(regex, eol + '\t\t\t');
					const twoTabs = '\t\t';
					stringValue = twoTabs + stringified.slice(0, stringified.length - 1) + twoTabs + stringified.slice(stringified.length - 1);
				}

				const index = contentValue.indexOf(stringValue);
				let startLineNumber = 1;
				for (let i = 0; i < index; i++) {
					if (contentValue.charAt(i) === '\n') {
						startLineNumber++;
					}
				}
				let endLineNumber = startLineNumber;
				for (let i = 0; i < stringValue.length; i++) {
					if (stringValue.charAt(i) === '\n') {
						endLineNumber++;
					}
				}
				selection = startLineNumber > 1 ? { startLineNumber, startColumn: startLineNumber === endLineNumber ? 4 : 3, endLineNumber, endColumn: startLineNumber === endLineNumber ? undefined : 4 } : undefined;
			}

			return this.editorService.openEditor({
				resource,
				options: {
					pinned: false,
					forceReload: true, // because content might have changed
					selection,
					revealInCenterIfOutsideViewport: !!selection
				}
			});
		});
	}

	public customize(task: ContributedTask | CustomTask, properties?: CustomizationProperties, openConfig?: boolean): Promise<void> {
		const workspaceFolder = task.getWorkspaceFolder();
		if (!workspaceFolder) {
			return Promise.resolve(undefined);
		}
		let configuration = this.getConfiguration(workspaceFolder);
		if (configuration.hasParseErrors) {
			this.notificationService.warn(nls.localize('customizeParseErrors', 'The current task configuration has errors. Please fix the errors first before customizing a task.'));
			return Promise.resolve<void>(undefined);
		}

		let fileConfig = configuration.config;
		let index: number | undefined;
		let toCustomize: TaskConfig.CustomTask | TaskConfig.ConfiguringTask | undefined;
		let taskConfig = CustomTask.is(task) ? task._source.config : undefined;
		if (taskConfig && taskConfig.element) {
			index = taskConfig.index;
			toCustomize = taskConfig.element;
		} else if (ContributedTask.is(task)) {
			toCustomize = {
			};
			let identifier: TaskConfig.TaskIdentifier = Objects.assign(Object.create(null), task.defines);
			delete identifier['_key'];
			Object.keys(identifier).forEach(key => (<any>toCustomize)![key] = identifier[key]);
			if (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length > 0 && Types.isStringArray(task.configurationProperties.problemMatchers)) {
				toCustomize.problemMatcher = task.configurationProperties.problemMatchers;
			}
			if (task.configurationProperties.group) {
				toCustomize.group = task.configurationProperties.group;
			}
		}
		if (!toCustomize) {
			return Promise.resolve(undefined);
		}
		if (properties) {
			for (let property of Object.getOwnPropertyNames(properties)) {
				let value = (<any>properties)[property];
				if (value !== undefined && value !== null) {
					(<any>toCustomize)[property] = value;
				}
			}
		} else {
			if (toCustomize.problemMatcher === undefined && task.configurationProperties.problemMatchers === undefined || (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0)) {
				toCustomize.problemMatcher = [];
			}
		}

		let promise: Promise<void> | undefined;
		if (!fileConfig) {
			let value = {
				version: '2.0.0',
				tasks: [toCustomize]
			};
			let content = [
				'{',
				nls.localize('tasksJsonComment', '\t// See https://go.microsoft.com/fwlink/?LinkId=733558 \n\t// for the documentation about the tasks.json format'),
			].join('\n') + JSON.stringify(value, null, '\t').substr(1);
			let editorConfig = this.configurationService.getValue<any>();
			if (editorConfig.editor.insertSpaces) {
				content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + strings.repeat(' ', s2.length * editorConfig.editor.tabSize));
			}
			promise = this.textFileService.create(workspaceFolder.toResource('.vscode/tasks.json'), content).then(() => { });
		} else {
			// We have a global task configuration
			if ((index === -1) && properties) {
				if (properties.problemMatcher !== undefined) {
					fileConfig.problemMatcher = properties.problemMatcher;
					promise = this.writeConfiguration(workspaceFolder, 'tasks.problemMatchers', fileConfig.problemMatcher);
				} else if (properties.group !== undefined) {
					fileConfig.group = properties.group;
					promise = this.writeConfiguration(workspaceFolder, 'tasks.group', fileConfig.group);
				}
			} else {
				if (!Array.isArray(fileConfig.tasks)) {
					fileConfig.tasks = [];
				}
				if (index === undefined) {
					fileConfig.tasks.push(toCustomize);
				} else {
					fileConfig.tasks[index] = toCustomize;
				}
				promise = this.writeConfiguration(workspaceFolder, 'tasks.tasks', fileConfig.tasks);
			}
		}
		if (!promise) {
			return Promise.resolve(undefined);
		}
		return promise.then(() => {
			let event: TaskCustomizationTelemetryEvent = {
				properties: properties ? Object.getOwnPropertyNames(properties) : []
			};
			/* __GDPR__
				"taskService.customize" : {
					"properties" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog(AbstractTaskService.CustomizationTelemetryEventName, event);
			if (openConfig) {
				this.openEditorAtTask(workspaceFolder.toResource('.vscode/tasks.json'), toCustomize);
			}
		});
	}

	private writeConfiguration(workspaceFolder: IWorkspaceFolder, key: string, value: any): Promise<void> | undefined {
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			return this.configurationService.updateValue(key, value, { resource: workspaceFolder.uri }, ConfigurationTarget.WORKSPACE);
		} else if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			return this.configurationService.updateValue(key, value, { resource: workspaceFolder.uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		} else {
			return undefined;
		}
	}

	public openConfig(task: CustomTask | undefined): Promise<void> {
		let resource: URI | undefined;
		if (task) {
			resource = task.getWorkspaceFolder().toResource(task._source.config.file);
		} else {
			resource = (this._workspaceFolders && (this._workspaceFolders.length > 0)) ? this._workspaceFolders[0].toResource('.vscode/tasks.json') : undefined;
		}
		return this.openEditorAtTask(resource, task ? task._label : undefined).then(() => undefined);
	}

	private createRunnableTask(tasks: TaskMap, group: TaskGroup): { task: Task; resolver: ITaskResolver } | undefined {
		interface ResolverData {
			id: Map<string, Task>;
			label: Map<string, Task>;
			identifier: Map<string, Task>;
		}

		let resolverData: Map<string, ResolverData> = new Map();
		let workspaceTasks: Task[] = [];
		let extensionTasks: Task[] = [];
		tasks.forEach((tasks, folder) => {
			let data = resolverData.get(folder);
			if (!data) {
				data = {
					id: new Map<string, Task>(),
					label: new Map<string, Task>(),
					identifier: new Map<string, Task>()
				};
				resolverData.set(folder, data);
			}
			for (let task of tasks) {
				data.id.set(task._id, task);
				data.label.set(task._label, task);
				if (task.configurationProperties.identifier) {
					data.identifier.set(task.configurationProperties.identifier, task);
				}
				if (group && task.configurationProperties.group === group) {
					if (task._source.kind === TaskSourceKind.Workspace) {
						workspaceTasks.push(task);
					} else {
						extensionTasks.push(task);
					}
				}
			}
		});
		let resolver: ITaskResolver = {
			resolve: (workspaceFolder: IWorkspaceFolder, alias: string) => {
				let data = resolverData.get(workspaceFolder.uri.toString());
				if (!data) {
					return undefined;
				}
				return data.id.get(alias) || data.label.get(alias) || data.identifier.get(alias);
			}
		};
		if (workspaceTasks.length > 0) {
			if (workspaceTasks.length > 1) {
				this._outputChannel.append(nls.localize('moreThanOneBuildTask', 'There are many build tasks defined in the tasks.json. Executing the first one.\n'));
			}
			return { task: workspaceTasks[0], resolver };
		}
		if (extensionTasks.length === 0) {
			return undefined;
		}

		// We can only have extension tasks if we are in version 2.0.0. Then we can even run
		// multiple build tasks.
		if (extensionTasks.length === 1) {
			return { task: extensionTasks[0], resolver };
		} else {
			let id: string = UUID.generateUuid();
			let task: InMemoryTask = new InMemoryTask(
				id,
				{ kind: TaskSourceKind.InMemory, label: 'inMemory' },
				id,
				'inMemory',
				{ reevaluateOnRerun: true },
				{
					identifier: id,
					dependsOn: extensionTasks.map((extensionTask) => { return { workspaceFolder: extensionTask.getWorkspaceFolder()!, task: extensionTask._id }; }),
					name: id,
				}
			);
			return { task, resolver };
		}
	}

	private createResolver(grouped: TaskMap): ITaskResolver {
		interface ResolverData {
			label: Map<string, Task>;
			identifier: Map<string, Task>;
			taskIdentifier: Map<string, Task>;
		}

		let resolverData: Map<string, ResolverData> = new Map();
		grouped.forEach((tasks, folder) => {
			let data = resolverData.get(folder);
			if (!data) {
				data = { label: new Map<string, Task>(), identifier: new Map<string, Task>(), taskIdentifier: new Map<string, Task>() };
				resolverData.set(folder, data);
			}
			for (let task of tasks) {
				data.label.set(task._label, task);
				if (task.configurationProperties.identifier) {
					data.identifier.set(task.configurationProperties.identifier, task);
				}
				let keyedIdentifier = task.getDefinition(true);
				if (keyedIdentifier !== undefined) {
					data.taskIdentifier.set(keyedIdentifier._key, task);
				}
			}
		});
		return {
			resolve: (workspaceFolder: IWorkspaceFolder, identifier: string | TaskIdentifier | undefined) => {
				let data = resolverData.get(workspaceFolder.uri.toString());
				if (!data || !identifier) {
					return undefined;
				}
				if (Types.isString(identifier)) {
					return data.label.get(identifier) || data.identifier.get(identifier);
				} else {
					let key = TaskDefinition.createTaskIdentifier(identifier, console);
					return key !== undefined ? data.taskIdentifier.get(key._key) : undefined;
				}
			}
		};
	}

	private executeTask(task: Task, resolver: ITaskResolver): Promise<ITaskSummary> {
		return ProblemMatcherRegistry.onReady().then(() => {
			return this.textFileService.saveAll().then((value) => { // make sure all dirty files are saved
				let executeResult = this.getTaskSystem().run(task, resolver);
				return this.handleExecuteResult(executeResult);
			});
		});
	}

	private handleExecuteResult(executeResult: ITaskExecuteResult): Promise<ITaskSummary> {
		if (executeResult.task.taskLoadMessages && executeResult.task.taskLoadMessages.length > 0) {
			executeResult.task.taskLoadMessages.forEach(loadMessage => {
				this._outputChannel.append(loadMessage + '\n');
			});
			this.showOutput();
		}

		let key = executeResult.task.getRecentlyUsedKey();
		if (key) {
			this.setRecentlyUsedTask(key);
		}
		if (executeResult.kind === TaskExecuteKind.Active) {
			let active = executeResult.active;
			if (active && active.same) {
				let message;
				if (active.background) {
					message = nls.localize('TaskSystem.activeSame.background', 'The task \'{0}\' is already active and in background mode.', executeResult.task.getQualifiedLabel());
				} else {
					message = nls.localize('TaskSystem.activeSame.noBackground', 'The task \'{0}\' is already active.', executeResult.task.getQualifiedLabel());
				}
				this.notificationService.prompt(Severity.Info, message,
					[{
						label: nls.localize('terminateTask', "Terminate Task"),
						run: () => this.terminate(executeResult.task)
					},
					{
						label: nls.localize('restartTask', "Restart Task"),
						run: () => this.restart(executeResult.task)
					}],
					{ sticky: true }
				);
			} else {
				throw new TaskError(Severity.Warning, nls.localize('TaskSystem.active', 'There is already a task running. Terminate it first before executing another task.'), TaskErrors.RunningTask);
			}
		}
		return executeResult.promise;
	}

	public restart(task: Task): void {
		if (!this._taskSystem) {
			return;
		}
		this._taskSystem.terminate(task).then((response) => {
			if (response.success) {
				this.run(task).then(undefined, reason => {
					// eat the error, it has already been surfaced to the user and we don't care about it here
				});
			} else {
				this.notificationService.warn(nls.localize('TaskSystem.restartFailed', 'Failed to terminate and restart task {0}', Types.isString(task) ? task : task.configurationProperties.name));
			}
			return response;
		});
	}

	public terminate(task: Task): Promise<TaskTerminateResponse> {
		if (!this._taskSystem) {
			return Promise.resolve({ success: true, task: undefined });
		}
		return this._taskSystem.terminate(task);
	}

	public terminateAll(): Promise<TaskTerminateResponse[]> {
		if (!this._taskSystem) {
			return Promise.resolve<TaskTerminateResponse[]>([]);
		}
		return this._taskSystem.terminateAll();
	}

	protected createTerminalTaskSystem(): ITaskSystem {
		return new TerminalTaskSystem(
			this.terminalService, this.outputService, this.panelService, this.markerService,
			this.modelService, this.configurationResolverService, this.telemetryService,
			this.contextService, this.environmentService,
			AbstractTaskService.OutputChannelId, this.fileService, this.terminalInstanceService,
			this.remoteAgentService,
			(workspaceFolder: IWorkspaceFolder) => {
				if (!workspaceFolder) {
					return undefined;
				}
				return this._taskSystemInfos.get(workspaceFolder.uri.scheme);
			}
		);
	}

	protected abstract getTaskSystem(): ITaskSystem;

	private getGroupedTasks(type?: string): Promise<TaskMap> {
		return Promise.all([this.extensionService.activateByEvent('onCommand:workbench.action.tasks.runTask'), TaskDefinitionRegistry.onReady()]).then(() => {
			let validTypes: IStringDictionary<boolean> = Object.create(null);
			TaskDefinitionRegistry.all().forEach(definition => validTypes[definition.taskType] = true);
			validTypes['shell'] = true;
			validTypes['process'] = true;
			return new Promise<TaskSet[]>(resolve => {
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
				let error = (error: any) => {
					try {
						if (error && Types.isString(error.message)) {
							this._outputChannel.append('Error: ');
							this._outputChannel.append(error.message);
							this._outputChannel.append('\n');
							this.showOutput();
						} else {
							this._outputChannel.append('Unknown error received while collecting tasks from providers.\n');
							this.showOutput();
						}
					} finally {
						if (--counter === 0) {
							resolve(result);
						}
					}
				};
				if (this.schemaVersion === JsonSchemaVersion.V2_0_0 && this._providers.size > 0) {
					for (const [handle, provider] of this._providers) {
						if ((type === undefined) || (type === this._providerTypes.get(handle))) {
							counter++;
							provider.provideTasks(validTypes).then(done, error);
						}
					}
				} else {
					resolve(result);
				}
			});
		}).then((contributedTaskSets) => {
			let result: TaskMap = new TaskMap();
			let contributedTasks: TaskMap = new TaskMap();

			for (let set of contributedTaskSets) {
				for (let task of set.tasks) {
					let workspaceFolder = task.getWorkspaceFolder();
					if (workspaceFolder) {
						contributedTasks.add(workspaceFolder, task);
					}
				}
			}

			return this.getWorkspaceTasks().then(async (customTasks) => {
				const customTasksKeyValuePairs = Array.from(customTasks);
				const customTasksPromises = customTasksKeyValuePairs.map(async ([key, folderTasks]) => {
					let contributed = contributedTasks.get(key);
					if (!folderTasks.set) {
						if (contributed) {
							result.add(key, ...contributed);
						}
						return;
					}

					if (!contributed) {
						result.add(key, ...folderTasks.set.tasks);
					} else {
						let configurations = folderTasks.configurations;
						let legacyTaskConfigurations = folderTasks.set ? this.getLegacyTaskConfigurations(folderTasks.set) : undefined;
						let customTasksToDelete: Task[] = [];
						if (configurations || legacyTaskConfigurations) {
							let unUsedConfigurations: Set<string> = new Set<string>();
							if (configurations) {
								Object.keys(configurations.byIdentifier).forEach(key => unUsedConfigurations.add(key));
							}
							for (let task of contributed) {
								if (!ContributedTask.is(task)) {
									continue;
								}
								if (configurations) {
									let configuringTask = configurations.byIdentifier[task.defines._key];
									if (configuringTask) {
										unUsedConfigurations.delete(task.defines._key);
										result.add(key, TaskConfig.createCustomTask(task, configuringTask));
									} else {
										result.add(key, task);
									}
								} else if (legacyTaskConfigurations) {
									let configuringTask = legacyTaskConfigurations[task.defines._key];
									if (configuringTask) {
										result.add(key, TaskConfig.createCustomTask(task, configuringTask));
										customTasksToDelete.push(configuringTask);
									} else {
										result.add(key, task);
									}
								} else {
									result.add(key, task);
								}
							}
							if (customTasksToDelete.length > 0) {
								let toDelete = customTasksToDelete.reduce<IStringDictionary<boolean>>((map, task) => {
									map[task._id] = true;
									return map;
								}, Object.create(null));
								for (let task of folderTasks.set.tasks) {
									if (toDelete[task._id]) {
										continue;
									}
									result.add(key, task);
								}
							} else {
								result.add(key, ...folderTasks.set.tasks);
							}

							const unUsedConfigurationsAsArray = Array.from(unUsedConfigurations);

							const unUsedConfigurationPromises = unUsedConfigurationsAsArray.map(async (value) => {
								let configuringTask = configurations!.byIdentifier[value];

								for (const [handle, provider] of this._providers) {
									if (configuringTask.type === this._providerTypes.get(handle)) {
										try {
											const resolvedTask = await provider.resolveTask(configuringTask);
											if (resolvedTask && (resolvedTask._id === configuringTask._id)) {
												result.add(key, TaskConfig.createCustomTask(resolvedTask, configuringTask));
												return;
											}
										} catch (error) {
											// Ignore errors. The task could not be provided by any of the providers.
										}
									}
								}

								this._outputChannel.append(nls.localize(
									'TaskService.noConfiguration',
									'Error: The {0} task detection didn\'t contribute a task for the following configuration:\n{1}\nThe task will be ignored.\n',
									configuringTask.configures.type,
									JSON.stringify(configuringTask._source.config.element, undefined, 4)
								));
								this.showOutput();
							});

							await Promise.all(unUsedConfigurationPromises);
						} else {
							result.add(key, ...folderTasks.set.tasks);
							result.add(key, ...contributed);
						}
					}
				});

				await Promise.all(customTasksPromises);

				return result;
			}, () => {
				// If we can't read the tasks.json file provide at least the contributed tasks
				let result: TaskMap = new TaskMap();
				for (let set of contributedTaskSets) {
					for (let task of set.tasks) {
						const folder = task.getWorkspaceFolder();
						if (folder) {
							result.add(folder, task);
						}
					}
				}
				return result;
			});
		});
	}

	private getLegacyTaskConfigurations(workspaceTasks: TaskSet): IStringDictionary<CustomTask> | undefined {
		let result: IStringDictionary<CustomTask> | undefined;
		function getResult(): IStringDictionary<CustomTask> {
			if (result) {
				return result;
			}
			result = Object.create(null);
			return result!;
		}
		for (let task of workspaceTasks.tasks) {
			if (CustomTask.is(task)) {
				let commandName = task.command && task.command.name;
				// This is for backwards compatibility with the 0.1.0 task annotation code
				// if we had a gulp, jake or grunt command a task specification was a annotation
				if (commandName === 'gulp' || commandName === 'grunt' || commandName === 'jake') {
					let identifier = NKeyedTaskIdentifier.create({
						type: commandName,
						task: task.configurationProperties.name
					});
					getResult()[identifier._key] = task;
				}
			}
		}
		return result;
	}

	public getWorkspaceTasks(runSource: TaskRunSource = TaskRunSource.User): Promise<Map<string, WorkspaceFolderTaskResult>> {
		if (this._workspaceTasksPromise) {
			return this._workspaceTasksPromise;
		}
		this.updateWorkspaceTasks(runSource);
		return this._workspaceTasksPromise!;
	}

	protected abstract updateWorkspaceTasks(runSource: TaskRunSource | void): void;

	protected computeWorkspaceTasks(runSource: TaskRunSource = TaskRunSource.User): Promise<Map<string, WorkspaceFolderTaskResult>> {
		if (this.workspaceFolders.length === 0) {
			return Promise.resolve(new Map<string, WorkspaceFolderTaskResult>());
		} else {
			let promises: Promise<WorkspaceFolderTaskResult | undefined>[] = [];
			for (let folder of this.workspaceFolders) {
				promises.push(this.computeWorkspaceFolderTasks(folder, runSource).then((value) => value, () => undefined));
			}
			return Promise.all(promises).then((values) => {
				let result = new Map<string, WorkspaceFolderTaskResult>();
				for (let value of values) {
					if (value) {
						result.set(value.workspaceFolder.uri.toString(), value);
					}
				}
				return result;
			});
		}
	}

	private computeWorkspaceFolderTasks(workspaceFolder: IWorkspaceFolder, runSource: TaskRunSource = TaskRunSource.User): Promise<WorkspaceFolderTaskResult> {
		return (this.executionEngine === ExecutionEngine.Process
			? this.computeLegacyConfiguration(workspaceFolder)
			: this.computeConfiguration(workspaceFolder)).
			then((workspaceFolderConfiguration) => {
				if (!workspaceFolderConfiguration || !workspaceFolderConfiguration.config || workspaceFolderConfiguration.hasErrors) {
					return Promise.resolve({ workspaceFolder, set: undefined, configurations: undefined, hasErrors: workspaceFolderConfiguration ? workspaceFolderConfiguration.hasErrors : false });
				}
				return ProblemMatcherRegistry.onReady().then((): WorkspaceFolderTaskResult => {
					let taskSystemInfo: TaskSystemInfo | undefined = this._taskSystemInfos.get(workspaceFolder.uri.scheme);
					let problemReporter = new ProblemReporter(this._outputChannel);
					let parseResult = TaskConfig.parse(workspaceFolder, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, workspaceFolderConfiguration.config!, problemReporter);
					let hasErrors = false;
					if (!parseResult.validationStatus.isOK()) {
						hasErrors = true;
						this.showOutput(runSource);
					}
					if (problemReporter.status.isFatal()) {
						problemReporter.fatal(nls.localize('TaskSystem.configurationErrors', 'Error: the provided task configuration has validation errors and can\'t not be used. Please correct the errors first.'));
						return { workspaceFolder, set: undefined, configurations: undefined, hasErrors };
					}
					let customizedTasks: { byIdentifier: IStringDictionary<ConfiguringTask>; } | undefined;
					if (parseResult.configured && parseResult.configured.length > 0) {
						customizedTasks = {
							byIdentifier: Object.create(null)
						};
						for (let task of parseResult.configured) {
							customizedTasks.byIdentifier[task.configures._key] = task;
						}
					}
					return { workspaceFolder, set: { tasks: parseResult.custom }, configurations: customizedTasks, hasErrors };
				});
			});
	}

	private computeConfiguration(workspaceFolder: IWorkspaceFolder): Promise<WorkspaceFolderConfigurationResult> {
		let { config, hasParseErrors } = this.getConfiguration(workspaceFolder);
		return Promise.resolve<WorkspaceFolderConfigurationResult>({ workspaceFolder, config, hasErrors: hasParseErrors });
	}

	protected abstract computeLegacyConfiguration(workspaceFolder: IWorkspaceFolder): Promise<WorkspaceFolderConfigurationResult>;

	private computeWorkspaceFolderSetup(): [IWorkspaceFolder[], IWorkspaceFolder[], ExecutionEngine, JsonSchemaVersion] {
		let workspaceFolders: IWorkspaceFolder[] = [];
		let ignoredWorkspaceFolders: IWorkspaceFolder[] = [];
		let executionEngine = ExecutionEngine.Terminal;
		let schemaVersion = JsonSchemaVersion.V2_0_0;

		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			let workspaceFolder: IWorkspaceFolder = this.contextService.getWorkspace().folders[0];
			workspaceFolders.push(workspaceFolder);
			executionEngine = this.computeExecutionEngine(workspaceFolder);
			schemaVersion = this.computeJsonSchemaVersion(workspaceFolder);
		} else if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			for (let workspaceFolder of this.contextService.getWorkspace().folders) {
				if (schemaVersion === this.computeJsonSchemaVersion(workspaceFolder)) {
					workspaceFolders.push(workspaceFolder);
				} else {
					ignoredWorkspaceFolders.push(workspaceFolder);
					this._outputChannel.append(nls.localize(
						'taskService.ignoreingFolder',
						'Ignoring task configurations for workspace folder {0}. Multi folder workspace task support requires that all folders use task version 2.0.0\n',
						workspaceFolder.uri.fsPath));
				}
			}
		}
		return [workspaceFolders, ignoredWorkspaceFolders, executionEngine, schemaVersion];
	}

	private computeExecutionEngine(workspaceFolder: IWorkspaceFolder): ExecutionEngine {
		let { config } = this.getConfiguration(workspaceFolder);
		if (!config) {
			return ExecutionEngine._default;
		}
		return TaskConfig.ExecutionEngine.from(config);
	}

	private computeJsonSchemaVersion(workspaceFolder: IWorkspaceFolder): JsonSchemaVersion {
		let { config } = this.getConfiguration(workspaceFolder);
		if (!config) {
			return JsonSchemaVersion.V2_0_0;
		}
		return TaskConfig.JsonSchemaVersion.from(config);
	}

	protected getConfiguration(workspaceFolder: IWorkspaceFolder): { config: TaskConfig.ExternalTaskRunnerConfiguration | undefined; hasParseErrors: boolean } {
		let result = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY
			? Objects.deepClone(this.configurationService.getValue<TaskConfig.ExternalTaskRunnerConfiguration>('tasks', { resource: workspaceFolder.uri }))
			: undefined;
		if (!result) {
			return { config: undefined, hasParseErrors: false };
		}
		let parseErrors: string[] = (result as any).$parseErrors;
		if (parseErrors) {
			let isAffected = false;
			for (const parseError of parseErrors) {
				if (/tasks\.json$/.test(parseError)) {
					isAffected = true;
					break;
				}
			}
			if (isAffected) {
				this._outputChannel.append(nls.localize('TaskSystem.invalidTaskJson', 'Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task.\n'));
				this.showOutput();
				return { config: undefined, hasParseErrors: true };
			}
		}
		return { config: result, hasParseErrors: false };
	}

	public inTerminal(): boolean {
		if (this._taskSystem) {
			return this._taskSystem instanceof TerminalTaskSystem;
		}
		return this.executionEngine === ExecutionEngine.Terminal;
	}

	public configureAction(): Action {
		const thisCapture: AbstractTaskService = this;
		return new class extends Action {
			constructor() {
				super(ConfigureTaskAction.ID, ConfigureTaskAction.TEXT, undefined, true, () => { thisCapture.runConfigureTasks(); return Promise.resolve(undefined); });
			}
		};
	}

	public beforeShutdown(): boolean | Promise<boolean> {
		if (!this._taskSystem) {
			return false;
		}
		if (!this._taskSystem.isActiveSync()) {
			return false;
		}
		// The terminal service kills all terminal on shutdown. So there
		// is nothing we can do to prevent this here.
		if (this._taskSystem instanceof TerminalTaskSystem) {
			return false;
		}

		let terminatePromise: Promise<IConfirmationResult>;
		if (this._taskSystem.canAutoTerminate()) {
			terminatePromise = Promise.resolve({ confirmed: true });
		} else {
			terminatePromise = this.dialogService.confirm({
				message: nls.localize('TaskSystem.runningTask', 'There is a task running. Do you want to terminate it?'),
				primaryButton: nls.localize({ key: 'TaskSystem.terminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task"),
				type: 'question'
			});
		}

		return terminatePromise.then(res => {
			if (res.confirmed) {
				return this._taskSystem!.terminateAll().then((responses) => {
					let success = true;
					let code: number | undefined = undefined;
					for (let response of responses) {
						success = success && response.success;
						// We only have a code in the old output runner which only has one task
						// So we can use the first code.
						if (code === undefined && response.code !== undefined) {
							code = response.code;
						}
					}
					if (success) {
						this._taskSystem = undefined;
						this.disposeTaskSystemListeners();
						return false; // no veto
					} else if (code && code === TerminateResponseCode.ProcessNotFound) {
						return this.dialogService.confirm({
							message: nls.localize('TaskSystem.noProcess', 'The launched task doesn\'t exist anymore. If the task spawned background processes exiting VS Code might result in orphaned processes. To avoid this start the last background process with a wait flag.'),
							primaryButton: nls.localize({ key: 'TaskSystem.exitAnyways', comment: ['&& denotes a mnemonic'] }, "&&Exit Anyways"),
							type: 'info'
						}).then(res => !res.confirmed);
					}
					return true; // veto
				}, (err) => {
					return true; // veto
				});
			}

			return true; // veto
		});
	}

	private handleError(err: any): void {
		let showOutput = true;
		if (err instanceof TaskError) {
			let buildError = <TaskError>err;
			let needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
			let needsTerminate = buildError.code === TaskErrors.RunningTask;
			if (needsConfig || needsTerminate) {
				this.notificationService.prompt(buildError.severity, buildError.message, [{
					label: needsConfig ? ConfigureTaskAction.TEXT : nls.localize('TerminateAction.label', "Terminate Task"),
					run: () => {
						if (needsConfig) {
							this.runConfigureTasks();
						} else {
							this.runTerminateCommand();
						}
					}
				}]);
			} else {
				this.notificationService.notify({ severity: buildError.severity, message: buildError.message });
			}
		} else if (err instanceof Error) {
			let error = <Error>err;
			this.notificationService.error(error.message);
			showOutput = false;
		} else if (Types.isString(err)) {
			this.notificationService.error(<string>err);
		} else {
			this.notificationService.error(nls.localize('TaskSystem.unknownError', 'An error has occurred while running a task. See task log for details.'));
		}
		if (showOutput) {
			this.showOutput();
		}
	}

	private canRunCommand(): boolean {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.prompt(
				Severity.Info,
				nls.localize('TaskService.noWorkspace', "Tasks are only available on a workspace folder."),
				[{
					label: nls.localize('TaskService.learnMore', "Learn More"),
					run: () => window.open('https://code.visualstudio.com/docs/editor/tasks')
				}]
			);
			return false;
		}
		return true;
	}

	private createTaskQuickPickEntries(tasks: Task[], group: boolean = false, sort: boolean = false, selectedEntry?: TaskQuickPickEntry): TaskQuickPickEntry[] {
		if (tasks === undefined || tasks === null || tasks.length === 0) {
			return [];
		}
		const TaskQuickPickEntry = (task: Task): TaskQuickPickEntry => {
			let description: string | undefined;
			if (this.needsFolderQualification()) {
				let workspaceFolder = task.getWorkspaceFolder();
				if (workspaceFolder) {
					description = workspaceFolder.name;
				}
			}
			return { label: task._label, description, task };
		};
		function fillEntries(entries: QuickPickInput<TaskQuickPickEntry>[], tasks: Task[], groupLabel: string): void {
			if (tasks.length) {
				entries.push({ type: 'separator', label: groupLabel });
			}
			for (let task of tasks) {
				let entry: TaskQuickPickEntry = TaskQuickPickEntry(task);
				entry.buttons = [{ iconClass: 'quick-open-task-configure', tooltip: nls.localize('configureTask', "Configure Task") }];
				if (selectedEntry && (task === selectedEntry.task)) {
					entries.unshift(selectedEntry);
				} else {
					entries.push(entry);
				}
			}
		}
		let entries: TaskQuickPickEntry[];
		if (group) {
			entries = [];
			if (tasks.length === 1) {
				entries.push(TaskQuickPickEntry(tasks[0]));
			} else {
				let recentlyUsedTasks = this.getRecentlyUsedTasks();
				let recent: Task[] = [];
				let configured: Task[] = [];
				let detected: Task[] = [];
				let taskMap: IStringDictionary<Task> = Object.create(null);
				tasks.forEach(task => {
					let key = task.getRecentlyUsedKey();
					if (key) {
						taskMap[key] = task;
					}
				});
				recentlyUsedTasks.keys().forEach(key => {
					let task = taskMap[key];
					if (task) {
						recent.push(task);
					}
				});
				for (let task of tasks) {
					let key = task.getRecentlyUsedKey();
					if (!key || !recentlyUsedTasks.has(key)) {
						if (task._source.kind === TaskSourceKind.Workspace) {
							configured.push(task);
						} else {
							detected.push(task);
						}
					}
				}
				const sorter = this.createSorter();
				fillEntries(entries, recent, nls.localize('recentlyUsed', 'recently used tasks'));
				configured = configured.sort((a, b) => sorter.compare(a, b));
				fillEntries(entries, configured, nls.localize('configured', 'configured tasks'));
				detected = detected.sort((a, b) => sorter.compare(a, b));
				fillEntries(entries, detected, nls.localize('detected', 'detected tasks'));
			}
		} else {
			if (sort) {
				const sorter = this.createSorter();
				tasks = tasks.sort((a, b) => sorter.compare(a, b));
			}
			entries = tasks.map<TaskQuickPickEntry>(task => TaskQuickPickEntry(task));
		}
		return entries;
	}

	private showQuickPick(tasks: Promise<Task[]> | Task[], placeHolder: string, defaultEntry?: TaskQuickPickEntry, group: boolean = false, sort: boolean = false, selectedEntry?: TaskQuickPickEntry, additionalEntries?: TaskQuickPickEntry[]): Promise<TaskQuickPickEntry | undefined | null> {
		let _createEntries = (): Promise<QuickPickInput<TaskQuickPickEntry>[]> => {
			if (Array.isArray(tasks)) {
				return Promise.resolve(this.createTaskQuickPickEntries(tasks, group, sort, selectedEntry));
			} else {
				return tasks.then((tasks) => this.createTaskQuickPickEntries(tasks, group, sort, selectedEntry));
			}
		};
		return this.quickInputService.pick(_createEntries().then((entries) => {
			if ((entries.length === 0) && defaultEntry) {
				entries.push(defaultEntry);
			} else if (entries.length > 1 && additionalEntries && additionalEntries.length > 0) {
				entries.push({ type: 'separator', label: '' });
				entries.push(additionalEntries[0]);
			}
			return entries;
		}), {
				placeHolder,
				matchOnDescription: true,
				onDidTriggerItemButton: context => {
					let task = context.item.task;
					this.quickInputService.cancel();
					if (ContributedTask.is(task)) {
						this.customize(task, undefined, true);
					} else if (CustomTask.is(task)) {
						this.openConfig(task);
					}
				}
			});
	}

	private showIgnoredFoldersMessage(): Promise<void> {
		if (this.ignoredWorkspaceFolders.length === 0 || !this.showIgnoreMessage) {
			return Promise.resolve(undefined);
		}

		this.notificationService.prompt(
			Severity.Info,
			nls.localize('TaskService.ignoredFolder', 'The following workspace folders are ignored since they use task version 0.1.0: {0}', this.ignoredWorkspaceFolders.map(f => f.name).join(', ')),
			[{
				label: nls.localize('TaskService.notAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					this.storageService.store(AbstractTaskService.IgnoreTask010DonotShowAgain_key, true, StorageScope.WORKSPACE);
					this._showIgnoreMessage = false;
				}
			}]
		);

		return Promise.resolve(undefined);
	}

	private runTaskCommand(arg?: any): void {
		if (!this.canRunCommand()) {
			return;
		}
		let identifier = this.getTaskIdentifier(arg);
		if (identifier !== undefined) {
			this.getGroupedTasks().then((grouped) => {
				let resolver = this.createResolver(grouped);
				let folders = this.contextService.getWorkspace().folders;
				for (let folder of folders) {
					let task = resolver.resolve(folder, identifier);
					if (task) {
						this.run(task).then(undefined, reason => {
							// eat the error, it has already been surfaced to the user and we don't care about it here
						});
						return;
					}
				}
				this.doRunTaskCommand(grouped.all());
			}, () => {
				this.doRunTaskCommand();
			});
		} else {
			this.doRunTaskCommand();
		}
	}

	private doRunTaskCommand(tasks?: Task[]): void {
		this.showIgnoredFoldersMessage().then(() => {
			this.showQuickPick(tasks ? tasks : this.tasks(),
				nls.localize('TaskService.pickRunTask', 'Select the task to run'),
				{
					label: nls.localize('TaskService.noEntryToRun', 'No task to run found. Configure Tasks...'),
					task: null
				},
				true).
				then((entry) => {
					let task: Task | undefined | null = entry ? entry.task : undefined;
					if (task === undefined) {
						return;
					}
					if (task === null) {
						this.runConfigureTasks();
					} else {
						this.run(task, { attachProblemMatcher: true }, TaskRunSource.User).then(undefined, reason => {
							// eat the error, it has already been surfaced to the user and we don't care about it here
						});
					}
				});
		});
	}

	private reRunTaskCommand(): void {
		if (!this.canRunCommand()) {
			return;
		}

		ProblemMatcherRegistry.onReady().then(() => {
			return this.textFileService.saveAll().then((value) => { // make sure all dirty files are saved
				let executeResult = this.getTaskSystem().rerun();
				if (executeResult) {
					return this.handleExecuteResult(executeResult);
				} else {
					this.doRunTaskCommand();
					return Promise.resolve(undefined);
				}
			});
		});
	}

	private splitPerGroupType(tasks: Task[]): { none: Task[], defaults: Task[], users: Task[] } {
		let none: Task[] = [];
		let defaults: Task[] = [];
		let users: Task[] = [];
		for (let task of tasks) {
			if (task.configurationProperties.groupType === GroupType.default) {
				defaults.push(task);
			} else if (task.configurationProperties.groupType === GroupType.user) {
				users.push(task);
			} else {
				none.push(task);
			}
		}
		return { none, defaults, users };
	}

	private runBuildCommand(): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
			this.build();
			return;
		}
		let options: IProgressOptions = {
			location: ProgressLocation.Window,
			title: nls.localize('TaskService.fetchingBuildTasks', 'Fetching build tasks...')
		};
		let promise = this.getTasksForGroup(TaskGroup.Build).then((tasks) => {
			if (tasks.length > 0) {
				let { defaults, users } = this.splitPerGroupType(tasks);
				if (defaults.length === 1) {
					this.run(defaults[0]).then(undefined, reason => {
						// eat the error, it has already been surfaced to the user and we don't care about it here
					});
					return;
				} else if (defaults.length + users.length > 0) {
					tasks = defaults.concat(users);
				}
			}
			this.showIgnoredFoldersMessage().then(() => {
				this.showQuickPick(tasks,
					nls.localize('TaskService.pickBuildTask', 'Select the build task to run'),
					{
						label: nls.localize('TaskService.noBuildTask', 'No build task to run found. Configure Build Task...'),
						task: null
					},
					true).then((entry) => {
						let task: Task | undefined | null = entry ? entry.task : undefined;
						if (task === undefined) {
							return;
						}
						if (task === null) {
							this.runConfigureDefaultBuildTask();
							return;
						}
						this.run(task, { attachProblemMatcher: true }).then(undefined, reason => {
							// eat the error, it has already been surfaced to the user and we don't care about it here
						});
					});
			});
		});
		this.progressService.withProgress(options, () => promise);
	}

	private runTestCommand(): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
			this.runTest();
			return;
		}
		let options: IProgressOptions = {
			location: ProgressLocation.Window,
			title: nls.localize('TaskService.fetchingTestTasks', 'Fetching test tasks...')
		};
		let promise = this.getTasksForGroup(TaskGroup.Test).then((tasks) => {
			if (tasks.length > 0) {
				let { defaults, users } = this.splitPerGroupType(tasks);
				if (defaults.length === 1) {
					this.run(defaults[0]).then(undefined, reason => {
						// eat the error, it has already been surfaced to the user and we don't care about it here
					});
					return;
				} else if (defaults.length + users.length > 0) {
					tasks = defaults.concat(users);
				}
			}
			this.showIgnoredFoldersMessage().then(() => {
				this.showQuickPick(tasks,
					nls.localize('TaskService.pickTestTask', 'Select the test task to run'),
					{
						label: nls.localize('TaskService.noTestTaskTerminal', 'No test task to run found. Configure Tasks...'),
						task: null
					}, true
				).then((entry) => {
					let task: Task | undefined | null = entry ? entry.task : undefined;
					if (task === undefined) {
						return;
					}
					if (task === null) {
						this.runConfigureTasks();
						return;
					}
					this.run(task).then(undefined, reason => {
						// eat the error, it has already been surfaced to the user and we don't care about it here
					});
				});
			});
		});
		this.progressService.withProgress(options, () => promise);
	}

	private runTerminateCommand(arg?: any): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (arg === 'terminateAll') {
			this.terminateAll();
			return;
		}
		let runQuickPick = (promise?: Promise<Task[]>) => {
			this.showQuickPick(promise || this.getActiveTasks(),
				nls.localize('TaskService.taskToTerminate', 'Select a task to terminate'),
				{
					label: nls.localize('TaskService.noTaskRunning', 'No task is currently running'),
					task: undefined
				},
				false, true,
				undefined,
				[{
					label: nls.localize('TaskService.terminateAllRunningTasks', 'All Running Tasks'),
					id: 'terminateAll',
					task: undefined
				}]
			).then(entry => {
				if (entry && entry.id === 'terminateAll') {
					this.terminateAll();
				}
				let task: Task | undefined | null = entry ? entry.task : undefined;
				if (task === undefined || task === null) {
					return;
				}
				this.terminate(task);
			});
		};
		if (this.inTerminal()) {
			let identifier = this.getTaskIdentifier(arg);
			let promise: Promise<Task[]>;
			if (identifier !== undefined) {
				promise = this.getActiveTasks();
				promise.then((tasks) => {
					for (let task of tasks) {
						if (task.matches(identifier)) {
							this.terminate(task);
							return;
						}
					}
					runQuickPick(promise);
				});
			} else {
				runQuickPick();
			}
		} else {
			this.isActive().then((active) => {
				if (active) {
					this.terminateAll().then((responses) => {
						// the output runner has only one task
						let response = responses[0];
						if (response.success) {
							return;
						}
						if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
							this.notificationService.error(nls.localize('TerminateAction.noProcess', 'The launched process doesn\'t exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes.'));
						} else {
							this.notificationService.error(nls.localize('TerminateAction.failed', 'Failed to terminate running task'));
						}
					});
				}
			});
		}
	}

	private runRestartTaskCommand(arg?: any): void {
		if (!this.canRunCommand()) {
			return;
		}
		let runQuickPick = (promise?: Promise<Task[]>) => {
			this.showQuickPick(promise || this.getActiveTasks(),
				nls.localize('TaskService.taskToRestart', 'Select the task to restart'),
				{
					label: nls.localize('TaskService.noTaskToRestart', 'No task to restart'),
					task: null
				},
				false, true
			).then(entry => {
				let task: Task | undefined | null = entry ? entry.task : undefined;
				if (task === undefined || task === null) {
					return;
				}
				this.restart(task);
			});
		};
		if (this.inTerminal()) {
			let identifier = this.getTaskIdentifier(arg);
			let promise: Promise<Task[]>;
			if (identifier !== undefined) {
				promise = this.getActiveTasks();
				promise.then((tasks) => {
					for (let task of tasks) {
						if (task.matches(identifier)) {
							this.restart(task);
							return;
						}
					}
					runQuickPick(promise);
				});
			} else {
				runQuickPick();
			}
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

	private getTaskIdentifier(arg?: any): string | KeyedTaskIdentifier | undefined {
		let result: string | KeyedTaskIdentifier | undefined = undefined;
		if (Types.isString(arg)) {
			result = arg;
		} else if (arg && Types.isString((arg as TaskIdentifier).type)) {
			result = TaskDefinition.createTaskIdentifier(arg as TaskIdentifier, console);
		}
		return result;
	}

	private runConfigureTasks(): void {
		if (!this.canRunCommand()) {
			return undefined;
		}
		let taskPromise: Promise<TaskMap>;
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			taskPromise = this.getGroupedTasks();
		} else {
			taskPromise = Promise.resolve(new TaskMap());
		}

		let openTaskFile = (workspaceFolder: IWorkspaceFolder): void => {
			let resource = workspaceFolder.toResource('.vscode/tasks.json');
			let configFileCreated = false;
			this.fileService.resolve(resource).then((stat) => stat, () => undefined).then((stat) => {
				if (stat) {
					return stat.resource;
				}
				return this.quickInputService.pick(getTaskTemplates(), { placeHolder: nls.localize('TaskService.template', 'Select a Task Template') }).then((selection) => {
					if (!selection) {
						return Promise.resolve(undefined);
					}
					let content = selection.content;
					let editorConfig = this.configurationService.getValue<any>();
					if (editorConfig.editor.insertSpaces) {
						content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + strings.repeat(' ', s2.length * editorConfig.editor.tabSize));
					}
					configFileCreated = true;
					type TaskServiceTemplateClassification = {
						templateId?: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
						autoDetect: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
					};
					type TaskServiceEvent = {
						templateId?: string;
						autoDetect: boolean;
					};
					return this.textFileService.create(resource, content).then((result): URI => {
						this.telemetryService.publicLog2<TaskServiceEvent, TaskServiceTemplateClassification>('taskService.template', {
							templateId: selection.id,
							autoDetect: selection.autoDetect
						});
						return result.resource;
					});
				});
			}).then((resource) => {
				if (!resource) {
					return;
				}
				this.editorService.openEditor({
					resource,
					options: {
						pinned: configFileCreated // pin only if config file is created #8727
					}
				});
			});
		};

		let configureTask = (task: Task): void => {
			if (ContributedTask.is(task)) {
				this.customize(task, undefined, true);
			} else if (CustomTask.is(task)) {
				this.openConfig(task);
			} else if (ConfiguringTask.is(task)) {
				// Do nothing.
			}
		};

		function isTaskEntry(value: IQuickPickItem): value is IQuickPickItem & { task: Task } {
			let candidate: IQuickPickItem & { task: Task } = value as any;
			return candidate && !!candidate.task;
		}

		let stats = this.contextService.getWorkspace().folders.map<Promise<IFileStat | undefined>>((folder) => {
			return this.fileService.resolve(folder.toResource('.vscode/tasks.json')).then(stat => stat, () => undefined);
		});

		let createLabel = nls.localize('TaskService.createJsonFile', 'Create tasks.json file from template');
		let openLabel = nls.localize('TaskService.openJsonFile', 'Open tasks.json file');
		let entries = Promise.all(stats).then((stats) => {
			return taskPromise.then((taskMap) => {
				type EntryType = (IQuickPickItem & { task: Task; }) | (IQuickPickItem & { folder: IWorkspaceFolder; });
				let entries: QuickPickInput<EntryType>[] = [];
				if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
					let tasks = taskMap.all();
					let needsCreateOrOpen: boolean = true;
					if (tasks.length > 0) {
						tasks = tasks.sort((a, b) => a._label.localeCompare(b._label));
						for (let task of tasks) {
							entries.push({ label: task._label, task });
							if (!ContributedTask.is(task)) {
								needsCreateOrOpen = false;
							}
						}
					}
					if (needsCreateOrOpen) {
						let label = stats[0] !== undefined ? openLabel : createLabel;
						if (entries.length) {
							entries.push({ type: 'separator' });
						}
						entries.push({ label, folder: this.contextService.getWorkspace().folders[0] });
					}
				} else {
					let folders = this.contextService.getWorkspace().folders;
					let index = 0;
					for (let folder of folders) {
						let tasks = taskMap.get(folder);
						if (tasks.length > 0) {
							tasks = tasks.slice().sort((a, b) => a._label.localeCompare(b._label));
							for (let i = 0; i < tasks.length; i++) {
								let entry: EntryType = { label: tasks[i]._label, task: tasks[i], description: folder.name };
								if (i === 0) {
									entries.push({ type: 'separator', label: folder.name });
								}
								entries.push(entry);
							}
						} else {
							let label = stats[index] !== undefined ? openLabel : createLabel;
							let entry: EntryType = { label, folder: folder };
							entries.push({ type: 'separator', label: folder.name });
							entries.push(entry);
						}
						index++;
					}
				}
				return entries;
			});
		});

		this.quickInputService.pick(entries,
			{ placeHolder: nls.localize('TaskService.pickTask', 'Select a task to configure') }).
			then((selection) => {
				if (!selection) {
					return;
				}
				if (isTaskEntry(selection)) {
					configureTask(selection.task);
				} else {
					openTaskFile(selection.folder);
				}
			});
	}

	private runConfigureDefaultBuildTask(): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.length === 0) {
					this.runConfigureTasks();
					return;
				}
				let selectedTask: Task | undefined;
				let selectedEntry: TaskQuickPickEntry;
				for (let task of tasks) {
					if (task.configurationProperties.group === TaskGroup.Build && task.configurationProperties.groupType === GroupType.default) {
						selectedTask = task;
						break;
					}
				}
				if (selectedTask) {
					selectedEntry = {
						label: nls.localize('TaskService.defaultBuildTaskExists', '{0} is already marked as the default build task', selectedTask.getQualifiedLabel()),
						task: selectedTask
					};
				}
				this.showIgnoredFoldersMessage().then(() => {
					this.showQuickPick(tasks,
						nls.localize('TaskService.pickDefaultBuildTask', 'Select the task to be used as the default build task'), undefined, true, false, selectedEntry).
						then((entry) => {
							let task: Task | undefined | null = entry ? entry.task : undefined;
							if ((task === undefined) || (task === null)) {
								return;
							}
							if (task === selectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemoryTask.is(task)) {
								this.customize(task, { group: { kind: 'build', isDefault: true } }, true).then(() => {
									if (selectedTask && (task !== selectedTask) && !InMemoryTask.is(selectedTask)) {
										this.customize(selectedTask, { group: 'build' }, true);
									}
								});
							}
						});
				});
			}));
		} else {
			this.runConfigureTasks();
		}
	}

	private runConfigureDefaultTestTask(): void {
		if (!this.canRunCommand()) {
			return;
		}
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.length === 0) {
					this.runConfigureTasks();
					return;
				}
				let selectedTask: Task | undefined;
				let selectedEntry: TaskQuickPickEntry;

				for (let task of tasks) {
					if (task.configurationProperties.group === TaskGroup.Test && task.configurationProperties.groupType === GroupType.default) {
						selectedTask = task;
						break;
					}
				}
				if (selectedTask) {
					selectedEntry = {
						label: nls.localize('TaskService.defaultTestTaskExists', '{0} is already marked as the default test task.', selectedTask.getQualifiedLabel()),
						task: selectedTask
					};
				}

				this.showIgnoredFoldersMessage().then(() => {
					this.showQuickPick(tasks,
						nls.localize('TaskService.pickDefaultTestTask', 'Select the task to be used as the default test task'), undefined, true, false, selectedEntry).then((entry) => {
							let task: Task | undefined | null = entry ? entry.task : undefined;
							if (!task) {
								return;
							}
							if (task === selectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemoryTask.is(task)) {
								this.customize(task, { group: { kind: 'test', isDefault: true } }, true).then(() => {
									if (selectedTask && (task !== selectedTask) && !InMemoryTask.is(selectedTask)) {
										this.customize(selectedTask, { group: 'test' }, true);
									}
								});
							}
						});
				});
			}));
		} else {
			this.runConfigureTasks();
		}
	}

	public runShowTasks(): void {
		if (!this.canRunCommand()) {
			return;
		}
		this.showQuickPick(this.getActiveTasks(),
			nls.localize('TaskService.pickShowTask', 'Select the task to show its output'),
			{
				label: nls.localize('TaskService.noTaskIsRunning', 'No task is running'),
				task: null
			},
			false, true
		).then((entry) => {
			let task: Task | undefined | null = entry ? entry.task : undefined;
			if (task === undefined || task === null) {
				return;
			}
			this._taskSystem!.revealTask(task);
		});
	}
}
