/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';

import { URI, UriComponents } from 'vs/base/common/uri';
import * as Objects from 'vs/base/common/objects';
import { asPromise } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { win32 } from 'vs/base/node/processes';


import { MainContext, MainThreadTaskShape, ExtHostTaskShape, IMainContext } from 'vs/workbench/api/common/extHost.protocol';

import * as types from 'vs/workbench/api/common/extHostTypes';
import { ExtHostWorkspace, IExtHostWorkspaceProvider } from 'vs/workbench/api/common/extHostWorkspace';
import * as vscode from 'vscode';
import {
	TaskDefinitionDTO, TaskExecutionDTO, TaskPresentationOptionsDTO,
	ProcessExecutionOptionsDTO, ProcessExecutionDTO,
	ShellExecutionOptionsDTO, ShellExecutionDTO,
	CustomExecutionDTO,
	CustomExecution2DTO,
	TaskDTO, TaskHandleDTO, TaskFilterDTO, TaskProcessStartedDTO, TaskProcessEndedDTO, TaskSystemInfoDTO, TaskSetDTO
} from '../common/shared/tasks';
import { ExtHostVariableResolverService } from 'vs/workbench/api/node/extHostDebugService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { ExtHostTerminalService, ExtHostTerminal } from 'vs/workbench/api/node/extHostTerminalService';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

namespace TaskDefinitionDTO {
	export function from(value: vscode.TaskDefinition): TaskDefinitionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: TaskDefinitionDTO): vscode.TaskDefinition | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace TaskPresentationOptionsDTO {
	export function from(value: vscode.TaskPresentationOptions): TaskPresentationOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: TaskPresentationOptionsDTO): vscode.TaskPresentationOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: vscode.ProcessExecutionOptions): ProcessExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: ProcessExecutionOptionsDTO): vscode.ProcessExecutionOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO | CustomExecutionDTO | CustomExecution2DTO | undefined): value is ProcessExecutionDTO {
		if (value) {
			const candidate = value as ProcessExecutionDTO;
			return candidate && !!candidate.process;
		} else {
			return false;
		}
	}
	export function from(value: vscode.ProcessExecution): ProcessExecutionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: ProcessExecutionDTO = {
			process: value.process,
			args: value.args
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: ProcessExecutionDTO): types.ProcessExecution | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return new types.ProcessExecution(value.process, value.args, value.options);
	}
}

namespace ShellExecutionOptionsDTO {
	export function from(value: vscode.ShellExecutionOptions): ShellExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: ShellExecutionOptionsDTO): vscode.ShellExecutionOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ShellExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO | CustomExecutionDTO | CustomExecution2DTO | undefined): value is ShellExecutionDTO {
		if (value) {
			const candidate = value as ShellExecutionDTO;
			return candidate && (!!candidate.commandLine || !!candidate.command);
		} else {
			return false;
		}
	}
	export function from(value: vscode.ShellExecution): ShellExecutionDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: ShellExecutionDTO = {
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
	export function to(value: ShellExecutionDTO): types.ShellExecution | undefined {
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

namespace CustomExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO | CustomExecutionDTO | CustomExecution2DTO | undefined): value is CustomExecutionDTO {
		if (value) {
			let candidate = value as CustomExecutionDTO;
			return candidate && candidate.customExecution === 'customExecution';
		} else {
			return false;
		}
	}

	export function from(value: vscode.CustomExecution): CustomExecutionDTO {
		return {
			customExecution: 'customExecution'
		};
	}
}

namespace CustomExecution2DTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO | CustomExecutionDTO | CustomExecution2DTO | undefined): value is CustomExecution2DTO {
		if (value) {
			let candidate = value as CustomExecution2DTO;
			return candidate && candidate.customExecution === 'customExecution2';
		} else {
			return false;
		}
	}

	export function from(value: vscode.CustomExecution2): CustomExecution2DTO {
		return {
			customExecution: 'customExecution2'
		};
	}
}

namespace TaskHandleDTO {
	export function from(value: types.Task): TaskHandleDTO {
		let folder: UriComponents | undefined;
		if (value.scope !== undefined && typeof value.scope !== 'number') {
			folder = value.scope.uri;
		}
		return {
			id: value._id!,
			workspaceFolder: folder!
		};
	}
}

