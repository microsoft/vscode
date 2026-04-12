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
import * as nls from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as Types from '../../../base/common/types.js';
import * as Platform from '../../../base/common/platform.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { ContributedTask, ConfiguringTask, CommandOptions, RuntimeType, CustomTask, TaskSourceKind, TaskDefinition, PresentationOptions, RunOptions } from '../../contrib/tasks/common/tasks.js';
import { ITaskService } from '../../contrib/tasks/common/taskService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { TaskEventKind } from '../common/shared/tasks.js';
import { IConfigurationResolverService } from '../../services/configurationResolver/common/configurationResolver.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { ConfigurationResolverExpression } from '../../services/configurationResolver/common/configurationResolverExpression.js';
var TaskExecutionDTO;
(function (TaskExecutionDTO) {
    function from(value) {
        return {
            id: value.id,
            task: TaskDTO.from(value.task)
        };
    }
    TaskExecutionDTO.from = from;
})(TaskExecutionDTO || (TaskExecutionDTO = {}));
export var TaskProblemMatcherStartedDto;
(function (TaskProblemMatcherStartedDto) {
    function from(value) {
        return {
            execution: {
                id: value.execution.id,
                task: TaskDTO.from(value.execution.task)
            },
        };
    }
    TaskProblemMatcherStartedDto.from = from;
})(TaskProblemMatcherStartedDto || (TaskProblemMatcherStartedDto = {}));
export var TaskProblemMatcherEndedDto;
(function (TaskProblemMatcherEndedDto) {
    function from(value) {
        return {
            execution: {
                id: value.execution.id,
                task: TaskDTO.from(value.execution.task)
            },
            hasErrors: value.hasErrors
        };
    }
    TaskProblemMatcherEndedDto.from = from;
})(TaskProblemMatcherEndedDto || (TaskProblemMatcherEndedDto = {}));
var TaskProcessStartedDTO;
(function (TaskProcessStartedDTO) {
    function from(value, processId) {
        return {
            id: value.id,
            processId
        };
    }
    TaskProcessStartedDTO.from = from;
})(TaskProcessStartedDTO || (TaskProcessStartedDTO = {}));
var TaskProcessEndedDTO;
(function (TaskProcessEndedDTO) {
    function from(value, exitCode) {
        return {
            id: value.id,
            exitCode
        };
    }
    TaskProcessEndedDTO.from = from;
})(TaskProcessEndedDTO || (TaskProcessEndedDTO = {}));
var TaskDefinitionDTO;
(function (TaskDefinitionDTO) {
    function from(value) {
        const result = Object.assign(Object.create(null), value);
        delete result._key;
        return result;
    }
    TaskDefinitionDTO.from = from;
    function to(value, executeOnly) {
        let result = TaskDefinition.createTaskIdentifier(value, console);
        if (result === undefined && executeOnly) {
            result = {
                _key: generateUuid(),
                type: '$executeOnly'
            };
        }
        return result;
    }
    TaskDefinitionDTO.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
(function (TaskPresentationOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return Object.assign(Object.create(null), value);
    }
    TaskPresentationOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return PresentationOptions.defaults;
        }
        return Object.assign(Object.create(null), PresentationOptions.defaults, value);
    }
    TaskPresentationOptionsDTO.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var RunOptionsDTO;
(function (RunOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return Object.assign(Object.create(null), value);
    }
    RunOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return RunOptions.defaults;
        }
        return Object.assign(Object.create(null), RunOptions.defaults, value);
    }
    RunOptionsDTO.to = to;
})(RunOptionsDTO || (RunOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
(function (ProcessExecutionOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        return {
            cwd: value.cwd,
            env: value.env
        };
    }
    ProcessExecutionOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return CommandOptions.defaults;
        }
        return {
            cwd: value.cwd || CommandOptions.defaults.cwd,
            env: value.env
        };
    }
    ProcessExecutionOptionsDTO.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
(function (ProcessExecutionDTO) {
    function is(value) {
        const candidate = value;
        return candidate && !!candidate.process;
    }
    ProcessExecutionDTO.is = is;
    function from(value) {
        const process = Types.isString(value.name) ? value.name : value.name.value;
        const args = value.args ? value.args.map(value => Types.isString(value) ? value : value.value) : [];
        const result = {
            process: process,
            args: args
        };
        if (value.options) {
            result.options = ProcessExecutionOptionsDTO.from(value.options);
        }
        return result;
    }
    ProcessExecutionDTO.from = from;
    function to(value) {
        const result = {
            runtime: RuntimeType.Process,
            name: value.process,
            args: value.args,
            presentation: undefined
        };
        result.options = ProcessExecutionOptionsDTO.to(value.options);
        return result;
    }
    ProcessExecutionDTO.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
(function (ShellExecutionOptionsDTO) {
    function from(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const result = {
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
    ShellExecutionOptionsDTO.from = from;
    function to(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const result = {
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
    ShellExecutionOptionsDTO.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
(function (ShellExecutionDTO) {
    function is(value) {
        const candidate = value;
        return candidate && (!!candidate.commandLine || !!candidate.command);
    }
    ShellExecutionDTO.is = is;
    function from(value) {
        const result = {};
        if (value.name && Types.isString(value.name) && (value.args === undefined || value.args === null || value.args.length === 0)) {
            result.commandLine = value.name;
        }
        else {
            result.command = value.name;
            result.args = value.args;
        }
        if (value.options) {
            result.options = ShellExecutionOptionsDTO.from(value.options);
        }
        return result;
    }
    ShellExecutionDTO.from = from;
    function to(value) {
        const result = {
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
    ShellExecutionDTO.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
var CustomExecutionDTO;
(function (CustomExecutionDTO) {
    function is(value) {
        const candidate = value;
        return candidate && candidate.customExecution === 'customExecution';
    }
    CustomExecutionDTO.is = is;
    function from(value) {
        return {
            customExecution: 'customExecution'
        };
    }
    CustomExecutionDTO.from = from;
    function to(value) {
        return {
            runtime: RuntimeType.CustomExecution,
            presentation: undefined
        };
    }
    CustomExecutionDTO.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
var TaskSourceDTO;
(function (TaskSourceDTO) {
    function from(value) {
        const result = {
            label: value.label
        };
        if (value.kind === TaskSourceKind.Extension) {
            result.extensionId = value.extension;
            if (value.workspaceFolder) {
                result.scope = value.workspaceFolder.uri;
            }
            else {
                result.scope = value.scope;
            }
        }
        else if (value.kind === TaskSourceKind.Workspace) {
            result.extensionId = '$core';
            result.scope = value.config.workspaceFolder ? value.config.workspaceFolder.uri : 1 /* TaskScope.Global */;
        }
        return result;
    }
    TaskSourceDTO.from = from;
    function to(value, workspace) {
        let scope;
        let workspaceFolder;
        if ((value.scope === undefined) || ((typeof value.scope === 'number') && (value.scope !== 1 /* TaskScope.Global */))) {
            if (workspace.getWorkspace().folders.length === 0) {
                scope = 1 /* TaskScope.Global */;
                workspaceFolder = undefined;
            }
            else {
                scope = 3 /* TaskScope.Folder */;
                workspaceFolder = workspace.getWorkspace().folders[0];
            }
        }
        else if (typeof value.scope === 'number') {
            scope = value.scope;
        }
        else {
            scope = 3 /* TaskScope.Folder */;
            workspaceFolder = workspace.getWorkspaceFolder(URI.revive(value.scope)) ?? undefined;
        }
        const result = {
            kind: TaskSourceKind.Extension,
            label: value.label,
            extension: value.extensionId,
            scope,
            workspaceFolder
        };
        return result;
    }
    TaskSourceDTO.to = to;
})(TaskSourceDTO || (TaskSourceDTO = {}));
var TaskHandleDTO;
(function (TaskHandleDTO) {
    function is(value) {
        const candidate = value;
        return !!candidate && Types.isString(candidate.id) && !!candidate.workspaceFolder;
    }
    TaskHandleDTO.is = is;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskDTO;
(function (TaskDTO) {
    function from(task) {
        if (task === undefined || task === null || (!CustomTask.is(task) && !ContributedTask.is(task) && !ConfiguringTask.is(task))) {
            return undefined;
        }
        const result = {
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
                case RuntimeType.Process:
                    result.execution = ProcessExecutionDTO.from(task.command);
                    break;
                case RuntimeType.Shell:
                    result.execution = ShellExecutionDTO.from(task.command);
                    break;
                case RuntimeType.CustomExecution:
                    result.execution = CustomExecutionDTO.from(task.command);
                    break;
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
    TaskDTO.from = from;
    function to(task, workspace, executeOnly, icon, hide) {
        if (!task || (typeof task.name !== 'string')) {
            return undefined;
        }
        let command;
        if (task.execution) {
            if (ShellExecutionDTO.is(task.execution)) {
                command = ShellExecutionDTO.to(task.execution);
            }
            else if (ProcessExecutionDTO.is(task.execution)) {
                command = ProcessExecutionDTO.to(task.execution);
            }
            else if (CustomExecutionDTO.is(task.execution)) {
                command = CustomExecutionDTO.to(task.execution);
            }
        }
        if (!command) {
            return undefined;
        }
        command.presentation = TaskPresentationOptionsDTO.to(task.presentationOptions);
        const source = TaskSourceDTO.to(task.source, workspace);
        const label = nls.localize('task.label', '{0}: {1}', source.label, task.name);
        const definition = TaskDefinitionDTO.to(task.definition, executeOnly);
        const id = (CustomExecutionDTO.is(task.execution) && task._id) ? task._id : `${task.source.extensionId}.${definition._key}`;
        const result = new ContributedTask(id, // uuidMap.getUUID(identifier)
        source, label, definition.type, definition, command, task.hasDefinedMatchers, RunOptionsDTO.to(task.runOptions), {
            name: task.name,
            identifier: label,
            group: task.group,
            isBackground: !!task.isBackground,
            problemMatchers: task.problemMatchers.slice(),
            detail: task.detail,
            icon,
            hide
        });
        return result;
    }
    TaskDTO.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskGroupDTO;
(function (TaskGroupDTO) {
    function from(value) {
        if (value === undefined) {
            return undefined;
        }
        return {
            _id: (typeof value === 'string') ? value : value._id,
            isDefault: (typeof value === 'string') ? false : ((typeof value.isDefault === 'string') ? false : value.isDefault)
        };
    }
    TaskGroupDTO.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
var TaskFilterDTO;
(function (TaskFilterDTO) {
    function from(value) {
        return value;
    }
    TaskFilterDTO.from = from;
    function to(value) {
        return value;
    }
    TaskFilterDTO.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
let MainThreadTask = class MainThreadTask extends Disposable {
    constructor(extHostContext, _taskService, _workspaceContextServer, _configurationResolverService) {
        super();
        this._taskService = _taskService;
        this._workspaceContextServer = _workspaceContextServer;
        this._configurationResolverService = _configurationResolverService;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
        this._providers = new Map();
        this._register(this._taskService.onDidStateChange(async (event) => {
            if (event.kind === TaskEventKind.Changed) {
                return;
            }
            const task = event.__task;
            if (event.kind === TaskEventKind.Start) {
                const execution = TaskExecutionDTO.from(task.getTaskExecution());
                let resolvedDefinition = execution.task.definition;
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
            }
            else if (event.kind === TaskEventKind.ProcessStarted) {
                this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(task.getTaskExecution(), event.processId));
            }
            else if (event.kind === TaskEventKind.ProcessEnded) {
                this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(task.getTaskExecution(), event.exitCode));
            }
            else if (event.kind === TaskEventKind.End) {
                this._proxy.$OnDidEndTask(TaskExecutionDTO.from(task.getTaskExecution()));
            }
            else if (event.kind === TaskEventKind.ProblemMatcherStarted) {
                this._proxy.$onDidStartTaskProblemMatchers(TaskProblemMatcherStartedDto.from({ execution: task.getTaskExecution() }));
            }
            else if (event.kind === TaskEventKind.ProblemMatcherEnded) {
                this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: false }));
            }
            else if (event.kind === TaskEventKind.ProblemMatcherFoundErrors) {
                this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: true }));
            }
        }));
    }
    dispose() {
        for (const value of this._providers.values()) {
            value.disposable.dispose();
        }
        this._providers.clear();
        super.dispose();
    }
    $createTaskId(taskDTO) {
        return new Promise((resolve, reject) => {
            const task = TaskDTO.to(taskDTO, this._workspaceContextServer, true);
            if (task) {
                resolve(task._id);
            }
            else {
                reject(new Error('Task could not be created from DTO'));
            }
        });
    }
    $registerTaskProvider(handle, type) {
        const provider = {
            provideTasks: (validTypes) => {
                return Promise.resolve(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
                    const tasks = [];
                    for (const dto of value.tasks) {
                        const task = TaskDTO.to(dto, this._workspaceContextServer, true);
                        if (task) {
                            tasks.push(task);
                        }
                        else {
                            console.error(`Task System: can not convert task: ${JSON.stringify(dto.definition, undefined, 0)}. Task will be dropped`);
                        }
                    }
                    const processedExtension = {
                        ...value.extension,
                        extensionLocation: URI.revive(value.extension.extensionLocation)
                    };
                    return {
                        tasks,
                        extension: processedExtension
                    };
                });
            },
            resolveTask: (task) => {
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
                return Promise.resolve(undefined);
            }
        };
        const disposable = this._taskService.registerTaskProvider(provider, type);
        this._providers.set(handle, { disposable, provider });
        return Promise.resolve(undefined);
    }
    $unregisterTaskProvider(handle) {
        const provider = this._providers.get(handle);
        if (provider) {
            provider.disposable.dispose();
            this._providers.delete(handle);
        }
        return Promise.resolve(undefined);
    }
    $fetchTasks(filter) {
        return this._taskService.tasks(TaskFilterDTO.to(filter)).then((tasks) => {
            const result = [];
            for (const task of tasks) {
                const item = TaskDTO.from(task);
                if (item) {
                    result.push(item);
                }
            }
            return result;
        });
    }
    getWorkspace(value) {
        let workspace;
        if (typeof value === 'string') {
            workspace = value;
        }
        else {
            const workspaceObject = this._workspaceContextServer.getWorkspace();
            const uri = URI.revive(value);
            if (workspaceObject.configuration?.toString() === uri.toString()) {
                workspace = workspaceObject;
            }
            else {
                workspace = this._workspaceContextServer.getWorkspaceFolder(uri);
            }
        }
        return workspace;
    }
    async $getTaskExecution(value) {
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
            }
            else {
                throw new Error('No workspace folder');
            }
        }
        else {
            const task = TaskDTO.to(value, this._workspaceContextServer, true);
            return {
                id: task._id,
                task: TaskDTO.from(task)
            };
        }
    }
    // Passing in a TaskHandleDTO will cause the task to get re-resolved, which is important for tasks are coming from the core,
    // such as those gotten from a fetchTasks, since they can have missing configuration properties.
    $executeTask(value) {
        return new Promise((resolve, reject) => {
            if (TaskHandleDTO.is(value)) {
                const workspace = this.getWorkspace(value.workspaceFolder);
                if (workspace) {
                    this._taskService.getTask(workspace, value.id, true).then((task) => {
                        if (!task) {
                            reject(new Error('Task not found'));
                        }
                        else {
                            const result = {
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
                }
                else {
                    reject(new Error('No workspace folder'));
                }
            }
            else {
                const task = TaskDTO.to(value, this._workspaceContextServer, true);
                this._taskService.run(task).then(undefined, reason => {
                    // eat the error, it has already been surfaced to the user and we don't care about it here
                });
                const result = {
                    id: task._id,
                    task: TaskDTO.from(task)
                };
                resolve(result);
            }
        });
    }
    $customExecutionComplete(id, result) {
        return new Promise((resolve, reject) => {
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
    $terminateTask(id) {
        return new Promise((resolve, reject) => {
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
    $registerTaskSystem(key, info) {
        let platform;
        switch (info.platform) {
            case 'Web':
                platform = 0 /* Platform.Platform.Web */;
                break;
            case 'win32':
                platform = 3 /* Platform.Platform.Windows */;
                break;
            case 'darwin':
                platform = 1 /* Platform.Platform.Mac */;
                break;
            case 'linux':
                platform = 2 /* Platform.Platform.Linux */;
                break;
            default:
                platform = Platform.platform;
        }
        this._taskService.registerTaskSystem(key, {
            platform: platform,
            uriProvider: (path) => {
                return URI.from({ scheme: info.scheme, authority: info.authority, path });
            },
            context: this._extHostContext,
            resolveVariables: (workspaceFolder, toResolve, target) => {
                const vars = [];
                toResolve.variables.forEach(item => vars.push(item));
                return Promise.resolve(this._proxy.$resolveVariables(workspaceFolder.uri, { process: toResolve.process, variables: vars })).then(values => {
                    const partiallyResolvedVars = Array.from(Object.values(values.variables));
                    return new Promise((resolve, reject) => {
                        this._configurationResolverService.resolveWithInteraction(workspaceFolder, partiallyResolvedVars, 'tasks', undefined, target).then(resolvedVars => {
                            if (!resolvedVars) {
                                resolve(undefined);
                            }
                            const result = {
                                process: undefined,
                                variables: new Map()
                            };
                            for (let i = 0; i < partiallyResolvedVars.length; i++) {
                                const variableName = vars[i].substring(2, vars[i].length - 1);
                                if (resolvedVars && values.variables[vars[i]] === vars[i]) {
                                    const resolved = resolvedVars.get(variableName);
                                    if (typeof resolved === 'string') {
                                        result.variables.set(variableName, resolved);
                                    }
                                }
                                else {
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
            findExecutable: (command, cwd, paths) => {
                return this._proxy.$findExecutable(command, cwd, paths);
            }
        });
    }
    async $registerSupportedExecutions(custom, shell, process) {
        return this._taskService.registerSupportedExecutions(custom, shell, process);
    }
};
MainThreadTask = __decorate([
    extHostNamedCustomer(MainContext.MainThreadTask),
    __param(1, ITaskService),
    __param(2, IWorkspaceContextService),
    __param(3, IConfigurationResolverService)
], MainThreadTask);
export { MainThreadTask };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRhc2suanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFRhc2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUV2QyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEtBQUssS0FBSyxNQUFNLCtCQUErQixDQUFDO0FBQ3ZELE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBRTVFLE9BQU8sRUFBYyx3QkFBd0IsRUFBb0IsTUFBTSxpREFBaUQsQ0FBQztBQUV6SCxPQUFPLEVBQ04sZUFBZSxFQUFFLGVBQWUsRUFDVixjQUFjLEVBQXlCLFdBQVcsRUFBRSxVQUFVLEVBQ3BGLGNBQWMsRUFBMEQsY0FBYyxFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFDdkgsTUFBTSxxQ0FBcUMsQ0FBQztBQUk3QyxPQUFPLEVBQUUsWUFBWSxFQUE4QixNQUFNLDJDQUEyQyxDQUFDO0FBRXJHLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsY0FBYyxFQUF5QyxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNuSCxPQUFPLEVBTU4sYUFBYSxFQUNiLE1BQU0sMkJBQTJCLENBQUM7QUFDbkMsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFFckgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbEUs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