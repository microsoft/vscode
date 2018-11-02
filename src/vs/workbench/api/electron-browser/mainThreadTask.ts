/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as Objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import * as Types from 'vs/base/common/types';
import * as Platform from 'vs/base/common/platform';
import { IStringDictionary } from 'vs/base/common/collections';

import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import {
	ContributedTask, ExtensionTaskSourceTransfer, KeyedTaskIdentifier, TaskExecution, Task, TaskEvent, TaskEventKind,
	PresentationOptions, CommandOptions, CommandConfiguration, RuntimeType, CustomTask, TaskScope, TaskSource, TaskSourceKind, ExtensionTaskSource, RevealKind, PanelKind
} from 'vs/workbench/parts/tasks/common/tasks';

import { TaskDefinition } from 'vs/workbench/parts/tasks/node/tasks';

import { ITaskService, TaskFilter } from 'vs/workbench/parts/tasks/common/taskService';

import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import {
	TaskDefinitionDTO, TaskExecutionDTO, ProcessExecutionOptionsDTO, TaskPresentationOptionsDTO,
	ProcessExecutionDTO, ShellExecutionDTO, ShellExecutionOptionsDTO, TaskDTO, TaskSourceDTO, TaskHandleDTO, TaskFilterDTO, TaskProcessStartedDTO, TaskProcessEndedDTO, TaskSystemInfoDTO
} from 'vs/workbench/api/shared/tasks';

namespace TaskExecutionDTO {
	export function from(value: TaskExecution): TaskExecutionDTO {
		return {
			id: value.id,
			task: TaskDTO.from(value.task)
		};
	}
	export function to(value: TaskExecutionDTO, workspace: IWorkspaceContextService, executeOnly: boolean): TaskExecution {
		return {
			id: value.id,
			task: TaskDTO.to(value.task, workspace, executeOnly)
		};
	}
}

namespace TaskProcessStartedDTO {
	export function from(value: TaskExecution, processId: number): TaskProcessStartedDTO {
		return {
			id: value.id,
			processId
		};
	}
}

namespace TaskProcessEndedDTO {
	export function from(value: TaskExecution, exitCode: number): TaskProcessEndedDTO {
		return {
			id: value.id,
			exitCode
		};
	}
}

namespace TaskDefinitionDTO {
	export function from(value: KeyedTaskIdentifier): TaskDefinitionDTO {
		let result = Objects.assign(Object.create(null), value);
		delete result._key;
		return result;
	}
	export function to(value: TaskDefinitionDTO, executeOnly: boolean): KeyedTaskIdentifier {
		let result = TaskDefinition.createTaskIdentifier(value, console);
		if (result === void 0 && executeOnly) {
			result = {
				_key: generateUuid(),
				type: '$executeOnly'
			};
		}
		return result;
	}
}

namespace TaskPresentationOptionsDTO {
	export function from(value: PresentationOptions): TaskPresentationOptionsDTO {
		if (value === void 0 || value === null) {
			return undefined;
		}
		return Objects.assign(Object.create(null), value);
	}
	export function to(value: TaskPresentationOptionsDTO): PresentationOptions {
		if (value === void 0 || value === null) {
			return { reveal: RevealKind.Always, echo: true, focus: false, panel: PanelKind.Shared, showReuseMessage: true, clear: false };
		}
		return Objects.assign(Object.create(null), value);
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: CommandOptions): ProcessExecutionOptionsDTO {
		if (value === void 0 || value === null) {
			return undefined;
		}
		return {
			cwd: value.cwd,
			env: value.env
		};
	}
	export function to(value: ProcessExecutionOptionsDTO): CommandOptions {
		if (value === void 0 || value === null) {
			return undefined;
		}
		return {
			cwd: value.cwd,
			env: value.env
		};
	}
}

namespace ProcessExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO): value is ProcessExecutionDTO {
		let candidate = value as ProcessExecutionDTO;
		return candidate && !!candidate.process;
	}
	export function from(value: CommandConfiguration): ProcessExecutionDTO {
		let process: string = Types.isString(value.name) ? value.name : value.name.value;
		let args: string[] = value.args ? value.args.map(value => Types.isString(value) ? value : value.value) : [];
		let result: ProcessExecutionDTO = {
			process: process,
			args: args
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: ProcessExecutionDTO): CommandConfiguration {
		let result: CommandConfiguration = {
			runtime: RuntimeType.Process,
			name: value.process,
			args: value.args,
			presentation: undefined
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.to(value.options);
		}
		return result;
	}
}