namespace TaskDTO {

	export function fromMany(tasks: vscode.Task[], extension: IExtensionDescription): TaskDTO[] {
		if (tasks === undefined || tasks === null) {
			return [];
		}
		const result: TaskDTO[] = [];
		for (let task of tasks) {
			const converted = from(task, extension);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	export function from(value: vscode.Task, extension: IExtensionDescription): TaskDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: ShellExecutionDTO | ProcessExecutionDTO | CustomExecutionDTO | CustomExecution2DTO | undefined;
		if (value.execution instanceof types.ProcessExecution) {
			execution = ProcessExecutionDTO.from(value.execution);
		} else if (value.execution instanceof types.ShellExecution) {
			execution = ShellExecutionDTO.from(value.execution);
		} else if ((<vscode.Task2>value).execution2 && (<vscode.Task2>value).execution2 instanceof types.CustomExecution) {
			execution = CustomExecutionDTO.from(<types.CustomExecution>(<vscode.Task2>value).execution2);
		} else if ((<vscode.Task2>value).execution2 && (<vscode.Task2>value).execution2 instanceof types.CustomExecution2) {
			execution = CustomExecution2DTO.from(<types.CustomExecution2>(<vscode.Task2>value).execution2);
		}

		const definition: TaskDefinitionDTO | undefined = TaskDefinitionDTO.from(value.definition);
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
		const group = (value.group as types.TaskGroup) ? (value.group as types.TaskGroup).id : undefined;
		const result: TaskDTO = {
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
			group: group,
			presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
			problemMatchers: value.problemMatchers,
			hasDefinedMatchers: (value as types.Task).hasDefinedMatchers,
			runOptions: (<vscode.Task>value).runOptions ? (<vscode.Task>value).runOptions : { reevaluateOnRerun: true },
		};
		return result;
	}
	export async function to(value: TaskDTO | undefined, workspace: IExtHostWorkspaceProvider): Promise<types.Task | undefined> {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: types.ShellExecution | types.ProcessExecution | undefined;
		if (ProcessExecutionDTO.is(value.execution)) {
			execution = ProcessExecutionDTO.to(value.execution);
		} else if (ShellExecutionDTO.is(value.execution)) {
			execution = ShellExecutionDTO.to(value.execution);
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
			result.group = types.TaskGroup.from(value.group);
		}
		if (value.presentationOptions) {
			result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions)!;
		}
		if (value._id) {
			result._id = value._id;
		}
		return result;
	}
}

namespace TaskFilterDTO {
	export function from(value: vscode.TaskFilter | undefined): TaskFilterDTO | undefined {
		return value;
	}

	export function to(value: TaskFilterDTO): vscode.TaskFilter | undefined {
		if (!value) {
			return undefined;
		}
		return Objects.assign(Object.create(null), value);
	}
}

class TaskExecutionImpl implements vscode.TaskExecution {

	constructor(private readonly _tasks: ExtHostTask, readonly _id: string, private readonly _task: vscode.Task) {
	}

	public get task(): vscode.Task {
		return this._task;
	}

	public terminate(): void {
		this._tasks.terminateTask(this);
	}

	public fireDidStartProcess(value: TaskProcessStartedDTO): void {
	}

	public fireDidEndProcess(value: TaskProcessEndedDTO): void {
	}
}

namespace TaskExecutionDTO {
	export async function to(value: TaskExecutionDTO, tasks: ExtHostTask, workspaceProvider: IExtHostWorkspaceProvider): Promise<vscode.TaskExecution> {
		const task = await TaskDTO.to(value.task, workspaceProvider);
		if (!task) {
			throw new Error('Unexpected: Task cannot be created.');
		}
		return new TaskExecutionImpl(tasks, value.id, task);
	}
	export function from(value: vscode.TaskExecution): TaskExecutionDTO {
		return {
			id: (value as TaskExecutionImpl)._id,
			task: undefined
		};
	}
}

interface HandlerData {
	type: string;
	provider: vscode.TaskProvider;
	extension: IExtensionDescription;
}

