/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { URI, UriComponents } from '../../../base/common/uri.js';
import { asPromise } from '../../../base/common/async.js';
import { Event, Emitter } from '../../../base/common/event.js';

import { MainContext, MainThreadTaskShape, ExtHostTaskShape } from './extHost.protocol.js';
import * as types from './extHostTypes.js';
import { IExtHostWorkspaceProvider, IExtHostWorkspace } from './extHostWorkspace.js';
import type * as vscode from 'vscode';
import * as tasks from './shared/tasks.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { IExtHostTerminalService } from './extHostTerminalService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../base/common/network.js';
import * as Platform from '../../../base/common/platform.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostApiDeprecationService } from './extHostApiDeprecationService.js';
import { USER_TASKS_GROUP_KEY } from '../../contrib/tasks/common/tasks.js';
import { ErrorNoTelemetry, NotSupportedError } from '../../../base/common/errors.js';
import { asArray } from '../../../base/common/arrays.js';
import { ITaskProblemMatcherStartedDto, ITaskProblemMatcherEndedDto } from './shared/tasks.js';

export interface IExtHostTask extends ExtHostTaskShape {

	readonly _serviceBrand: undefined;

	taskExecutions: vscode.TaskExecution[];
	onDidStartTask: Event<vscode.TaskStartEvent>;
	onDidEndTask: Event<vscode.TaskEndEvent>;
	onDidStartTaskProcess: Event<vscode.TaskProcessStartEvent>;
	onDidEndTaskProcess: Event<vscode.TaskProcessEndEvent>;
	onDidStartTaskProblemMatchers: Event<vscode.TaskProblemMatcherStartedEvent>;
	onDidEndTaskProblemMatchers: Event<vscode.TaskProblemMatcherEndedEvent>;

	registerTaskProvider(extension: IExtensionDescription, type: string, provider: vscode.TaskProvider): vscode.Disposable;
	registerTaskSystem(scheme: string, info: tasks.ITaskSystemInfoDTO): void;
	fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]>;
	executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution>;
	terminateTask(execution: vscode.TaskExecution): Promise<void>;
}

namespace TaskDefinitionDTO {
	export function from(value: vscode.TaskDefinition): tasks.ITaskDefinitionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: tasks.ITaskDefinitionDTO): vscode.TaskDefinition | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace TaskPresentationOptionsDTO {
	export function from(value: vscode.TaskPresentationOptions): tasks.ITaskPresentationOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: tasks.ITaskPresentationOptionsDTO): vscode.TaskPresentationOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: vscode.ProcessExecutionOptions): tasks.IProcessExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: tasks.IProcessExecutionOptionsDTO): vscode.ProcessExecutionOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionDTO {
	export function is(value: tasks.IShellExecutionDTO | tasks.IProcessExecutionDTO | tasks.ICustomExecutionDTO | undefined): value is tasks.IProcessExecutionDTO {
		if (value) {
			const candidate = value as tasks.IProcessExecutionDTO;
			return candidate && !!candidate.process;
		} else {
			return false;
		}
	}
	export function from(value: vscode.ProcessExecution): tasks.IProcessExecutionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: tasks.IProcessExecutionDTO = {
			process: value.process,
			args: value.args
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: tasks.IProcessExecutionDTO): types.ProcessExecution | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return new types.ProcessExecution(value.process, value.args, value.options);
	}
}

namespace ShellExecutionOptionsDTO {
	export function from(value: vscode.ShellExecutionOptions): tasks.IShellExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: tasks.IShellExecutionOptionsDTO): vscode.ShellExecutionOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ShellExecutionDTO {
	export function is(value: tasks.IShellExecutionDTO | tasks.IProcessExecutionDTO | tasks.ICustomExecutionDTO | undefined): value is tasks.IShellExecutionDTO {
		if (value) {
			const candidate = value as tasks.IShellExecutionDTO;
			return candidate && (!!candidate.commandLine || !!candidate.command);
		} else {
			return false;
		}
	}
	export function from(value: vscode.ShellExecution): tasks.IShellExecutionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: tasks.IShellExecutionDTO = {
		};
		if (value.commandLine !== undefined) {
			result.commandLine = value.commandLine;
		} else {
			result.command = value.command;
			result.args = value.args;
		}
		if (value.options) {
			result.options = ShellExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: tasks.IShellExecutionDTO): types.ShellExecution | undefined {
		if (value === undefined || value === null || (value.command === undefined && value.commandLine === undefined)) {
			return undefined;
		}
		if (value.commandLine) {
			return new types.ShellExecution(value.commandLine, value.options);
		} else {
			return new types.ShellExecution(value.command!, value.args ? value.args : [], value.options);
		}
	}
}