namespace ShellExecutionOptionsDTO {
	export function from(value: CommandOptions): ShellExecutionOptionsDTO {
		if (value === void 0 || value === null) {
			return undefined;
		}
		let result: ShellExecutionOptionsDTO = {
			cwd: value.cwd,
			env: value.env
		};
		if (value.shell) {
			result.executable = value.shell.executable;
			result.shellArgs = value.shell.args;
			result.shellQuoting = value.shell.quoting;
		}
		return result;
	}
	export function to(value: ShellExecutionOptionsDTO): CommandOptions {
		if (value === void 0 || value === null) {
			return undefined;
		}
		let result: CommandOptions = {
			cwd: value.cwd,
			env: value.env
		};
		if (value.executable) {
			result.shell = {
				executable: value.executable
			};
			if (value.shellArgs) {
				result.shell.args = value.shellArgs;
			}
			if (value.shellQuoting) {
				result.shell.quoting = value.shellQuoting;
			}
		}
		return result;
	}
}

namespace ShellExecutionDTO {
	export function is(value: ShellExecutionDTO | ProcessExecutionDTO): value is ShellExecutionDTO {
		let candidate = value as ShellExecutionDTO;
		return candidate && (!!candidate.commandLine || !!candidate.command);
	}
	export function from(value: CommandConfiguration): ShellExecutionDTO {
		let result: ShellExecutionDTO = {};
		if (value.name && Types.isString(value.name) && (value.args === void 0 || value.args === null || value.args.length === 0)) {
			result.commandLine = value.name;
		} else {
			result.command = value.name;
			result.args = value.args;
		}
		if (value.options) {
			result.options = ShellExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: ShellExecutionDTO): CommandConfiguration {
		let result: CommandConfiguration = {
			runtime: RuntimeType.Shell,
			name: value.commandLine ? value.commandLine : value.command,
			args: value.args,
			presentation: undefined
		};
		if (value.options) {
			result.options = ShellExecutionOptionsDTO.to(value.options);
		}
		return result;
	}
}

namespace TaskSourceDTO {
	export function from(value: TaskSource): TaskSourceDTO {
		let result: TaskSourceDTO = {
			label: value.label
		};
		if (value.kind === TaskSourceKind.Extension) {
			result.extensionId = value.extension;
			if (value.workspaceFolder) {
				result.scope = value.workspaceFolder.uri;
			} else {
				result.scope = value.scope;
			}
		} else if (value.kind === TaskSourceKind.Workspace) {
			result.extensionId = '$core';
			result.scope = value.config.workspaceFolder.uri;
		}
		return result;
	}
	export function to(value: TaskSourceDTO, workspace: IWorkspaceContextService): ExtensionTaskSource {
		let scope: TaskScope;
		let workspaceFolder: IWorkspaceFolder;
		if (value.scope === void 0) {
			if (workspace.getWorkspace().folders.length === 0) {
				scope = TaskScope.Global;
				workspaceFolder = undefined;
			} else {
				scope = TaskScope.Folder;
				workspaceFolder = workspace.getWorkspace().folders[0];
			}
		} else if (typeof value.scope === 'number') {
			scope = value.scope;
		} else {
			scope = TaskScope.Folder;
			workspaceFolder = workspace.getWorkspaceFolder(URI.revive(value.scope));
		}
		let result: ExtensionTaskSource = {
			kind: TaskSourceKind.Extension,
			label: value.label,
			extension: value.extensionId,
			scope,
			workspaceFolder
		};
		return result;
	}
}

namespace TaskHandleDTO {
	export function is(value: any): value is TaskHandleDTO {
		let candidate: TaskHandleDTO = value;
		return candidate && Types.isString(candidate.id) && !!candidate.workspaceFolder;
	}
}

namespace TaskDTO {
	export function from(task: Task): TaskDTO {
		if (task === void 0 || task === null || (!CustomTask.is(task) && !ContributedTask.is(task))) {
			return undefined;
		}
		let result: TaskDTO = {
			_id: task._id,
			name: task.name,
			definition: TaskDefinitionDTO.from(Task.getTaskDefinition(task)),
			source: TaskSourceDTO.from(task._source),
			execution: undefined,
			presentationOptions: task.command ? TaskPresentationOptionsDTO.from(task.command.presentation) : undefined,
			isBackground: task.isBackground,
			problemMatchers: [],
			hasDefinedMatchers: ContributedTask.is(task) ? task.hasDefinedMatchers : false
		};
		if (task.group) {
			result.group = task.group;
		}
		if (task.command) {
			if (task.command.runtime === RuntimeType.Process) {
				result.execution = ProcessExecutionDTO.from(task.command);
			} else if (task.command.runtime === RuntimeType.Shell) {
				result.execution = ShellExecutionDTO.from(task.command);
			}
		}
		if (task.problemMatchers) {
			for (let matcher of task.problemMatchers) {
				if (Types.isString(matcher)) {
					result.problemMatchers.push(matcher);
				}
			}
		}
		return result;
	}

