/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as Types from '../../../../base/common/types.js';
import * as resources from '../../../../base/common/resources.js';
import * as Objects from '../../../../base/common/objects.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { TaskDefinitionRegistry } from './taskDefinitionRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
export const USER_TASKS_GROUP_KEY = 'settings';
export const TASK_RUNNING_STATE = new RawContextKey('taskRunning', false, nls.localize('tasks.taskRunningContext', "Whether a task is currently running."));
/** Whether the active terminal is a task terminal. */
export const TASK_TERMINAL_ACTIVE = new RawContextKey('taskTerminalActive', false, nls.localize('taskTerminalActive', "Whether the active terminal is a task terminal."));
export const TASKS_CATEGORY = nls.localize2('tasksCategory', "Tasks");
export var ShellQuoting;
(function (ShellQuoting) {
    /**
     * Use character escaping.
     */
    ShellQuoting[ShellQuoting["Escape"] = 1] = "Escape";
    /**
     * Use strong quoting
     */
    ShellQuoting[ShellQuoting["Strong"] = 2] = "Strong";
    /**
     * Use weak quoting.
     */
    ShellQuoting[ShellQuoting["Weak"] = 3] = "Weak";
})(ShellQuoting || (ShellQuoting = {}));
export const CUSTOMIZED_TASK_TYPE = '$customized';
(function (ShellQuoting) {
    function from(value) {
        if (!value) {
            return ShellQuoting.Strong;
        }
        switch (value.toLowerCase()) {
            case 'escape':
                return ShellQuoting.Escape;
            case 'strong':
                return ShellQuoting.Strong;
            case 'weak':
                return ShellQuoting.Weak;
            default:
                return ShellQuoting.Strong;
        }
    }
    ShellQuoting.from = from;
})(ShellQuoting || (ShellQuoting = {}));
export var CommandOptions;
(function (CommandOptions) {
    CommandOptions.defaults = { cwd: '${workspaceFolder}' };
})(CommandOptions || (CommandOptions = {}));
export var RevealKind;
(function (RevealKind) {
    /**
     * Always brings the terminal to front if the task is executed.
     */
    RevealKind[RevealKind["Always"] = 1] = "Always";
    /**
     * Only brings the terminal to front if a problem is detected executing the task
     * e.g. the task couldn't be started,
     * the task ended with an exit code other than zero,
     * or the problem matcher found an error.
     */
    RevealKind[RevealKind["Silent"] = 2] = "Silent";
    /**
     * The terminal never comes to front when the task is executed.
     */
    RevealKind[RevealKind["Never"] = 3] = "Never";
})(RevealKind || (RevealKind = {}));
(function (RevealKind) {
    function fromString(value) {
        switch (value.toLowerCase()) {
            case 'always':
                return RevealKind.Always;
            case 'silent':
                return RevealKind.Silent;
            case 'never':
                return RevealKind.Never;
            default:
                return RevealKind.Always;
        }
    }
    RevealKind.fromString = fromString;
})(RevealKind || (RevealKind = {}));
export var RevealProblemKind;
(function (RevealProblemKind) {
    /**
     * Never reveals the problems panel when this task is executed.
     */
    RevealProblemKind[RevealProblemKind["Never"] = 1] = "Never";
    /**
     * Only reveals the problems panel if a problem is found.
     */
    RevealProblemKind[RevealProblemKind["OnProblem"] = 2] = "OnProblem";
    /**
     * Never reveals the problems panel when this task is executed.
     */
    RevealProblemKind[RevealProblemKind["Always"] = 3] = "Always";
})(RevealProblemKind || (RevealProblemKind = {}));
(function (RevealProblemKind) {
    function fromString(value) {
        switch (value.toLowerCase()) {
            case 'always':
                return RevealProblemKind.Always;
            case 'never':
                return RevealProblemKind.Never;
            case 'onproblem':
                return RevealProblemKind.OnProblem;
            default:
                return RevealProblemKind.OnProblem;
        }
    }
    RevealProblemKind.fromString = fromString;
})(RevealProblemKind || (RevealProblemKind = {}));
export var PanelKind;
(function (PanelKind) {
    /**
     * Shares a panel with other tasks. This is the default.
     */
    PanelKind[PanelKind["Shared"] = 1] = "Shared";
    /**
     * Uses a dedicated panel for this tasks. The panel is not
     * shared with other tasks.
     */
    PanelKind[PanelKind["Dedicated"] = 2] = "Dedicated";
    /**
     * Creates a new panel whenever this task is executed.
     */
    PanelKind[PanelKind["New"] = 3] = "New";
})(PanelKind || (PanelKind = {}));
(function (PanelKind) {
    function fromString(value) {
        switch (value.toLowerCase()) {
            case 'shared':
                return PanelKind.Shared;
            case 'dedicated':
                return PanelKind.Dedicated;
            case 'new':
                return PanelKind.New;
            default:
                return PanelKind.Shared;
        }
    }
    PanelKind.fromString = fromString;
})(PanelKind || (PanelKind = {}));
export var PresentationOptions;
(function (PresentationOptions) {
    PresentationOptions.defaults = {
        echo: true, reveal: RevealKind.Always, revealProblems: RevealProblemKind.Never, focus: false, panel: PanelKind.Shared, showReuseMessage: true, clear: false, preserveTerminalName: false
    };
})(PresentationOptions || (PresentationOptions = {}));
export var RuntimeType;
(function (RuntimeType) {
    RuntimeType[RuntimeType["Shell"] = 1] = "Shell";
    RuntimeType[RuntimeType["Process"] = 2] = "Process";
    RuntimeType[RuntimeType["CustomExecution"] = 3] = "CustomExecution";
})(RuntimeType || (RuntimeType = {}));
(function (RuntimeType) {
    function fromString(value) {
        switch (value.toLowerCase()) {
            case 'shell':
                return RuntimeType.Shell;
            case 'process':
                return RuntimeType.Process;
            case 'customExecution':
                return RuntimeType.CustomExecution;
            default:
                return RuntimeType.Process;
        }
    }
    RuntimeType.fromString = fromString;
    function toString(value) {
        switch (value) {
            case RuntimeType.Shell: return 'shell';
            case RuntimeType.Process: return 'process';
            case RuntimeType.CustomExecution: return 'customExecution';
            default: return 'process';
        }
    }
    RuntimeType.toString = toString;
})(RuntimeType || (RuntimeType = {}));
export var CommandString;
(function (CommandString) {
    function value(value) {
        if (Types.isString(value)) {
            return value;
        }
        else {
            return value.value;
        }
    }
    CommandString.value = value;
})(CommandString || (CommandString = {}));
export var TaskGroup;
(function (TaskGroup) {
    TaskGroup.Clean = { _id: 'clean', isDefault: false };
    TaskGroup.Build = { _id: 'build', isDefault: false };
    TaskGroup.Rebuild = { _id: 'rebuild', isDefault: false };
    TaskGroup.Test = { _id: 'test', isDefault: false };
    function is(value) {
        return value === TaskGroup.Clean._id || value === TaskGroup.Build._id || value === TaskGroup.Rebuild._id || value === TaskGroup.Test._id;
    }
    TaskGroup.is = is;
    function from(value) {
        if (value === undefined) {
            return undefined;
        }
        else if (Types.isString(value)) {
            if (is(value)) {
                return { _id: value, isDefault: false };
            }
            return undefined;
        }
        else {
            return value;
        }
    }
    TaskGroup.from = from;
})(TaskGroup || (TaskGroup = {}));
export var TaskScope;
(function (TaskScope) {
    TaskScope[TaskScope["Global"] = 1] = "Global";
    TaskScope[TaskScope["Workspace"] = 2] = "Workspace";
    TaskScope[TaskScope["Folder"] = 3] = "Folder";
})(TaskScope || (TaskScope = {}));
export var TaskSourceKind;
(function (TaskSourceKind) {
    TaskSourceKind.Workspace = 'workspace';
    TaskSourceKind.Extension = 'extension';
    TaskSourceKind.InMemory = 'inMemory';
    TaskSourceKind.WorkspaceFile = 'workspaceFile';
    TaskSourceKind.User = 'user';
    function toConfigurationTarget(kind) {
        switch (kind) {
            case TaskSourceKind.User: return 2 /* ConfigurationTarget.USER */;
            case TaskSourceKind.WorkspaceFile: return 5 /* ConfigurationTarget.WORKSPACE */;
            default: return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
        }
    }
    TaskSourceKind.toConfigurationTarget = toConfigurationTarget;
})(TaskSourceKind || (TaskSourceKind = {}));
export var DependsOrder;
(function (DependsOrder) {
    DependsOrder["parallel"] = "parallel";
    DependsOrder["sequence"] = "sequence";
})(DependsOrder || (DependsOrder = {}));
export var RunOnOptions;
(function (RunOnOptions) {
    RunOnOptions[RunOnOptions["default"] = 1] = "default";
    RunOnOptions[RunOnOptions["folderOpen"] = 2] = "folderOpen";
    RunOnOptions[RunOnOptions["worktreeCreated"] = 3] = "worktreeCreated";
})(RunOnOptions || (RunOnOptions = {}));
export var InstancePolicy;
(function (InstancePolicy) {
    InstancePolicy["terminateNewest"] = "terminateNewest";
    InstancePolicy["terminateOldest"] = "terminateOldest";
    InstancePolicy["prompt"] = "prompt";
    InstancePolicy["warn"] = "warn";
    InstancePolicy["silent"] = "silent";
})(InstancePolicy || (InstancePolicy = {}));
export var RunOptions;
(function (RunOptions) {
    RunOptions.defaults = { reevaluateOnRerun: true, runOn: RunOnOptions.default, instanceLimit: 1, instancePolicy: "prompt" /* InstancePolicy.prompt */ };
})(RunOptions || (RunOptions = {}));
export class CommonTask {
    constructor(id, label, type, runOptions, configurationProperties, source) {
        /**
         * The cached label.
         */
        this._label = '';
        this._id = id;
        if (label) {
            this._label = label;
        }
        if (type) {
            this.type = type;
        }
        this.runOptions = runOptions;
        this.configurationProperties = configurationProperties;
        this._source = source;
    }
    getDefinition(useSource) {
        return undefined;
    }
    getMapKey() {
        return this._id;
    }
    getKey() {
        return undefined;
    }
    getCommonTaskId() {
        const key = { folder: this.getFolderId(), id: this._id };
        return JSON.stringify(key);
    }
    clone() {
        return this.fromObject(Object.assign({}, this));
    }
    getWorkspaceFolder() {
        return undefined;
    }
    getWorkspaceFileName() {
        return undefined;
    }
    getTelemetryKind() {
        return 'unknown';
    }
    matches(key, compareId = false) {
        if (key === undefined) {
            return false;
        }
        if (Types.isString(key)) {
            return key === this._label || key === this.configurationProperties.identifier || (compareId && key === this._id);
        }
        const identifier = this.getDefinition(true);
        return identifier !== undefined && identifier._key === key._key;
    }
    getQualifiedLabel() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (workspaceFolder) {
            return `${this._label} (${workspaceFolder.name})`;
        }
        else {
            return this._label;
        }
    }
    getTaskExecution() {
        const result = {
            id: this._id,
            task: this
        };
        return result;
    }
    addTaskLoadMessages(messages) {
        if (this._taskLoadMessages === undefined) {
            this._taskLoadMessages = [];
        }
        if (messages) {
            this._taskLoadMessages = this._taskLoadMessages.concat(messages);
        }
    }
    get taskLoadMessages() {
        return this._taskLoadMessages;
    }
}
/**
 * For tasks of type shell or process, this is created upon parse
 * of the tasks.json or workspace file.
 * For ContributedTasks of all other types, this is the result of
 * resolving a ConfiguringTask.
 */
