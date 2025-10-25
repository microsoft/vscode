/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';

import { URI, UriComponents } from '../../../base/common/uri.js';
import { findExecutable } from '../../../base/node/processes.js';
import * as types from '../common/extHostTypes.js';
import { IExtHostWorkspace } from '../common/extHostWorkspace.js';
import type * as vscode from 'vscode';
import * as tasks from '../common/shared/tasks.js';
import { IExtHostDocumentsAndEditors } from '../common/extHostDocumentsAndEditors.js';
import { IExtHostConfiguration } from '../common/extHostConfiguration.js';
import { IWorkspaceFolder, WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { ExtHostTaskBase, TaskHandleDTO, TaskDTO, CustomExecutionDTO, HandlerData } from '../common/extHostTask.js';
import { Schemas } from '../../../base/common/network.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostApiDeprecationService } from '../common/extHostApiDeprecationService.js';
import * as resources from '../../../base/common/resources.js';
import { homedir } from 'os';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';

export class ExtHostTask extends ExtHostTaskBase {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostWorkspace private readonly workspaceService: IExtHostWorkspace,
		@IExtHostDocumentsAndEditors editorService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService extHostTerminalService: IExtHostTerminalService,
		@ILogService logService: ILogService,
		@IExtHostApiDeprecationService deprecationService: IExtHostApiDeprecationService,
		@IExtHostVariableResolverProvider private readonly variableResolver: IExtHostVariableResolverProvider,
	) {
		super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
		if (initData.remote.isRemote && initData.remote.authority) {
			this.registerTaskSystem(Schemas.vscodeRemote, {
				scheme: Schemas.vscodeRemote,
				authority: initData.remote.authority,
				platform: process.platform
			});
		} else {
			this.registerTaskSystem(Schemas.file, {
				scheme: Schemas.file,
				authority: '',
				platform: process.platform
			});
		}
		this._proxy.$registerSupportedExecutions(true, true, true);
	}

	public async executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution> {
		const tTask = (task as types.Task);

		if (!task.execution && (tTask._id === undefined)) {
			throw new Error('Tasks to execute must include an execution');
		}

		// We have a preserved ID. So the task didn't change.
		if (tTask._id !== undefined) {
			// Always get the task execution first to prevent timing issues when retrieving it later
			const handleDto = TaskHandleDTO.from(tTask, this.workspaceService);
			const executionDTO = await this._proxy.$getTaskExecution(handleDto);
			if (executionDTO.task === undefined) {
				throw new Error('Task from execution DTO is undefined');
			}
			const execution = await this.getTaskExecution(executionDTO, task);
			this._proxy.$executeTask(handleDto).catch(() => { /* The error here isn't actionable. */ });
			return execution;
		} else {
			const dto = TaskDTO.from(task, extension);
			if (dto === undefined) {
				return Promise.reject(new Error('Task is not valid'));
			}

			// If this task is a custom execution, then we need to save it away
			// in the provided custom execution map that is cleaned up after the
			// task is executed.
			if (CustomExecutionDTO.is(dto.execution)) {
				await this.addCustomExecution(dto, task, false);
			}
			// Always get the task execution first to prevent timing issues when retrieving it later
			const execution = await this.getTaskExecution(await this._proxy.$getTaskExecution(dto), task);
			this._proxy.$executeTask(dto).catch(() => { /* The error here isn't actionable. */ });
			return execution;
		}
	}

	protected provideTasksInternal(validTypes: { [key: string]: boolean }, taskIdPromises: Promise<void>[], handler: HandlerData, value: vscode.Task[] | null | undefined): { tasks: tasks.ITaskDTO[]; extension: IExtensionDescription } {
		const taskDTOs: tasks.ITaskDTO[] = [];
		if (value) {
			for (const task of value) {
				this.checkDeprecation(task, handler);

				if (!task.definition || !validTypes[task.definition.type]) {
					this._logService.warn(`The task [${task.source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
				}

				const taskDTO: tasks.ITaskDTO | undefined = TaskDTO.from(task, handler.extension);
				if (taskDTO) {
					taskDTOs.push(taskDTO);

					if (CustomExecutionDTO.is(taskDTO.execution)) {
						// The ID is calculated on the main thread task side, so, let's call into it here.
						// We need the task id's pre-computed for custom task executions because when OnDidStartTask
						// is invoked, we have to be able to map it back to our data.
						taskIdPromises.push(this.addCustomExecution(taskDTO, task, true));
					}
				}
			}
		}
		return {
			tasks: taskDTOs,
			extension: handler.extension
		};
	}

	protected async resolveTaskInternal(resolvedTaskDTO: tasks.ITaskDTO): Promise<tasks.ITaskDTO | undefined> {
		return resolvedTaskDTO;
	}

	private async getAFolder(workspaceFolders: vscode.WorkspaceFolder[] | undefined): Promise<IWorkspaceFolder> {
		let folder = (workspaceFolders && workspaceFolders.length > 0) ? workspaceFolders[0] : undefined;
		if (!folder) {
			const userhome = URI.file(homedir());
			folder = new WorkspaceFolder({ uri: userhome, name: resources.basename(userhome), index: 0 });
		}
		return {
			uri: folder.uri,
			name: folder.name,
			index: folder.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		};
	}

	public async $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }; variables: string[] }): Promise<{ process?: string; variables: { [key: string]: string } }> {
		const uri: URI = URI.revive(uriComponents);
		const result = {
			process: undefined as string | undefined,
			variables: Object.create(null)
		};
		const workspaceFolder = await this._workspaceProvider.resolveWorkspaceFolder(uri);
		const workspaceFolders = (await this._workspaceProvider.getWorkspaceFolders2()) ?? [];

		const resolver = await this.variableResolver.getResolver();
		const ws: IWorkspaceFolder = workspaceFolder ? {
			uri: workspaceFolder.uri,
			name: workspaceFolder.name,
			index: workspaceFolder.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		} : await this.getAFolder(workspaceFolders);

		for (const variable of toResolve.variables) {
			result.variables[variable] = await resolver.resolveAsync(ws, variable);
		}
		if (toResolve.process !== undefined) {
			let paths: string[] | undefined = undefined;
			if (toResolve.process.path !== undefined) {
				paths = toResolve.process.path.split(path.delimiter);
				for (let i = 0; i < paths.length; i++) {
					paths[i] = await resolver.resolveAsync(ws, paths[i]);
				}
			}
			const processName = await resolver.resolveAsync(ws, toResolve.process.name);
			const cwd = toResolve.process.cwd !== undefined ? await resolver.resolveAsync(ws, toResolve.process.cwd) : undefined;
			const foundExecutable = await findExecutable(processName, cwd, paths);
			if (foundExecutable) {
				result.process = foundExecutable;
			} else if (path.isAbsolute(processName)) {
				result.process = processName;
			} else {
				result.process = path.join(cwd ?? '', processName);
			}
		}
		return result;
	}

	public async $jsonTasksSupported(): Promise<boolean> {
		return true;
	}

	public async $findExecutable(command: string, cwd?: string, paths?: string[]): Promise<string | undefined> {
		return findExecutable(command, cwd, paths);
	}
}