	export function to(task: TaskDTO, workspace: IWorkspaceContextService, executeOnly: boolean): Task {
		if (typeof task.name !== 'string') {
			return undefined;
		}
		let command: CommandConfiguration;
		if (ShellExecutionDTO.is(task.execution)) {
			command = ShellExecutionDTO.to(task.execution);
		} else if (ProcessExecutionDTO.is(task.execution)) {
			command = ProcessExecutionDTO.to(task.execution);
		}
		if (!command) {
			return undefined;
		}
		command.presentation = TaskPresentationOptionsDTO.to(task.presentationOptions);
		command.presentation = Objects.assign(command.presentation || {}, { echo: true, reveal: RevealKind.Always, focus: false, panel: PanelKind.Shared });

		let source = TaskSourceDTO.to(task.source, workspace);

		let label = nls.localize('task.label', '{0}: {1}', source.label, task.name);
		let definition = TaskDefinitionDTO.to(task.definition, executeOnly);
		let id = `${task.source.extensionId}.${definition._key}`;
		let result: ContributedTask = {
			_id: id, // uuidMap.getUUID(identifier)
			_source: source,
			_label: label,
			type: definition.type,
			defines: definition,
			name: task.name,
			identifier: label,
			group: task.group,
			command: command,
			isBackground: !!task.isBackground,
			problemMatchers: task.problemMatchers.slice(),
			hasDefinedMatchers: task.hasDefinedMatchers
		};
		return result;
	}
}

namespace TaskFilterDTO {
	export function from(value: TaskFilter): TaskFilterDTO {
		return value;
	}
	export function to(value: TaskFilterDTO): TaskFilter {
		return value;
	}
}

@extHostNamedCustomer(MainContext.MainThreadTask)
export class MainThreadTask implements MainThreadTaskShape {

	private _extHostContext: IExtHostContext;
	private _proxy: ExtHostTaskShape;
	private _activeHandles: { [handle: number]: boolean; };