export namespace CustomExecutionDTO {
	export function is(value: tasks.IShellExecutionDTO | tasks.IProcessExecutionDTO | tasks.ICustomExecutionDTO | undefined): value is tasks.ICustomExecutionDTO {
		if (value) {
			const candidate = value as tasks.ICustomExecutionDTO;
			return candidate && candidate.customExecution === 'customExecution';
		} else {
			return false;
		}
	}

	export function from(value: vscode.CustomExecution): tasks.ICustomExecutionDTO {
		return {
			customExecution: 'customExecution'
		};
	}

	export function to(taskId: string, providedCustomExeutions: Map<string, types.CustomExecution>): types.CustomExecution | undefined {
		return providedCustomExeutions.get(taskId);
	}
}


export namespace TaskHandleDTO {
	export function from(value: types.Task, workspaceService?: IExtHostWorkspace): tasks.ITaskHandleDTO {
		let folder: UriComponents | string;
		if (value.scope !== undefined && typeof value.scope !== 'number') {
			folder = value.scope.uri;
		} else if (value.scope !== undefined && typeof value.scope === 'number') {
			if ((value.scope === types.TaskScope.Workspace) && workspaceService && workspaceService.workspaceFile) {
				folder = workspaceService.workspaceFile;
			} else {
				folder = USER_TASKS_GROUP_KEY;
			}
		}
		return {
			id: value._id!,
			workspaceFolder: folder!
		};
	}
}
namespace TaskGroupDTO {
	export function from(value: vscode.TaskGroup): tasks.ITaskGroupDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return { _id: value.id, isDefault: value.isDefault };
	}
}

export namespace TaskDTO {
	export function fromMany(tasks: vscode.Task[], extension: IExtensionDescription): tasks.ITaskDTO[] {
		if (tasks === undefined || tasks === null) {
			return [];
		}
		const result: tasks.ITaskDTO[] = [];
		for (const task of tasks) {
			const converted = from(task, extension);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	export function from(value: vscode.Task, extension: IExtensionDescription): tasks.ITaskDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: tasks.IShellExecutionDTO | tasks.IProcessExecutionDTO | tasks.ICustomExecutionDTO | undefined;
		if (value.execution instanceof types.ProcessExecution) {
			execution = ProcessExecutionDTO.from(value.execution);
		} else if (value.execution instanceof types.ShellExecution) {
			execution = ShellExecutionDTO.from(value.execution);
		} else if (value.execution && value.execution instanceof types.CustomExecution) {
			execution = CustomExecutionDTO.from(<types.CustomExecution>value.execution);
		}

		const definition: tasks.ITaskDefinitionDTO | undefined = TaskDefinitionDTO.from(value.definition);
		let scope: number | UriComponents;
		if (value.scope) {
			if (typeof value.scope === 'number') {
				scope = value.scope;
			} else {
				scope = value.scope.uri;
			}
		} else {
			// To continue to support the deprecated task constructor that doesn't take a scope, we must add a scope here:
			scope = types.TaskScope.Workspace;
		}
		if (!definition || !scope) {
			return undefined;
		}
		const result: tasks.ITaskDTO = {
			_id: (value as types.Task)._id!,
			definition,
			name: value.name,
			source: {
				extensionId: extension.identifier.value,
				label: value.source,
				scope: scope
			},
			execution: execution!,
			isBackground: value.isBackground,
			group: TaskGroupDTO.from(value.group as vscode.TaskGroup),
			presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
			problemMatchers: asArray(value.problemMatchers),
			hasDefinedMatchers: (value as types.Task).hasDefinedMatchers,
			runOptions: value.runOptions ? value.runOptions : { reevaluateOnRerun: true },
			detail: value.detail
		};
		return result;
	}
	export async function to(value: tasks.ITaskDTO | undefined, workspace: IExtHostWorkspaceProvider, providedCustomExeutions: Map<string, types.CustomExecution>): Promise<types.Task | undefined> {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: types.ShellExecution | types.ProcessExecution | types.CustomExecution | undefined;
		if (ProcessExecutionDTO.is(value.execution)) {
			execution = ProcessExecutionDTO.to(value.execution);
		} else if (ShellExecutionDTO.is(value.execution)) {
			execution = ShellExecutionDTO.to(value.execution);
		} else if (CustomExecutionDTO.is(value.execution)) {
			execution = CustomExecutionDTO.to(value._id, providedCustomExeutions);
		}
		const definition: vscode.TaskDefinition | undefined = TaskDefinitionDTO.to(value.definition);
		let scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder | undefined;
		if (value.source) {
			if (value.source.scope !== undefined) {
				if (typeof value.source.scope === 'number') {
					scope = value.source.scope;
				} else {
					scope = await workspace.resolveWorkspaceFolder(URI.revive(value.source.scope));
				}
			} else {
				scope = types.TaskScope.Workspace;
			}
		}
		if (!definition || !scope) {
			return undefined;
		}
		const result = new types.Task(definition, scope, value.name!, value.source.label, execution, value.problemMatchers);
		if (value.isBackground !== undefined) {
			result.isBackground = value.isBackground;
		}
		if (value.group !== undefined) {
			result.group = types.TaskGroup.from(value.group._id);
			if (result.group && value.group.isDefault) {
				result.group = new types.TaskGroup(result.group.id, result.group.label);
				if (value.group.isDefault === true) {
					result.group.isDefault = value.group.isDefault;
				}
			}
		}
		if (value.presentationOptions) {
			result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions)!;
		}
		if (value._id) {
			result._id = value._id;
		}
		if (value.detail) {
			result.detail = value.detail;
		}
		return result;
	}
}

