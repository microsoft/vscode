/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

import { URI, UriComponents } from 'vs/base/common/uri';
import * as Objects from 'vs/base/common/objects';
import { asPromise } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { win32 } from 'vs/base/node/processes';

import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';

import { MainContext, MainThreadTaskShape, ExtHostTaskShape, IMainContext } from 'vs/workbench/api/node/extHost.protocol';

import * as types from 'vs/workbench/api/node/extHostTypes';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import * as vscode from 'vscode';
import {
	TaskDefinitionDTO, TaskExecutionDTO, TaskPresentationOptionsDTO, ProcessExecutionOptionsDTO, ProcessExecutionDTO,
	ShellExecutionOptionsDTO, ShellExecutionDTO, TaskDTO, TaskHandleDTO, TaskFilterDTO, TaskProcessStartedDTO, TaskProcessEndedDTO, TaskSystemInfoDTO, TaskSetDTO
} from '../shared/tasks';
import { ExtHostVariableResolverService } from 'vs/workbench/api/node/extHostDebugService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { CancellationToken } from 'vs/base/common/cancellation';

namespace TaskDefinitionDTO {
	export function from(value: vscode.TaskDefinition): TaskDefinitionDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: TaskDefinitionDTO): vscode.TaskDefinition {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace TaskPresentationOptionsDTO {
	export function from(value: vscode.TaskPresentationOptions): TaskPresentationOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: TaskPresentationOptionsDTO): vscode.TaskPresentationOptions {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: vscode.ProcessExecutionOptions): ProcessExecutionOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: ProcessExecutionOptionsDTO): vscode.ProcessExecutionOptions {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ProcessExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO): value is ProcessExecutionDTO {
		let candidate = value as ProcessExecutionDTO;
		return candidate && !!candidate.process;
	}
	export function from(value: vscode.ProcessExecution): ProcessExecutionDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		let result: ProcessExecutionDTO = {
			process: value.process,
			args: value.args
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: ProcessExecutionDTO): types.ProcessExecution {
		if (value === undefined || value === null) {
			return undefined;
		}
		return new types.ProcessExecution(value.process, value.args, value.options);
	}
}

namespace ShellExecutionOptionsDTO {
	export function from(value: vscode.ShellExecutionOptions): ShellExecutionOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
	export function to(value: ShellExecutionOptionsDTO): vscode.ShellExecutionOptions {
		if (value === undefined || value === null) {
			return undefined;
		}
		return value;
	}
}

namespace ShellExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO): value is ShellExecutionDTO {
		let candidate = value as ShellExecutionDTO;
		return candidate && (!!candidate.commandLine || !!candidate.command);
	}
	export function from(value: vscode.ShellExecution): ShellExecutionDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		let result: ShellExecutionDTO = {
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
	export function to(value: ShellExecutionDTO): types.ShellExecution {
		if (value === undefined || value === null) {
			return undefined;
		}
		if (value.commandLine) {
			return new types.ShellExecution(value.commandLine, value.options);
		} else {
			return new types.ShellExecution(value.command, value.args ? value.args : [], value.options);
		}
	}
}

namespace TaskHandleDTO {
	export function from(value: types.Task): TaskHandleDTO {
		let folder: UriComponents;
		if (value.scope !== undefined && typeof value.scope !== 'number') {
			folder = value.scope.uri;
		}
		return {
			id: value._id,
			workspaceFolder: folder
		};
	}
}

namespace TaskDTO {