	constructor(
		extHostContext: IExtHostContext,
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextServer: IWorkspaceContextService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
		this._activeHandles = Object.create(null);
		this._taskService.onDidStateChange((event: TaskEvent) => {
			let task = event.__task;
			if (event.kind === TaskEventKind.Start) {
				this._proxy.$onDidStartTask(TaskExecutionDTO.from(Task.getTaskExecution(task)));
			} else if (event.kind === TaskEventKind.ProcessStarted) {
				this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(Task.getTaskExecution(task), event.processId));
			} else if (event.kind === TaskEventKind.ProcessEnded) {
				this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(Task.getTaskExecution(task), event.exitCode));
			} else if (event.kind === TaskEventKind.End) {
				this._proxy.$OnDidEndTask(TaskExecutionDTO.from(Task.getTaskExecution(task)));
			}
		});
	}

	public dispose(): void {
		Object.keys(this._activeHandles).forEach((handle) => {
			this._taskService.unregisterTaskProvider(parseInt(handle, 10));
		});
		this._activeHandles = Object.create(null);
	}

	public $registerTaskProvider(handle: number): Thenable<void> {
		this._taskService.registerTaskProvider(handle, {
			provideTasks: (validTypes: IStringDictionary<boolean>) => {
				return TPromise.wrap(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
					let tasks: Task[] = [];
					for (let task of value.tasks) {
						let taskTransfer = task._source as any as ExtensionTaskSourceTransfer;
						if (taskTransfer.__workspaceFolder !== void 0 && taskTransfer.__definition !== void 0) {
							(task._source as any).workspaceFolder = this._workspaceContextServer.getWorkspaceFolder(URI.revive(taskTransfer.__workspaceFolder));
							delete taskTransfer.__workspaceFolder;
							let taskIdentifier = TaskDefinition.createTaskIdentifier(taskTransfer.__definition, console);
							delete taskTransfer.__definition;
							if (taskIdentifier !== void 0) {
								(task as ContributedTask).defines = taskIdentifier;
								task._id = `${task._id}.${taskIdentifier._key}`;
								tasks.push(task);
							}
						} else {
							console.warn(`Dropping task ${task.name}. Missing workspace folder and task definition`);
						}
					}
					value.tasks = tasks;
					return value;
				});
			}
		});
		this._activeHandles[handle] = true;
		return TPromise.wrap<void>(undefined);
	}

	public $unregisterTaskProvider(handle: number): Thenable<void> {
		this._taskService.unregisterTaskProvider(handle);
		delete this._activeHandles[handle];
		return TPromise.wrap<void>(undefined);
	}

	public $fetchTasks(filter?: TaskFilterDTO): Thenable<TaskDTO[]> {
		return this._taskService.tasks(TaskFilterDTO.to(filter)).then((tasks) => {
			let result: TaskDTO[] = [];
			for (let task of tasks) {
				let item = TaskDTO.from(task);
				if (item) {
					result.push(item);
				}
			}
			return result;
		});
	}

	public $executeTask(value: TaskHandleDTO | TaskDTO): Thenable<TaskExecutionDTO> {
		return new TPromise<TaskExecutionDTO>((resolve, reject) => {
			if (TaskHandleDTO.is(value)) {
				let workspaceFolder = this._workspaceContextServer.getWorkspaceFolder(URI.revive(value.workspaceFolder));
				this._taskService.getTask(workspaceFolder, value.id, true).then((task: Task) => {
					this._taskService.run(task);
					let result: TaskExecutionDTO = {
						id: value.id,
						task: TaskDTO.from(task)
					};
					resolve(result);
				}, (_error) => {
					reject(new Error('Task not found'));
				});
			} else {
				let task = TaskDTO.to(value, this._workspaceContextServer, true);
				this._taskService.run(task);
				let result: TaskExecutionDTO = {
					id: task._id,
					task: TaskDTO.from(task)
				};
				resolve(result);
			}
		});
	}

	public $terminateTask(id: string): Thenable<void> {
		return new TPromise<void>((resolve, reject) => {
			this._taskService.getActiveTasks().then((tasks) => {
				for (let task of tasks) {
					if (id === task._id) {
						this._taskService.terminate(task).then((value) => {
							resolve(undefined);
						}, (error) => {
							reject(undefined);
						});
						return;
					}
				}
				reject(new Error('Task to terminate not found'));
			});
		});
	}

	public $registerTaskSystem(key: string, info: TaskSystemInfoDTO): void {
		let platform: Platform.Platform;
		switch (info.platform) {
			case 'win32':
				platform = Platform.Platform.Windows;
				break;
			case 'darwin':
				platform = Platform.Platform.Mac;
				break;
			case 'linux':
				platform = Platform.Platform.Linux;
				break;
			default:
				platform = Platform.platform;
		}
		this._taskService.registerTaskSystem(key, {
			platform: platform,
			uriProvider: (path: string): URI => {
				return URI.parse(`${info.scheme}://${info.authority}${path}`);
			},
			context: this._extHostContext,
			resolveVariables: (workspaceFolder: IWorkspaceFolder, variables: Set<string>): TPromise<Map<string, string>> => {
				let vars: string[] = [];
				variables.forEach(item => vars.push(item));
				return TPromise.wrap(this._proxy.$resolveVariables(workspaceFolder.uri, vars)).then(values => {
					let result = new Map<string, string>();
					Object.keys(values).forEach(key => result.set(key, values[key]));
					return result;
				});
			}
		});
	}
}