namespace TaskFilterDTO {
	export function from(value: vscode.TaskFilter | undefined): tasks.ITaskFilterDTO | undefined {
		return value;
	}

	export function to(value: tasks.ITaskFilterDTO): vscode.TaskFilter | undefined {
		if (!value) {
			return undefined;
		}
		return Object.assign(Object.create(null), value);
	}
}

class TaskExecutionImpl implements vscode.TaskExecution {

	readonly #tasks: ExtHostTaskBase;
	private _terminal: vscode.Terminal | undefined;

	constructor(tasks: ExtHostTaskBase, readonly _id: string, private readonly _task: vscode.Task) {
		this.#tasks = tasks;
	}

	public get task(): vscode.Task {
		return this._task;
	}

	public terminate(): void {
		this.#tasks.terminateTask(this);
	}

	public fireDidStartProcess(value: tasks.ITaskProcessStartedDTO): void {
	}

	public fireDidEndProcess(value: tasks.ITaskProcessEndedDTO): void {
	}

	public get terminal(): vscode.Terminal | undefined {
		return this._terminal;
	}

	public set terminal(term: vscode.Terminal | undefined) {
		this._terminal = term;
	}
}

export interface HandlerData {
	type: string;
	provider: vscode.TaskProvider;
	extension: IExtensionDescription;
}

export abstract class ExtHostTaskBase implements ExtHostTaskShape, IExtHostTask {
	readonly _serviceBrand: undefined;

	protected readonly _proxy: MainThreadTaskShape;
	protected readonly _workspaceProvider: IExtHostWorkspaceProvider;
	protected readonly _editorService: IExtHostDocumentsAndEditors;
	protected readonly _configurationService: IExtHostConfiguration;
	protected readonly _terminalService: IExtHostTerminalService;
	protected readonly _logService: ILogService;
	protected readonly _deprecationService: IExtHostApiDeprecationService;
	protected _handleCounter: number;
	protected _handlers: Map<number, HandlerData>;
	protected _taskExecutions: Map<string, TaskExecutionImpl>;
	protected _taskExecutionPromises: Map<string, Promise<TaskExecutionImpl>>;
	protected _providedCustomExecutions2: Map<string, types.CustomExecution>;
	private _notProvidedCustomExecutions: Set<string>; // Used for custom executions tasks that are created and run through executeTask.
	protected _activeCustomExecutions2: Map<string, types.CustomExecution>;
	private _lastStartedTask: string | undefined;
	protected readonly _onDidExecuteTask: Emitter<vscode.TaskStartEvent> = new Emitter<vscode.TaskStartEvent>();
	protected readonly _onDidTerminateTask: Emitter<vscode.TaskEndEvent> = new Emitter<vscode.TaskEndEvent>();

