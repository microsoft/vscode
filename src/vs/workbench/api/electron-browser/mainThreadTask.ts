/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import * as Platform from 'vs/base/common/platform';
import { IStringDictionary, forEach } from 'vs/base/common/collections';
import { IDisposable } from 'vs/base/common/lifecycle';

import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import {
	ContributedTask, KeyedTaskIdentifier, TaskExecution, Task, TaskEvent, TaskEventKind,
	PresentationOptions, CommandOptions, CommandConfiguration, RuntimeType, CustomTask, TaskScope, TaskSource, TaskSourceKind, ExtensionTaskSource, RunOptions, TaskSet
} from 'vs/workbench/parts/tasks/common/tasks';


import { ResolveSet, ResolvedVariables } from 'vs/workbench/parts/tasks/common/taskSystem';
import { ITaskService, TaskFilter, ITaskProvider } from 'vs/workbench/parts/tasks/common/taskService';

import { TaskDefinition } from 'vs/workbench/parts/tasks/node/tasks';

import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import {
	TaskDefinitionDTO, TaskExecutionDTO, ProcessExecutionOptionsDTO, TaskPresentationOptionsDTO,
	ProcessExecutionDTO, ShellExecutionDTO, ShellExecutionOptionsDTO, TaskDTO, TaskSourceDTO, TaskHandleDTO, TaskFilterDTO, TaskProcessStartedDTO, TaskProcessEndedDTO, TaskSystemInfoDTO,
	RunOptionsDTO
} from 'vs/workbench/api/shared/tasks';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

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
		if (result === undefined && executeOnly) {
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
		if (value === undefined || value === null) {
			return undefined;
		}
		return Objects.assign(Object.create(null), value);
	}
	export function to(value: TaskPresentationOptionsDTO): PresentationOptions {
		if (value === undefined || value === null) {
			return PresentationOptions.defaults;
		}
		return Objects.assign(Object.create(null), PresentationOptions.defaults, value);
	}
}

namespace RunOptionsDTO {
	export function from(value: RunOptions): RunOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return Objects.assign(Object.create(null), value);
	}
	export function to(value: RunOptionsDTO): RunOptions {
		if (value === undefined || value === null) {
			return RunOptions.defaults;
		}
		return Objects.assign(Object.create(null), RunOptions.defaults, value);
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: CommandOptions): ProcessExecutionOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		return {
			cwd: value.cwd,
			env: value.env
		};
	}
	export function to(value: ProcessExecutionOptionsDTO): CommandOptions {
		if (value === undefined || value === null) {
			return CommandOptions.defaults;
		}
		return {
			cwd: value.cwd || CommandOptions.defaults.cwd,
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
		result.options = ProcessExecutionOptionsDTO.to(value.options);
		return result;
	}
}