	export function fromMany(tasks: vscode.Task[], extension: IExtensionDescription): TaskDTO[] {
		if (tasks === undefined || tasks === null) {
			return [];
		}
		let result: TaskDTO[] = [];
		for (let task of tasks) {
			let converted = from(task, extension);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	export function from(value: vscode.Task, extension: IExtensionDescription): TaskDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: ShellExecutionDTO | ProcessExecutionDTO;
		if (value.execution instanceof types.ProcessExecution) {
			execution = ProcessExecutionDTO.from(value.execution);
		} else if (value.execution instanceof types.ShellExecution) {
			execution = ShellExecutionDTO.from(value.execution);
		}
		let definition: TaskDefinitionDTO = TaskDefinitionDTO.from(value.definition);
		let scope: number | UriComponents;
		if (value.scope) {
			if (typeof value.scope === 'number') {
				scope = value.scope;
			} else {
				scope = value.scope.uri;
			}
		}
		if (!definition || !scope) {
			return undefined;
		}
		let group = (value.group as types.TaskGroup) ? (value.group as types.TaskGroup).id : undefined;
		let result: TaskDTO = {
			_id: (value as types.Task)._id,
			definition,
			name: value.name,
			source: {
				extensionId: extension.identifier.value,
				label: value.source,
				scope: scope
			},
			execution,
			isBackground: value.isBackground,
			group: group,
			presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
			problemMatchers: value.problemMatchers,
			hasDefinedMatchers: (value as types.Task).hasDefinedMatchers,
			runOptions: (<vscode.Task>value).runOptions ? (<vscode.Task>value).runOptions : { reevaluateOnRerun: true },
		};
		return result;
	}
	export function to(value: TaskDTO, workspace: ExtHostWorkspace): types.Task {
		if (value === undefined || value === null) {
			return undefined;
		}
		let execution: types.ShellExecution | types.ProcessExecution;
		if (ProcessExecutionDTO.is(value.execution)) {
			execution = ProcessExecutionDTO.to(value.execution);
		} else if (ShellExecutionDTO.is(value.execution)) {
			execution = ShellExecutionDTO.to(value.execution);
		}
		let definition: vscode.TaskDefinition = TaskDefinitionDTO.to(value.definition);
		let scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder;
		if (value.source) {
			if (value.source.scope !== undefined) {
				if (typeof value.source.scope === 'number') {
					scope = value.source.scope;
				} else {
					scope = workspace.resolveWorkspaceFolder(URI.revive(value.source.scope));
				}
			} else {
				scope = types.TaskScope.Workspace;
			}
		}
		if (!definition || !scope) {
			return undefined;
		}
		let result = new types.Task(definition, scope, value.name, value.source.label, execution, value.problemMatchers);
		if (value.isBackground !== undefined) {
			result.isBackground = value.isBackground;
		}
		if (value.group !== undefined) {
			result.group = types.TaskGroup.from(value.group);
		}
		if (value.presentationOptions) {
			result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions);
		}
		if (value._id) {
			result._id = value._id;
		}
		return result;
	}
}

namespace TaskFilterDTO {
	export function from(value: vscode.TaskFilter): TaskFilterDTO {
		return value;
	}

	export function to(value: TaskFilterDTO): vscode.TaskFilter {
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
	export function to(value: TaskExecutionDTO, tasks: ExtHostTask): vscode.TaskExecution {
		return new TaskExecutionImpl(tasks, value.id, TaskDTO.to(value.task, tasks.extHostWorkspace));
	}
	export function from(value: vscode.TaskExecution): TaskExecutionDTO {
		return {
			id: (value as TaskExecutionImpl)._id,
			task: undefined
		};
	}
}

interface HandlerData {
	provider: vscode.TaskProvider;
	extension: IExtensionDescription;
}

export class ExtHostTask implements ExtHostTaskShape {

	private _proxy: MainThreadTaskShape;
	private _workspaceService: ExtHostWorkspace;
	private _editorService: ExtHostDocumentsAndEditors;
	private _configurationService: ExtHostConfiguration;
	private _handleCounter: number;
	private _handlers: Map<number, HandlerData>;
	private _taskExecutions: Map<string, TaskExecutionImpl>;

	private readonly _onDidExecuteTask: Emitter<vscode.TaskStartEvent> = new Emitter<vscode.TaskStartEvent>();
	private readonly _onDidTerminateTask: Emitter<vscode.TaskEndEvent> = new Emitter<vscode.TaskEndEvent>();

	private readonly _onDidTaskProcessStarted: Emitter<vscode.TaskProcessStartEvent> = new Emitter<vscode.TaskProcessStartEvent>();
	private readonly _onDidTaskProcessEnded: Emitter<vscode.TaskProcessEndEvent> = new Emitter<vscode.TaskProcessEndEvent>();

