/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';

import { URI, UriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as Types from '../../../base/common/types.js';
import * as Platform from '../../../base/common/platform.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';

import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../platform/workspace/common/workspace.js';

import {
	ContributedTask, ConfiguringTask, KeyedTaskIdentifier, ITaskExecution, Task, ITaskEvent,
	IPresentationOptions, CommandOptions, ICommandConfiguration, RuntimeType, CustomTask, TaskScope, TaskSource,
	TaskSourceKind, IExtensionTaskSource, IRunOptions, ITaskSet, TaskGroup, TaskDefinition, PresentationOptions, RunOptions
} from '../../contrib/tasks/common/tasks.js';


import { IResolveSet, IResolvedVariables } from '../../contrib/tasks/common/taskSystem.js';
import { ITaskService, ITaskFilter, ITaskProvider } from '../../contrib/tasks/common/taskService.js';

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext } from '../common/extHost.protocol.js';
import {
	ITaskDefinitionDTO, ITaskExecutionDTO, IProcessExecutionOptionsDTO, ITaskPresentationOptionsDTO,
	IProcessExecutionDTO, IShellExecutionDTO, IShellExecutionOptionsDTO, ICustomExecutionDTO, ITaskDTO, ITaskSourceDTO, ITaskHandleDTO, ITaskFilterDTO, ITaskProcessStartedDTO, ITaskProcessEndedDTO, ITaskSystemInfoDTO,
	IRunOptionsDTO, ITaskGroupDTO,
	ITaskProblemMatcherStarted,
	ITaskProblemMatcherEnded,
	TaskEventKind
} from '../common/shared/tasks.js';
import { IConfigurationResolverService } from '../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ConfigurationResolverExpression } from '../../services/configurationResolver/common/configurationResolverExpression.js';

namespace TaskExecutionDTO {
	export function from(value: ITaskExecution): ITaskExecutionDTO {
		return {
			id: value.id,
			task: TaskDTO.from(value.task)
		};
	}
}

export interface ITaskProblemMatcherStartedDto {
	execution: ITaskExecutionDTO;
}

export namespace TaskProblemMatcherStartedDto {
	export function from(value: ITaskProblemMatcherStarted): ITaskProblemMatcherStartedDto {
		return {
			execution: {
				id: value.execution.id,
				task: TaskDTO.from(value.execution.task)
			},
		};
	}
}

export interface ITaskProblemMatcherEndedDto {
	execution: ITaskExecutionDTO;
	hasErrors: boolean;
}

export namespace TaskProblemMatcherEndedDto {
	export function from(value: ITaskProblemMatcherEnded): ITaskProblemMatcherEndedDto {
		return {
			execution: {
				id: value.execution.id,
				task: TaskDTO.from(value.execution.task)
			},
			hasErrors: value.hasErrors
		};
	}
}



namespace TaskProcessStartedDTO {
	export function from(value: ITaskExecution, processId: number): ITaskProcessStartedDTO {
		return {
			id: value.id,
			processId
		};
	}
}

namespace TaskProcessEndedDTO {
	export function from(value: ITaskExecution, exitCode: number | undefined): ITaskProcessEndedDTO {
		return {
			id: value.id,
			exitCode
		};
	}
}

namespace TaskDefinitionDTO {
	export function from(value: KeyedTaskIdentifier): ITaskDefinitionDTO {
		const result = Object.assign(Object.create(null), value);
		delete result._key;
		return result;
	}
	export function to(value: ITaskDefinitionDTO, executeOnly: boolean): KeyedTaskIdentifier | undefined {
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
	export function from(value: IPresentationOptions | undefined): ITaskPresentationOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return Object.assign(Object.create(null), value);
	}
	export function to(value: ITaskPresentationOptionsDTO | undefined): IPresentationOptions {
		if (value === undefined || value === null) {
			return PresentationOptions.defaults;
		}
		return Object.assign(Object.create(null), PresentationOptions.defaults, value);
	}
}

namespace RunOptionsDTO {
	export function from(value: IRunOptions): IRunOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return Object.assign(Object.create(null), value);
	}
	export function to(value: IRunOptionsDTO | undefined): IRunOptions {
		if (value === undefined || value === null) {
			return RunOptions.defaults;
		}
		return Object.assign(Object.create(null), RunOptions.defaults, value);
	}
}