class CustomExecutionData implements IDisposable {
	private static waitForDimensionsTimeoutInMs: number = 5000;
	private _cancellationSource?: CancellationTokenSource;
	private readonly _onTaskExecutionComplete: Emitter<CustomExecutionData> = new Emitter<CustomExecutionData>();
	private readonly _disposables = new DisposableStore();
	private terminal?: vscode.Terminal;
	private terminalId?: number;
	public result: number | undefined;

	constructor(
		private readonly customExecution: vscode.CustomExecution,
		private readonly terminalService: ExtHostTerminalService) {
	}

	public dispose(): void {
		this._cancellationSource = undefined;
		this._disposables.dispose();
	}

	public get onTaskExecutionComplete(): Event<CustomExecutionData> {
		return this._onTaskExecutionComplete.event;
	}

	private onDidCloseTerminal(terminal: vscode.Terminal): void {
		if ((this.terminal === terminal) && this._cancellationSource) {
			this._cancellationSource.cancel();
		}
	}

	private onDidOpenTerminal(terminal: vscode.Terminal): void {
		if (!(terminal instanceof ExtHostTerminal)) {
			throw new Error('How could this not be a extension host terminal?');
		}

		if (this.terminalId && terminal._id === this.terminalId) {
			this.startCallback(this.terminalId);
		}
	}

	public async startCallback(terminalId: number): Promise<void> {
		this.terminalId = terminalId;

		// If we have already started the extension task callback, then
		// do not start it again.
		// It is completely valid for multiple terminals to be opened
		// before the one for our task.
		if (this._cancellationSource) {
			return undefined;
		}

		const callbackTerminals: vscode.Terminal[] = this.terminalService.terminals.filter((terminal) => terminal._id === terminalId);

		if (!callbackTerminals || callbackTerminals.length === 0) {
			this._disposables.add(this.terminalService.onDidOpenTerminal(this.onDidOpenTerminal.bind(this)));
			return;
		}

		if (callbackTerminals.length !== 1) {
			throw new Error(`Expected to only have one terminal at this point`);
		}

		this.terminal = callbackTerminals[0];
		const terminalRenderer: vscode.TerminalRenderer = await this.terminalService.resolveTerminalRenderer(terminalId);

		// If we don't have the maximum dimensions yet, then we need to wait for them (but not indefinitely).
		// Custom executions will expect the dimensions to be set properly before they are launched.
		// BUT, due to the API contract VSCode has for terminals and dimensions, they are still responsible for
		// handling cases where they are not set.
		if (!terminalRenderer.maximumDimensions) {
			const dimensionTimeout: Promise<void> = new Promise((resolve) => {
				setTimeout(() => {
					resolve();
				}, CustomExecutionData.waitForDimensionsTimeoutInMs);
			});

			let dimensionsRegistration: IDisposable | undefined;
			const dimensionsPromise: Promise<void> = new Promise((resolve) => {
				dimensionsRegistration = terminalRenderer.onDidChangeMaximumDimensions((newDimensions) => {
					resolve();
				});
			});

			await Promise.race([dimensionTimeout, dimensionsPromise]);
			if (dimensionsRegistration) {
				dimensionsRegistration.dispose();
			}
		}

		this._cancellationSource = new CancellationTokenSource();
		this._disposables.add(this._cancellationSource);

		this._disposables.add(this.terminalService.onDidCloseTerminal(this.onDidCloseTerminal.bind(this)));

		// Regardless of how the task completes, we are done with this custom execution task.
		this.customExecution.callback(terminalRenderer, this._cancellationSource.token).then(
			(success) => {
				this.result = success;
				this._onTaskExecutionComplete.fire(this);
			}, (rejected) => {
				this._onTaskExecutionComplete.fire(this);
			});
	}
}

export class ExtHostTask implements ExtHostTaskShape {

	private _proxy: MainThreadTaskShape;
	private _workspaceProvider: IExtHostWorkspaceProvider;
	private _editorService: ExtHostDocumentsAndEditors;
	private _configurationService: ExtHostConfiguration;
	private _terminalService: ExtHostTerminalService;
	private _handleCounter: number;
	private _handlers: Map<number, HandlerData>;
	private _taskExecutions: Map<string, TaskExecutionImpl>;
	private _providedCustomExecutions: Map<string, CustomExecutionData>;
	private _activeCustomExecutions: Map<string, CustomExecutionData>;
	private _providedCustomExecutions2: Map<string, vscode.CustomExecution2>;
	private _activeCustomExecutions2: Map<string, vscode.CustomExecution2>;