	protected readonly _onDidTaskProcessStarted: Emitter<vscode.TaskProcessStartEvent> = new Emitter<vscode.TaskProcessStartEvent>();
	protected readonly _onDidTaskProcessEnded: Emitter<vscode.TaskProcessEndEvent> = new Emitter<vscode.TaskProcessEndEvent>();
	protected readonly _onDidStartTaskProblemMatchers: Emitter<vscode.TaskProblemMatcherStartedEvent> = new Emitter<vscode.TaskProblemMatcherStartedEvent>();
	protected readonly _onDidEndTaskProblemMatchers: Emitter<vscode.TaskProblemMatcherEndedEvent> = new Emitter<vscode.TaskProblemMatcherEndedEvent>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostDocumentsAndEditors editorService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService extHostTerminalService: IExtHostTerminalService,
		@ILogService logService: ILogService,
		@IExtHostApiDeprecationService deprecationService: IExtHostApiDeprecationService
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTask);
		this._workspaceProvider = workspaceService;
		this._editorService = editorService;
		this._configurationService = configurationService;
		this._terminalService = extHostTerminalService;
		this._handleCounter = 0;
		this._handlers = new Map<number, HandlerData>();
		this._taskExecutions = new Map<string, TaskExecutionImpl>();
		this._taskExecutionPromises = new Map<string, Promise<TaskExecutionImpl>>();
		this._providedCustomExecutions2 = new Map<string, types.CustomExecution>();
		this._notProvidedCustomExecutions = new Set<string>();
		this._activeCustomExecutions2 = new Map<string, types.CustomExecution>();
		this._logService = logService;
		this._deprecationService = deprecationService;
		this._proxy.$registerSupportedExecutions(true);
	}

	public registerTaskProvider(extension: IExtensionDescription, type: string, provider: vscode.TaskProvider): vscode.Disposable {
		if (!provider) {
			return new types.Disposable(() => { });
		}
		const handle = this.nextHandle();
		this._handlers.set(handle, { type, provider, extension });
		this._proxy.$registerTaskProvider(handle, type);
		return new types.Disposable(() => {
			this._handlers.delete(handle);
			this._proxy.$unregisterTaskProvider(handle);
		});
	}

	public registerTaskSystem(scheme: string, info: tasks.ITaskSystemInfoDTO): void {
		this._proxy.$registerTaskSystem(scheme, info);
	}

	public fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]> {
		return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then(async (values) => {
			const result: vscode.Task[] = [];
			for (const value of values) {
				const task = await TaskDTO.to(value, this._workspaceProvider, this._providedCustomExecutions2);
				if (task) {
					result.push(task);
				}
			}
			return result;
		});
	}

	public abstract executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution>;

	public get taskExecutions(): vscode.TaskExecution[] {
		const result: vscode.TaskExecution[] = [];
		this._taskExecutions.forEach(value => result.push(value));
		return result;
	}

	public terminateTask(execution: vscode.TaskExecution): Promise<void> {
		if (!(execution instanceof TaskExecutionImpl)) {
			throw new Error('No valid task execution provided');
		}
		return this._proxy.$terminateTask((execution as TaskExecutionImpl)._id);
	}

	public get onDidStartTask(): Event<vscode.TaskStartEvent> {
		return this._onDidExecuteTask.event;
	}

	public async $onDidStartTask(execution: tasks.ITaskExecutionDTO, terminalId: number, resolvedDefinition: tasks.ITaskDefinitionDTO): Promise<void> {
		const customExecution: types.CustomExecution | undefined = this._providedCustomExecutions2.get(execution.id);
		if (customExecution) {
			// Clone the custom execution to keep the original untouched. This is important for multiple runs of the same task.
			this._activeCustomExecutions2.set(execution.id, customExecution);
			this._terminalService.attachPtyToTerminal(terminalId, await customExecution.callback(resolvedDefinition));
		}
		this._lastStartedTask = execution.id;

		const taskExecution = await this.getTaskExecution(execution);
		const terminal = this._terminalService.getTerminalById(terminalId)?.value;
		if (taskExecution) {
			taskExecution.terminal = terminal;
		}

		this._onDidExecuteTask.fire({
			execution: taskExecution
		});
	}

	public get onDidEndTask(): Event<vscode.TaskEndEvent> {
		return this._onDidTerminateTask.event;
	}

	public async $OnDidEndTask(execution: tasks.ITaskExecutionDTO): Promise<void> {
		if (!this._taskExecutionPromises.has(execution.id)) {
			// Event already fired by the main thread
			// See https://github.com/microsoft/vscode/commit/aaf73920aeae171096d205efb2c58804a32b6846
			return;
		}
		const _execution = await this.getTaskExecution(execution);
		this._taskExecutionPromises.delete(execution.id);
		this._taskExecutions.delete(execution.id);
		this.customExecutionComplete(execution);
		this._onDidTerminateTask.fire({
			execution: _execution
		});
	}

	public get onDidStartTaskProcess(): Event<vscode.TaskProcessStartEvent> {
		return this._onDidTaskProcessStarted.event;
	}

	public async $onDidStartTaskProcess(value: tasks.ITaskProcessStartedDTO): Promise<void> {
		const execution = await this.getTaskExecution(value.id);
		this._onDidTaskProcessStarted.fire({
			execution: execution,
			processId: value.processId
		});
	}

	public get onDidEndTaskProcess(): Event<vscode.TaskProcessEndEvent> {
		return this._onDidTaskProcessEnded.event;
	}

	public async $onDidEndTaskProcess(value: tasks.ITaskProcessEndedDTO): Promise<void> {
		const execution = await this.getTaskExecution(value.id);
		this._onDidTaskProcessEnded.fire({
			execution: execution,
			exitCode: value.exitCode
		});
	}

	public get onDidStartTaskProblemMatchers(): Event<vscode.TaskProblemMatcherStartedEvent> {
		return this._onDidStartTaskProblemMatchers.event;
	}

	public async $onDidStartTaskProblemMatchers(value: ITaskProblemMatcherStartedDto): Promise<void> {
		let execution;
		try {
			execution = await this.getTaskExecution(value.execution.id);
		} catch (error) {
			// The task execution is not available anymore
			return;
		}

		this._onDidStartTaskProblemMatchers.fire({ execution });
	}

	public get onDidEndTaskProblemMatchers(): Event<vscode.TaskProblemMatcherEndedEvent> {
		return this._onDidEndTaskProblemMatchers.event;
	}

	public async $onDidEndTaskProblemMatchers(value: ITaskProblemMatcherEndedDto): Promise<void> {
		let execution;
		try {
			execution = await this.getTaskExecution(value.execution.id);
		} catch (error) {
			// The task execution is not available anymore
			return;
		}

		this._onDidEndTaskProblemMatchers.fire({ execution, hasErrors: value.hasErrors });
	}

	protected abstract provideTasksInternal(validTypes: { [key: string]: boolean }, taskIdPromises: Promise<void>[], handler: HandlerData, value: vscode.Task[] | null | undefined): { tasks: tasks.ITaskDTO[]; extension: IExtensionDescription };

	public $provideTasks(handle: number, validTypes: { [key: string]: boolean }): Promise<tasks.ITaskSetDTO> {
		const handler = this._handlers.get(handle);
		if (!handler) {
			return Promise.reject(new Error('no handler found'));
		}

		// Set up a list of task ID promises that we can wait on
		// before returning the provided tasks. The ensures that
		// our task IDs are calculated for any custom execution tasks.
		// Knowing this ID ahead of time is needed because when a task
		// start event is fired this is when the custom execution is called.
		// The task start event is also the first time we see the ID from the main
		// thread, which is too late for us because we need to save an map
		// from an ID to the custom execution function. (Kind of a cart before the horse problem).
		const taskIdPromises: Promise<void>[] = [];
		const fetchPromise = asPromise(() => handler.provider.provideTasks(CancellationToken.None)).then(value => {
			return this.provideTasksInternal(validTypes, taskIdPromises, handler, value);
		});

		return new Promise((resolve) => {
			fetchPromise.then((result) => {
				Promise.all(taskIdPromises).then(() => {
					resolve(result);
				});
			});
		});
	}

	protected abstract resolveTaskInternal(resolvedTaskDTO: tasks.ITaskDTO): Promise<tasks.ITaskDTO | undefined>;

	public async $resolveTask(handle: number, taskDTO: tasks.ITaskDTO): Promise<tasks.ITaskDTO | undefined> {
		const handler = this._handlers.get(handle);
		if (!handler) {
			return Promise.reject(new Error('no handler found'));
		}

		if (taskDTO.definition.type !== handler.type) {
			throw new Error(`Unexpected: Task of type [${taskDTO.definition.type}] cannot be resolved by provider of type [${handler.type}].`);
		}

		const task = await TaskDTO.to(taskDTO, this._workspaceProvider, this._providedCustomExecutions2);
		if (!task) {
			throw new Error('Unexpected: Task cannot be resolved.');
		}

		const resolvedTask = await handler.provider.resolveTask(task, CancellationToken.None);
		if (!resolvedTask) {
			return;
		}

		this.checkDeprecation(resolvedTask, handler);

		const resolvedTaskDTO: tasks.ITaskDTO | undefined = TaskDTO.from(resolvedTask, handler.extension);
		if (!resolvedTaskDTO) {
			throw new Error('Unexpected: Task cannot be resolved.');
		}

		if (resolvedTask.definition !== task.definition) {
			throw new Error('Unexpected: The resolved task definition must be the same object as the original task definition. The task definition cannot be changed.');
		}

		if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
			await this.addCustomExecution(resolvedTaskDTO, resolvedTask, true);
		}

		return await this.resolveTaskInternal(resolvedTaskDTO);
	}

	public abstract $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }; variables: string[] }): Promise<{ process?: string; variables: { [key: string]: string } }>;

	private nextHandle(): number {
		return this._handleCounter++;
	}

	protected async addCustomExecution(taskDTO: tasks.ITaskDTO, task: vscode.Task, isProvided: boolean): Promise<void> {
		const taskId = await this._proxy.$createTaskId(taskDTO);
		if (!isProvided && !this._providedCustomExecutions2.has(taskId)) {
			this._notProvidedCustomExecutions.add(taskId);
			// Also add to active executions when not coming from a provider to prevent timing issue.
			this._activeCustomExecutions2.set(taskId, <types.CustomExecution>task.execution);
		}
		this._providedCustomExecutions2.set(taskId, <types.CustomExecution>task.execution);
	}

	protected async getTaskExecution(execution: tasks.ITaskExecutionDTO | string, task?: vscode.Task): Promise<TaskExecutionImpl> {
		if (typeof execution === 'string') {
			const taskExecution = this._taskExecutionPromises.get(execution);
			if (!taskExecution) {
				throw new ErrorNoTelemetry('Unexpected: The specified task is missing an execution');
			}
			return taskExecution;
		}

		const result: Promise<TaskExecutionImpl> | undefined = this._taskExecutionPromises.get(execution.id);
		if (result) {
			return result;
		}

		let executionPromise: Promise<TaskExecutionImpl>;
		if (!task) {
			executionPromise = TaskDTO.to(execution.task, this._workspaceProvider, this._providedCustomExecutions2).then(t => {
				if (!t) {
					throw new ErrorNoTelemetry('Unexpected: Task does not exist.');
				}
				return new TaskExecutionImpl(this, execution.id, t);
			});
		} else {
			executionPromise = Promise.resolve(new TaskExecutionImpl(this, execution.id, task));
		}
		this._taskExecutionPromises.set(execution.id, executionPromise);
		return executionPromise.then(taskExecution => {
			this._taskExecutions.set(execution.id, taskExecution);
			return taskExecution;
		});
	}

	protected checkDeprecation(task: vscode.Task, handler: HandlerData) {
		const tTask = (task as types.Task);
		if (tTask._deprecated) {
			this._deprecationService.report('Task.constructor', handler.extension, 'Use the Task constructor that takes a `scope` instead.');
		}
	}

	private customExecutionComplete(execution: tasks.ITaskExecutionDTO): void {
		const extensionCallback2: vscode.CustomExecution | undefined = this._activeCustomExecutions2.get(execution.id);
		if (extensionCallback2) {
			this._activeCustomExecutions2.delete(execution.id);
		}

		// Technically we don't really need to do this, however, if an extension
		// is executing a task through "executeTask" over and over again
		// with different properties in the task definition, then the map of executions
		// could grow indefinitely, something we don't want.
		if (this._notProvidedCustomExecutions.has(execution.id) && (this._lastStartedTask !== execution.id)) {
			this._providedCustomExecutions2.delete(execution.id);
			this._notProvidedCustomExecutions.delete(execution.id);
		}
		const iterator = this._notProvidedCustomExecutions.values();
		let iteratorResult = iterator.next();
		while (!iteratorResult.done) {
			if (!this._activeCustomExecutions2.has(iteratorResult.value) && (this._lastStartedTask !== iteratorResult.value)) {
				this._providedCustomExecutions2.delete(iteratorResult.value);
				this._notProvidedCustomExecutions.delete(iteratorResult.value);
			}
			iteratorResult = iterator.next();
		}
	}

	public abstract $jsonTasksSupported(): Promise<boolean>;

	public abstract $findExecutable(command: string, cwd?: string | undefined, paths?: string[] | undefined): Promise<string | undefined>;
}

