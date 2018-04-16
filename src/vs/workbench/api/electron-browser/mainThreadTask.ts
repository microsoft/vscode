/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as crypto from 'crypto';

import * as nls from 'vs/nls';

import URI from 'vs/base/common/uri';
import * as Objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import * as Types from 'vs/base/common/types';

import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import {
	ContributedTask, ExtensionTaskSourceTransfer, TaskIdentifier, TaskExecution, Task, TaskEvent, TaskEventKind,
	PresentationOptions, CommandOptions, CommandConfiguration, RuntimeType, CustomTask, TaskScope, TaskSource, TaskSourceKind, ExtensionTaskSource, RevealKind, PanelKind
} from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';


import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import {
	TaskDefinitionDTO, TaskExecutionDTO, ProcessExecutionOptionsDTO, TaskPresentationOptionsDTO,
	ProcessExecutionDTO, ShellExecutionDTO, ShellExecutionOptionsDTO, TaskDTO, TaskSourceDTO, TaskHandleDTO
} from 'vs/workbench/api/shared/tasks';

export { TaskDTO, TaskHandleDTO, TaskExecutionDTO };

namespace TaskExecutionDTO {
	export function from(value: TaskExecution): TaskExecutionDTO {
		return {
			id: value.id,
			task: TaskDTO.from(value.task)
		};
	}
	export function to(value: TaskExecutionDTO, workspace: IWorkspaceContextService): TaskExecution {
		return {
			id: value.id,
			task: TaskDTO.to(value.task, workspace)
		};
	}
}

namespace TaskDefinitionDTO {
	export function from(value: TaskIdentifier): TaskDefinitionDTO {
		let result = Objects.assign(Object.create(null), value);
		delete result._key;
		return result;
	}
	export function to(value: TaskDefinitionDTO): TaskIdentifier {
		const hash = crypto.createHash('md5');
		hash.update(JSON.stringify(value));
		let result = Objects.assign(Object.create(null), value);
		result._key = hash.digest('hex');
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
			return undefined;
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
		if (!result.execution) {
			return undefined;
		}
		return result;
	}

	export function to(task: TaskDTO, workspace: IWorkspaceContextService): Task {
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
		let definition = TaskDefinitionDTO.to(task.definition);
		let id = `${task.source.extensionId}.${definition._key}`;
		let result: ContributedTask = {
			_id: id, // uuidMap.getUUID(identifier),
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

@extHostNamedCustomer(MainContext.MainThreadTask)
export class MainThreadTask implements MainThreadTaskShape {

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
				this._proxy.$taskStarted(TaskExecutionDTO.from(Task.getTaskExecution(task)));
			} else if (event.kind === TaskEventKind.End) {
				this._proxy.$taskEnded(TaskExecutionDTO.from(Task.getTaskExecution(task)));
			}
		});
	}

	public dispose(): void {
		Object.keys(this._activeHandles).forEach((handle) => {
			this._taskService.unregisterTaskProvider(parseInt(handle, 10));
		});
		this._activeHandles = Object.create(null);
	}

	public $registerTaskProvider(handle: number): TPromise<void> {
		this._taskService.registerTaskProvider(handle, {
			provideTasks: () => {
				return this._proxy.$provideTasks(handle).then((value) => {
					for (let task of value.tasks) {
						if (ContributedTask.is(task)) {
							let uri = (task._source as any as ExtensionTaskSourceTransfer).__workspaceFolder;
							if (uri) {
								delete (task._source as any as ExtensionTaskSourceTransfer).__workspaceFolder;
								(task._source as any).workspaceFolder = this._workspaceContextServer.getWorkspaceFolder(URI.revive(uri));
							}
						}
					}
					return value;
				});
			}
		});
		this._activeHandles[handle] = true;
		return TPromise.wrap<void>(undefined);
	}

	public $unregisterTaskProvider(handle: number): TPromise<void> {
		this._taskService.unregisterTaskProvider(handle);
		delete this._activeHandles[handle];
		return TPromise.wrap<void>(undefined);
	}

	public $executeTaskProvider(): TPromise<TaskDTO[]> {
		return this._taskService.tasks().then((tasks) => {
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

	public $executeTask(value: TaskHandleDTO | TaskDTO): TPromise<TaskExecutionDTO> {
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
				}, (error) => {
					reject(new Error('Task not found'));
				});
			} else {
				let task = TaskDTO.to(value, this._workspaceContextServer);
				this._taskService.run(task);
				let result: TaskExecutionDTO = {
					id: task._id,
					task: TaskDTO.from(task)
				};
				resolve(result);
			}
		});
	}

	public $terminateTask(id: string): TPromise<void> {
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
}