	private readonly _onDidExecuteTask: Emitter<vscode.TaskStartEvent> = new Emitter<vscode.TaskStartEvent>();
	private readonly _onDidTerminateTask: Emitter<vscode.TaskEndEvent> = new Emitter<vscode.TaskEndEvent>();

	private readonly _onDidTaskProcessStarted: Emitter<vscode.TaskProcessStartEvent> = new Emitter<vscode.TaskProcessStartEvent>();
	private readonly _onDidTaskProcessEnded: Emitter<vscode.TaskProcessEndEvent> = new Emitter<vscode.TaskProcessEndEvent>();

	constructor(
		mainContext: IMainContext,
		workspaceService: ExtHostWorkspace,
		editorService: ExtHostDocumentsAndEditors,
		configurationService: ExtHostConfiguration,
		extHostTerminalService: ExtHostTerminalService) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTask);
		this._workspaceProvider = workspaceService;
		this._editorService = editorService;
		this._configurationService = configurationService;
		this._terminalService = extHostTerminalService;
		this._handleCounter = 0;
		this._handlers = new Map<number, HandlerData>();
		this._taskExecutions = new Map<string, TaskExecutionImpl>();
		this._providedCustomExecutions = new Map<string, CustomExecutionData>();
		this._activeCustomExecutions = new Map<string, CustomExecutionData>();
		this._providedCustomExecutions2 = new Map<string, vscode.CustomExecution2>();
		this._activeCustomExecutions2 = new Map<string, vscode.CustomExecution2>();
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

	public registerTaskSystem(scheme: string, info: TaskSystemInfoDTO): void {
		this._proxy.$registerTaskSystem(scheme, info);
	}

	public fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]> {
		return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then(async (values) => {
			const result: vscode.Task[] = [];
			for (let value of values) {
				const task = await TaskDTO.to(value, this._workspaceProvider);
				if (task) {
					result.push(task);
				}
			}
			return result;
		});
	}

	public async executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution> {
		const tTask = (task as types.Task);
		// We have a preserved ID. So the task didn't change.
		if (tTask._id !== undefined) {
			return this._proxy.$executeTask(TaskHandleDTO.from(tTask)).then(value => this.getTaskExecution(value, task));
		} else {
			const dto = TaskDTO.from(task, extension);
			if (dto === undefined) {
				return Promise.reject(new Error('Task is not valid'));
			}
			return this._proxy.$executeTask(dto).then(value => this.getTaskExecution(value, task));
		}
	}

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

	public async $onDidStartTask(execution: TaskExecutionDTO, terminalId: number): Promise<void> {
		const execution2: vscode.CustomExecution2 | undefined = this._providedCustomExecutions2.get(execution.id);
		if (execution2) {
			if (this._activeCustomExecutions2.get(execution.id) !== undefined) {
				throw new Error('We should not be trying to start the same custom task executions twice.');
			}

			// Clone the custom execution to keep the original untouched. This is important for multiple runs of the same task.
			this._activeCustomExecutions2.set(execution.id, execution2);
			await this._terminalService.attachPtyToTerminal(terminalId, await execution2.callback());
		}

		// Once a terminal is spun up for the custom execution task this event will be fired.
		// At that point, we need to actually start the callback, but
		// only if it hasn't already begun.
		const extensionCallback: CustomExecutionData | undefined = this._providedCustomExecutions.get(execution.id);
		if (extensionCallback) {
			if (this._activeCustomExecutions.get(execution.id) !== undefined) {
				throw new Error('We should not be trying to start the same custom task executions twice.');
			}

			this._activeCustomExecutions.set(execution.id, extensionCallback);

			const taskExecutionComplete: IDisposable = extensionCallback.onTaskExecutionComplete(() => {
				this.customExecutionComplete(execution);
				taskExecutionComplete.dispose();
			});

			extensionCallback.startCallback(terminalId);
		}

		this._onDidExecuteTask.fire({
			execution: await this.getTaskExecution(execution)
		});
	}

	public get onDidEndTask(): Event<vscode.TaskEndEvent> {
		return this._onDidTerminateTask.event;
	}

	public async $OnDidEndTask(execution: TaskExecutionDTO): Promise<void> {
		const _execution = await this.getTaskExecution(execution);
		this._taskExecutions.delete(execution.id);
		this.customExecutionComplete(execution);
		this._onDidTerminateTask.fire({
			execution: _execution
		});
	}

	public get onDidStartTaskProcess(): Event<vscode.TaskProcessStartEvent> {
		return this._onDidTaskProcessStarted.event;
	}

	public async $onDidStartTaskProcess(value: TaskProcessStartedDTO): Promise<void> {
		const execution = await this.getTaskExecution(value.id);
		if (execution) {
			this._onDidTaskProcessStarted.fire({
				execution: execution,
				processId: value.processId
			});
		}
	}

	public get onDidEndTaskProcess(): Event<vscode.TaskProcessEndEvent> {
		return this._onDidTaskProcessEnded.event;
	}

	public async $onDidEndTaskProcess(value: TaskProcessEndedDTO): Promise<void> {
		const execution = await this.getTaskExecution(value.id);
		if (execution) {
			this._onDidTaskProcessEnded.fire({
				execution: execution,
				exitCode: value.exitCode
			});
		}
	}

	public $provideTasks(handle: number, validTypes: { [key: string]: boolean; }): Thenable<TaskSetDTO> {
		const handler = this._handlers.get(handle);
		if (!handler) {
			return Promise.reject(new Error('no handler found'));
		}

		// For custom execution tasks, we need to store the execution objects locally
		// since we obviously cannot send callback functions through the proxy.
		// So, clear out any existing ones.
		this._providedCustomExecutions.clear();
		this._providedCustomExecutions2.clear();

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
			const taskDTOs: TaskDTO[] = [];
			if (value) {
				for (let task of value) {
					if (!task.definition || !validTypes[task.definition.type]) {
						console.warn(`The task [${task.source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
					}

					const taskDTO: TaskDTO | undefined = TaskDTO.from(task, handler.extension);
					if (taskDTO) {
						taskDTOs.push(taskDTO);

						if (CustomExecutionDTO.is(taskDTO.execution)) {
							// The ID is calculated on the main thread task side, so, let's call into it here.
							// We need the task id's pre-computed for custom task executions because when OnDidStartTask
							// is invoked, we have to be able to map it back to our data.
							taskIdPromises.push(this.addCustomExecution(taskDTO, <vscode.Task2>task));
						} else if (CustomExecution2DTO.is(taskDTO.execution)) {
							taskIdPromises.push(this.addCustomExecution2(taskDTO, <vscode.Task2>task));

						}
					}
				}
			}
			return {
				tasks: taskDTOs,
				extension: handler.extension
			};
		});

		return new Promise((resolve) => {
			fetchPromise.then((result) => {
				Promise.all(taskIdPromises).then(() => {
					resolve(result);
				});
			});
		});
	}

	public async $resolveTask(handle: number, taskDTO: TaskDTO): Promise<TaskDTO | undefined> {
		const handler = this._handlers.get(handle);
		if (!handler) {
			return Promise.reject(new Error('no handler found'));
		}

		if (taskDTO.definition.type !== handler.type) {
			throw new Error(`Unexpected: Task of type [${taskDTO.definition.type}] cannot be resolved by provider of type [${handler.type}].`);
		}

		const task = await TaskDTO.to(taskDTO, this._workspaceProvider);
		if (!task) {
			throw new Error('Unexpected: Task cannot be resolved.');
		}

		const resolvedTask = await handler.provider.resolveTask(task, CancellationToken.None);
		if (!resolvedTask) {
			return;
		}

		const resolvedTaskDTO: TaskDTO | undefined = TaskDTO.from(resolvedTask, handler.extension);
		if (!resolvedTaskDTO) {
			throw new Error('Unexpected: Task cannot be resolved.');
		}

		if (resolvedTask.definition !== task.definition) {
			throw new Error('Unexpected: The resolved task definition must be the same object as the original task definition. The task definition cannot be changed.');
		}

		if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
			await this.addCustomExecution(resolvedTaskDTO, <vscode.Task2>resolvedTask);
		}

		if (CustomExecution2DTO.is(resolvedTaskDTO.execution)) {
			await this.addCustomExecution2(resolvedTaskDTO, <vscode.Task2>resolvedTask);
		}

		return resolvedTaskDTO;
	}

	public async $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }, variables: string[] }): Promise<{ process?: string, variables: { [key: string]: string; } }> {
		const configProvider = await this._configurationService.getConfigProvider();
		const uri: URI = URI.revive(uriComponents);
		const result = {
			process: <unknown>undefined as string,
			variables: Object.create(null)
		};
		const workspaceFolder = await this._workspaceProvider.resolveWorkspaceFolder(uri);
		const workspaceFolders = await this._workspaceProvider.getWorkspaceFolders2();
		if (!workspaceFolders || !workspaceFolder) {
			throw new Error('Unexpected: Tasks can only be run in a workspace folder');
		}
		const resolver = new ExtHostVariableResolverService(workspaceFolders, this._editorService, configProvider);
		const ws: IWorkspaceFolder = {
			uri: workspaceFolder.uri,
			name: workspaceFolder.name,
			index: workspaceFolder.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		};
		for (let variable of toResolve.variables) {
			result.variables[variable] = resolver.resolve(ws, variable);
		}
		if (toResolve.process !== undefined) {
			let paths: string[] | undefined = undefined;
			if (toResolve.process.path !== undefined) {
				paths = toResolve.process.path.split(path.delimiter);
				for (let i = 0; i < paths.length; i++) {
					paths[i] = resolver.resolve(ws, paths[i]);
				}
			}
			result.process = await win32.findExecutable(
				resolver.resolve(ws, toResolve.process.name),
				toResolve.process.cwd !== undefined ? resolver.resolve(ws, toResolve.process.cwd) : undefined,
				paths
			);
		}
		return result;
	}

	private nextHandle(): number {
		return this._handleCounter++;
	}

	private async addCustomExecution(taskDTO: TaskDTO, task: vscode.Task2): Promise<void> {
		const taskId = await this._proxy.$createTaskId(taskDTO);
		this._providedCustomExecutions.set(taskId, new CustomExecutionData(<vscode.CustomExecution>(<vscode.Task2>task).execution2, this._terminalService));
	}

	private async addCustomExecution2(taskDTO: TaskDTO, task: vscode.Task2): Promise<void> {
		const taskId = await this._proxy.$createTaskId(taskDTO);
		this._providedCustomExecutions2.set(taskId, <vscode.CustomExecution2>(<vscode.Task2>task).execution2);
	}

	private async getTaskExecution(execution: TaskExecutionDTO | string, task?: vscode.Task): Promise<TaskExecutionImpl> {
		if (typeof execution === 'string') {
			const taskExecution = this._taskExecutions.get(execution);
			if (!taskExecution) {
				throw new Error('Unexpected: The specified task is missing an execution');
			}
			return taskExecution;
		}

		let result: TaskExecutionImpl | undefined = this._taskExecutions.get(execution.id);
		if (result) {
			return result;
		}
		const taskToCreate = task ? task : await TaskDTO.to(execution.task, this._workspaceProvider);
		if (!taskToCreate) {
			throw new Error('Unexpected: Task does not exist.');
		}
		const createdResult: TaskExecutionImpl = new TaskExecutionImpl(this, execution.id, taskToCreate);
		this._taskExecutions.set(execution.id, createdResult);
		return createdResult;
	}

	private customExecutionComplete(execution: TaskExecutionDTO): void {
		const extensionCallback: CustomExecutionData | undefined = this._activeCustomExecutions.get(execution.id);
		if (extensionCallback) {
			this._activeCustomExecutions.delete(execution.id);
			this._proxy.$customExecutionComplete(execution.id, extensionCallback.result);
			extensionCallback.dispose();
		}
		const extensionCallback2: vscode.CustomExecution2 | undefined = this._activeCustomExecutions2.get(execution.id);
		if (extensionCallback2) {
			this._activeCustomExecutions2.delete(execution.id);
		}
	}
}