export class WorkerExtHostTask extends ExtHostTaskBase {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostDocumentsAndEditors editorService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService extHostTerminalService: IExtHostTerminalService,
		@ILogService logService: ILogService,
		@IExtHostApiDeprecationService deprecationService: IExtHostApiDeprecationService
	) {
		super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
		this.registerTaskSystem(Schemas.vscodeRemote, {
			scheme: Schemas.vscodeRemote,
			authority: '',
			platform: Platform.PlatformToString(Platform.Platform.Web)
		});
	}

	public async executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution> {
		if (!task.execution) {
			throw new Error('Tasks to execute must include an execution');
		}

		const dto = TaskDTO.from(task, extension);
		if (dto === undefined) {
			throw new Error('Task is not valid');
		}

		// If this task is a custom execution, then we need to save it away
		// in the provided custom execution map that is cleaned up after the
		// task is executed.
		if (CustomExecutionDTO.is(dto.execution)) {
			await this.addCustomExecution(dto, task, false);
		} else {
			throw new NotSupportedError();
		}

		// Always get the task execution first to prevent timing issues when retrieving it later
		const execution = await this.getTaskExecution(await this._proxy.$getTaskExecution(dto), task);
		this._proxy.$executeTask(dto).catch(error => { throw new Error(error); });
		return execution;
	}

	protected provideTasksInternal(validTypes: { [key: string]: boolean }, taskIdPromises: Promise<void>[], handler: HandlerData, value: vscode.Task[] | null | undefined): { tasks: tasks.ITaskDTO[]; extension: IExtensionDescription } {
		const taskDTOs: tasks.ITaskDTO[] = [];
		if (value) {
			for (const task of value) {
				this.checkDeprecation(task, handler);
				if (!task.definition || !validTypes[task.definition.type]) {
					const source = task.source ? task.source : 'No task source';
					this._logService.warn(`The task [${source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
				}

				const taskDTO: tasks.ITaskDTO | undefined = TaskDTO.from(task, handler.extension);
				if (taskDTO && CustomExecutionDTO.is(taskDTO.execution)) {
					taskDTOs.push(taskDTO);
					// The ID is calculated on the main thread task side, so, let's call into it here.
					// We need the task id's pre-computed for custom task executions because when OnDidStartTask
					// is invoked, we have to be able to map it back to our data.
					taskIdPromises.push(this.addCustomExecution(taskDTO, task, true));
				} else {
					this._logService.warn('Only custom execution tasks supported.');
				}
			}
		}
		return {
			tasks: taskDTOs,
			extension: handler.extension
		};
	}

	protected async resolveTaskInternal(resolvedTaskDTO: tasks.ITaskDTO): Promise<tasks.ITaskDTO | undefined> {
		if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
			return resolvedTaskDTO;
		} else {
			this._logService.warn('Only custom execution tasks supported.');
		}
		return undefined;
	}

	public async $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }; variables: string[] }): Promise<{ process?: string; variables: { [key: string]: string } }> {
		const result = {
			process: <unknown>undefined as string,
			variables: Object.create(null)
		};
		return result;
	}

	public async $jsonTasksSupported(): Promise<boolean> {
		return false;
	}

	public async $findExecutable(command: string, cwd?: string | undefined, paths?: string[] | undefined): Promise<string | undefined> {
		return undefined;
	}
}

export const IExtHostTask = createDecorator<IExtHostTask>('IExtHostTask');
