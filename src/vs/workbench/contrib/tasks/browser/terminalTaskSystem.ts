/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import * as Async from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isUNC } from '../../../../base/common/extpath.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedMap, Touch } from '../../../../base/common/map.js';
import * as Objects from '../../../../base/common/objects.js';
import * as path from '../../../../base/common/path.js';
import * as Platform from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import * as Types from '../../../../base/common/types.js';
import * as nls from '../../../../nls.js';

import { IModelService } from '../../../../editor/common/services/model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { Markers } from '../../markers/common/markers.js';
import { ProblemMatcher, ProblemMatcherRegistry /*, ProblemPattern, getResource */ } from '../common/problemMatcher.js';

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IShellLaunchConfig, WaitOnExitValue } from '../../../../platform/terminal/common/terminal.js';
import { formatMessageForTerminal } from '../../../../platform/terminal/common/terminalStrings.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { TaskTerminalStatus } from './taskTerminalStatus.js';
import { ProblemCollectorEventKind, ProblemHandlingStrategy, StartStopProblemCollector, WatchingProblemCollector } from '../common/problemCollectors.js';
import { GroupKind } from '../common/taskConfiguration.js';
import { IResolveSet, IResolvedVariables, ITaskExecuteResult, ITaskResolver, ITaskSummary, ITaskSystem, ITaskSystemInfo, ITaskSystemInfoResolver, ITaskTerminateResponse, TaskError, TaskErrors, TaskExecuteKind, Triggers } from '../common/taskSystem.js';
import { CommandOptions, CommandString, ContributedTask, CustomTask, DependsOrder, ICommandConfiguration, IConfigurationProperties, IExtensionTaskSource, IPresentationOptions, IShellConfiguration, IShellQuotingOptions, ITaskEvent, InMemoryTask, PanelKind, RevealKind, RevealProblemKind, RuntimeType, ShellQuoting, TASK_TERMINAL_ACTIVE, Task, TaskEvent, TaskEventKind, TaskScope, TaskSourceKind } from '../common/tasks.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { VSCodeOscProperty, VSCodeOscPt, VSCodeSequence } from '../../terminal/browser/terminalEscapeSequences.js';
import { TerminalProcessExtHostProxy } from '../../terminal/browser/terminalProcessExtHostProxy.js';
import { ITerminalProfileResolverService, TERMINAL_VIEW_ID } from '../../terminal/common/terminal.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { RerunForActiveTerminalCommandId, rerunTaskIcon } from './task.contribution.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

interface ITerminalData {
	terminal: ITerminalInstance;
	lastTask: string;
	group?: string;
}

interface IInstanceCount {
	count: number;
}

interface IActiveTerminalData {
	terminal?: ITerminalInstance;
	task: Task;
	promise: Promise<ITaskSummary>;
	state?: TaskEventKind;
	count: IInstanceCount;
}

interface IReconnectionTaskData {
	label: string;
	id: string;
	lastTask: string;
	group?: string;
}

const ReconnectionType = 'Task';

class VariableResolver {
	private static _regex = /\$\{(.*?)\}/g;
	constructor(public workspaceFolder: IWorkspaceFolder | undefined, public taskSystemInfo: ITaskSystemInfo | undefined, public readonly values: Map<string, string>, private _service: IConfigurationResolverService | undefined) {
	}
	async resolve(value: string): Promise<string> {
		const replacers: Promise<string>[] = [];
		value.replace(VariableResolver._regex, (match, ...args) => {
			replacers.push(this._replacer(match, args));
			return match;
		});
		const resolvedReplacers = await Promise.all(replacers);
		return value.replace(VariableResolver._regex, () => resolvedReplacers.shift()!);

	}

	private async _replacer(match: string, args: string[]): Promise<string> {
		// Strip out the ${} because the map contains them variables without those characters.
		const result = this.values.get(match.substring(2, match.length - 1));
		if ((result !== undefined) && (result !== null)) {
			return result;
		}
		if (this._service) {
			return this._service.resolveAsync(this.workspaceFolder, match);
		}
		return match;
	}
}

class VerifiedTask {
	readonly task: Task;
	readonly resolver: ITaskResolver;
	readonly trigger: string;
	resolvedVariables?: IResolvedVariables;
	systemInfo?: ITaskSystemInfo;
	workspaceFolder?: IWorkspaceFolder;
	shellLaunchConfig?: IShellLaunchConfig;

	constructor(task: Task, resolver: ITaskResolver, trigger: string) {
		this.task = task;
		this.resolver = resolver;
		this.trigger = trigger;
	}

	public verify(): boolean {
		let verified = false;
		if (this.trigger && this.resolvedVariables && this.workspaceFolder && (this.shellLaunchConfig !== undefined)) {
			verified = true;
		}
		return verified;
	}

	public getVerifiedTask(): { task: Task; resolver: ITaskResolver; trigger: string; resolvedVariables: IResolvedVariables; systemInfo: ITaskSystemInfo; workspaceFolder: IWorkspaceFolder; shellLaunchConfig: IShellLaunchConfig } {
		if (this.verify()) {
			return { task: this.task, resolver: this.resolver, trigger: this.trigger, resolvedVariables: this.resolvedVariables!, systemInfo: this.systemInfo!, workspaceFolder: this.workspaceFolder!, shellLaunchConfig: this.shellLaunchConfig! };
		} else {
			throw new Error('VerifiedTask was not checked. verify must be checked before getVerifiedTask.');
		}
	}
}