namespace ShellExecutionOptionsDTO {
	export function from(value: CommandOptions): ShellExecutionOptionsDTO {
		if (value === undefined || value === null) {
			return undefined;
		}
		let result: ShellExecutionOptionsDTO = {
			cwd: value.cwd || CommandOptions.defaults.cwd,
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
		if (value === undefined || value === null) {
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
		if (value.name && Types.isString(value.name) && (value.args === undefined || value.args === null || value.args.length === 0)) {
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
		if ((value.scope === undefined) || ((typeof value.scope === 'number') && (value.scope !== TaskScope.Global))) {
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
		if (task === undefined || task === null || (!CustomTask.is(task) && !ContributedTask.is(task))) {
			return undefined;
		}
		let result: TaskDTO = {
			_id: task._id,
			name: task.configurationProperties.name,
			definition: TaskDefinitionDTO.from(task.getDefinition()),
			source: TaskSourceDTO.from(task._source),
			execution: undefined,
			presentationOptions: task.command ? TaskPresentationOptionsDTO.from(task.command.presentation) : undefined,
			isBackground: task.configurationProperties.isBackground,
			problemMatchers: [],
			hasDefinedMatchers: ContributedTask.is(task) ? task.hasDefinedMatchers : false,
			runOptions: RunOptionsDTO.from(task.runOptions),
		};
		if (task.configurationProperties.group) {
			result.group = task.configurationProperties.group;
		}
		if (task.command) {
			if (task.command.runtime === RuntimeType.Process) {
				result.execution = ProcessExecutionDTO.from(task.command);
			} else if (task.command.runtime === RuntimeType.Shell) {
				result.execution = ShellExecutionDTO.from(task.command);
			}
		}
		if (task.configurationProperties.problemMatchers) {
			for (let matcher of task.configurationProperties.problemMatchers) {
				if (Types.isString(matcher)) {
					result.problemMatchers.push(matcher);
				}
			}
		}
		return result;
	}

	export function to(task: TaskDTO, workspace: IWorkspaceContextService, executeOnly: boolean): ContributedTask {
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
		let source = TaskSourceDTO.to(task.source, workspace);

		let label = nls.localize('task.label', '{0}: {1}', source.label, task.name);
		let definition = TaskDefinitionDTO.to(task.definition, executeOnly);
		let id = `${task.source.extensionId}.${definition._key}`;
		let result: ContributedTask = new ContributedTask(
			id, // uuidMap.getUUID(identifier)
			source,
			label,
			definition.type,
			definition,
			command,
			task.hasDefinedMatchers,
			RunOptionsDTO.to(task.runOptions),
			{
				name: task.name,
				identifier: label,
				group: task.group,
				isBackground: !!task.isBackground,
				problemMatchers: task.problemMatchers.slice(),
			}
		);
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
	private _providers: Map<number, { disposable: IDisposable, provider: ITaskProvider }>;

	constructor(
		extHostContext: IExtHostContext,
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextServer: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
		this._providers = new Map();
		this._taskService.onDidStateChange((event: TaskEvent) => {
			let task = event.__task;
			if (event.kind === TaskEventKind.Start) {
				this._proxy.$onDidStartTask(TaskExecutionDTO.from(task.getTaskExecution()));
			} else if (event.kind === TaskEventKind.ProcessStarted) {
				this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(task.getTaskExecution(), event.processId));
			} else if (event.kind === TaskEventKind.ProcessEnded) {
				this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(task.getTaskExecution(), event.exitCode));
			} else if (event.kind === TaskEventKind.End) {
				this._proxy.$OnDidEndTask(TaskExecutionDTO.from(task.getTaskExecution()));
			}
		});
	}

	public dispose(): void {
		this._providers.forEach((value) => {
			value.disposable.dispose();
		});
		this._providers.clear();
	}

	public $registerTaskProvider(handle: number): Promise<void> {
		let provider: ITaskProvider = {
			provideTasks: (validTypes: IStringDictionary<boolean>) => {
				return Promise.resolve(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
					let tasks: Task[] = [];
					for (let dto of value.tasks) {
						let task = TaskDTO.to(dto, this._workspaceContextServer, true);
						if (task) {
							tasks.push(task);
						} else {
							console.error(`Task System: can not convert task: ${JSON.stringify(dto.definition, undefined, 0)}. Task will be dropped`);
						}
					}
					return {
						tasks,
						extension: value.extension
					} as TaskSet;
				});
			}
		};
		let disposable = this._taskService.registerTaskProvider(provider);
		this._providers.set(handle, { disposable, provider });
		return Promise.resolve(undefined);
	}

	public $unregisterTaskProvider(handle: number): Promise<void> {
		this._providers.delete(handle);
		return Promise.resolve(undefined);
	}

	public $fetchTasks(filter?: TaskFilterDTO): Promise<TaskDTO[]> {
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

	public $executeTask(value: TaskHandleDTO | TaskDTO): Promise<TaskExecutionDTO> {
		return new Promise<TaskExecutionDTO>((resolve, reject) => {
			if (TaskHandleDTO.is(value)) {
				let workspaceFolder = this._workspaceContextServer.getWorkspaceFolder(URI.revive(value.workspaceFolder));
				this._taskService.getTask(workspaceFolder, value.id, true).then((task: Task) => {
					this._taskService.run(task).then(undefined, reason => {
						// eat the error, it has already been surfaced to the user and we don't care about it here
					});
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
				this._taskService.run(task).then(undefined, reason => {
					// eat the error, it has already been surfaced to the user and we don't care about it here
				});
				let result: TaskExecutionDTO = {
					id: task._id,
					task: TaskDTO.from(task)
				};
				resolve(result);
			}
		});
	}

	public $terminateTask(id: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
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
			resolveVariables: (workspaceFolder: IWorkspaceFolder, toResolve: ResolveSet): Promise<ResolvedVariables> => {
				let vars: string[] = [];
				toResolve.variables.forEach(item => vars.push(item));
				return Promise.resolve(this._proxy.$resolveVariables(workspaceFolder.uri, { process: toResolve.process, variables: vars })).then(values => {
					const partiallyResolvedVars = new Array<string>();
					forEach(values.variables, (entry) => {
						partiallyResolvedVars.push(entry.value);
					});
					return new Promise((resolve, reject) => {
						this._configurationResolverService.resolveWithInteraction(workspaceFolder, partiallyResolvedVars, 'tasks').then(resolvedVars => {
							let result = {
								process: undefined as string,
								variables: new Map<string, string>()
							};
							for (let i = 0; i < partiallyResolvedVars.length; i++) {
								const variableName = vars[i].substring(2, vars[i].length - 1);
								if (values.variables[vars[i]] === vars[i]) {
									result.variables.set(variableName, resolvedVars.get(variableName));
								} else {
									result.variables.set(variableName, partiallyResolvedVars[i]);
								}
							}
							if (Types.isString(values.process)) {
								result.process = values.process;
							}
							resolve(result);
						}, reason => {
							reject(reason);
						});
					});
				});
			}
		});
	}
}