namespace ProcessExecutionOptionsDTO {
	export function from(value: CommandOptions): IProcessExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		return {
			cwd: value.cwd,
			env: value.env
		};
	}
	export function to(value: IProcessExecutionOptionsDTO | undefined): CommandOptions {
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
	export function is(value: IShellExecutionDTO | IProcessExecutionDTO | ICustomExecutionDTO): value is IProcessExecutionDTO {
		const candidate = value as IProcessExecutionDTO;
		return candidate && !!candidate.process;
	}
	export function from(value: ICommandConfiguration): IProcessExecutionDTO {
		const process: string = Types.isString(value.name) ? value.name : value.name!.value;
		const args: string[] = value.args ? value.args.map(value => Types.isString(value) ? value : value.value) : [];
		const result: IProcessExecutionDTO = {
			process: process,
			args: args
		};
		if (value.options) {
			result.options = ProcessExecutionOptionsDTO.from(value.options);
		}
		return result;
	}
	export function to(value: IProcessExecutionDTO): ICommandConfiguration {
		const result: ICommandConfiguration = {
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
	export function from(value: CommandOptions): IShellExecutionOptionsDTO | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: IShellExecutionOptionsDTO = {
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
	export function to(value: IShellExecutionOptionsDTO): CommandOptions | undefined {
		if (value === undefined || value === null) {
			return undefined;
		}
		const result: CommandOptions = {
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
	export function is(value: IShellExecutionDTO | IProcessExecutionDTO | ICustomExecutionDTO): value is IShellExecutionDTO {
		const candidate = value as IShellExecutionDTO;
		return candidate && (!!candidate.commandLine || !!candidate.command);
	}
	export function from(value: ICommandConfiguration): IShellExecutionDTO {
		const result: IShellExecutionDTO = {};
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
	export function to(value: IShellExecutionDTO): ICommandConfiguration {
		const result: ICommandConfiguration = {
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

namespace CustomExecutionDTO {
	export function is(value: IShellExecutionDTO | IProcessExecutionDTO | ICustomExecutionDTO): value is ICustomExecutionDTO {
		const candidate = value as ICustomExecutionDTO;
		return candidate && candidate.customExecution === 'customExecution';
	}

	export function from(value: ICommandConfiguration): ICustomExecutionDTO {
		return {
			customExecution: 'customExecution'
		};
	}

	export function to(value: ICustomExecutionDTO): ICommandConfiguration {
		return {
			runtime: RuntimeType.CustomExecution,
			presentation: undefined
		};
	}
}

namespace TaskSourceDTO {
	export function from(value: TaskSource): ITaskSourceDTO {
		const result: ITaskSourceDTO = {
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
			result.scope = value.config.workspaceFolder ? value.config.workspaceFolder.uri : TaskScope.Global;
		}
		return result;
	}
	export function to(value: ITaskSourceDTO, workspace: IWorkspaceContextService): IExtensionTaskSource {
		let scope: TaskScope;
		let workspaceFolder: IWorkspaceFolder | undefined;
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
			workspaceFolder = workspace.getWorkspaceFolder(URI.revive(value.scope)) ?? undefined;
		}
		const result: IExtensionTaskSource = {
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
	export function is(value: unknown): value is ITaskHandleDTO {
		const candidate = value as ITaskHandleDTO | undefined;
		return !!candidate && Types.isString(candidate.id) && !!candidate.workspaceFolder;
	}
}

namespace TaskDTO {
	export function from(task: Task | ConfiguringTask): ITaskDTO | undefined {
		if (task === undefined || task === null || (!CustomTask.is(task) && !ContributedTask.is(task) && !ConfiguringTask.is(task))) {
			return undefined;
		}
		const result: ITaskDTO = {
			_id: task._id,
			name: task.configurationProperties.name,
			definition: TaskDefinitionDTO.from(task.getDefinition(true)),
			source: TaskSourceDTO.from(task._source),
			execution: undefined,
			presentationOptions: !ConfiguringTask.is(task) && task.command ? TaskPresentationOptionsDTO.from(task.command.presentation) : undefined,
			isBackground: task.configurationProperties.isBackground,
			problemMatchers: [],
			hasDefinedMatchers: ContributedTask.is(task) ? task.hasDefinedMatchers : false,
			runOptions: RunOptionsDTO.from(task.runOptions),
		};
		result.group = TaskGroupDTO.from(task.configurationProperties.group);

		if (task.configurationProperties.detail) {
			result.detail = task.configurationProperties.detail;
		}
		if (!ConfiguringTask.is(task) && task.command) {
			switch (task.command.runtime) {
				case RuntimeType.Process: result.execution = ProcessExecutionDTO.from(task.command); break;
				case RuntimeType.Shell: result.execution = ShellExecutionDTO.from(task.command); break;
				case RuntimeType.CustomExecution: result.execution = CustomExecutionDTO.from(task.command); break;
			}
		}
		if (task.configurationProperties.problemMatchers) {
			for (const matcher of task.configurationProperties.problemMatchers) {
				if (Types.isString(matcher)) {
					result.problemMatchers.push(matcher);
				}
			}
		}
		return result;
	}

	export function to(task: ITaskDTO | undefined, workspace: IWorkspaceContextService, executeOnly: boolean, icon?: { id?: string; color?: string }, hide?: boolean): ContributedTask | undefined {
		if (!task || (typeof task.name !== 'string')) {
			return undefined;
		}

		let command: ICommandConfiguration | undefined;
		if (task.execution) {
			if (ShellExecutionDTO.is(task.execution)) {
				command = ShellExecutionDTO.to(task.execution);
			} else if (ProcessExecutionDTO.is(task.execution)) {
				command = ProcessExecutionDTO.to(task.execution);
			} else if (CustomExecutionDTO.is(task.execution)) {
				command = CustomExecutionDTO.to(task.execution);
			}
		}

		if (!command) {
			return undefined;
		}
		command.presentation = TaskPresentationOptionsDTO.to(task.presentationOptions);
		const source = TaskSourceDTO.to(task.source, workspace);

		const label = nls.localize('task.label', '{0}: {1}', source.label, task.name);
		const definition = TaskDefinitionDTO.to(task.definition, executeOnly)!;
		const id = (CustomExecutionDTO.is(task.execution!) && task._id) ? task._id : `${task.source.extensionId}.${definition._key}`;
		const result: ContributedTask = new ContributedTask(
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
				detail: task.detail,
				icon,
				hide
			}
		);
		return result;
	}
}

namespace TaskGroupDTO {
	export function from(value: string | TaskGroup | undefined): ITaskGroupDTO | undefined {
		if (value === undefined) {
			return undefined;
		}
		return {
			_id: (typeof value === 'string') ? value : value._id,
			isDefault: (typeof value === 'string') ? false : ((typeof value.isDefault === 'string') ? false : value.isDefault)
		};
	}
}

namespace TaskFilterDTO {
	export function from(value: ITaskFilter): ITaskFilterDTO {
		return value;
	}
	export function to(value: ITaskFilterDTO | undefined): ITaskFilter | undefined {
		return value;
	}
}

@extHostNamedCustomer(MainContext.MainThreadTask)
export class MainThreadTask extends Disposable implements MainThreadTaskShape {

	private readonly _extHostContext: IExtHostContext | undefined;
	private readonly _proxy: ExtHostTaskShape;
	private readonly _providers: Map<number, { disposable: IDisposable; provider: ITaskProvider }>;

	constructor(
		extHostContext: IExtHostContext,
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextServer: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
		this._providers = new Map();
		this._register(this._taskService.onDidStateChange(async (event: ITaskEvent) => {
			if (event.kind === TaskEventKind.Changed) {
				return;
			}

			const task = event.__task;
			if (event.kind === TaskEventKind.Start) {
				const execution = TaskExecutionDTO.from(task.getTaskExecution());
				let resolvedDefinition: ITaskDefinitionDTO = execution.task!.definition;
				if (execution.task?.execution && CustomExecutionDTO.is(execution.task.execution) && event.resolvedVariables) {
					const expr = ConfigurationResolverExpression.parse(execution.task.definition);
					for (const replacement of expr.unresolved()) {
						const value = event.resolvedVariables.get(replacement.inner);
						if (value !== undefined) {
							expr.resolve(replacement, value);
						}
					}

					resolvedDefinition = await this._configurationResolverService.resolveAsync(task.getWorkspaceFolder(), expr);
				}
				this._proxy.$onDidStartTask(execution, event.terminalId, resolvedDefinition);
			} else if (event.kind === TaskEventKind.ProcessStarted) {
				this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(task.getTaskExecution(), event.processId));
			} else if (event.kind === TaskEventKind.ProcessEnded) {
				this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(task.getTaskExecution(), event.exitCode));
			} else if (event.kind === TaskEventKind.End) {
				this._proxy.$OnDidEndTask(TaskExecutionDTO.from(task.getTaskExecution()));
			} else if (event.kind === TaskEventKind.ProblemMatcherStarted) {
				this._proxy.$onDidStartTaskProblemMatchers(TaskProblemMatcherStartedDto.from({ execution: task.getTaskExecution() }));
			} else if (event.kind === TaskEventKind.ProblemMatcherEnded) {
				this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: false }));
			} else if (event.kind === TaskEventKind.ProblemMatcherFoundErrors) {
				this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: true }));
			}

		}));
	}

	public override dispose(): void {
		for (const value of this._providers.values()) {
			value.disposable.dispose();
		}
		this._providers.clear();
		super.dispose();
	}

	$createTaskId(taskDTO: ITaskDTO): Promise<string> {
		return new Promise((resolve, reject) => {
			const task = TaskDTO.to(taskDTO, this._workspaceContextServer, true);
			if (task) {
				resolve(task._id);
			} else {
				reject(new Error('Task could not be created from DTO'));
			}
		});
	}

	public $registerTaskProvider(handle: number, type: string): Promise<void> {
		const provider: ITaskProvider = {
			provideTasks: (validTypes: IStringDictionary<boolean>) => {
				return Promise.resolve(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
					const tasks: Task[] = [];
					for (const dto of value.tasks) {
						const task = TaskDTO.to(dto, this._workspaceContextServer, true);
						if (task) {
							tasks.push(task);
						} else {
							console.error(`Task System: can not convert task: ${JSON.stringify(dto.definition, undefined, 0)}. Task will be dropped`);
						}
					}
					const processedExtension: IExtensionDescription = {
						...value.extension,
						extensionLocation: URI.revive(value.extension.extensionLocation)
					};
					return {
						tasks,
						extension: processedExtension
					} satisfies ITaskSet;
				});
			},
			resolveTask: (task: ConfiguringTask) => {
				const dto = TaskDTO.from(task);

				if (dto) {
					dto.name = ((dto.name === undefined) ? '' : dto.name); // Using an empty name causes the name to default to the one given by the provider.
					return Promise.resolve(this._proxy.$resolveTask(handle, dto)).then(resolvedTask => {
						if (resolvedTask) {
							return TaskDTO.to(resolvedTask, this._workspaceContextServer, true, task.configurationProperties.icon, task.configurationProperties.hide);
						}

						return undefined;
					});
				}
				return Promise.resolve<ContributedTask | undefined>(undefined);
			}
		};
		const disposable = this._taskService.registerTaskProvider(provider, type);
		this._providers.set(handle, { disposable, provider });
		return Promise.resolve(undefined);
	}

	public $unregisterTaskProvider(handle: number): Promise<void> {
		const provider = this._providers.get(handle);
		if (provider) {
			provider.disposable.dispose();
			this._providers.delete(handle);
		}
		return Promise.resolve(undefined);
	}

	public $fetchTasks(filter?: ITaskFilterDTO): Promise<ITaskDTO[]> {
		return this._taskService.tasks(TaskFilterDTO.to(filter)).then((tasks) => {
			const result: ITaskDTO[] = [];
			for (const task of tasks) {
				const item = TaskDTO.from(task);
				if (item) {
					result.push(item);
				}
			}
			return result;
		});
	}

	private getWorkspace(value: UriComponents | string): string | IWorkspace | IWorkspaceFolder | null {
		let workspace;
		if (typeof value === 'string') {
			workspace = value;
		} else {
			const workspaceObject = this._workspaceContextServer.getWorkspace();
			const uri = URI.revive(value);
			if (workspaceObject.configuration?.toString() === uri.toString()) {
				workspace = workspaceObject;
			} else {
				workspace = this._workspaceContextServer.getWorkspaceFolder(uri);
			}
		}
		return workspace;
	}

	public async $getTaskExecution(value: ITaskHandleDTO | ITaskDTO): Promise<ITaskExecutionDTO> {
		if (TaskHandleDTO.is(value)) {
			const workspace = this.getWorkspace(value.workspaceFolder);
			if (workspace) {
				const task = await this._taskService.getTask(workspace, value.id, true);
				if (task) {
					return {
						id: task._id,
						task: TaskDTO.from(task)
					};
				}
				throw new Error('Task not found');
			} else {
				throw new Error('No workspace folder');
			}
		} else {
			const task = TaskDTO.to(value, this._workspaceContextServer, true)!;
			return {
				id: task._id,
				task: TaskDTO.from(task)
			};
		}
	}

	// Passing in a TaskHandleDTO will cause the task to get re-resolved, which is important for tasks are coming from the core,
	// such as those gotten from a fetchTasks, since they can have missing configuration properties.
	public $executeTask(value: ITaskHandleDTO | ITaskDTO): Promise<ITaskExecutionDTO> {
		return new Promise<ITaskExecutionDTO>((resolve, reject) => {
			if (TaskHandleDTO.is(value)) {
				const workspace = this.getWorkspace(value.workspaceFolder);
				if (workspace) {
					this._taskService.getTask(workspace, value.id, true).then((task: Task | undefined) => {
						if (!task) {
							reject(new Error('Task not found'));
						} else {
							const result: ITaskExecutionDTO = {
								id: value.id,
								task: TaskDTO.from(task)
							};
							this._taskService.run(task).then(summary => {
								// Ensure that the task execution gets cleaned up if the exit code is undefined
								// This can happen when the task has dependent tasks and one of them failed
								if ((summary?.exitCode === undefined) || (summary.exitCode !== 0)) {
									this._proxy.$OnDidEndTask(result);
								}
							}, reason => {
								// eat the error, it has already been surfaced to the user and we don't care about it here
							});
							resolve(result);
						}
					}, (_error) => {
						reject(new Error('Task not found'));
					});
				} else {
					reject(new Error('No workspace folder'));
				}
			} else {
				const task = TaskDTO.to(value, this._workspaceContextServer, true)!;
				this._taskService.run(task).then(undefined, reason => {
					// eat the error, it has already been surfaced to the user and we don't care about it here
				});
				const result: ITaskExecutionDTO = {
					id: task._id,
					task: TaskDTO.from(task)
				};
				resolve(result);
			}
		});
	}


	public $customExecutionComplete(id: string, result?: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._taskService.getActiveTasks().then((tasks) => {
				for (const task of tasks) {
					if (id === task._id) {
						this._taskService.extensionCallbackTaskComplete(task, result).then((value) => {
							resolve(undefined);
						}, (error) => {
							reject(error);
						});
						return;
					}
				}
				reject(new Error('Task to mark as complete not found'));
			});
		});
	}

	public $terminateTask(id: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._taskService.getActiveTasks().then((tasks) => {
				for (const task of tasks) {
					if (id === task._id) {
						this._taskService.terminate(task).then((value) => {
							resolve(undefined);
						}, (error) => {
							reject(undefined);
						});
						return;
					}
				}
				reject(new ErrorNoTelemetry('Task to terminate not found'));
			});
		});
	}

	public $registerTaskSystem(key: string, info: ITaskSystemInfoDTO): void {
		let platform: Platform.Platform;
		switch (info.platform) {
			case 'Web':
				platform = Platform.Platform.Web;
				break;
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
				return URI.from({ scheme: info.scheme, authority: info.authority, path });
			},
			context: this._extHostContext,
			resolveVariables: (workspaceFolder: IWorkspaceFolder, toResolve: IResolveSet, target: ConfigurationTarget): Promise<IResolvedVariables | undefined> => {
				const vars: string[] = [];
				toResolve.variables.forEach(item => vars.push(item));
				return Promise.resolve(this._proxy.$resolveVariables(workspaceFolder.uri, { process: toResolve.process, variables: vars })).then(values => {
					const partiallyResolvedVars = Array.from(Object.values(values.variables));
					return new Promise<IResolvedVariables | undefined>((resolve, reject) => {
						this._configurationResolverService.resolveWithInteraction(workspaceFolder, partiallyResolvedVars, 'tasks', undefined, target).then(resolvedVars => {
							if (!resolvedVars) {
								resolve(undefined);
							}

							const result: IResolvedVariables = {
								process: undefined,
								variables: new Map<string, string>()
							};
							for (let i = 0; i < partiallyResolvedVars.length; i++) {
								const variableName = vars[i].substring(2, vars[i].length - 1);
								if (resolvedVars && values.variables[vars[i]] === vars[i]) {
									const resolved = resolvedVars.get(variableName);
									if (typeof resolved === 'string') {
										result.variables.set(variableName, resolved);
									}
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
			},
			findExecutable: (command: string, cwd?: string, paths?: string[]): Promise<string | undefined> => {
				return this._proxy.$findExecutable(command, cwd, paths);
			}
		});
	}

	async $registerSupportedExecutions(custom?: boolean, shell?: boolean, process?: boolean): Promise<void> {
		return this._taskService.registerSupportedExecutions(custom, shell, process);
	}

}