export class TerminalTaskSystem extends Disposable implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private static readonly ProcessVarName = '__process__';

	private static _shellQuotes: IStringDictionary<IShellQuotingOptions> = {
		'cmd': {
			strong: '"'
		},
		'powershell': {
			escape: {
				escapeChar: '`',
				charsToEscape: ' "\'()'
			},
			strong: '\'',
			weak: '"'
		},
		'bash': {
			escape: {
				escapeChar: '\\',
				charsToEscape: ' "\''
			},
			strong: '\'',
			weak: '"'
		},
		'zsh': {
			escape: {
				escapeChar: '\\',
				charsToEscape: ' "\''
			},
			strong: '\'',
			weak: '"'
		}
	};

	private static _osShellQuotes: IStringDictionary<IShellQuotingOptions> = {
		'Linux': TerminalTaskSystem._shellQuotes['bash'],
		'Mac': TerminalTaskSystem._shellQuotes['bash'],
		'Windows': TerminalTaskSystem._shellQuotes['powershell']
	};

	private _activeTasks: IStringDictionary<IActiveTerminalData>;
	private _busyTasks: IStringDictionary<Task>;
	private _terminals: IStringDictionary<ITerminalData>;
	private _idleTaskTerminals: LinkedMap<string, string>;
	private _sameTaskTerminals: IStringDictionary<string>;
	private _taskSystemInfoResolver: ITaskSystemInfoResolver;
	private _lastTask: VerifiedTask | undefined;
	// Should always be set in run
	private _currentTask!: VerifiedTask;
	private _isRerun: boolean = false;
	private _previousPanelId: string | undefined;
	private _previousTerminalInstance: ITerminalInstance | undefined;
	private _terminalStatusManager: TaskTerminalStatus;
	private _terminalCreationQueue: Promise<ITerminalInstance | void> = Promise.resolve();
	private _hasReconnected: boolean = false;
	private readonly _onDidStateChange: Emitter<ITaskEvent>;
	private _reconnectedTerminals: ITerminalInstance[] | undefined;
	private _terminalTabActions = [{ id: RerunForActiveTerminalCommandId, label: nls.localize('rerunTask', 'Rerun Task'), icon: rerunTaskIcon }];
	private _taskTerminalActive: IContextKey<boolean>;

	taskShellIntegrationStartSequence(cwd: string | URI | undefined): string {
		return (
			VSCodeSequence(VSCodeOscPt.PromptStart) +
			VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Task}=True`) +
			(cwd
				? VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Cwd}=${typeof cwd === 'string' ? cwd : cwd.fsPath}`)
				: ''
			) +
			VSCodeSequence(VSCodeOscPt.CommandStart)
		);
	}
	get taskShellIntegrationOutputSequence(): string {
		return VSCodeSequence(VSCodeOscPt.CommandExecuted);
	}

	constructor(
		private _terminalService: ITerminalService,
		private _terminalGroupService: ITerminalGroupService,
		private _outputService: IOutputService,
		private _paneCompositeService: IPaneCompositePartService,
		private _viewsService: IViewsService,
		private _markerService: IMarkerService,
		private _modelService: IModelService,
		private _configurationResolverService: IConfigurationResolverService,
		private _contextService: IWorkspaceContextService,
		private _environmentService: IWorkbenchEnvironmentService,
		private _outputChannelId: string,
		private _fileService: IFileService,
		private _terminalProfileResolverService: ITerminalProfileResolverService,
		private _pathService: IPathService,
		private _viewDescriptorService: IViewDescriptorService,
		private _logService: ILogService,
		private _notificationService: INotificationService,
		contextKeyService: IContextKeyService,
		instantiationService: IInstantiationService,
		taskSystemInfoResolver: ITaskSystemInfoResolver,
	) {
		super();

		this._activeTasks = Object.create(null);
		this._busyTasks = Object.create(null);
		this._terminals = Object.create(null);
		this._idleTaskTerminals = new LinkedMap<string, string>();
		this._sameTaskTerminals = Object.create(null);
		this._onDidStateChange = new Emitter();
		this._taskSystemInfoResolver = taskSystemInfoResolver;
		this._register(this._terminalStatusManager = instantiationService.createInstance(TaskTerminalStatus));
		this._taskTerminalActive = TASK_TERMINAL_ACTIVE.bindTo(contextKeyService);
		this._register(this._terminalService.onDidChangeActiveInstance((e) => this._taskTerminalActive.set(e?.shellLaunchConfig.type === 'Task')));
	}

	public get onDidStateChange(): Event<ITaskEvent> {
		return this._onDidStateChange.event;
	}

	private _log(value: string): void {
		this._appendOutput(value + '\n');
	}

	protected _showOutput(): void {
		this._outputService.showChannel(this._outputChannelId, true);
	}

	public reconnect(task: Task, resolver: ITaskResolver): ITaskExecuteResult {
		this._reconnectToTerminals();
		return this.run(task, resolver, Triggers.reconnect);
	}

	public run(task: Task, resolver: ITaskResolver, trigger: string = Triggers.command): ITaskExecuteResult {
		task = task.clone(); // A small amount of task state is stored in the task (instance) and tasks passed in to run may have that set already.
		const instances = InMemoryTask.is(task) || this._isTaskEmpty(task) ? [] : this._getInstances(task);
		const validInstance = instances.length < ((task.runOptions && task.runOptions.instanceLimit) ?? 1);
		const instance = instances[0]?.count?.count ?? 0;
		this._currentTask = new VerifiedTask(task, resolver, trigger);
		if (instance > 0) {
			task.instance = instance;
		}
		if (!validInstance) {
			const terminalData = instances[instances.length - 1];
			this._lastTask = this._currentTask;
			return { kind: TaskExecuteKind.Active, task: terminalData.task, active: { same: true, background: task.configurationProperties.isBackground! }, promise: terminalData.promise };
		}

		try {
			const executeResult = { kind: TaskExecuteKind.Started, task, started: {}, promise: this._executeTask(task, resolver, trigger, new Set(), new Map(), undefined) };
			if (task.configurationProperties.dependsOn) {
				// Track the parent task #244744
				const mapKey = task.getMapKey();
				this._activeTasks[mapKey] = { task, promise: executeResult.promise, count: { count: 0 } };
			}
			executeResult.promise.then(summary => {
				this._lastTask = this._currentTask;
			});
			return executeResult;
		} catch (error) {
			this._removeFromActiveTasks(task);
			if (error instanceof TaskError) {
				throw error;
			} else if (error instanceof Error) {
				this._log(error.message);
				throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
			} else {
				this._log(error.toString());
				throw new TaskError(Severity.Error, nls.localize('TerminalTaskSystem.unknownError', 'A unknown error has occurred while executing a task. See task output log for details.'), TaskErrors.UnknownError);
			}
		}
	}

	public rerun(): ITaskExecuteResult | undefined {
		if (this._lastTask && this._lastTask.verify()) {
			if ((this._lastTask.task.runOptions.reevaluateOnRerun !== undefined) && !this._lastTask.task.runOptions.reevaluateOnRerun) {
				this._isRerun = true;
			}
			const result = this.run(this._lastTask.task, this._lastTask.resolver);
			result.promise.then(summary => {
				this._isRerun = false;
			});
			return result;
		} else {
			return undefined;
		}
	}

	private _showTaskLoadErrors(task: Task) {
		if (task.taskLoadMessages && task.taskLoadMessages.length > 0) {
			task.taskLoadMessages.forEach(loadMessage => {
				this._log(loadMessage + '\n');
			});
			const openOutput = 'Show Output';
			this._notificationService.prompt(Severity.Warning,
				nls.localize('TerminalTaskSystem.taskLoadReporting', "There are issues with task \"{0}\". See the output for more details.",
					task._label), [{
						label: openOutput,
						run: () => this._showOutput()
					}]);
		}
	}

	public isTaskVisible(task: Task): boolean {
		const terminalData = this._activeTasks[task.getMapKey()];
		if (!terminalData?.terminal) {
			return false;
		}
		const activeTerminalInstance = this._terminalService.activeInstance;
		const isPanelShowingTerminal = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
		return isPanelShowingTerminal && (activeTerminalInstance?.instanceId === terminalData.terminal.instanceId);
	}


	public revealTask(task: Task): boolean {
		const terminalData = this._activeTasks[task.getMapKey()];
		if (!terminalData?.terminal) {
			return false;
		}
		const isTerminalInPanel: boolean = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID) === ViewContainerLocation.Panel;
		if (isTerminalInPanel && this.isTaskVisible(task)) {
			if (this._previousPanelId) {
				if (this._previousTerminalInstance) {
					this._terminalService.setActiveInstance(this._previousTerminalInstance);
				}
				this._paneCompositeService.openPaneComposite(this._previousPanelId, ViewContainerLocation.Panel);
			} else {
				this._paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
			}
			this._previousPanelId = undefined;
			this._previousTerminalInstance = undefined;
		} else {
			if (isTerminalInPanel) {
				this._previousPanelId = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.getId();
				if (this._previousPanelId === TERMINAL_VIEW_ID) {
					this._previousTerminalInstance = this._terminalService.activeInstance ?? undefined;
				}
			}
			this._terminalService.setActiveInstance(terminalData.terminal);
			if (CustomTask.is(task) || ContributedTask.is(task)) {
				this._terminalGroupService.showPanel(task.command.presentation!.focus);
			}
		}
		return true;
	}

	public isActive(): Promise<boolean> {
		return Promise.resolve(this.isActiveSync());
	}

	public isActiveSync(): boolean {
		return Object.values(this._activeTasks).some(value => !!value.terminal);
	}

	public canAutoTerminate(): boolean {
		return Object.values(this._activeTasks).every(value => !value.task.configurationProperties.promptOnClose);
	}

	public getActiveTasks(): Task[] {
		return Object.values(this._activeTasks).flatMap(value => value.terminal ? value.task : []);
	}

	public getLastInstance(task: Task): Task | undefined {
		const recentKey = task.getKey();
		return Object.values(this._activeTasks).reverse().find(
			(value) => recentKey && recentKey === value.task.getKey())?.task;
	}

	public getBusyTasks(): Task[] {
		return Object.keys(this._busyTasks).map(key => this._busyTasks[key]);
	}

	public customExecutionComplete(task: Task, result: number): Promise<void> {
		const activeTerminal = this._activeTasks[task.getMapKey()];
		if (!activeTerminal?.terminal) {
			return Promise.reject(new Error('Expected to have a terminal for a custom execution task'));
		}

		return new Promise<void>((resolve) => {
			// activeTerminal.terminal.rendererExit(result);
			resolve();
		});
	}

	private _getInstances(task: Task): IActiveTerminalData[] {
		const recentKey = task.getKey();
		return Object.values(this._activeTasks).filter(
			(value) => recentKey && recentKey === value.task.getKey());
	}

	private _removeFromActiveTasks(task: Task | string): void {
		const key = typeof task === 'string' ? task : task.getMapKey();
		const taskToRemove = this._activeTasks[key];
		if (!taskToRemove) {
			return;
		}
		delete this._activeTasks[key];
	}

	private _fireTaskEvent(event: ITaskEvent) {
		if (event.kind !== TaskEventKind.Changed) {
			const activeTask = this._activeTasks[event.__task.getMapKey()];
			if (activeTask) {
				activeTask.state = event.kind;
			}
		}
		this._onDidStateChange.fire(event);
	}

	public terminate(task: Task): Promise<ITaskTerminateResponse> {
		const activeTerminal = this._activeTasks[task.getMapKey()];
		if (!activeTerminal) {
			return Promise.resolve<ITaskTerminateResponse>({ success: false, task: undefined });
		}
		const terminal = activeTerminal.terminal;
		if (!terminal) {
			return Promise.resolve<ITaskTerminateResponse>({ success: false, task: undefined });
		}
		return new Promise<ITaskTerminateResponse>((resolve, reject) => {
			terminal.onDisposed(terminal => {
				this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
			});
			const onExit = terminal.onExit(() => {
				const task = activeTerminal.task;
				try {
					onExit.dispose();
					this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
				} catch (error) {
					// Do nothing.
				}
				resolve({ success: true, task: task });
			});
			terminal.dispose();
		});
	}

	public terminateAll(): Promise<ITaskTerminateResponse[]> {
		const promises: Promise<ITaskTerminateResponse>[] = [];
		for (const [key, terminalData] of Object.entries(this._activeTasks)) {
			const terminal = terminalData?.terminal;
			if (terminal) {
				promises.push(new Promise<ITaskTerminateResponse>((resolve, reject) => {
					const onExit = terminal.onExit(() => {
						const task = terminalData.task;
						try {
							onExit.dispose();
							this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
						} catch (error) {
							// Do nothing.
						}
						if (this._activeTasks[key] === terminalData) {
							delete this._activeTasks[key];
						}
						resolve({ success: true, task: terminalData.task });
					});
				}));
				terminal.dispose();
			}
		}
		return Promise.all<ITaskTerminateResponse>(promises);
	}

	private _showDependencyCycleMessage(task: Task) {
		this._log(nls.localize('dependencyCycle',
			'There is a dependency cycle. See task "{0}".',
			task._label
		));
		this._showOutput();
	}

	private _executeTask(task: Task, resolver: ITaskResolver, trigger: string, liveDependencies: Set<string>, encounteredTasks: Map<string, Promise<ITaskSummary>>, alreadyResolved?: Map<string, string>): Promise<ITaskSummary> {
		this._showTaskLoadErrors(task);

		const mapKey = task.getMapKey();

		// It's important that we add this task's entry to _activeTasks before
		// any of the code in the then runs (see #180541 and #180578). Wrapping
		// it in Promise.resolve().then() ensures that.
		const promise = Promise.resolve().then(async () => {
			alreadyResolved = alreadyResolved ?? new Map<string, string>();
			const promises: Promise<ITaskSummary>[] = [];
			if (task.configurationProperties.dependsOn) {
				const nextLiveDependencies = new Set(liveDependencies).add(task.getCommonTaskId());
				for (const dependency of task.configurationProperties.dependsOn) {
					const dependencyTask = await resolver.resolve(dependency.uri, dependency.task);
					if (dependencyTask) {
						this._adoptConfigurationForDependencyTask(dependencyTask, task);
						let taskResult;
						const commonKey = dependencyTask.getCommonTaskId();
						if (nextLiveDependencies.has(commonKey)) {
							this._showDependencyCycleMessage(dependencyTask);
							taskResult = Promise.resolve<ITaskSummary>({});
						} else {
							taskResult = encounteredTasks.get(commonKey);
							if (!taskResult) {
								const activeTask = this._activeTasks[dependencyTask.getMapKey()] ?? this._getInstances(dependencyTask).pop();
								taskResult = activeTask && this._getDependencyPromise(activeTask);
								this._activeTasks[mapKey].terminal = activeTask?.terminal;
								this._activeTasks[mapKey].count = { count: task.configurationProperties.dependsOn.length };
							}
						}
						if (!taskResult) {
							this._fireTaskEvent(TaskEvent.general(TaskEventKind.DependsOnStarted, task));
							taskResult = this._executeDependencyTask(dependencyTask, resolver, trigger, nextLiveDependencies, encounteredTasks, alreadyResolved);
						}
						encounteredTasks.set(commonKey, taskResult);
						promises.push(taskResult);
						if (task.configurationProperties.dependsOrder === DependsOrder.sequence) {
							const promiseResult = await taskResult;
							if (promiseResult.exitCode !== 0) {
								break;
							}
						}
					} else {
						this._log(nls.localize('dependencyFailed',
							'Couldn\'t resolve dependent task \'{0}\' in workspace folder \'{1}\'',
							Types.isString(dependency.task) ? dependency.task : JSON.stringify(dependency.task, undefined, 0),
							dependency.uri.toString()
						));
						this._showOutput();
					}
				}
			}

			return Promise.all(promises).then((summaries): Promise<ITaskSummary> | ITaskSummary => {
				for (const summary of summaries) {
					if (summary.exitCode !== 0) {
						return { exitCode: summary.exitCode };
					}
				}
				if ((ContributedTask.is(task) || CustomTask.is(task)) && (task.command)) {
					if (this._isRerun) {
						return this._reexecuteCommand(task, trigger, alreadyResolved!);
					} else {
						return this._executeCommand(task, trigger, alreadyResolved!);
					}
				}
				return { exitCode: 0 };
			});
		}).finally(() => {
			delete this._activeTasks[mapKey];
		});
		const lastInstance = this._getInstances(task).pop();
		const count = lastInstance?.count ?? { count: 0 };
		count.count++;
		const activeTask = { task, promise, count };
		this._activeTasks[mapKey] = activeTask;
		return promise;
	}

	private _createInactiveDependencyPromise(task: Task): Promise<ITaskSummary> {
		return new Promise<ITaskSummary>(resolve => {
			const taskInactiveDisposable = this.onDidStateChange(taskEvent => {
				if ((taskEvent.kind === TaskEventKind.Inactive) && (taskEvent.__task === task)) {
					taskInactiveDisposable.dispose();
					resolve({ exitCode: 0 });
				}
			});
		});
	}

	private _adoptConfigurationForDependencyTask(dependencyTask: Task, task: Task): void {
		if (dependencyTask.configurationProperties.icon) {
			dependencyTask.configurationProperties.icon.id ||= task.configurationProperties.icon?.id;
			dependencyTask.configurationProperties.icon.color ||= task.configurationProperties.icon?.color;
		} else {
			dependencyTask.configurationProperties.icon = task.configurationProperties.icon;
		}
	}

	private async _getDependencyPromise(task: IActiveTerminalData): Promise<ITaskSummary> {
		if (!task.task.configurationProperties.isBackground) {
			return task.promise;
		}
		if (!task.task.configurationProperties.problemMatchers || task.task.configurationProperties.problemMatchers.length === 0) {
			return task.promise;
		}
		if (task.state === TaskEventKind.Inactive) {
			return { exitCode: 0 };
		}
		return this._createInactiveDependencyPromise(task.task);
	}

	private async _executeDependencyTask(task: Task, resolver: ITaskResolver, trigger: string, liveDependencies: Set<string>, encounteredTasks: Map<string, Promise<ITaskSummary>>, alreadyResolved?: Map<string, string>): Promise<ITaskSummary> {
		// If the task is a background task with a watching problem matcher, we don't wait for the whole task to finish,
		// just for the problem matcher to go inactive.
		if (!task.configurationProperties.isBackground) {
			return this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved);
		}

		const inactivePromise = this._createInactiveDependencyPromise(task);
		return Promise.race([inactivePromise, this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved)]);
	}

	private async _resolveAndFindExecutable(systemInfo: ITaskSystemInfo | undefined, workspaceFolder: IWorkspaceFolder | undefined, task: CustomTask | ContributedTask, cwd: string | undefined, envPath: string | undefined): Promise<string> {
		const command = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name!));
		cwd = cwd ? await this._configurationResolverService.resolveAsync(workspaceFolder, cwd) : undefined;
		const delimiter = (await this._pathService.path).delimiter;
		const paths = envPath ? await Promise.all(envPath.split(delimiter).map(p => this._configurationResolverService.resolveAsync(workspaceFolder, p))) : undefined;
		const foundExecutable = await systemInfo?.findExecutable(command, cwd, paths);
		if (foundExecutable) {
			return foundExecutable;
		}
		if (path.isAbsolute(command)) {
			return command;
		}
		return path.join(cwd ?? '', command);
	}

	private _findUnresolvedVariables(variables: Set<string>, alreadyResolved: Map<string, string>): Set<string> {
		if (alreadyResolved.size === 0) {
			return variables;
		}
		const unresolved = new Set<string>();
		for (const variable of variables) {
			if (!alreadyResolved.has(variable.substring(2, variable.length - 1))) {
				unresolved.add(variable);
			}
		}
		return unresolved;
	}

	private _mergeMaps(mergeInto: Map<string, string>, mergeFrom: Map<string, string>) {
		for (const entry of mergeFrom) {
			if (!mergeInto.has(entry[0])) {
				mergeInto.set(entry[0], entry[1]);
			}
		}
	}

	private async _acquireInput(taskSystemInfo: ITaskSystemInfo | undefined, workspaceFolder: IWorkspaceFolder | undefined, task: CustomTask | ContributedTask, variables: Set<string>, alreadyResolved: Map<string, string>): Promise<IResolvedVariables | undefined> {
		const resolved = await this._resolveVariablesFromSet(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved);
		this._fireTaskEvent(TaskEvent.general(TaskEventKind.AcquiredInput, task));
		return resolved;
	}

	private _resolveVariablesFromSet(taskSystemInfo: ITaskSystemInfo | undefined, workspaceFolder: IWorkspaceFolder | undefined, task: CustomTask | ContributedTask, variables: Set<string>, alreadyResolved: Map<string, string>): Promise<IResolvedVariables | undefined> {
		const isProcess = task.command && task.command.runtime === RuntimeType.Process;
		const options = task.command && task.command.options ? task.command.options : undefined;
		const cwd = options ? options.cwd : undefined;
		let envPath: string | undefined = undefined;
		if (options && options.env) {
			for (const key of Object.keys(options.env)) {
				if (key.toLowerCase() === 'path') {
					if (Types.isString(options.env[key])) {
						envPath = options.env[key];
					}
					break;
				}
			}
		}
		const unresolved = this._findUnresolvedVariables(variables, alreadyResolved);
		let resolvedVariables: Promise<IResolvedVariables | undefined>;
		if (taskSystemInfo && workspaceFolder) {
			const resolveSet: IResolveSet = {
				variables: unresolved
			};

			if (taskSystemInfo.platform === Platform.Platform.Windows && isProcess) {
				resolveSet.process = { name: CommandString.value(task.command.name!) };
				if (cwd) {
					resolveSet.process.cwd = cwd;
				}
				if (envPath) {
					resolveSet.process.path = envPath;
				}
			}
			resolvedVariables = taskSystemInfo.resolveVariables(workspaceFolder, resolveSet, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolved) => {
				if (!resolved) {
					return undefined;
				}

				this._mergeMaps(alreadyResolved, resolved.variables);
				resolved.variables = new Map(alreadyResolved);
				if (isProcess) {
					let process = CommandString.value(task.command.name!);
					if (taskSystemInfo.platform === Platform.Platform.Windows) {
						process = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
					}
					resolved.variables.set(TerminalTaskSystem.ProcessVarName, process);
				}
				return resolved;
			});
			return resolvedVariables;
		} else {
			const variablesArray = new Array<string>();
			unresolved.forEach(variable => variablesArray.push(variable));

			return new Promise<IResolvedVariables | undefined>((resolve, reject) => {
				this._configurationResolverService.resolveWithInteraction(workspaceFolder, variablesArray, 'tasks', undefined, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolvedVariablesMap: Map<string, string> | undefined) => {
					if (resolvedVariablesMap) {
						this._mergeMaps(alreadyResolved, resolvedVariablesMap);
						resolvedVariablesMap = new Map(alreadyResolved);
						if (isProcess) {
							let processVarValue: string;
							if (Platform.isWindows) {
								processVarValue = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
							} else {
								processVarValue = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name!));
							}
							resolvedVariablesMap.set(TerminalTaskSystem.ProcessVarName, processVarValue);
						}
						const resolvedVariablesResult: IResolvedVariables = {
							variables: resolvedVariablesMap,
						};
						resolve(resolvedVariablesResult);
					} else {
						resolve(undefined);
					}
				}, reason => {
					reject(reason);
				});
			});
		}
	}

	private _executeCommand(task: CustomTask | ContributedTask, trigger: string, alreadyResolved: Map<string, string>): Promise<ITaskSummary> {
		const taskWorkspaceFolder = task.getWorkspaceFolder();
		let workspaceFolder: IWorkspaceFolder | undefined;
		if (taskWorkspaceFolder) {
			workspaceFolder = this._currentTask.workspaceFolder = taskWorkspaceFolder;
		} else {
			const folders = this._contextService.getWorkspace().folders;
			workspaceFolder = folders.length > 0 ? folders[0] : undefined;
		}
		const systemInfo: ITaskSystemInfo | undefined = this._currentTask.systemInfo = this._taskSystemInfoResolver(workspaceFolder);

		const variables = new Set<string>();
		this._collectTaskVariables(variables, task);
		const resolvedVariables = this._acquireInput(systemInfo, workspaceFolder, task, variables, alreadyResolved);

		return resolvedVariables.then((resolvedVariables) => {
			if (resolvedVariables && !this._isTaskEmpty(task)) {
				this._currentTask.resolvedVariables = resolvedVariables;
				return this._executeInTerminal(task, trigger, new VariableResolver(workspaceFolder, systemInfo, resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
			} else {
				// Allows the taskExecutions array to be updated in the extension host
				this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
				return Promise.resolve({ exitCode: 0 });
			}
		}, reason => {
			return Promise.reject(reason);
		});
	}

	private _isTaskEmpty(task: CustomTask | ContributedTask): boolean {
		const isCustomExecution = (task.command.runtime === RuntimeType.CustomExecution);
		return !((task.command !== undefined) && task.command.runtime && (isCustomExecution || (task.command.name !== undefined)));
	}

	private _reexecuteCommand(task: CustomTask | ContributedTask, trigger: string, alreadyResolved: Map<string, string>): Promise<ITaskSummary> {
		const lastTask = this._lastTask;
		if (!lastTask) {
			return Promise.reject(new Error('No task previously run'));
		}
		const workspaceFolder = this._currentTask.workspaceFolder = lastTask.workspaceFolder;
		const variables = new Set<string>();
		this._collectTaskVariables(variables, task);

		// Check that the task hasn't changed to include new variables
		let hasAllVariables = true;
		variables.forEach(value => {
			if (value.substring(2, value.length - 1) in lastTask.getVerifiedTask().resolvedVariables) {
				hasAllVariables = false;
			}
		});

		if (!hasAllVariables) {
			return this._acquireInput(lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().workspaceFolder, task, variables, alreadyResolved).then((resolvedVariables) => {
				if (!resolvedVariables) {
					// Allows the taskExecutions array to be updated in the extension host
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
					return { exitCode: 0 };
				}
				this._currentTask.resolvedVariables = resolvedVariables;
				return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
			}, reason => {
				return Promise.reject(reason);
			});
		} else {
			this._currentTask.resolvedVariables = lastTask.getVerifiedTask().resolvedVariables;
			return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
		}
	}

	private async _executeInTerminal(task: CustomTask | ContributedTask, trigger: string, resolver: VariableResolver, workspaceFolder: IWorkspaceFolder | undefined): Promise<ITaskSummary> {
		let terminal: ITerminalInstance | undefined = undefined;
		let error: TaskError | undefined = undefined;
		let promise: Promise<ITaskSummary> | undefined = undefined;
		if (task.configurationProperties.isBackground) {
			const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
			const watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this._markerService, this._modelService, this._fileService);
			if ((problemMatchers.length > 0) && !watchingProblemMatcher.isWatching()) {
				this._appendOutput(nls.localize('TerminalTaskSystem.nonWatchingMatcher', 'Task {0} is a background task but uses a problem matcher without a background pattern', task._label));
				this._showOutput();
			}
			const toDispose = new DisposableStore();
			let eventCounter: number = 0;
			const mapKey = task.getMapKey();
			toDispose.add(watchingProblemMatcher.onDidStateChange((event) => {
				if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
					eventCounter++;
					this._busyTasks[mapKey] = task;
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal?.instanceId));
				} else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
					eventCounter--;
					if (this._busyTasks[mapKey]) {
						delete this._busyTasks[mapKey];
					}
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.Inactive, task, terminal?.instanceId));
					if (eventCounter === 0) {
						if ((watchingProblemMatcher.numberOfMatches > 0) && watchingProblemMatcher.maxMarkerSeverity &&
							(watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
							this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
							const reveal = task.command.presentation!.reveal;
							const revealProblems = task.command.presentation!.revealProblems;
							if (revealProblems === RevealProblemKind.OnProblem) {
								this._viewsService.openView(Markers.MARKERS_VIEW_ID, true);
							} else if (reveal === RevealKind.Silent) {
								this._terminalService.setActiveInstance(terminal!);
								this._terminalGroupService.showPanel(false);
							}
						} else {
							this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherEnded, task, terminal?.instanceId));
						}
					}
				}
			}));
			watchingProblemMatcher.aboutToStart();
			let delayer: Async.Delayer<any> | undefined = undefined;
			[terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);

			if (error) {
				return Promise.reject(new Error((<TaskError>error).message));
			}
			if (!terminal) {
				return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
			}
			this._terminalStatusManager.addTerminal(task, terminal, watchingProblemMatcher);

			let processStartedSignaled = false;
			terminal.processReady.then(() => {
				if (!processStartedSignaled) {
					this._fireTaskEvent(TaskEvent.processStarted(task, terminal!.instanceId, terminal!.processId!));
					processStartedSignaled = true;
				}
			}, (_error) => {
				this._logService.error('Task terminal process never got ready');
			});
			this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
			let onData: IDisposable | undefined;
			if (problemMatchers.length) {
				this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherStarted, task, terminal.instanceId));
				// prevent https://github.com/microsoft/vscode/issues/174511 from happening
				onData = terminal.onLineData((line) => {
					watchingProblemMatcher.processLine(line);
					if (!delayer) {
						delayer = new Async.Delayer(3000);
					}
					delayer.trigger(() => {
						watchingProblemMatcher.forceDelivery();
						delayer = undefined;
					});
				});
			}

			promise = new Promise<ITaskSummary>((resolve, reject) => {
				const onExit = terminal!.onExit((terminalLaunchResult) => {
					const exitCode = typeof terminalLaunchResult === 'number' ? terminalLaunchResult : terminalLaunchResult?.code;
					onData?.dispose();
					onExit.dispose();
					const key = task.getMapKey();
					if (this._busyTasks[mapKey]) {
						delete this._busyTasks[mapKey];
					}
					this._removeFromActiveTasks(task);
					this._fireTaskEvent(TaskEvent.changed());
					if (terminalLaunchResult !== undefined) {
						// Only keep a reference to the terminal if it is not being disposed.
						switch (task.command.presentation!.panel) {
							case PanelKind.Dedicated:
								this._sameTaskTerminals[key] = terminal!.instanceId.toString();
								break;
							case PanelKind.Shared:
								this._idleTaskTerminals.set(key, terminal!.instanceId.toString(), Touch.AsOld);
								break;
						}
					}
					const reveal = task.command.presentation!.reveal;
					if ((reveal === RevealKind.Silent) && ((exitCode !== 0) || (watchingProblemMatcher.numberOfMatches > 0) && watchingProblemMatcher.maxMarkerSeverity &&
						(watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error))) {
						try {
							this._terminalService.setActiveInstance(terminal!);
							this._terminalGroupService.showPanel(false);
						} catch (e) {
							// If the terminal has already been disposed, then setting the active instance will fail. #99828
							// There is nothing else to do here.
						}
					}
					watchingProblemMatcher.done();
					watchingProblemMatcher.dispose();
					if (!processStartedSignaled) {
						this._fireTaskEvent(TaskEvent.processStarted(task, terminal!.instanceId, terminal!.processId!));
						processStartedSignaled = true;
					}
					this._fireTaskEvent(TaskEvent.processEnded(task, terminal!.instanceId, exitCode));

					for (let i = 0; i < eventCounter; i++) {
						this._fireTaskEvent(TaskEvent.general(TaskEventKind.Inactive, task, terminal!.instanceId));
					}
					eventCounter = 0;
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
					toDispose.dispose();
					resolve({ exitCode: exitCode ?? undefined });
				});
			});
			if (trigger === Triggers.reconnect && !!terminal.xterm) {
				const bufferLines = [];
				const bufferReverseIterator = terminal.xterm.getBufferReverseIterator();
				const startRegex = new RegExp(watchingProblemMatcher.beginPatterns.map(pattern => pattern.source).join('|'));
				for (const nextLine of bufferReverseIterator) {
					bufferLines.push(nextLine);
					if (startRegex.test(nextLine)) {
						break;
					}
				}
				let delayer: Async.Delayer<any> | undefined = undefined;
				for (let i = bufferLines.length - 1; i >= 0; i--) {
					watchingProblemMatcher.processLine(bufferLines[i]);
					if (!delayer) {
						delayer = new Async.Delayer(3000);
					}
					delayer.trigger(() => {
						watchingProblemMatcher.forceDelivery();
						delayer = undefined;
					});
				}
			}
		} else {
			[terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);

			if (error) {
				return Promise.reject(new Error((<TaskError>error).message));
			}
			if (!terminal) {
				return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
			}

			this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
			const mapKey = task.getMapKey();
			this._busyTasks[mapKey] = task;
			this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal.instanceId));

			const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
			const startStopProblemMatcher = new StartStopProblemCollector(problemMatchers, this._markerService, this._modelService, ProblemHandlingStrategy.Clean, this._fileService);
			this._terminalStatusManager.addTerminal(task, terminal, startStopProblemMatcher);
			startStopProblemMatcher.onDidStateChange((event) => {
				if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherStarted, task, terminal?.instanceId));
				} else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
					if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
						this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
					} else {
						this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherEnded, task, terminal?.instanceId));
					}
				}
			});
			let processStartedSignaled = false;
			terminal.processReady.then(() => {
				if (!processStartedSignaled) {
					this._fireTaskEvent(TaskEvent.processStarted(task, terminal!.instanceId, terminal!.processId!));
					processStartedSignaled = true;
				}
			}, (_error) => {
				// The process never got ready. Need to think how to handle this.
			});

			const onData = terminal.onLineData((line) => {
				startStopProblemMatcher.processLine(line);
			});
			promise = new Promise<ITaskSummary>((resolve, reject) => {
				const onExit = terminal!.onExit((terminalLaunchResult) => {
					const exitCode = typeof terminalLaunchResult === 'number' ? terminalLaunchResult : terminalLaunchResult?.code;
					onExit.dispose();
					const key = task.getMapKey();
					this._removeFromActiveTasks(task);
					this._fireTaskEvent(TaskEvent.changed());
					if (terminalLaunchResult !== undefined) {
						// Only keep a reference to the terminal if it is not being disposed.
						switch (task.command.presentation!.panel) {
							case PanelKind.Dedicated:
								this._sameTaskTerminals[key] = terminal!.instanceId.toString();
								break;
							case PanelKind.Shared:
								this._idleTaskTerminals.set(key, terminal!.instanceId.toString(), Touch.AsOld);
								break;
						}
					}
					const reveal = task.command.presentation!.reveal;
					const revealProblems = task.command.presentation!.revealProblems;
					const revealProblemPanel = terminal && (revealProblems === RevealProblemKind.OnProblem) && (startStopProblemMatcher.numberOfMatches > 0);
					if (revealProblemPanel) {
						this._viewsService.openView(Markers.MARKERS_VIEW_ID);
					} else if (terminal && (reveal === RevealKind.Silent) && ((exitCode !== 0) || (startStopProblemMatcher.numberOfMatches > 0) && startStopProblemMatcher.maxMarkerSeverity &&
						(startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error))) {
						try {
							this._terminalService.setActiveInstance(terminal);
							this._terminalGroupService.showPanel(false);
						} catch (e) {
							// If the terminal has already been disposed, then setting the active instance will fail. #99828
							// There is nothing else to do here.
						}
					}
					// Hack to work around #92868 until terminal is fixed.
					setTimeout(() => {
						onData.dispose();
						startStopProblemMatcher.done();
						startStopProblemMatcher.dispose();
					}, 100);
					if (!processStartedSignaled && terminal) {
						this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId!));
						processStartedSignaled = true;
					}

					this._fireTaskEvent(TaskEvent.processEnded(task, terminal?.instanceId, exitCode ?? undefined));
					if (this._busyTasks[mapKey]) {
						delete this._busyTasks[mapKey];
					}
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.Inactive, task, terminal?.instanceId));
					if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
						this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
					} else {
						this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherEnded, task, terminal?.instanceId));
					}
					this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task, terminal?.instanceId));
					resolve({ exitCode: exitCode ?? undefined });
				});
			});
		}

		const showProblemPanel = task.command.presentation && (task.command.presentation.revealProblems === RevealProblemKind.Always);
		if (showProblemPanel) {
			this._viewsService.openView(Markers.MARKERS_VIEW_ID);
		} else if (task.command.presentation && (task.command.presentation.focus || task.command.presentation.reveal === RevealKind.Always)) {
			this._terminalService.setActiveInstance(terminal);
			await this._terminalService.revealTerminal(terminal);
			if (task.command.presentation.focus) {
				this._terminalService.focusInstance(terminal);
			}
		}
		if (this._activeTasks[task.getMapKey()]) {
			this._activeTasks[task.getMapKey()].terminal = terminal;
		} else {
			console.warn('No active tasks found for the terminal.');
		}
		this._fireTaskEvent(TaskEvent.changed());
		return promise;
	}

	private _createTerminalName(task: CustomTask | ContributedTask): string {
		const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		return needsFolderQualification ? task.getQualifiedLabel() : (task.configurationProperties.name || '');
	}

	private async _createShellLaunchConfig(task: CustomTask | ContributedTask, workspaceFolder: IWorkspaceFolder | undefined, variableResolver: VariableResolver, platform: Platform.Platform, options: CommandOptions, command: CommandString, args: CommandString[], waitOnExit: WaitOnExitValue): Promise<IShellLaunchConfig | undefined> {
		let shellLaunchConfig: IShellLaunchConfig;
		const isShellCommand = task.command.runtime === RuntimeType.Shell;
		const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		const terminalName = this._createTerminalName(task);
		const type = ReconnectionType;
		const originalCommand = task.command.name;
		let cwd: string | URI | undefined;
		if (options.cwd) {
			cwd = options.cwd;
			if (!path.isAbsolute(cwd)) {
				if (workspaceFolder && (workspaceFolder.uri.scheme === Schemas.file)) {
					cwd = path.join(workspaceFolder.uri.fsPath, cwd);
				}
			}
			// This must be normalized to the OS
			cwd = isUNC(cwd) ? cwd : resources.toLocalResource(URI.from({ scheme: Schemas.file, path: cwd }), this._environmentService.remoteAuthority, this._pathService.defaultUriScheme);
		}
		if (isShellCommand) {
			let os: Platform.OperatingSystem;
			switch (platform) {
				case Platform.Platform.Windows: os = Platform.OperatingSystem.Windows; break;
				case Platform.Platform.Mac: os = Platform.OperatingSystem.Macintosh; break;
				case Platform.Platform.Linux:
				default: os = Platform.OperatingSystem.Linux; break;
			}
			const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
				allowAutomationShell: true,
				os,
				remoteAuthority: this._environmentService.remoteAuthority
			});
			let icon: URI | ThemeIcon | { light: URI; dark: URI } | undefined;
			if (task.configurationProperties.icon?.id) {
				icon = ThemeIcon.fromId(task.configurationProperties.icon.id);
			} else {
				const taskGroupKind = task.configurationProperties.group ? GroupKind.to(task.configurationProperties.group) : undefined;
				const kindId = typeof taskGroupKind === 'string' ? taskGroupKind : taskGroupKind?.kind;
				icon = kindId === 'test' ? ThemeIcon.fromId(Codicon.beaker.id) : defaultProfile.icon;
			}
			shellLaunchConfig = {
				name: terminalName,
				type,
				executable: defaultProfile.path,
				args: defaultProfile.args,
				env: { ...defaultProfile.env },
				icon,
				color: task.configurationProperties.icon?.color || undefined,
				waitOnExit
			};
			let shellSpecified: boolean = false;
			const shellOptions: IShellConfiguration | undefined = task.command.options && task.command.options.shell;
			if (shellOptions) {
				if (shellOptions.executable) {
					// Clear out the args so that we don't end up with mismatched args.
					if (shellOptions.executable !== shellLaunchConfig.executable) {
						shellLaunchConfig.args = undefined;
					}
					shellLaunchConfig.executable = await this._resolveVariable(variableResolver, shellOptions.executable);
					shellSpecified = true;
				}
				if (shellOptions.args) {
					shellLaunchConfig.args = await this._resolveVariables(variableResolver, shellOptions.args.slice());
				}
			}
			if (shellLaunchConfig.args === undefined) {
				shellLaunchConfig.args = [];
			}
			const shellArgs = Array.isArray(shellLaunchConfig.args) ? <string[]>shellLaunchConfig.args.slice(0) : [shellLaunchConfig.args];
			const toAdd: string[] = [];
			const basename = path.posix.basename((await this._pathService.fileURI(shellLaunchConfig.executable!)).path).toLowerCase();
			const commandLine = this._buildShellCommandLine(platform, basename, shellOptions, command, originalCommand, args);
			let windowsShellArgs: boolean = false;
			if (platform === Platform.Platform.Windows) {
				windowsShellArgs = true;
				// If we don't have a cwd, then the terminal uses the home dir.
				const userHome = await this._pathService.userHome();
				if (basename === 'cmd.exe' && ((options.cwd && isUNC(options.cwd)) || (!options.cwd && isUNC(userHome.fsPath)))) {
					return undefined;
				}
				if ((basename === 'powershell.exe') || (basename === 'pwsh.exe')) {
					if (!shellSpecified) {
						toAdd.push('-Command');
					}
				} else if ((basename === 'bash.exe') || (basename === 'zsh.exe')) {
					windowsShellArgs = false;
					if (!shellSpecified) {
						toAdd.push('-c');
					}
				} else if (basename === 'wsl.exe') {
					if (!shellSpecified) {
						toAdd.push('-e');
					}
				} else {
					if (!shellSpecified) {
						toAdd.push('/d', '/c');
					}
				}
			} else {
				if (!shellSpecified) {
					// Under Mac remove -l to not start it as a login shell.
					if (platform === Platform.Platform.Mac) {
						// Background on -l on osx https://github.com/microsoft/vscode/issues/107563
						// TODO: Handle by pulling the default terminal profile?
						// const osxShellArgs = this._configurationService.inspect(TerminalSettingId.ShellArgsMacOs);
						// if ((osxShellArgs.user === undefined) && (osxShellArgs.userLocal === undefined) && (osxShellArgs.userLocalValue === undefined)
						// 	&& (osxShellArgs.userRemote === undefined) && (osxShellArgs.userRemoteValue === undefined)
						// 	&& (osxShellArgs.userValue === undefined) && (osxShellArgs.workspace === undefined)
						// 	&& (osxShellArgs.workspaceFolder === undefined) && (osxShellArgs.workspaceFolderValue === undefined)
						// 	&& (osxShellArgs.workspaceValue === undefined)) {
						// 	const index = shellArgs.indexOf('-l');
						// 	if (index !== -1) {
						// 		shellArgs.splice(index, 1);
						// 	}
						// }
					}
					toAdd.push('-c');
				}
			}
			const combinedShellArgs = this._addAllArgument(toAdd, shellArgs);
			combinedShellArgs.push(commandLine);
			shellLaunchConfig.args = windowsShellArgs ? combinedShellArgs.join(' ') : combinedShellArgs;
			if (task.command.presentation && task.command.presentation.echo) {
				if (needsFolderQualification && workspaceFolder) {
					const folder = cwd && typeof cwd === 'object' && 'path' in cwd ? path.basename(cwd.path) : workspaceFolder.name;
					shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
						key: 'task.executingInFolder',
						comment: ['The workspace folder the task is running in', 'The task command line or label']

					}, 'Executing task in folder {0}: {1}', folder, commandLine), { excludeLeadingNewLine: true }) + this.taskShellIntegrationOutputSequence;
				} else {
					shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
						key: 'task.executing.shellIntegration',
						comment: ['The task command line or label']
					}, 'Executing task: {0}', commandLine), { excludeLeadingNewLine: true }) + this.taskShellIntegrationOutputSequence;
				}
			} else {
				shellLaunchConfig.initialText = {
					text: this.taskShellIntegrationStartSequence(cwd) + this.taskShellIntegrationOutputSequence,
					trailingNewLine: false
				};
			}
		} else {
			const commandExecutable = (task.command.runtime !== RuntimeType.CustomExecution) ? CommandString.value(command) : undefined;
			const executable = !isShellCommand
				? await this._resolveVariable(variableResolver, await this._resolveVariable(variableResolver, '${' + TerminalTaskSystem.ProcessVarName + '}'))
				: commandExecutable;

			// When we have a process task there is no need to quote arguments. So we go ahead and take the string value.
			shellLaunchConfig = {
				name: terminalName,
				type,
				icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : undefined,
				color: task.configurationProperties.icon?.color || undefined,
				executable: executable,
				args: args.map(a => Types.isString(a) ? a : a.value),
				waitOnExit
			};
			if (task.command.presentation && task.command.presentation.echo) {
				const getArgsToEcho = (args: string | string[] | undefined): string => {
					if (!args || args.length === 0) {
						return '';
					}
					if (Types.isString(args)) {
						return args;
					}
					return args.join(' ');
				};
				if (needsFolderQualification && workspaceFolder) {
					shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
						key: 'task.executingInFolder',
						comment: ['The workspace folder the task is running in', 'The task command line or label']
					}, 'Executing task in folder {0}: {1}', workspaceFolder.name, `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.taskShellIntegrationOutputSequence;
				} else {
					shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
						key: 'task.executing.shell-integration',
						comment: ['The task command line or label']
					}, 'Executing task: {0}', `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.taskShellIntegrationOutputSequence;
				}
			} else {
				shellLaunchConfig.initialText = {
					text: this.taskShellIntegrationStartSequence(cwd) + this.taskShellIntegrationOutputSequence,
					trailingNewLine: false
				};
			}
		}

		if (cwd) {
			shellLaunchConfig.cwd = cwd;
		}
		if (options.env) {
			if (shellLaunchConfig.env) {
				shellLaunchConfig.env = { ...shellLaunchConfig.env, ...options.env };
			} else {
				shellLaunchConfig.env = options.env;
			}
		}
		shellLaunchConfig.isFeatureTerminal = true;
		shellLaunchConfig.useShellEnvironment = true;
		shellLaunchConfig.tabActions = this._terminalTabActions;
		return shellLaunchConfig;
	}

	private _addAllArgument(shellCommandArgs: string[], configuredShellArgs: string[]): string[] {
		const combinedShellArgs: string[] = Objects.deepClone(configuredShellArgs);
		shellCommandArgs.forEach(element => {
			const shouldAddShellCommandArg = configuredShellArgs.every((arg, index) => {
				if ((arg.toLowerCase() === element) && (configuredShellArgs.length > index + 1)) {
					// We can still add the argument, but only if not all of the following arguments begin with "-".
					return !configuredShellArgs.slice(index + 1).every(testArg => testArg.startsWith('-'));
				} else {
					return arg.toLowerCase() !== element;
				}
			});
			if (shouldAddShellCommandArg) {
				combinedShellArgs.push(element);
			}
		});
		return combinedShellArgs;
	}

	private async _reconnectToTerminal(task: Task): Promise<ITerminalInstance | undefined> {
		if (!this._reconnectedTerminals) {
			return;
		}
		for (let i = 0; i < this._reconnectedTerminals.length; i++) {
			const terminal = this._reconnectedTerminals[i];
			if (getReconnectionData(terminal)?.lastTask === task.getCommonTaskId()) {
				this._reconnectedTerminals.splice(i, 1);
				return terminal;
			}
		}
		return undefined;
	}

	private async _doCreateTerminal(task: Task, group: string | undefined, launchConfigs: IShellLaunchConfig): Promise<ITerminalInstance> {
		const reconnectedTerminal = await this._reconnectToTerminal(task);
		const onDisposed = (terminal: ITerminalInstance) => this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
		if (reconnectedTerminal) {
			if ('command' in task && task.command.presentation) {
				reconnectedTerminal.waitOnExit = getWaitOnExitValue(task.command.presentation, task.configurationProperties);
			}
			reconnectedTerminal.onDisposed(onDisposed);
			this._logService.trace('reconnected to task and terminal', task._id);
			return reconnectedTerminal;
		}
		if (group) {
			// Try to find an existing terminal to split.
			// Even if an existing terminal is found, the split can fail if the terminal width is too small.
			for (const terminal of Object.values(this._terminals)) {
				if (terminal.group === group) {
					this._logService.trace(`Found terminal to split for group ${group}`);
					const originalInstance = terminal.terminal;
					const result = await this._terminalService.createTerminal({ location: { parentTerminal: originalInstance }, config: launchConfigs });
					result.onDisposed(onDisposed);
					if (result) {
						return result;
					}
				}
			}
			this._logService.trace(`No terminal found to split for group ${group}`);
		}
		// Either no group is used, no terminal with the group exists or splitting an existing terminal failed.
		const createdTerminal = await this._terminalService.createTerminal({ config: launchConfigs });
		createdTerminal.onDisposed(onDisposed);
		return createdTerminal;
	}

	private _reconnectToTerminals(): void {
		if (this._hasReconnected) {
			this._logService.trace(`Already reconnected, to ${this._reconnectedTerminals?.length} terminals so returning`);
			return;
		}
		this._reconnectedTerminals = this._terminalService.getReconnectedTerminals(ReconnectionType)?.filter(t => !t.isDisposed && getReconnectionData(t)) || [];
		this._logService.trace(`Attempting reconnection of ${this._reconnectedTerminals?.length} terminals`);
		if (!this._reconnectedTerminals?.length) {
			this._logService.trace(`No terminals to reconnect to so returning`);
		} else {
			for (const terminal of this._reconnectedTerminals) {
				const data = getReconnectionData(terminal) as IReconnectionTaskData | undefined;
				if (data) {
					const terminalData = { lastTask: data.lastTask, group: data.group, terminal };
					this._terminals[terminal.instanceId] = terminalData;
					this._logService.trace('Reconnecting to task terminal', terminalData.lastTask, terminal.instanceId);
				}
			}
		}
		this._hasReconnected = true;
	}

	private _deleteTaskAndTerminal(terminal: ITerminalInstance, terminalData: ITerminalData): void {
		delete this._terminals[terminal.instanceId];
		delete this._sameTaskTerminals[terminalData.lastTask];
		this._idleTaskTerminals.delete(terminalData.lastTask);
		// Delete the task now as a work around for cases when the onExit isn't fired.
		// This can happen if the terminal wasn't shutdown with an "immediate" flag and is expected.
		// For correct terminal re-use, the task needs to be deleted immediately.
		// Note that this shouldn't be a problem anymore since user initiated terminal kills are now immediate.
		const mapKey = terminalData.lastTask;
		this._removeFromActiveTasks(mapKey);
		if (this._busyTasks[mapKey]) {
			delete this._busyTasks[mapKey];
		}
	}

	private async _createTerminal(task: CustomTask | ContributedTask, resolver: VariableResolver, workspaceFolder: IWorkspaceFolder | undefined): Promise<[ITerminalInstance | undefined, TaskError | undefined]> {
		const platform = resolver.taskSystemInfo ? resolver.taskSystemInfo.platform : Platform.platform;
		const options = await this._resolveOptions(resolver, task.command.options);
		const presentationOptions = task.command.presentation;

		if (!presentationOptions) {
			throw new Error('Task presentation options should not be undefined here.');
		}
		const waitOnExit = getWaitOnExitValue(presentationOptions, task.configurationProperties);

		let command: CommandString | undefined;
		let args: CommandString[] | undefined;
		let launchConfigs: IShellLaunchConfig | undefined;

		if (task.command.runtime === RuntimeType.CustomExecution) {
			this._currentTask.shellLaunchConfig = launchConfigs = {
				customPtyImplementation: (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService),
				waitOnExit,
				name: this._createTerminalName(task),
				initialText: task.command.presentation && task.command.presentation.echo ? formatMessageForTerminal(nls.localize({
					key: 'task.executing',
					comment: ['The task command line or label']
				}, 'Executing task: {0}', task._label), { excludeLeadingNewLine: true }) : undefined,
				isFeatureTerminal: true,
				icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : undefined,
				color: task.configurationProperties.icon?.color || undefined
			};
		} else {
			const resolvedResult: { command: CommandString; args: CommandString[] } = await this._resolveCommandAndArgs(resolver, task.command);
			command = resolvedResult.command;
			args = resolvedResult.args;

			this._currentTask.shellLaunchConfig = launchConfigs = await this._createShellLaunchConfig(task, workspaceFolder, resolver, platform, options, command, args, waitOnExit);
			if (launchConfigs === undefined) {
				return [undefined, new TaskError(Severity.Error, nls.localize('TerminalTaskSystem', 'Can\'t execute a shell command on an UNC drive using cmd.exe.'), TaskErrors.UnknownError)];
			}
		}
		const prefersSameTerminal = presentationOptions.panel === PanelKind.Dedicated;
		const allowsSharedTerminal = presentationOptions.panel === PanelKind.Shared;
		const group = presentationOptions.group;

		const taskKey = task.getMapKey();
		let terminalToReuse: ITerminalData | undefined;
		if (prefersSameTerminal) {
			const terminalId = this._sameTaskTerminals[taskKey];
			if (terminalId) {
				terminalToReuse = this._terminals[terminalId];
				delete this._sameTaskTerminals[taskKey];
			}
		} else if (allowsSharedTerminal) {
			// Always allow to reuse the terminal previously used by the same task.
			let terminalId = this._idleTaskTerminals.remove(taskKey);
			if (!terminalId) {
				// There is no idle terminal which was used by the same task.
				// Search for any idle terminal used previously by a task of the same group
				// (or, if the task has no group, a terminal used by a task without group).
				for (const taskId of this._idleTaskTerminals.keys()) {
					const idleTerminalId = this._idleTaskTerminals.get(taskId)!;
					if (idleTerminalId && this._terminals[idleTerminalId] && this._terminals[idleTerminalId].group === group) {
						terminalId = this._idleTaskTerminals.remove(taskId);
						break;
					}
				}
			}
			if (terminalId) {
				terminalToReuse = this._terminals[terminalId];
			}
		}
		if (terminalToReuse) {
			if (!launchConfigs) {
				throw new Error('Task shell launch configuration should not be undefined here.');
			}

			terminalToReuse.terminal.scrollToBottom();
			if (task.configurationProperties.isBackground) {
				launchConfigs.reconnectionProperties = { ownerId: ReconnectionType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
			}
			await terminalToReuse.terminal.reuseTerminal(launchConfigs);

			if (task.command.presentation && task.command.presentation.clear) {
				terminalToReuse.terminal.clearBuffer();
			}
			this._terminals[terminalToReuse.terminal.instanceId.toString()].lastTask = taskKey;
			return [terminalToReuse.terminal, undefined];
		}

		this._terminalCreationQueue = this._terminalCreationQueue.then(() => this._doCreateTerminal(task, group, launchConfigs));
		const terminal: ITerminalInstance = (await this._terminalCreationQueue)!;
		if (task.configurationProperties.isBackground) {
			terminal.shellLaunchConfig.reconnectionProperties = { ownerId: ReconnectionType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
		}
		const terminalKey = terminal.instanceId.toString();
		const terminalData = { terminal: terminal, lastTask: taskKey, group };
		terminal.onDisposed(() => this._deleteTaskAndTerminal(terminal, terminalData));
		this._terminals[terminalKey] = terminalData;
		terminal.shellLaunchConfig.tabActions = this._terminalTabActions;
		return [terminal, undefined];
	}

	private _buildShellCommandLine(platform: Platform.Platform, shellExecutable: string, shellOptions: IShellConfiguration | undefined, command: CommandString, originalCommand: CommandString | undefined, args: CommandString[]): string {
		const basename = path.parse(shellExecutable).name.toLowerCase();
		const shellQuoteOptions = this._getQuotingOptions(basename, shellOptions, platform);

		function needsQuotes(value: string): boolean {
			if (value.length >= 2) {
				const first = value[0] === shellQuoteOptions.strong ? shellQuoteOptions.strong : value[0] === shellQuoteOptions.weak ? shellQuoteOptions.weak : undefined;
				if (first === value[value.length - 1]) {
					return false;
				}
			}
			let quote: string | undefined;
			for (let i = 0; i < value.length; i++) {
				// We found the end quote.
				const ch = value[i];
				if (ch === quote) {
					quote = undefined;
				} else if (quote !== undefined) {
					// skip the character. We are quoted.
					continue;
				} else if (ch === shellQuoteOptions.escape) {
					// Skip the next character
					i++;
				} else if (ch === shellQuoteOptions.strong || ch === shellQuoteOptions.weak) {
					quote = ch;
				} else if (ch === ' ') {
					return true;
				}
			}
			return false;
		}

		function quote(value: string, kind: ShellQuoting): [string, boolean] {
			if (kind === ShellQuoting.Strong && shellQuoteOptions.strong) {
				return [shellQuoteOptions.strong + value + shellQuoteOptions.strong, true];
			} else if (kind === ShellQuoting.Weak && shellQuoteOptions.weak) {
				return [shellQuoteOptions.weak + value + shellQuoteOptions.weak, true];
			} else if (kind === ShellQuoting.Escape && shellQuoteOptions.escape) {
				if (Types.isString(shellQuoteOptions.escape)) {
					return [value.replace(/ /g, shellQuoteOptions.escape + ' '), true];
				} else {
					const buffer: string[] = [];
					for (const ch of shellQuoteOptions.escape.charsToEscape) {
						buffer.push(`\\${ch}`);
					}
					const regexp: RegExp = new RegExp('[' + buffer.join(',') + ']', 'g');
					const escapeChar = shellQuoteOptions.escape.escapeChar;
					return [value.replace(regexp, (match) => escapeChar + match), true];
				}
			}
			return [value, false];
		}

		function quoteIfNecessary(value: CommandString): [string, boolean] {
			if (Types.isString(value)) {
				if (needsQuotes(value)) {
					return quote(value, ShellQuoting.Strong);
				} else {
					return [value, false];
				}
			} else {
				return quote(value.value, value.quoting);
			}
		}

		// If we have no args and the command is a string then use the command to stay backwards compatible with the old command line
		// model. To allow variable resolving with spaces we do continue if the resolved value is different than the original one
		// and the resolved one needs quoting.
		if ((!args || args.length === 0) && Types.isString(command) && (command === originalCommand as string || needsQuotes(originalCommand as string))) {
			return command;
		}

		const result: string[] = [];
		let commandQuoted = false;
		let argQuoted = false;
		let value: string;
		let quoted: boolean;
		[value, quoted] = quoteIfNecessary(command);
		result.push(value);
		commandQuoted = quoted;
		for (const arg of args) {
			[value, quoted] = quoteIfNecessary(arg);
			result.push(value);
			argQuoted = argQuoted || quoted;
		}

		let commandLine = result.join(' ');
		// There are special rules quoted command line in cmd.exe
		if (platform === Platform.Platform.Windows) {
			if (basename === 'cmd' && commandQuoted && argQuoted) {
				commandLine = '"' + commandLine + '"';
			} else if ((basename === 'powershell' || basename === 'pwsh') && commandQuoted) {
				commandLine = '& ' + commandLine;
			}
		}

		return commandLine;
	}

	private _getQuotingOptions(shellBasename: string, shellOptions: IShellConfiguration | undefined, platform: Platform.Platform): IShellQuotingOptions {
		if (shellOptions && shellOptions.quoting) {
			return shellOptions.quoting;
		}
		return TerminalTaskSystem._shellQuotes[shellBasename] || TerminalTaskSystem._osShellQuotes[Platform.PlatformToString(platform)];
	}

	private _collectTaskVariables(variables: Set<string>, task: CustomTask | ContributedTask): void {
		if (task.command && task.command.name) {
			this._collectCommandVariables(variables, task.command, task);
		}
		this._collectMatcherVariables(variables, task.configurationProperties.problemMatchers);

		if (task.command.runtime === RuntimeType.CustomExecution && (CustomTask.is(task) || ContributedTask.is(task))) {
			let definition: any;
			if (CustomTask.is(task)) {
				definition = task._source.config.element;
			} else {
				definition = Objects.deepClone(task.defines);
				delete definition._key;
				delete definition.type;
			}
			this._collectDefinitionVariables(variables, definition);
		}
	}

	private _collectDefinitionVariables(variables: Set<string>, definition: any): void {
		if (Types.isString(definition)) {
			this._collectVariables(variables, definition);
		} else if (Array.isArray(definition)) {
			definition.forEach((element: any) => this._collectDefinitionVariables(variables, element));
		} else if (Types.isObject(definition)) {
			for (const key in definition) {
				this._collectDefinitionVariables(variables, definition[key]);
			}
		}
	}

	private _collectCommandVariables(variables: Set<string>, command: ICommandConfiguration, task: CustomTask | ContributedTask): void {
		// The custom execution should have everything it needs already as it provided
		// the callback.
		if (command.runtime === RuntimeType.CustomExecution) {
			return;
		}

		if (command.name === undefined) {
			throw new Error('Command name should never be undefined here.');
		}
		this._collectVariables(variables, command.name);
		command.args?.forEach(arg => this._collectVariables(variables, arg));
		// Try to get a scope.
		const scope = (<IExtensionTaskSource>task._source).scope;
		if (scope !== TaskScope.Global) {
			variables.add('${workspaceFolder}');
		}
		if (command.options) {
			const options = command.options;
			if (options.cwd) {
				this._collectVariables(variables, options.cwd);
			}
			const optionsEnv = options.env;
			if (optionsEnv) {
				Object.keys(optionsEnv).forEach((key) => {
					const value: any = optionsEnv[key];
					if (Types.isString(value)) {
						this._collectVariables(variables, value);
					}
				});
			}
			if (options.shell) {
				if (options.shell.executable) {
					this._collectVariables(variables, options.shell.executable);
				}
				options.shell.args?.forEach(arg => this._collectVariables(variables, arg));
			}
		}
	}

	private _collectMatcherVariables(variables: Set<string>, values: Array<string | ProblemMatcher> | undefined): void {
		if (values === undefined || values === null || values.length === 0) {
			return;
		}
		values.forEach((value) => {
			let matcher: ProblemMatcher;
			if (Types.isString(value)) {
				if (value[0] === '$') {
					matcher = ProblemMatcherRegistry.get(value.substring(1));
				} else {
					matcher = ProblemMatcherRegistry.get(value);
				}
			} else {
				matcher = value;
			}
			if (matcher && matcher.filePrefix) {
				if (Types.isString(matcher.filePrefix)) {
					this._collectVariables(variables, matcher.filePrefix);
				} else {
					for (const fp of [...asArray(matcher.filePrefix.include || []), ...asArray(matcher.filePrefix.exclude || [])]) {
						this._collectVariables(variables, fp);
					}
				}
			}
		});
	}

	private _collectVariables(variables: Set<string>, value: string | CommandString): void {
		const string: string = Types.isString(value) ? value : value.value;
		const r = /\$\{(.*?)\}/g;
		let matches: RegExpExecArray | null;
		do {
			matches = r.exec(string);
			if (matches) {
				variables.add(matches[0]);
			}
		} while (matches);
	}

	private async _resolveCommandAndArgs(resolver: VariableResolver, commandConfig: ICommandConfiguration): Promise<{ command: CommandString; args: CommandString[] }> {
		// First we need to use the command args:
		let args: CommandString[] = commandConfig.args ? commandConfig.args.slice() : [];
		args = await this._resolveVariables(resolver, args);
		const command: CommandString = await this._resolveVariable(resolver, commandConfig.name);
		return { command, args };
	}

	private async _resolveVariables(resolver: VariableResolver, value: string[]): Promise<string[]>;
	private async _resolveVariables(resolver: VariableResolver, value: CommandString[]): Promise<CommandString[]>;
	private async _resolveVariables(resolver: VariableResolver, value: CommandString[]): Promise<CommandString[]> {
		return Promise.all(value.map(s => this._resolveVariable(resolver, s)));
	}

	private async _resolveMatchers(resolver: VariableResolver, values: Array<string | ProblemMatcher> | undefined): Promise<ProblemMatcher[]> {
		if (values === undefined || values === null || values.length === 0) {
			return [];
		}
		const result: ProblemMatcher[] = [];
		for (const value of values) {
			let matcher: ProblemMatcher;
			if (Types.isString(value)) {
				if (value[0] === '$') {
					matcher = ProblemMatcherRegistry.get(value.substring(1));
				} else {
					matcher = ProblemMatcherRegistry.get(value);
				}
			} else {
				matcher = value;
			}
			if (!matcher) {
				this._appendOutput(nls.localize('unknownProblemMatcher', 'Problem matcher {0} can\'t be resolved. The matcher will be ignored'));
				continue;
			}
			const taskSystemInfo: ITaskSystemInfo | undefined = resolver.taskSystemInfo;
			const hasFilePrefix = matcher.filePrefix !== undefined;
			const hasUriProvider = taskSystemInfo !== undefined && taskSystemInfo.uriProvider !== undefined;
			if (!hasFilePrefix && !hasUriProvider) {
				result.push(matcher);
			} else {
				const copy = Objects.deepClone(matcher);
				if (hasUriProvider && (taskSystemInfo !== undefined)) {
					copy.uriProvider = taskSystemInfo.uriProvider;
				}
				if (hasFilePrefix) {
					const filePrefix = copy.filePrefix;
					if (Types.isString(filePrefix)) {
						copy.filePrefix = await this._resolveVariable(resolver, filePrefix);
					} else if (filePrefix !== undefined) {
						if (filePrefix.include) {
							filePrefix.include = Array.isArray(filePrefix.include)
								? await Promise.all(filePrefix.include.map(x => this._resolveVariable(resolver, x)))
								: await this._resolveVariable(resolver, filePrefix.include);
						}
						if (filePrefix.exclude) {
							filePrefix.exclude = Array.isArray(filePrefix.exclude)
								? await Promise.all(filePrefix.exclude.map(x => this._resolveVariable(resolver, x)))
								: await this._resolveVariable(resolver, filePrefix.exclude);
						}
					}
				}
				result.push(copy);
			}
		}
		return result;
	}

	private async _resolveVariable(resolver: VariableResolver, value: string | undefined): Promise<string>;
	private async _resolveVariable(resolver: VariableResolver, value: CommandString | undefined): Promise<CommandString>;
	private async _resolveVariable(resolver: VariableResolver, value: CommandString | undefined): Promise<CommandString> {
		// TODO@Dirk Task.getWorkspaceFolder should return a WorkspaceFolder that is defined in workspace.ts
		if (Types.isString(value)) {
			return resolver.resolve(value);
		} else if (value !== undefined) {
			return {
				value: await resolver.resolve(value.value),
				quoting: value.quoting
			};
		} else { // This should never happen
			throw new Error('Should never try to resolve undefined.');
		}
	}

	private async _resolveOptions(resolver: VariableResolver, options: CommandOptions | undefined): Promise<CommandOptions> {
		if (options === undefined || options === null) {
			let cwd: string | undefined;
			try {
				cwd = await this._resolveVariable(resolver, '${workspaceFolder}');
			} catch (e) {
				// No workspace
			}
			return { cwd };
		}
		const result: CommandOptions = Types.isString(options.cwd)
			? { cwd: await this._resolveVariable(resolver, options.cwd) }
			: { cwd: await this._resolveVariable(resolver, '${workspaceFolder}') };
		if (options.env) {
			result.env = Object.create(null);
			for (const key of Object.keys(options.env)) {
				const value: any = options.env[key];
				if (Types.isString(value)) {
					result.env![key] = await this._resolveVariable(resolver, value);
				} else {
					result.env![key] = value.toString();
				}
			}
		}
		return result;
	}

	static WellKnownCommands: IStringDictionary<boolean> = {
		'ant': true,
		'cmake': true,
		'eslint': true,
		'gradle': true,
		'grunt': true,
		'gulp': true,
		'jake': true,
		'jenkins': true,
		'jshint': true,
		'make': true,
		'maven': true,
		'msbuild': true,
		'msc': true,
		'nmake': true,
		'npm': true,
		'rake': true,
		'tsc': true,
		'xbuild': true
	};

	public getSanitizedCommand(cmd: string): string {
		let result = cmd.toLowerCase();
		const index = result.lastIndexOf(path.sep);
		if (index !== -1) {
			result = result.substring(index + 1);
		}
		if (TerminalTaskSystem.WellKnownCommands[result]) {
			return result;
		}
		return 'other';
	}

	public getTaskForTerminal(instanceId: number): Task | undefined {
		for (const key in this._activeTasks) {
			const activeTask = this._activeTasks[key];
			if (activeTask.terminal?.instanceId === instanceId) {
				return activeTask.task;
			}
		}
		return undefined;
	}

	private _appendOutput(output: string): void {
		const outputChannel = this._outputService.getChannel(this._outputChannelId);
		outputChannel?.append(output);
	}
}

function getWaitOnExitValue(presentationOptions: IPresentationOptions, configurationProperties: IConfigurationProperties) {
	if ((presentationOptions.close === undefined) || (presentationOptions.close === false)) {
		if ((presentationOptions.reveal !== RevealKind.Never) || !configurationProperties.isBackground || (presentationOptions.close === false)) {
			if (presentationOptions.panel === PanelKind.New) {
				return taskShellIntegrationWaitOnExitSequence(nls.localize('closeTerminal', 'Press any key to close the terminal.'));
			} else if (presentationOptions.showReuseMessage) {
				return taskShellIntegrationWaitOnExitSequence(nls.localize('reuseTerminal', 'Terminal will be reused by tasks, press any key to close it.'));
			} else {
				return true;
			}
		}
	}
	return !presentationOptions.close;
}

function taskShellIntegrationWaitOnExitSequence(message: string): (exitCode: number) => string {
	return (exitCode) => {
		return `${VSCodeSequence(VSCodeOscPt.CommandFinished, exitCode.toString())}${message}`;
	};
}

function getReconnectionData(terminal: ITerminalInstance): IReconnectionTaskData | undefined {
	return terminal.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties?.data as IReconnectionTaskData | undefined;
}
