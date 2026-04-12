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
import * as resources from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITaskService } from '../common/taskService.js';
import { RunOnOptions, TaskSourceKind, TASKS_CATEGORY } from '../common/tasks.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
const HAS_PROMPTED_FOR_AUTOMATIC_TASKS = 'task.hasPromptedForAutomaticTasks.v2';
const ALLOW_AUTOMATIC_TASKS = 'task.allowAutomaticTasks';
let RunAutomaticTasks = class RunAutomaticTasks extends Disposable {
    constructor(_taskService, _configurationService, _workspaceTrustManagementService, _logService, _storageService, _notificationService, _openerService) {
        super();
        this._taskService = _taskService;
        this._configurationService = _configurationService;
        this._workspaceTrustManagementService = _workspaceTrustManagementService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._notificationService = _notificationService;
        this._openerService = _openerService;
        this._hasRunTasks = false;
        if (this._taskService.isReconnected) {
            this._tryRunTasks();
        }
        else {
            this._register(Event.once(this._taskService.onDidReconnectToTasks)(async () => await this._tryRunTasks()));
        }
        this._register(this._workspaceTrustManagementService.onDidChangeTrust(async () => await this._tryRunTasks()));
    }
    async _tryRunTasks() {
        if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
            return;
        }
        const { value, userValue } = this._configurationService.inspect(ALLOW_AUTOMATIC_TASKS);
        // If user explicitly set it to 'off', don't run or prompt
        if (this._hasRunTasks || (value === 'off' && userValue !== undefined)) {
            return;
        }
        this._hasRunTasks = true;
        this._logService.trace('RunAutomaticTasks: Trying to run tasks.');
        // Wait until we have task system info (the extension host and workspace folders are available).
        if (!this._taskService.hasTaskSystemInfo) {
            this._logService.trace('RunAutomaticTasks: Awaiting task system info.');
            await Event.toPromise(Event.once(this._taskService.onDidChangeTaskSystemInfo));
        }
        let workspaceTasks = await this._taskService.getWorkspaceTasks(2 /* TaskRunSource.FolderOpen */);
        this._logService.trace(`RunAutomaticTasks: Found ${workspaceTasks.size} automatic tasks`);
        let autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
        this._logService.trace(`RunAutomaticTasks: taskNames=${JSON.stringify(autoTasks.taskNames)}`);
        // As seen in some cases with the Remote SSH extension, the tasks configuration is loaded after we have come
        // to this point. Let's give it some extra time.
        if (autoTasks.taskNames.length === 0) {
            const updatedWithinTimeout = await Promise.race([
                new Promise((resolve) => {
                    Event.toPromise(Event.once(this._taskService.onDidChangeTaskConfig)).then(() => resolve(true));
                }),
                new Promise((resolve) => {
                    const timer = setTimeout(() => { clearTimeout(timer); resolve(false); }, 10000);
                })
            ]);
            if (!updatedWithinTimeout) {
                this._logService.trace(`RunAutomaticTasks: waited some extra time, but no update of tasks configuration`);
                return;
            }
            workspaceTasks = await this._taskService.getWorkspaceTasks(2 /* TaskRunSource.FolderOpen */);
            autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
            this._logService.trace(`RunAutomaticTasks: updated taskNames=${JSON.stringify(autoTasks.taskNames)}`);
        }
        this._runWithPermission(this._taskService, this._configurationService, this._storageService, this._notificationService, this._openerService, autoTasks.tasks, autoTasks.taskNames, autoTasks.locations);
    }
    _runTasks(taskService, tasks) {
        tasks.forEach(task => {
            if (task instanceof Promise) {
                task.then(promiseResult => {
                    if (promiseResult) {
                        taskService.run(promiseResult);
                    }
                });
            }
            else {
                taskService.run(task);
            }
        });
    }
    _getTaskSource(source) {
        const taskKind = TaskSourceKind.toConfigurationTarget(source.kind);
        switch (taskKind) {
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */: {
                return resources.joinPath(source.config.workspaceFolder.uri, source.config.file);
            }
            case 5 /* ConfigurationTarget.WORKSPACE */: {
                return source.config.workspace?.configuration ?? undefined;
            }
        }
        return undefined;
    }
    _findAutoTasks(taskService, workspaceTaskResult) {
        const tasks = new Array();
        const taskNames = new Array();
        const locations = new Map();
        if (workspaceTaskResult) {
            workspaceTaskResult.forEach(resultElement => {
                if (resultElement.set) {
                    resultElement.set.tasks.forEach(task => {
                        if (task.runOptions.runOn === RunOnOptions.folderOpen) {
                            tasks.push(task);
                            taskNames.push(task._label);
                            const location = this._getTaskSource(task._source);
                            if (location) {
                                locations.set(location.fsPath, location);
                            }
                        }
                    });
                }
                if (resultElement.configurations) {
                    for (const configuredTask of Object.values(resultElement.configurations.byIdentifier)) {
                        if (configuredTask.runOptions.runOn === RunOnOptions.folderOpen) {
                            tasks.push(new Promise(resolve => {
                                taskService.getTask(resultElement.workspaceFolder, configuredTask._id, true).then(task => resolve(task));
                            }));
                            if (configuredTask._label) {
                                taskNames.push(configuredTask._label);
                            }
                            else {
                                taskNames.push(configuredTask.configures.task);
                            }
                            const location = this._getTaskSource(configuredTask._source);
                            if (location) {
                                locations.set(location.fsPath, location);
                            }
                        }
                    }
                }
            });
        }
        return { tasks, taskNames, locations };
    }
    async _runWithPermission(taskService, configurationService, storageService, notificationService, openerService, tasks, taskNames, locations) {
        if (taskNames.length === 0) {
            return;
        }
        if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === 'on') {
            this._runTasks(taskService, tasks);
            return;
        }
        const hasShownPromptForAutomaticTasks = storageService.getBoolean(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, 1 /* StorageScope.WORKSPACE */, false);
        if (hasShownPromptForAutomaticTasks) {
            return;
        }
        // We have automatic tasks - prompt to allow.
        const allow = await this._showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations);
        if (allow) {
            this._runTasks(taskService, tasks);
        }
    }
    _showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations) {
        return new Promise(resolve => {
            notificationService.prompt(Severity.Info, nls.localize('tasks.run.allowAutomatic', "This workspace has tasks ({0}) defined ({1}) that can launch processes automatically when you open this workspace. Do you want to allow automatic tasks to run in all trusted workspaces?", taskNames.join(', '), Array.from(locations.keys()).join(', ')), [{
                    label: nls.localize('allow', "Allow"),
                    run: () => {
                        resolve(true);
                        configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, 'on', 2 /* ConfigurationTarget.USER */);
                    }
                },
                {
                    label: nls.localize('disallow', "Disallow"),
                    run: () => {
                        resolve(false);
                        configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, 'off', 2 /* ConfigurationTarget.USER */);
                    }
                },
                {
                    label: locations.size === 1 ? nls.localize('openTask', "Open File") : nls.localize('openTasks', "Open Files"),
                    run: async () => {
                        for (const location of locations) {
                            await openerService.open(location[1]);
                        }
                        resolve(false);
                    }
                }], { onCancel: () => resolve(false) });
            storageService.store(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        });
    }
};
RunAutomaticTasks = __decorate([
    __param(0, ITaskService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceTrustManagementService),
    __param(3, ILogService),
    __param(4, IStorageService),
    __param(5, INotificationService),
    __param(6, IOpenerService)
], RunAutomaticTasks);
export { RunAutomaticTasks };
export class ManageAutomaticTaskRunning extends Action2 {
    static { this.ID = 'workbench.action.tasks.manageAutomaticRunning'; }
    static { this.LABEL = nls.localize('workbench.action.tasks.manageAutomaticRunning', "Manage Automatic Tasks"); }
    constructor() {
        super({
            id: ManageAutomaticTaskRunning.ID,
            title: ManageAutomaticTaskRunning.LABEL,
            category: TASKS_CATEGORY
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const configurationService = accessor.get(IConfigurationService);
        const allowItem = { label: nls.localize('workbench.action.tasks.allowAutomaticTasks', "Allow Automatic Tasks") };
        const disallowItem = { label: nls.localize('workbench.action.tasks.disallowAutomaticTasks', "Disallow Automatic Tasks") };
        const value = await quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
        if (!value) {
            return;
        }
        configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, value === allowItem ? 'on' : 'off', 2 /* ConfigurationTarget.USER */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuQXV0b21hdGljVGFza3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9icm93c2VyL3J1bkF1dG9tYXRpY1Rhc2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFlBQVksRUFBOEIsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRixPQUFPLEVBQUUsWUFBWSxFQUFtQyxjQUFjLEVBQUUsY0FBYyxFQUFpRCxNQUFNLG9CQUFvQixDQUFDO0FBQ2xLLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBa0Isa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFekUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE1BQU0sZ0NBQWdDLEdBQUcsc0NBQXNDLENBQUM7QUFDaEYsTUFBTSxxQkFB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