export class CustomTask extends CommonTask {
    constructor(id, source, label, type, command, hasDefinedMatchers, runOptions, configurationProperties) {
        super(id, label, undefined, runOptions, configurationProperties, source);
        /**
         * The command configuration
         */
        this.command = {};
        this._source = source;
        this.hasDefinedMatchers = hasDefinedMatchers;
        if (command) {
            this.command = command;
        }
    }
    clone() {
        return new CustomTask(this._id, this._source, this._label, this.type, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
    }
    customizes() {
        if (this._source && this._source.customizes) {
            return this._source.customizes;
        }
        return undefined;
    }
    getDefinition(useSource = false) {
        if (useSource && this._source.customizes !== undefined) {
            return this._source.customizes;
        }
        else {
            let type;
            const commandRuntime = this.command ? this.command.runtime : undefined;
            switch (commandRuntime) {
                case RuntimeType.Shell:
                    type = 'shell';
                    break;
                case RuntimeType.Process:
                    type = 'process';
                    break;
                case RuntimeType.CustomExecution:
                    type = 'customExecution';
                    break;
                case undefined:
                    type = '$composite';
                    break;
                default:
                    throw new Error('Unexpected task runtime');
            }
            const result = {
                type,
                _key: this._id,
                id: this._id
            };
            return result;
        }
    }
    static is(value) {
        return value instanceof CustomTask;
    }
    getMapKey() {
        const workspaceFolder = this._source.config.workspaceFolder;
        return workspaceFolder ? `${workspaceFolder.uri.toString()}|${this._id}|${this.instance}` : `${this._id}|${this.instance}`;
    }
    getFolderId() {
        return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
    }
    getCommonTaskId() {
        return this._source.customizes ? super.getCommonTaskId() : (this.getKey() ?? super.getCommonTaskId());
    }
    /**
     * @returns A key representing the task
     */
    getKey() {
        const workspaceFolder = this.getFolderId();
        if (!workspaceFolder) {
            return undefined;
        }
        let id = this.configurationProperties.identifier;
        if (this._source.kind !== TaskSourceKind.Workspace) {
            id += this._source.kind;
        }
        const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
        return JSON.stringify(key);
    }
    getWorkspaceFolder() {
        return this._source.config.workspaceFolder;
    }
    getWorkspaceFileName() {
        return (this._source.config.workspace && this._source.config.workspace.configuration) ? resources.basename(this._source.config.workspace.configuration) : undefined;
    }
    getTelemetryKind() {
        if (this._source.customizes) {
            return 'workspace>extension';
        }
        else {
            return 'workspace';
        }
    }
    fromObject(object) {
        const obj = object;
        return new CustomTask(obj._id, obj._source, obj._label, obj.type, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
    }
}
/**
 * After a contributed task has been parsed, but before
 * the task has been resolved via the extension, its properties
 * are stored in this
 */
export class ConfiguringTask extends CommonTask {
    constructor(id, source, label, type, configures, runOptions, configurationProperties) {
        super(id, label, type, runOptions, configurationProperties, source);
        this._source = source;
        this.configures = configures;
    }
    static is(value) {
        return value instanceof ConfiguringTask;
    }
    fromObject(object) {
        return object;
    }
    getDefinition() {
        return this.configures;
    }
    getWorkspaceFileName() {
        return (this._source.config.workspace && this._source.config.workspace.configuration) ? resources.basename(this._source.config.workspace.configuration) : undefined;
    }
    getWorkspaceFolder() {
        return this._source.config.workspaceFolder;
    }
    getFolderId() {
        return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
    }
    getKey() {
        const workspaceFolder = this.getFolderId();
        if (!workspaceFolder) {
            return undefined;
        }
        let id = this.configurationProperties.identifier;
        if (this._source.kind !== TaskSourceKind.Workspace) {
            id += this._source.kind;
        }
        const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
        return JSON.stringify(key);
    }
}
/**
 * A task from an extension created via resolveTask or provideTask
 */
export class ContributedTask extends CommonTask {
    constructor(id, source, label, type, defines, command, hasDefinedMatchers, runOptions, configurationProperties) {
        super(id, label, type, runOptions, configurationProperties, source);
        this.defines = defines;
        this.hasDefinedMatchers = hasDefinedMatchers;
        this.command = command;
        this.icon = configurationProperties.icon;
        this.hide = configurationProperties.hide;
    }
    clone() {
        return new ContributedTask(this._id, this._source, this._label, this.type, this.defines, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
    }
    getDefinition() {
        return this.defines;
    }
    static is(value) {
        return value instanceof ContributedTask;
    }
    getMapKey() {
        const workspaceFolder = this._source.workspaceFolder;
        return workspaceFolder
            ? `${this._source.scope.toString()}|${workspaceFolder.uri.toString()}|${this._id}|${this.instance}`
            : `${this._source.scope.toString()}|${this._id}|${this.instance}`;
    }
    getFolderId() {
        if (this._source.scope === 3 /* TaskScope.Folder */ && this._source.workspaceFolder) {
            return this._source.workspaceFolder.uri.toString();
        }
        return undefined;
    }
    getKey() {
        const key = { type: 'contributed', scope: this._source.scope, id: this._id };
        key.folder = this.getFolderId();
        return JSON.stringify(key);
    }
    getWorkspaceFolder() {
        return this._source.workspaceFolder;
    }
    getTelemetryKind() {
        return 'extension';
    }
    fromObject(object) {
        const obj = object;
        return new ContributedTask(obj._id, obj._source, obj._label, obj.type, obj.defines, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
    }
}
export class InMemoryTask extends CommonTask {
    constructor(id, source, label, type, runOptions, configurationProperties) {
        super(id, label, type, runOptions, configurationProperties, source);
        this._source = source;
    }
    clone() {
        return new InMemoryTask(this._id, this._source, this._label, this.type, this.runOptions, this.configurationProperties);
    }
    static is(value) {
        return value instanceof InMemoryTask;
    }
    getTelemetryKind() {
        return 'composite';
    }
    getMapKey() {
        return `${this._id}|${this.instance}`;
    }
    getFolderId() {
        return undefined;
    }
    fromObject(object) {
        const obj = object;
        return new InMemoryTask(obj._id, obj._source, obj._label, obj.type, obj.runOptions, obj.configurationProperties);
    }
}
export var ExecutionEngine;
(function (ExecutionEngine) {
    ExecutionEngine[ExecutionEngine["Process"] = 1] = "Process";
    ExecutionEngine[ExecutionEngine["Terminal"] = 2] = "Terminal";
})(ExecutionEngine || (ExecutionEngine = {}));
(function (ExecutionEngine) {
    ExecutionEngine._default = ExecutionEngine.Terminal;
})(ExecutionEngine || (ExecutionEngine = {}));
export var JsonSchemaVersion;
(function (JsonSchemaVersion) {
    JsonSchemaVersion[JsonSchemaVersion["V0_1_0"] = 1] = "V0_1_0";
    JsonSchemaVersion[JsonSchemaVersion["V2_0_0"] = 2] = "V2_0_0";
})(JsonSchemaVersion || (JsonSchemaVersion = {}));
export class TaskSorter {
    constructor(workspaceFolders) {
        this._order = new Map();
        for (let i = 0; i < workspaceFolders.length; i++) {
            this._order.set(workspaceFolders[i].uri.toString(), i);
        }
    }
    compare(a, b) {
        const aw = a.getWorkspaceFolder();
        const bw = b.getWorkspaceFolder();
        if (aw && bw) {
            let ai = this._order.get(aw.uri.toString());
            ai = ai === undefined ? 0 : ai + 1;
            let bi = this._order.get(bw.uri.toString());
            bi = bi === undefined ? 0 : bi + 1;
            if (ai === bi) {
                return a._label.localeCompare(b._label);
            }
            else {
                return ai - bi;
            }
        }
        else if (!aw && bw) {
            return -1;
        }
        else if (aw && !bw) {
            return +1;
        }
        else {
            return 0;
        }
    }
}
export var TaskRunType;
(function (TaskRunType) {
    TaskRunType["SingleRun"] = "singleRun";
    TaskRunType["Background"] = "background";
})(TaskRunType || (TaskRunType = {}));
export var TaskEventKind;
(function (TaskEventKind) {
    /** Indicates that a task's properties or configuration have changed */
    TaskEventKind["Changed"] = "changed";
    /** Indicates that a task has begun executing */
    TaskEventKind["ProcessStarted"] = "processStarted";
    /** Indicates that a task process has completed */
    TaskEventKind["ProcessEnded"] = "processEnded";
    /** Indicates that a task was terminated, either by user action or by the system */
    TaskEventKind["Terminated"] = "terminated";
    /** Indicates that a task has started running */
    TaskEventKind["Start"] = "start";
    /** Indicates that a task has acquired all needed input/variables to execute */
    TaskEventKind["AcquiredInput"] = "acquiredInput";
    /** Indicates that a dependent task has started */
    TaskEventKind["DependsOnStarted"] = "dependsOnStarted";
    /** Indicates that a task is actively running/processing */
    TaskEventKind["Active"] = "active";
    /** Indicates that a task is paused/waiting but not complete */
    TaskEventKind["Inactive"] = "inactive";
    /** Indicates that a task has completed fully */
    TaskEventKind["End"] = "end";
    /** Indicates that a task's problem matcher has started */
    TaskEventKind["ProblemMatcherStarted"] = "problemMatcherStarted";
    /** Indicates that a task's problem matcher has ended */
    TaskEventKind["ProblemMatcherEnded"] = "problemMatcherEnded";
    /** Indicates that a task's problem matcher has found errors */
    TaskEventKind["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
})(TaskEventKind || (TaskEventKind = {}));
export var TaskRunSource;
(function (TaskRunSource) {
    TaskRunSource[TaskRunSource["System"] = 0] = "System";
    TaskRunSource[TaskRunSource["User"] = 1] = "User";
    TaskRunSource[TaskRunSource["FolderOpen"] = 2] = "FolderOpen";
    TaskRunSource[TaskRunSource["ConfigurationChange"] = 3] = "ConfigurationChange";
    TaskRunSource[TaskRunSource["Reconnect"] = 4] = "Reconnect";
    TaskRunSource[TaskRunSource["ChatAgent"] = 5] = "ChatAgent";
})(TaskRunSource || (TaskRunSource = {}));
export var TaskEvent;
(function (TaskEvent) {
    function common(task) {
        return {
            taskId: task._id,
            taskName: task.configurationProperties.name,
            runType: task.configurationProperties.isBackground ? "background" /* TaskRunType.Background */ : "singleRun" /* TaskRunType.SingleRun */,
            group: task.configurationProperties.group,
            __task: task,
        };
    }
    function start(task, terminalId, resolvedVariables) {
        return {
            ...common(task),
            kind: TaskEventKind.Start,
            terminalId,
            resolvedVariables,
        };
    }
    TaskEvent.start = start;
    function processStarted(task, terminalId, processId) {
        return {
            ...common(task),
            kind: TaskEventKind.ProcessStarted,
            terminalId,
            processId,
        };
    }
    TaskEvent.processStarted = processStarted;
    function processEnded(task, terminalId, exitCode, durationMs) {
        return {
            ...common(task),
            kind: TaskEventKind.ProcessEnded,
            terminalId,
            exitCode,
            durationMs,
        };
    }
    TaskEvent.processEnded = processEnded;
    function inactive(task, terminalId, durationMs) {
        return {
            ...common(task),
            kind: TaskEventKind.Inactive,
            terminalId,
            durationMs,
        };
    }
    TaskEvent.inactive = inactive;
    function terminated(task, terminalId, exitReason) {
        return {
            ...common(task),
            kind: TaskEventKind.Terminated,
            exitReason,
            terminalId,
        };
    }
    TaskEvent.terminated = terminated;
    function general(kind, task, terminalId) {
        return {
            ...common(task),
            kind,
            terminalId,
        };
    }
    TaskEvent.general = general;
    function problemMatcherEnded(task, hasErrors, terminalId) {
        return {
            ...common(task),
            kind: TaskEventKind.ProblemMatcherEnded,
            hasErrors,
        };
    }
    TaskEvent.problemMatcherEnded = problemMatcherEnded;
    function changed() {
        return { kind: TaskEventKind.Changed };
    }
    TaskEvent.changed = changed;
})(TaskEvent || (TaskEvent = {}));
export var KeyedTaskIdentifier;
(function (KeyedTaskIdentifier) {
    function sortedStringify(literal) {
        const keys = Object.keys(literal).sort();
        let result = '';
        for (const key of keys) {
            let stringified = literal[key];
            if (stringified instanceof Object) {
                stringified = sortedStringify(stringified);
            }
            else if (typeof stringified === 'string') {
                stringified = stringified.replace(/,/g, ',,');
            }
            result += key + ',' + stringified + ',';
        }
        return result;
    }
    function create(value) {
        const resultKey = sortedStringify(value);
        const result = { _key: resultKey, type: value.taskType };
        Object.assign(result, value);
        return result;
    }
    KeyedTaskIdentifier.create = create;
})(KeyedTaskIdentifier || (KeyedTaskIdentifier = {}));
export var TaskSettingId;
(function (TaskSettingId) {
    TaskSettingId["AutoDetect"] = "task.autoDetect";
    TaskSettingId["SaveBeforeRun"] = "task.saveBeforeRun";
    TaskSettingId["ShowDecorations"] = "task.showDecorations";
    TaskSettingId["ProblemMatchersNeverPrompt"] = "task.problemMatchers.neverPrompt";
    TaskSettingId["SlowProviderWarning"] = "task.slowProviderWarning";
    TaskSettingId["QuickOpenHistory"] = "task.quickOpen.history";
    TaskSettingId["QuickOpenDetail"] = "task.quickOpen.detail";
    TaskSettingId["QuickOpenSkip"] = "task.quickOpen.skip";
    TaskSettingId["QuickOpenShowAll"] = "task.quickOpen.showAll";
    TaskSettingId["AllowAutomaticTasks"] = "task.allowAutomaticTasks";
    TaskSettingId["Reconnection"] = "task.reconnection";
    TaskSettingId["VerboseLogging"] = "task.verboseLogging";
    TaskSettingId["NotifyWindowOnTaskCompletion"] = "task.notifyWindowOnTaskCompletion";
})(TaskSettingId || (TaskSettingId = {}));
export var TasksSchemaProperties;
(function (TasksSchemaProperties) {
    TasksSchemaProperties["Tasks"] = "tasks";
    TasksSchemaProperties["SuppressTaskName"] = "tasks.suppressTaskName";
    TasksSchemaProperties["Windows"] = "tasks.windows";
    TasksSchemaProperties["Osx"] = "tasks.osx";
    TasksSchemaProperties["Linux"] = "tasks.linux";
    TasksSchemaProperties["ShowOutput"] = "tasks.showOutput";
    TasksSchemaProperties["IsShellCommand"] = "tasks.isShellCommand";
    TasksSchemaProperties["ServiceTestSetting"] = "tasks.service.testSetting";
})(TasksSchemaProperties || (TasksSchemaProperties = {}));
export var TaskDefinition;
(function (TaskDefinition) {
    function createTaskIdentifier(external, reporter) {
        const definition = TaskDefinitionRegistry.get(external.type);
        if (definition === undefined) {
            // We have no task definition so we can't sanitize the literal. Take it as is
            const copy = Objects.deepClone(external);
            delete copy._key;
            return KeyedTaskIdentifier.create(copy);
        }
        const literal = Object.create(null);
        literal.type = definition.taskType;
        const required = new Set();
        definition.required.forEach(element => required.add(element));
        const properties = definition.properties;
        for (const property of Object.keys(properties)) {
            const value = external[property];
            if (value !== undefined && value !== null) {
                literal[property] = value;
            }
            else if (required.has(property)) {
                const schema = properties[property];
                if (schema.default !== undefined) {
                    literal[property] = Objects.deepClone(schema.default);
                }
                else {
                    switch (schema.type) {
                        case 'boolean':
                            literal[property] = false;
                            break;
                        case 'number':
                        case 'integer':
                            literal[property] = 0;
                            break;
                        case 'string':
                            literal[property] = '';
                            break;
                        default:
                            reporter.error(nls.localize('TaskDefinition.missingRequiredProperty', 'Error: the task identifier \'{0}\' is missing the required property \'{1}\'. The task identifier will be ignored.', JSON.stringify(external, undefined, 0), property));
                            return undefined;
                    }
                }
            }
        }
        return KeyedTaskIdentifier.create(literal);
    }
    TaskDefinition.createTaskIdentifier = createTaskIdentifier;
})(TaskDefinition || (TaskDefinition = {}));
export const rerunTaskIcon = registerIcon('rerun-task', Codicon.refresh, nls.localize('rerunTaskIcon', 'View icon of the rerun task.'));
export const RerunForActiveTerminalCommandId = 'workbench.action.tasks.rerunForActiveTerminal';
export const RerunAllRunningTasksCommandId = 'workbench.action.tasks.rerunAllRunningTasks';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9jb21tb24vdGFza3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssS0FBSyxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUs5RCxPQUFPLEVBQUUsYUFBYSxFQUF3QixNQUFNLHNEQUFzRCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBSXJFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFJakYsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsVUFBVSxDQUFDO0FBRS9DLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLElBQUksYUFBYSxDQUFVLGFBQWEsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDLENBQUM7QUFDckssc0RBQXNEO0FBQ3RELE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLElBQUksYUFBYSxDQUFVLG9CQUFvQixFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGlEQUFpRCxDQUFDLENBQUMsQ0FBQztBQUNuTCxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFdEUsTUFBTSxDQUFO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