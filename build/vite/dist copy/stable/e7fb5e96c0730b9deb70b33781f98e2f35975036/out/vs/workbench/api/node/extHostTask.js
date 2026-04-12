/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { findExecutable } from '../../../base/node/processes.js';
import { IExtHostWorkspace } from '../common/extHostWorkspace.js';
import { IExtHostDocumentsAndEditors } from '../common/extHostDocumentsAndEditors.js';
import { IExtHostConfiguration } from '../common/extHostConfiguration.js';
import { WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { ExtHostTaskBase, TaskHandleDTO, TaskDTO, CustomExecutionDTO } from '../common/extHostTask.js';
import { Schemas } from '../../../base/common/network.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostApiDeprecationService } from '../common/extHostApiDeprecationService.js';
import * as resources from '../../../base/common/resources.js';
import { homedir } from 'os';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';
let ExtHostTask = class ExtHostTask extends ExtHostTaskBase {
    constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService, variableResolver) {
        super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
        this.workspaceService = workspaceService;
        this.variableResolver = variableResolver;
        if (initData.remote.isRemote && initData.remote.authority) {
            this.registerTaskSystem(Schemas.vscodeRemote, {
                scheme: Schemas.vscodeRemote,
                authority: initData.remote.authority,
                platform: process.platform
            });
        }
        else {
            this.registerTaskSystem(Schemas.file, {
                scheme: Schemas.file,
                authority: '',
                platform: process.platform
            });
        }
        this._proxy.$registerSupportedExecutions(true, true, true);
    }
    async executeTask(extension, task) {
        const tTask = task;
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
            this._proxy.$executeTask(handleDto).catch(() => { });
            return execution;
        }
        else {
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
            this._proxy.$executeTask(dto).catch(() => { });
            return execution;
        }
    }
    provideTasksInternal(validTypes, taskIdPromises, handler, value) {
        const taskDTOs = [];
        if (value) {
            for (const task of value) {
                this.checkDeprecation(task, handler);
                if (!task.definition || !validTypes[task.definition.type]) {
                    this._logService.warn(`The task [${task.source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
                }
                const taskDTO = TaskDTO.from(task, handler.extension);
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
    async resolveTaskInternal(resolvedTaskDTO) {
        return resolvedTaskDTO;
    }
    async getAFolder(workspaceFolders) {
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
    async $resolveVariables(uriComponents, toResolve) {
        const uri = URI.revive(uriComponents);
        const result = {
            process: undefined,
            variables: Object.create(null)
        };
        const workspaceFolder = await this._workspaceProvider.resolveWorkspaceFolder(uri);
        const workspaceFolders = (await this._workspaceProvider.getWorkspaceFolders2()) ?? [];
        const resolver = await this.variableResolver.getResolver();
        const ws = workspaceFolder ? {
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
            let paths = undefined;
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
            }
            else if (path.isAbsolute(processName)) {
                result.process = processName;
            }
            else {
                result.process = path.join(cwd ?? '', processName);
            }
        }
        return result;
    }
    async $jsonTasksSupported() {
        return true;
    }
    async $findExecutable(command, cwd, paths) {
        return findExecutable(command, cwd, paths);
    }
};
ExtHostTask = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, IExtHostWorkspace),
    __param(3, IExtHostDocumentsAndEditors),
    __param(4, IExtHostConfiguration),
    __param(5, IExtHostTerminalService),
    __param(6, ILogService),
    __param(7, IExtHostApiDeprecationService),
    __param(8, IExtHostVariableResolverProvider)
], ExtHostTask);
export { ExtHostTask };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRhc2suanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdFRhc2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLElBQUksTUFBTSw4QkFBOEIsQ0FBQztBQUVyRCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUdsRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRSxPQUFPLEVBQW9CLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBZSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDMUYsT0FBTyxLQUFLLFNBQVMsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1B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