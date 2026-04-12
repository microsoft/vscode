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
import { URI } from '../../../base/common/uri.js';
import { asPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { MainContext } from './extHost.protocol.js';
import * as types from './extHostTypes.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
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
var TaskDefinitionDTO;
(function (TaskDefinitionDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    TaskDefinitionDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    TaskDefinitionDTO.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
(function (TaskPresentationOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    TaskPresentationOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    TaskPresentationOptionsDTO.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
(function (ProcessExecutionOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    ProcessExecutionOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    ProcessExecutionOptionsDTO.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
(function (ProcessExecutionDTO) {
    function is(value) {
        if (value) {
            const candidate = value;
            return candidate && !!candidate.process;
        }
        else {
            return false;
        }
    }
    ProcessExecutionDTO.is = is;
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const result = {
            process: value.process,
            args: value.args
        };
        if (value.options) {
            result.options = ProcessExecutionOptionsDTO.from(value.options);
        }
        return result;
    }
    ProcessExecutionDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return new types.ProcessExecution(value.process, value.args, value.options);
    }
    ProcessExecutionDTO.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
(function (ShellExecutionOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    ShellExecutionOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return value;
    }
    ShellExecutionOptionsDTO.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
(function (ShellExecutionDTO) {
    function is(value) {
        if (value) {
            const candidate = value;
            return candidate && (!!candidate.commandLine || !!candidate.command);
        }
        else {
            return false;
        }
    }
    ShellExecutionDTO.is = is;
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const result = {};
        if (value.commandLine !== undefined) {
            result.commandLine = value.commandLine;
        }
        else {
            result.command = value.command;
            result.args = value.args;
        }
        if (value.options) {
            result.options = ShellExecutionOptionsDTO.from(value.options);
        }
        return result;
    }
    ShellExecutionDTO.from = from;
    function to(value) {
        if (value === undefined || value === null || (value.command === undefined && value.commandLine === undefined)) {
            return undefined;
        }
        if (value.commandLine) {
            return new types.ShellExecution(value.commandLine, value.options);
        }
        else {
            return new types.ShellExecution(value.command, value.args ? value.args : [], value.options);
        }
    }
    ShellExecutionDTO.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
export var CustomExecutionDTO;
(function (CustomExecutionDTO) {
    function is(value) {
        if (value) {
            const candidate = value;
            return candidate && candidate.customExecution === 'customExecution';
        }
        else {
            return false;
        }
    }
    CustomExecutionDTO.is = is;
    function from(value) {
        return {
            customExecution: 'customExecution'
        };
    }
    CustomExecutionDTO.from = from;
    function to(taskId, providedCustomExeutions) {
        return providedCustomExeutions.get(taskId);
    }
    CustomExecutionDTO.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
export var TaskHandleDTO;
(function (TaskHandleDTO) {
    function from(value, workspaceService) {
        let folder;
        if (value.scope !== undefined && typeof value.scope !== 'number') {
            folder = value.scope.uri;
        }
        else if (value.scope !== undefined && typeof value.scope === 'number') {
            if ((value.scope === types.TaskScope.Workspace) && workspaceService && workspaceService.workspaceFile) {
                folder = workspaceService.workspaceFile;
            }
            else {
                folder = USER_TASKS_GROUP_KEY;
            }
        }
        return {
            id: value._id,
            workspaceFolder: folder
        };
    }
    TaskHandleDTO.from = from;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskGroupDTO;
(function (TaskGroupDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return { _id: value.id, isDefault: value.isDefault };
    }
    TaskGroupDTO.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
export var TaskDTO;
(function (TaskDTO) {
    function fromMany(tasks, extension) {
        if (tasks === undefined || tasks === null) {
            return [];
        }
        const result = [];
        for (const task of tasks) {
            const converted = from(task, extension);
            if (converted) {
                result.push(converted);
            }
        }
        return result;
    }
    TaskDTO.fromMany = fromMany;
    function from(value, extension) {
        if (value === undefined || value === null) {
            return undefined;
        }
        let execution;
        if (value.execution instanceof types.ProcessExecution) {
            execution = ProcessExecutionDTO.from(value.execution);
        }
        else if (value.execution instanceof types.ShellExecution) {
            execution = ShellExecutionDTO.from(value.execution);
        }
        else if (value.execution && value.execution instanceof types.CustomExecution) {
            execution = CustomExecutionDTO.from(value.execution);
        }
        const definition = TaskDefinitionDTO.from(value.definition);
        let scope;
        if (value.scope) {
            if (typeof value.scope === 'number') {
                scope = value.scope;
            }
            else {
                scope = value.scope.uri;
            }
        }
        else {
            // To continue to support the deprecated task constructor that doesn't take a scope, we must add a scope here:
            scope = types.TaskScope.Workspace;
        }
        if (!definition || !scope) {
            return undefined;
        }
        const result = {
            _id: value._id,
            definition,
            name: value.name,
            source: {
                extensionId: extension.identifier.value,
                label: value.source,
                scope: scope
            },
            execution: execution,
            isBackground: value.isBackground,
            group: TaskGroupDTO.from(value.group),
            presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
            problemMatchers: asArray(value.problemMatchers),
            hasDefinedMatchers: value.hasDefinedMatchers,
            runOptions: value.runOptions ? value.runOptions : { reevaluateOnRerun: true },
            detail: value.detail
        };
        return result;
    }
    TaskDTO.from = from;
    async function to(value, workspace, providedCustomExeutions) {
        if (value === undefined || value === null) {
            return undefined;
        }
        let execution;
        if (ProcessExecutionDTO.is(value.execution)) {
            execution = ProcessExecutionDTO.to(value.execution);
        }
        else if (ShellExecutionDTO.is(value.execution)) {
            execution = ShellExecutionDTO.to(value.execution);
        }
        else if (CustomExecutionDTO.is(value.execution)) {
            execution = CustomExecutionDTO.to(value._id, providedCustomExeutions);
        }
        const definition = TaskDefinitionDTO.to(value.definition);
        let scope;
        if (value.source) {
            if (value.source.scope !== undefined) {
                if (typeof value.source.scope === 'number') {
                    scope = value.source.scope;
                }
                else {
                    scope = await workspace.resolveWorkspaceFolder(URI.revive(value.source.scope));
                }
            }
            else {
                scope = types.TaskScope.Workspace;
            }
        }
        if (!definition || !scope) {
            return undefined;
        }
        const result = new types.Task(definition, scope, value.name, value.source.label, execution, value.problemMatchers);
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
            result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions);
        }
        if (value.runOptions) {
            result.runOptions = value.runOptions;
        }
        if (value._id) {
            result._id = value._id;
        }
        if (value.detail) {
            result.detail = value.detail;
        }
        return result;
    }
    TaskDTO.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskFilterDTO;
(function (TaskFilterDTO) {
    function from(value) {
        return value;
    }
    TaskFilterDTO.from = from;
    function to(value) {
        if (!value) {
            return undefined;
        }
        return Object.assign(Object.create(null), value);
    }
    TaskFilterDTO.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
class TaskExecutionImpl {
    #tasks;
    constructor(tasks, _id, _task) {
        this._id = _id;
        this._task = _task;
        this.#tasks = tasks;
    }
    get task() {
        return this._task;
    }
    terminate() {
        this.#tasks.terminateTask(this);
    }
    fireDidStartProcess(value) {
    }
    fireDidEndProcess(value) {
    }
    get terminal() {
        return this._terminal;
    }
    set terminal(term) {
        this._terminal = term;
    }
}
let ExtHostTaskBase = class ExtHostTaskBase {
    constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
        this._onDidExecuteTask = new Emitter();
        this._onDidTerminateTask = new Emitter();
        this._onDidTaskProcessStarted = new Emitter();
        this._onDidTaskProcessEnded = new Emitter();
        this._onDidStartTaskProblemMatchers = new Emitter();
        this._onDidEndTaskProblemMatchers = new Emitter();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadTask);
        this._workspaceProvider = workspaceService;
        this._editorService = editorService;
        this._configurationService = configurationService;
        this._terminalService = extHostTerminalService;
        this._handleCounter = 0;
        this._handlers = new Map();
        this._taskExecutions = new Map();
        this._taskExecutionPromises = new Map();
        this._providedCustomExecutions2 = new Map();
        this._notProvidedCustomExecutions = new Set();
        this._activeCustomExecutions2 = new Map();
        this._logService = logService;
        this._deprecationService = deprecationService;
        this._proxy.$registerSupportedExecutions(true);
    }
    registerTaskProvider(extension, type, provider) {
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
    registerTaskSystem(scheme, info) {
        this._proxy.$registerTaskSystem(scheme, info);
    }
    fetchTasks(filter) {
        return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then(async (values) => {
            const result = [];
            for (const value of values) {
                const task = await TaskDTO.to(value, this._workspaceProvider, this._providedCustomExecutions2);
                if (task) {
                    result.push(task);
                }
            }
            return result;
        });
    }
    get taskExecutions() {
        const result = [];
        this._taskExecutions.forEach(value => result.push(value));
        return result;
    }
    terminateTask(execution) {
        if (!(execution instanceof TaskExecutionImpl)) {
            throw new Error('No valid task execution provided');
        }
        return this._proxy.$terminateTask(execution._id);
    }
    get onDidStartTask() {
        return this._onDidExecuteTask.event;
    }
    async $onDidStartTask(execution, terminalId, resolvedDefinition) {
        const customExecution = this._providedCustomExecutions2.get(execution.id);
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
    get onDidEndTask() {
        return this._onDidTerminateTask.event;
    }
    async $OnDidEndTask(execution) {
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
    get onDidStartTaskProcess() {
        return this._onDidTaskProcessStarted.event;
    }
    async $onDidStartTaskProcess(value) {
        const execution = await this.getTaskExecution(value.id);
        this._onDidTaskProcessStarted.fire({
            execution: execution,
            processId: value.processId
        });
    }
    get onDidEndTaskProcess() {
        return this._onDidTaskProcessEnded.event;
    }
    async $onDidEndTaskProcess(value) {
        const execution = await this.getTaskExecution(value.id);
        this._onDidTaskProcessEnded.fire({
            execution: execution,
            exitCode: value.exitCode
        });
    }
    get onDidStartTaskProblemMatchers() {
        return this._onDidStartTaskProblemMatchers.event;
    }
    async $onDidStartTaskProblemMatchers(value) {
        let execution;
        try {
            execution = await this.getTaskExecution(value.execution.id);
        }
        catch (error) {
            // The task execution is not available anymore
            return;
        }
        this._onDidStartTaskProblemMatchers.fire({ execution });
    }
    get onDidEndTaskProblemMatchers() {
        return this._onDidEndTaskProblemMatchers.event;
    }
    async $onDidEndTaskProblemMatchers(value) {
        let execution;
        try {
            execution = await this.getTaskExecution(value.execution.id);
        }
        catch (error) {
            // The task execution is not available anymore
            return;
        }
        this._onDidEndTaskProblemMatchers.fire({ execution, hasErrors: value.hasErrors });
    }
    $provideTasks(handle, validTypes) {
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
        const taskIdPromises = [];
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
    async $resolveTask(handle, taskDTO) {
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
        const resolvedTaskDTO = TaskDTO.from(resolvedTask, handler.extension);
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
    nextHandle() {
        return this._handleCounter++;
    }
    async addCustomExecution(taskDTO, task, isProvided) {
        const taskId = await this._proxy.$createTaskId(taskDTO);
        if (!isProvided && !this._providedCustomExecutions2.has(taskId)) {
            this._notProvidedCustomExecutions.add(taskId);
            // Also add to active executions when not coming from a provider to prevent timing issue.
            this._activeCustomExecutions2.set(taskId, task.execution);
        }
        this._providedCustomExecutions2.set(taskId, task.execution);
    }
    async getTaskExecution(execution, task) {
        if (typeof execution === 'string') {
            const taskExecution = this._taskExecutionPromises.get(execution);
            if (!taskExecution) {
                throw new ErrorNoTelemetry('Unexpected: The specified task is missing an execution');
            }
            return taskExecution;
        }
        const result = this._taskExecutionPromises.get(execution.id);
        if (result) {
            return result;
        }
        let executionPromise;
        if (!task) {
            executionPromise = TaskDTO.to(execution.task, this._workspaceProvider, this._providedCustomExecutions2).then(t => {
                if (!t) {
                    throw new ErrorNoTelemetry('Unexpected: Task does not exist.');
                }
                return new TaskExecutionImpl(this, execution.id, t);
            });
        }
        else {
            executionPromise = Promise.resolve(new TaskExecutionImpl(this, execution.id, task));
        }
        this._taskExecutionPromises.set(execution.id, executionPromise);
        return executionPromise.then(taskExecution => {
            this._taskExecutions.set(execution.id, taskExecution);
            return taskExecution;
        });
    }
    checkDeprecation(task, handler) {
        const tTask = task;
        if (tTask._deprecated) {
            this._deprecationService.report('Task.constructor', handler.extension, 'Use the Task constructor that takes a `scope` instead.');
        }
    }
    customExecutionComplete(execution) {
        const extensionCallback2 = this._activeCustomExecutions2.get(execution.id);
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
};
ExtHostTaskBase = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, IExtHostWorkspace),
    __param(3, IExtHostDocumentsAndEditors),
    __param(4, IExtHostConfiguration),
    __param(5, IExtHostTerminalService),
    __param(6, ILogService),
    __param(7, IExtHostApiDeprecationService)
], ExtHostTaskBase);
export { ExtHostTaskBase };
let WorkerExtHostTask = class WorkerExtHostTask extends ExtHostTaskBase {
    constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
        super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
        this.registerTaskSystem(Schemas.vscodeRemote, {
            scheme: Schemas.vscodeRemote,
            authority: '',
            platform: Platform.PlatformToString(0 /* Platform.Platform.Web */)
        });
    }
    async executeTask(extension, task) {
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
        }
        else {
            throw new NotSupportedError();
        }
        // Always get the task execution first to prevent timing issues when retrieving it later
        const execution = await this.getTaskExecution(await this._proxy.$getTaskExecution(dto), task);
        this._proxy.$executeTask(dto).catch(error => { throw new Error(error); });
        return execution;
    }
    provideTasksInternal(validTypes, taskIdPromises, handler, value) {
        const taskDTOs = [];
        if (value) {
            for (const task of value) {
                this.checkDeprecation(task, handler);
                if (!task.definition || !validTypes[task.definition.type]) {
                    const source = task.source ? task.source : 'No task source';
                    this._logService.warn(`The task [${source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
                }
                const taskDTO = TaskDTO.from(task, handler.extension);
                if (taskDTO && CustomExecutionDTO.is(taskDTO.execution)) {
                    taskDTOs.push(taskDTO);
                    // The ID is calculated on the main thread task side, so, let's call into it here.
                    // We need the task id's pre-computed for custom task executions because when OnDidStartTask
                    // is invoked, we have to be able to map it back to our data.
                    taskIdPromises.push(this.addCustomExecution(taskDTO, task, true));
                }
                else {
                    this._logService.warn('Only custom execution tasks supported.');
                }
            }
        }
        return {
            tasks: taskDTOs,
            extension: handler.extension
        };
    }
    async resolveTaskInternal(resolvedTaskDTO) {
        if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
            return resolvedTaskDTO;
        }
        else {
            this._logService.warn('Only custom execution tasks supported.');
        }
        return undefined;
    }
    async $resolveVariables(uriComponents, toResolve) {
        const result = {
            process: undefined,
            variables: Object.create(null)
        };
        return result;
    }
    async $jsonTasksSupported() {
        return false;
    }
    async $findExecutable(command, cwd, paths) {
        return undefined;
    }
};
WorkerExtHostTask = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, IExtHostWorkspace),
    __param(3, IExtHostDocumentsAndEditors),
    __param(4, IExtHostConfiguration),
    __param(5, IExtHostTerminalService),
    __param(6, ILogService),
    __param(7, IExtHostApiDeprecationService)
], WorkerExtHostTask);
export { WorkerExtHostTask };
export const IExtHostTask = createDecorator('IExtHostTask');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRhc2suanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0VGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRCxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUFFLFdBQVcsRUFBeUMsTUFBTSx1QkFBdUIsQ0FBQztBQUMzRixPQUFPLEtBQUssS0FBSyxNQUFNLG1CQUFtQixDQUFDO0FBQzNDLE9BQU8sRUFBNkIsaUJBQWlCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdyRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFB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