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
import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { MenuRegistry, MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ProblemMatcherRegistry } from '../common/problemMatcher.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { Extensions as OutputExt } from '../../../services/output/common/output.js';
import { TaskGroup, TASKS_CATEGORY, TASK_RUNNING_STATE, TASK_TERMINAL_ACTIVE, TaskEventKind, rerunTaskIcon, RerunForActiveTerminalCommandId, RerunAllRunningTasksCommandId } from '../common/tasks.js';
import { ITaskService, TaskCommandsRegistered, TaskExecutionSupportedContext } from '../common/taskService.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { RunAutomaticTasks, ManageAutomaticTaskRunning } from './runAutomaticTasks.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import schemaVersion1 from '../common/jsonSchema_v1.js';
import schemaVersion2, { updateProblemMatchers, updateTaskDefinitions } from '../common/jsonSchema_v2.js';
import { AbstractTaskService, ConfigureTaskAction } from './abstractTaskService.js';
import { tasksSchemaId } from '../../../services/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { TasksQuickAccessProvider } from './tasksQuickAccess.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { TaskDefinitionRegistry } from '../common/taskDefinitionRegistry.js';
import { isString } from '../../../../base/common/types.js';
import { promiseWithResolvers } from '../../../../base/common/async.js';
import { TerminalContextKeys } from '../../terminal/common/terminalContextKey.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RunAutomaticTasks, 4 /* LifecyclePhase.Eventually */);
registerAction2(ManageAutomaticTaskRunning);
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: ManageAutomaticTaskRunning.ID,
        title: ManageAutomaticTaskRunning.LABEL,
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
let TaskStatusBarContributions = class TaskStatusBarContributions extends Disposable {
    constructor(_taskService, _statusbarService, _progressService) {
        super();
        this._taskService = _taskService;
        this._statusbarService = _statusbarService;
        this._progressService = _progressService;
        this._activeTasksCount = 0;
        this._registerListeners();
    }
    _registerListeners() {
        let promise = undefined;
        let resolve;
        this._register(this._taskService.onDidStateChange(event => {
            if (event.kind === TaskEventKind.Changed) {
                this._updateRunningTasksStatus();
            }
            if (!this._ignoreEventForUpdateRunningTasksCount(event)) {
                switch (event.kind) {
                    case TaskEventKind.Active:
                        this._activeTasksCount++;
                        if (this._activeTasksCount === 1) {
                            if (!promise) {
                                ({ promise, resolve } = promiseWithResolvers());
                            }
                        }
                        break;
                    case TaskEventKind.Inactive:
                        // Since the exiting of the sub process is communicated async we can't order inactive and terminate events.
                        // So try to treat them accordingly.
                        if (this._activeTasksCount > 0) {
                            this._activeTasksCount--;
                            if (this._activeTasksCount === 0) {
                                if (promise && resolve) {
                                    resolve();
                                }
                            }
                        }
                        break;
                    case TaskEventKind.Terminated:
                        if (this._activeTasksCount !== 0) {
                            this._activeTasksCount = 0;
                            if (promise && resolve) {
                                resolve();
                            }
                        }
                        break;
                }
            }
            if (promise && (event.kind === TaskEventKind.Active) && (this._activeTasksCount === 1)) {
                this._progressService.withProgress({ location: 10 /* ProgressLocation.Window */, command: 'workbench.action.tasks.showTasks' }, progress => {
                    progress.report({ message: nls.localize('building', 'Building...') });
                    return promise;
                }).then(() => {
                    promise = undefined;
                });
            }
        }));
    }
    async _updateRunningTasksStatus() {
        const tasks = await this._taskService.getActiveTasks();
        if (tasks.length === 0) {
            if (this._runningTasksStatusItem) {
                this._runningTasksStatusItem.dispose();
                this._runningTasksStatusItem = undefined;
            }
        }
        else {
            const itemProps = {
                name: nls.localize('status.runningTasks', "Running Tasks"),
                text: `$(tools) ${tasks.length}`,
                ariaLabel: nls.localize('numberOfRunningTasks', "{0} running tasks", tasks.length),
                tooltip: nls.localize('runningTasks', "Show Running Tasks"),
                command: 'workbench.action.tasks.showTasks',
            };
            if (!this._runningTasksStatusItem) {
                this._runningTasksStatusItem = this._statusbarService.addEntry(itemProps, 'status.runningTasks', 0 /* StatusbarAlignment.LEFT */, { location: { id: 'status.problems', priority: 50 }, alignment: 1 /* StatusbarAlignment.RIGHT */ });
            }
            else {
                this._runningTasksStatusItem.update(itemProps);
            }
        }
    }
    _ignoreEventForUpdateRunningTasksCount(event) {
        if (!this._taskService.inTerminal() || event.kind === TaskEventKind.Changed) {
            return false;
        }
        if ((isString(event.group) ? event.group : event.group?._id) !== TaskGroup.Build._id) {
            return true;
        }
        return event.__task.configurationProperties.problemMatchers === undefined || event.__task.configurationProperties.problemMatchers.length === 0;
    }
};
TaskStatusBarContributions = __decorate([
    __param(0, ITaskService),
    __param(1, IStatusbarService),
    __param(2, IProgressService)
], TaskStatusBarContributions);
export { TaskStatusBarContributions };
workbenchRegistry.registerWorkbenchContribution(TaskStatusBarContributions, 3 /* LifecyclePhase.Restored */);
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "3_run" /* TerminalMenuBarGroup.Run */,
    command: {
        id: 'workbench.action.tasks.runTask',
        title: nls.localize({ key: 'miRunTask', comment: ['&& denotes a mnemonic'] }, "&&Run Task...")
    },
    order: 1,
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "3_run" /* TerminalMenuBarGroup.Run */,
    command: {
        id: 'workbench.action.tasks.build',
        title: nls.localize({ key: 'miBuildTask', comment: ['&& denotes a mnemonic'] }, "Run &&Build Task...")
    },
    order: 2,
    when: TaskExecutionSupportedContext
});
// Manage Tasks
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "5_manage" /* TerminalMenuBarGroup.Manage */,
    command: {
        precondition: TASK_RUNNING_STATE,
        id: 'workbench.action.tasks.showTasks',
        title: nls.localize({ key: 'miRunningTask', comment: ['&& denotes a mnemonic'] }, "Show Runnin&&g Tasks...")
    },
    order: 1,
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "5_manage" /* TerminalMenuBarGroup.Manage */,
    command: {
        precondition: TASK_RUNNING_STATE,
        id: 'workbench.action.tasks.restartTask',
        title: nls.localize({ key: 'miRestartTask', comment: ['&& denotes a mnemonic'] }, "R&&estart Running Task...")
    },
    order: 2,
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "5_manage" /* TerminalMenuBarGroup.Manage */,
    command: {
        precondition: TASK_RUNNING_STATE,
        id: 'workbench.action.tasks.terminate',
        title: nls.localize({ key: 'miTerminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task...")
    },
    order: 3,
    when: TaskExecutionSupportedContext
});
// Configure Tasks
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "7_configure" /* TerminalMenuBarGroup.Configure */,
    command: {
        id: 'workbench.action.tasks.configureTaskRunner',
        title: nls.localize({ key: 'miConfigureTask', comment: ['&& denotes a mnemonic'] }, "&&Configure Tasks...")
    },
    order: 1,
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
    group: "7_configure" /* TerminalMenuBarGroup.Configure */,
    command: {
        id: 'workbench.action.tasks.configureDefaultBuildTask',
        title: nls.localize({ key: 'miConfigureBuildTask', comment: ['&& denotes a mnemonic'] }, "Configure De&&fault Build Task...")
    },
    order: 2,
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.openWorkspaceFileTasks',
        title: nls.localize2('workbench.action.tasks.openWorkspaceFileTasks', "Open Workspace Tasks"),
        category: TASKS_CATEGORY
    },
    when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), TaskExecutionSupportedContext)
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: ConfigureTaskAction.ID,
        title: ConfigureTaskAction.TEXT,
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.showLog',
        title: nls.localize2('ShowLogAction.label', "Show Task Log"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.runTask',
        title: nls.localize2('RunTaskAction.label', "Run Task"),
        category: TASKS_CATEGORY
    }
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.reRunTask',
        title: nls.localize2('ReRunTaskAction.label', "Rerun Last Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.restartTask',
        title: nls.localize2('RestartTaskAction.label', "Restart Running Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: RerunAllRunningTasksCommandId,
        title: nls.localize2('RerunAllRunningTasksAction.label', "Rerun All Running Tasks"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.showTasks',
        title: nls.localize2('ShowTasksAction.label', "Show Running Tasks"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.terminate',
        title: nls.localize2('TerminateAction.label', "Terminate Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.build',
        title: nls.localize2('BuildAction.label', "Run Build Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.test',
        title: nls.localize2('TestAction.label', "Run Test Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.configureDefaultBuildTask',
        title: nls.localize2('ConfigureDefaultBuildTask.label', "Configure Default Build Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.configureDefaultTestTask',
        title: nls.localize2('ConfigureDefaultTestTask.label', "Configure Default Test Task"),
        category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'workbench.action.tasks.openUserTasks',
        title: nls.localize2('workbench.action.tasks.openUserTasks', "Open User Tasks"), category: TASKS_CATEGORY
    },
    when: TaskExecutionSupportedContext
});
class UserTasksGlobalActionContribution extends Disposable {
    constructor() {
        super();
        this.registerActions();
    }
    registerActions() {
        const id = 'workbench.action.tasks.openUserTasks';
        const title = nls.localize('tasks', "Tasks");
        this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
            command: {
                id,
                title
            },
            when: TaskExecutionSupportedContext,
            group: '2_configuration',
            order: 6
        }));
        this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
            command: {
                id,
                title
            },
            when: TaskExecutionSupportedContext,
            group: '2_configuration',
            order: 6
        }));
    }
}
workbenchRegistry.registerWorkbenchContribution(UserTasksGlobalActionContribution, 3 /* LifecyclePhase.Restored */);
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.rebuild', title: nls.localize('RebuildAction.label', 'Run Rebuild Task'), category: tasksCategory });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.clean', title: nls.localize('CleanAction.label', 'Run Clean Task'), category: tasksCategory });
KeybindingsRegistry.registerKeybindingRule({
    id: 'workbench.action.tasks.build',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: TaskCommandsRegistered,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 32 /* KeyCode.KeyB */
});
// Tasks Output channel. Register it before using it in Task Service.
const outputChannelRegistry = Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel({ id: AbstractTaskService.OutputChannelId, label: AbstractTaskService.OutputChannelLabel, log: false });
// Register Quick Access
const quickAccessRegistry = (Registry.as(QuickAccessExtensions.Quickaccess));
const tasksPickerContextKey = 'inTasksPicker';
quickAccessRegistry.registerQuickAccessProvider({
    ctor: TasksQuickAccessProvider,
    prefix: TasksQuickAccessProvider.PREFIX,
    contextKey: tasksPickerContextKey,
    placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type the name of a task to run."),
    helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Run Task"), commandCenterOrder: 60 }]
});
// tasks.json validation
const schema = {
    id: tasksSchemaId,
    description: 'Task definition file',
    type: 'object',
    allowTrailingCommas: true,
    allowComments: true,
    default: {
        version: '2.0.0',
        tasks: [
            {
                label: 'My Task',
                command: 'echo hello',
                type: 'shell',
                args: [],
                problemMatcher: ['$tsc'],
                presentation: {
                    reveal: 'always'
                },
                group: 'build'
            }
        ]
    }
};
schema.definitions = {
    ...schemaVersion1.definitions,
    ...schemaVersion2.definitions,
};
schema.oneOf = [...(schemaVersion2.oneOf || []), ...(schemaVersion1.oneOf || [])];
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(tasksSchemaId, schema);
export class TaskRegistryContribution extends Disposable {
    static { this.ID = 'taskRegistryContribution'; }
    constructor() {
        super();
        this._register(ProblemMatcherRegistry.onMatcherChanged(() => {
            updateProblemMatchers();
            jsonRegistry.notifySchemaChanged(tasksSchemaId);
        }));
        this._register(TaskDefinitionRegistry.onDefinitionsChanged(() => {
            updateTaskDefinitions();
            jsonRegistry.notifySchemaChanged(tasksSchemaId);
        }));
    }
}
registerWorkbenchContribution2(TaskRegistryContribution.ID, TaskRegistryContribution, 3 /* WorkbenchPhase.AfterRestored */);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'task',
    order: 100,
    title: nls.localize('tasksConfigurationTitle', "Tasks"),
    type: 'object',
    properties: {
        ["task.problemMatchers.neverPrompt" /* TaskSettingId.ProblemMatchersNeverPrompt */]: {
            markdownDescription: nls.localize('task.problemMatchers.neverPrompt', "Configures whether to show the problem matcher prompt when running a task. Set to `true` to never prompt, or use a dictionary of task types to turn off prompting only for specific task types."),
            'oneOf': [
                {
                    type: 'boolean',
                    markdownDescription: nls.localize('task.problemMatchers.neverPrompt.boolean', 'Sets problem matcher prompting behavior for all tasks.')
                },
                {
                    type: 'object',
                    patternProperties: {
                        '.*': {
                            type: 'boolean'
                        }
                    },
                    markdownDescription: nls.localize('task.problemMatchers.neverPrompt.array', 'An object containing task type-boolean pairs to never prompt for problem matchers on.'),
                    default: {
                        'shell': true
                    }
                }
            ],
            default: false
        },
        ["task.autoDetect" /* TaskSettingId.AutoDetect */]: {
            markdownDescription: nls.localize('task.autoDetect', "Controls enablement of `provideTasks` for all task provider extension. If the Tasks: Run Task command is slow, disabling auto detect for task providers may help. Individual extensions may also provide settings that disable auto detection."),
            type: 'string',
            enum: ['on', 'off'],
            default: 'on'
        },
        ["task.slowProviderWarning" /* TaskSettingId.SlowProviderWarning */]: {
            markdownDescription: nls.localize('task.slowProviderWarning', "Configures whether a warning is shown when a provider is slow"),
            'oneOf': [
                {
                    type: 'boolean',
                    markdownDescription: nls.localize('task.slowProviderWarning.boolean', 'Sets the slow provider warning for all tasks.')
                },
                {
                    type: 'array',
                    items: {
                        type: 'string',
                        markdownDescription: nls.localize('task.slowProviderWarning.array', 'An array of task types to never show the slow provider warning.')
                    }
                }
            ],
            default: true
        },
        ["task.quickOpen.history" /* TaskSettingId.QuickOpenHistory */]: {
            markdownDescription: nls.localize('task.quickOpen.history', "Controls the number of recent items tracked in task quick open dialog."),
            type: 'number',
            default: 30, minimum: 0, maximum: 30
        },
        ["task.quickOpen.detail" /* TaskSettingId.QuickOpenDetail */]: {
            markdownDescription: nls.localize('task.quickOpen.detail', "Controls whether to show the task detail for tasks that have a detail in task quick picks, such as Run Task."),
            type: 'boolean',
            default: true
        },
        ["task.quickOpen.skip" /* TaskSettingId.QuickOpenSkip */]: {
            type: 'boolean',
            description: nls.localize('task.quickOpen.skip', "Controls whether the task quick pick is skipped when there is only one task to pick from."),
            default: false
        },
        ["task.quickOpen.showAll" /* TaskSettingId.QuickOpenShowAll */]: {
            type: 'boolean',
            description: nls.localize('task.quickOpen.showAll', "Causes the Tasks: Run Task command to use the slower \"show all\" behavior instead of the faster two level picker where tasks are grouped by provider."),
            default: false
        },
        ["task.allowAutomaticTasks" /* TaskSettingId.AllowAutomaticTasks */]: {
            type: 'string',
            enum: ['on', 'off'],
            enumDescriptions: [
                nls.localize('task.allowAutomaticTasks.on', "Always"),
                nls.localize('task.allowAutomaticTasks.off', "Never"),
            ],
            description: nls.localize('task.allowAutomaticTasks', "Enable automatic tasks - note that tasks won't run in an untrusted workspace."),
            default: 'off',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            restricted: true
        },
        ["task.reconnection" /* TaskSettingId.Reconnection */]: {
            type: 'boolean',
            description: nls.localize('task.reconnection', "On window reload, reconnect to tasks that have problem matchers."),
            default: true
        },
        ["task.saveBeforeRun" /* TaskSettingId.SaveBeforeRun */]: {
            markdownDescription: nls.localize('task.saveBeforeRun', 'Save all dirty editors before running a task.'),
            type: 'string',
            enum: ['always', 'never', 'prompt'],
            enumDescriptions: [
                nls.localize('task.saveBeforeRun.always', 'Always saves all editors before running.'),
                nls.localize('task.saveBeforeRun.never', 'Never saves editors before running.'),
                nls.localize('task.SaveBeforeRun.prompt', 'Prompts whether to save editors before running.'),
            ],
            default: 'always',
        },
        ["task.notifyWindowOnTaskCompletion" /* TaskSettingId.NotifyWindowOnTaskCompletion */]: {
            type: 'integer',
            markdownDescription: nls.localize('task.NotifyWindowOnTaskCompletion', 'Controls the minimum task runtime in milliseconds before showing an OS notification when the task finishes while the window is not in focus. Set to -1 to disable notifications. Set to 0 to always show notifications. This includes a window badge as well as notification toast.'),
            default: 60000,
            minimum: -1
        },
        ["task.verboseLogging" /* TaskSettingId.VerboseLogging */]: {
            type: 'boolean',
            description: nls.localize('task.verboseLogging', "Enable verbose logging for tasks."),
            default: false
        },
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: RerunForActiveTerminalCommandId,
            icon: rerunTaskIcon,
            title: nls.localize2('workbench.action.tasks.rerunForActiveTerminal', 'Rerun Task'),
            precondition: TASK_TERMINAL_ACTIVE,
            menu: [{ id: MenuId.TerminalInstanceContext, when: TASK_TERMINAL_ACTIVE }],
            keybinding: {
                when: TerminalContextKeys.focus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */
                },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async run(accessor, args) {
        const terminalService = accessor.get(ITerminalService);
        const taskSystem = accessor.get(ITaskService);
        const instance = args ?? terminalService.activeInstance;
        if (instance) {
            await taskSystem.rerun(instance.instanceId);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFzay5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9icm93c2VyL3Rhc2suY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFaEgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLGtEQUFrRCxDQUFDO0FBRXRHLE9BQU8sS0FBSyx3QkFBd0IsTUFBTSxxRUFBcUUsQ0FBQztBQUdoSCxPQUFPLEVBQXNCLGlCQUFpQixFQUE0QyxNQUFNLGtEQUFrRCxDQUFDO0FBRW5KLE9BQU8sRUFBMEIsVUFBVSxJQUFJLFNBQVMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTVHLE9BQU8sRUFBYyxTQUFTLEVBQWlCLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLCtCQUErQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbE8sT0FBTyxFQUFFLFlBQVksRUFBRSxzQkFBc0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRS9HLE9BQU8sRUFBRSxVQUFVLElBQUksbUJBQW1CLEVBQTJFLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7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