	constructor(mainContext: IMainContext, workspaceService: ExtHostWorkspace, editorService: ExtHostDocumentsAndEditors, configurationService: ExtHostConfiguration) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTask);
		this._workspaceService = workspaceService;
		this._editorService = editorService;
		this._configurationService = configurationService;
		this._handleCounter = 0;
		this._handlers = new Map<number, HandlerData>();
		this._taskExecutions = new Map<string, TaskExecutionImpl>();
	}

	public get extHostWorkspace(): ExtHostWorkspace {
		return this._workspaceService;
	}

	public registerTaskProvider(extension: IExtensionDescription, provider: vscode.TaskProvider): vscode.Disposable {
		if (!provider) {
			return new types.Disposable(() => { });
		}
		let handle = this.nextHandle();
		this._handlers.set(handle, { provider, extension });
		this._proxy.$registerTaskProvider(handle);
		return new types.Disposable(() => {
			this._handlers.delete(handle);
			this._proxy.$unregisterTaskProvider(handle);
		});
	}

	public registerTaskSystem(scheme: string, info: TaskSystemInfoDTO): void {
		this._proxy.$registerTaskSystem(scheme, info);
	}

	public fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]> {
		return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then((values) => {
			let result: vscode.Task[] = [];
			for (let value of values) {
				let task = TaskDTO.to(value, this._workspaceService);
				if (task) {
					result.push(task);
				}
			}
			return result;
		});
	}

	public executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution> {
		let tTask = (task as types.Task);
		// We have a preserved ID. So the task didn't change.
		if (tTask._id !== undefined) {
			return this._proxy.$executeTask(TaskHandleDTO.from(tTask)).then(value => this.getTaskExecution(value, task));
		} else {
			let dto = TaskDTO.from(task, extension);
			if (dto === undefined) {
				return Promise.reject(new Error('Task is not valid'));
			}
			return this._proxy.$executeTask(dto).then(value => this.getTaskExecution(value, task));
		}
	}

	public get taskExecutions(): vscode.TaskExecution[] {
		let result: vscode.TaskExecution[] = [];
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

	public $onDidStartTask(execution: TaskExecutionDTO): void {
		this._onDidExecuteTask.fire({
			execution: this.getTaskExecution(execution)
		});
	}

	public get onDidEndTask(): Event<vscode.TaskEndEvent> {
		return this._onDidTerminateTask.event;
	}

	public $OnDidEndTask(execution: TaskExecutionDTO): void {
		const _execution = this.getTaskExecution(execution);
		this._taskExecutions.delete(execution.id);
		this._onDidTerminateTask.fire({
			execution: _execution
		});
	}

	public get onDidStartTaskProcess(): Event<vscode.TaskProcessStartEvent> {
		return this._onDidTaskProcessStarted.event;
	}

	public $onDidStartTaskProcess(value: TaskProcessStartedDTO): void {
		const execution = this.getTaskExecution(value.id);
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

	public $onDidEndTaskProcess(value: TaskProcessEndedDTO): void {
		const execution = this.getTaskExecution(value.id);
		if (execution) {
			this._onDidTaskProcessEnded.fire({
				execution: execution,
				exitCode: value.exitCode
			});
		}
	}

	public $provideTasks(handle: number, validTypes: { [key: string]: boolean; }): Thenable<TaskSetDTO> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return Promise.reject(new Error('no handler found'));
		}
		return asPromise(() => handler.provider.provideTasks(CancellationToken.None)).then(value => {
			let sanitized: vscode.Task[] = [];
			for (let task of value) {
				if (task.definition && validTypes[task.definition.type] === true) {
					sanitized.push(task);
				} else {
					sanitized.push(task);
					console.warn(`The task [${task.source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
				}
			}
			return {
				tasks: TaskDTO.fromMany(sanitized, handler.extension),
				extension: handler.extension
			};
		});
	}

	public $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }, variables: string[] }): Promise<{ process?: string, variables: { [key: string]: string; } }> {
		let uri: URI = URI.revive(uriComponents);
		let result = {
			process: undefined as string,
			variables: Object.create(null)
		};
		let workspaceFolder = this._workspaceService.resolveWorkspaceFolder(uri);
		let resolver = new ExtHostVariableResolverService(this._workspaceService, this._editorService, this._configurationService);
		let ws: IWorkspaceFolder = {
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
			result.process = win32.findExecutable(
				resolver.resolve(ws, toResolve.process.name),
				toResolve.process.cwd !== undefined ? resolver.resolve(ws, toResolve.process.cwd) : undefined,
				paths
			);
		}
		return Promise.resolve(result);
	}

	private nextHandle(): number {
		return this._handleCounter++;
	}

	private getTaskExecution(execution: TaskExecutionDTO | string, task?: vscode.Task): TaskExecutionImpl {
		if (typeof execution === 'string') {
			return this._taskExecutions.get(execution);
		}

		let result: TaskExecutionImpl = this._taskExecutions.get(execution.id);
		if (result) {
			return result;
		}
		result = new TaskExecutionImpl(this, execution.id, task ? task : TaskDTO.to(execution.task, this._workspaceService));
		this._taskExecutions.set(execution.id, result);
		return result;
	}
}
