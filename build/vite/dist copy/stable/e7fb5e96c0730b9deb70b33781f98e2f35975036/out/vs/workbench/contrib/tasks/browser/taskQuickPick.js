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
var TaskQuickPick_1;
import * as nls from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import { ContributedTask, CustomTask, ConfiguringTask } from '../common/tasks.js';
import * as Types from '../../../../base/common/types.js';
import { ITaskService } from '../common/taskService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { getColorClass, createColorStyleElement } from '../../terminal/browser/terminalIcon.js';
import { showWithPinnedItems } from '../../../../platform/quickinput/browser/quickPickPin.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const QUICKOPEN_DETAIL_CONFIG = 'task.quickOpen.detail';
export const QUICKOPEN_SKIP_CONFIG = 'task.quickOpen.skip';
export function isWorkspaceFolder(folder) {
    return 'uri' in folder;
}
const SHOW_ALL = nls.localize('taskQuickPick.showAll', "Show All Tasks...");
export const configureTaskIcon = registerIcon('tasks-list-configure', Codicon.gear, nls.localize('configureTaskIcon', 'Configuration icon in the tasks selection list.'));
const removeTaskIcon = registerIcon('tasks-remove', Codicon.close, nls.localize('removeTaskIcon', 'Icon for remove in the tasks selection list.'));
const runTaskStorageKey = 'runTaskStorageKey';
let TaskQuickPick = TaskQuickPick_1 = class TaskQuickPick extends Disposable {
    constructor(_taskService, _configurationService, _quickInputService, _notificationService, _themeService, _dialogService, _storageService) {
        super();
        this._taskService = _taskService;
        this._configurationService = _configurationService;
        this._quickInputService = _quickInputService;
        this._notificationService = _notificationService;
        this._themeService = _themeService;
        this._dialogService = _dialogService;
        this._storageService = _storageService;
        this._sorter = this._taskService.createSorter();
    }
    _showDetail() {
        // Ensure invalid values get converted into boolean values
        return !!this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
    }
    _guessTaskLabel(task) {
        if (task._label) {
            return task._label;
        }
        if (ConfiguringTask.is(task)) {
            let label = task.configures.type;
            const configures = Objects.deepClone(task.configures);
            delete configures['_key'];
            delete configures['type'];
            Object.keys(configures).forEach(key => label += `: ${configures[key]}`);
            return label;
        }
        return '';
    }
    static getTaskLabelWithIcon(task, labelGuess) {
        const label = labelGuess || task._label;
        const icon = task.configurationProperties.icon;
        if (!icon) {
            return `${label}`;
        }
        return icon.id ? `$(${icon.id}) ${label}` : `$(${Codicon.tools.id}) ${label}`;
    }
    static applyColorStyles(task, entry, themeService) {
        if (task.configurationProperties.icon?.color) {
            const colorTheme = themeService.getColorTheme();
            const disposable = createColorStyleElement(colorTheme);
            entry.iconClasses = [getColorClass(task.configurationProperties.icon.color)];
            return disposable;
        }
        return;
    }
    _createTaskEntry(task, extraButtons = []) {
        const buttons = [
            { iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize('configureTask', "Configure Task") },
            ...extraButtons
        ];
        const entry = { label: TaskQuickPick_1.getTaskLabelWithIcon(task, this._guessTaskLabel(task)), description: this._taskService.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : undefined, buttons };
        const disposable = TaskQuickPick_1.applyColorStyles(task, entry, this._themeService);
        if (disposable) {
            this._register(disposable);
        }
        return entry;
    }
    _createEntriesForGroup(entries, tasks, groupLabel, extraButtons = []) {
        entries.push({ type: 'separator', label: groupLabel });
        tasks.forEach(task => {
            if (!task.configurationProperties.hide) {
                entries.push(this._createTaskEntry(task, extraButtons));
            }
        });
    }
    _createTypeEntries(entries, types) {
        entries.push({ type: 'separator', label: nls.localize('contributedTasks', "contributed") });
        types.forEach(type => {
            entries.push({ label: `$(folder) ${type}`, task: type, ariaLabel: nls.localize('taskType', "All {0} tasks", type) });
        });
        entries.push({ label: SHOW_ALL, task: SHOW_ALL, alwaysShow: true });
    }
    _handleFolderTaskResult(result) {
        const tasks = [];
        Array.from(result).forEach(([key, folderTasks]) => {
            if (folderTasks.set) {
                tasks.push(...folderTasks.set.tasks);
            }
            if (folderTasks.configurations) {
                for (const configuration in folderTasks.configurations.byIdentifier) {
                    tasks.push(folderTasks.configurations.byIdentifier[configuration]);
                }
            }
        });
        return tasks;
    }
    _dedupeConfiguredAndRecent(recentTasks, configuredTasks) {
        let dedupedConfiguredTasks = [];
        const foundRecentTasks = Array(recentTasks.length).fill(false);
        for (let j = 0; j < configuredTasks.length; j++) {
            const workspaceFolder = configuredTasks[j].getWorkspaceFolder()?.uri.toString();
            const definition = configuredTasks[j].getDefinition()?._key;
            const type = configuredTasks[j].type;
            const label = configuredTasks[j]._label;
            const recentKey = configuredTasks[j].getKey();
            const findIndex = recentTasks.findIndex((value) => {
                return (workspaceFolder && definition && value.getWorkspaceFolder()?.uri.toString() === workspaceFolder
                    && ((value.getDefinition()?._key === definition) || (value.type === type && value._label === label)))
                    || (recentKey && value.getKey() === recentKey);
            });
            if (findIndex === -1) {
                dedupedConfiguredTasks.push(configuredTasks[j]);
            }
            else {
                recentTasks[findIndex] = configuredTasks[j];
                foundRecentTasks[findIndex] = true;
            }
        }
        dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => this._sorter.compare(a, b));
        const prunedRecentTasks = [];
        for (let i = 0; i < recentTasks.length; i++) {
            if (foundRecentTasks[i] || ConfiguringTask.is(recentTasks[i])) {
                prunedRecentTasks.push(recentTasks[i]);
            }
        }
        return { configuredTasks: dedupedConfiguredTasks, recentTasks: prunedRecentTasks };
    }
    async getTopLevelEntries(defaultEntry) {
        if (this._topLevelEntries !== undefined) {
            return { entries: this._topLevelEntries };
        }
        let recentTasks = (await this._taskService.getSavedTasks('historical')).reverse();
        const configuredTasks = this._handleFolderTaskResult(await this._taskService.getWorkspaceTasks());
        const extensionTaskTypes = this._taskService.taskTypes();
        this._topLevelEntries = [];
        // Dedupe will update recent tasks if they've changed in tasks.json.
        const dedupeAndPrune = this._dedupeConfiguredAndRecent(recentTasks, configuredTasks);
        const dedupedConfiguredTasks = dedupeAndPrune.configuredTasks;
        recentTasks = dedupeAndPrune.recentTasks;
        if (recentTasks.length > 0) {
            const removeRecentButton = {
                iconClass: ThemeIcon.asClassName(removeTaskIcon),
                tooltip: nls.localize('removeRecent', 'Remove Recently Used Task')
            };
            this._createEntriesForGroup(this._topLevelEntries, recentTasks, nls.localize('recentlyUsed', 'recently used'), [removeRecentButton]);
        }
        if (configuredTasks.length > 0) {
            if (dedupedConfiguredTasks.length > 0) {
                this._createEntriesForGroup(this._topLevelEntries, dedupedConfiguredTasks, nls.localize('configured', 'configured'));
            }
        }
        if (defaultEntry && (configuredTasks.length === 0)) {
            this._topLevelEntries.push({ type: 'separator', label: nls.localize('configured', 'configured') });
            this._topLevelEntries.push(defaultEntry);
        }
        if (extensionTaskTypes.length > 0) {
            this._createTypeEntries(this._topLevelEntries, extensionTaskTypes);
        }
        return { entries: this._topLevelEntries, isSingleConfigured: configuredTasks.length === 1 ? configuredTasks[0] : undefined };
    }
    async handleSettingOption(selectedType) {
        const { confirmed } = await this._dialogService.confirm({
            type: Severity.Warning,
            message: nls.localize('TaskQuickPick.changeSettingDetails', "Task detection for {0} tasks causes files in any workspace you open to be run as code. Enabling {0} task detection is a user setting and will apply to any workspace you open. \n\n Do you want to enable {0} task detection for all workspaces?", selectedType),
            cancelButton: nls.localize('TaskQuickPick.changeSettingNo', "No")
        });
        if (confirmed) {
            await this._configurationService.updateValue(`${selectedType}.autoDetect`, 'on');
            await new Promise(resolve => setTimeout(() => resolve(), 100));
            return this.show(nls.localize('TaskService.pickRunTask', 'Select the task to run'), undefined, selectedType);
        }
        return undefined;
    }
    async show(placeHolder, defaultEntry, startAtType, name) {
        const disposables = new DisposableStore();
        const picker = disposables.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        picker.placeholder = placeHolder;
        picker.matchOnDescription = true;
        picker.ignoreFocusOut = false;
        disposables.add(picker.onDidTriggerItemButton(async (context) => {
            const task = context.item.task;
            if (context.button.iconClass === ThemeIcon.asClassName(removeTaskIcon)) {
                const key = (task && !Types.isString(task)) ? task.getKey() : undefined;
                if (key) {
                    this._taskService.removeRecentlyUsedTask(key);
                }
                const indexToRemove = picker.items.indexOf(context.item);
                if (indexToRemove >= 0) {
                    picker.items = [...picker.items.slice(0, indexToRemove), ...picker.items.slice(indexToRemove + 1)];
                }
            }
            else if (context.button.iconClass === ThemeIcon.asClassName(configureTaskIcon)) {
                this._quickInputService.cancel();
                if (ContributedTask.is(task)) {
                    this._taskService.customize(task, undefined, true);
                }
                else if (CustomTask.is(task) || ConfiguringTask.is(task)) {
                    let canOpenConfig = false;
                    try {
                        canOpenConfig = await this._taskService.openConfig(task);
                    }
                    catch (e) {
                        // do nothing.
                    }
                    if (!canOpenConfig) {
                        this._taskService.customize(task, undefined, true);
                    }
                }
            }
        }));
        if (name) {
            picker.value = name;
        }
        let firstLevelTask = startAtType;
        if (!firstLevelTask) {
            // First show recent tasks configured tasks. Other tasks will be available at a second level
            const topLevelEntriesResult = await this.getTopLevelEntries(defaultEntry);
            if (topLevelEntriesResult.isSingleConfigured && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
                disposables.dispose();
                return this._toTask(topLevelEntriesResult.isSingleConfigured);
            }
            const taskQuickPickEntries = topLevelEntriesResult.entries;
            firstLevelTask = await this._doPickerFirstLevel(picker, taskQuickPickEntries, disposables);
        }
        do {
            if (Types.isString(firstLevelTask)) {
                if (name) {
                    await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
                    disposables.dispose();
                    return undefined;
                }
                const selectedEntry = await this.doPickerSecondLevel(picker, disposables, firstLevelTask);
                // Proceed to second level of quick pick
                if (selectedEntry && !selectedEntry.settingType && selectedEntry.task === null) {
                    // The user has chosen to go back to the first level
                    picker.value = '';
                    firstLevelTask = await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
                }
                else if (selectedEntry && Types.isString(selectedEntry.settingType)) {
                    disposables.dispose();
                    return this.handleSettingOption(selectedEntry.settingType);
                }
                else {
                    disposables.dispose();
                    return (selectedEntry?.task && !Types.isString(selectedEntry?.task)) ? this._toTask(selectedEntry?.task) : undefined;
                }
            }
            else if (firstLevelTask) {
                disposables.dispose();
                return this._toTask(firstLevelTask);
            }
            else {
                disposables.dispose();
                return firstLevelTask;
            }
        } while (1);
        return;
    }
    async _doPickerFirstLevel(picker, taskQuickPickEntries, disposables) {
        picker.items = taskQuickPickEntries;
        disposables.add(showWithPinnedItems(this._storageService, runTaskStorageKey, picker, true));
        const firstLevelPickerResult = await new Promise(resolve => {
            disposables.add(Event.once(picker.onDidAccept)(async () => {
                resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
            }));
        });
        return firstLevelPickerResult?.task;
    }
    async doPickerSecondLevel(picker, disposables, type, name) {
        picker.busy = true;
        if (type === SHOW_ALL) {
            const items = (await this._taskService.tasks()).filter(t => !t.configurationProperties.hide).sort((a, b) => this._sorter.compare(a, b)).map(task => this._createTaskEntry(task));
            items.push(...TaskQuickPick_1.allSettingEntries(this._configurationService));
            picker.items = items;
        }
        else {
            picker.value = name || '';
            picker.items = await this._getEntriesForProvider(type);
        }
        await picker.show();
        picker.busy = false;
        const secondLevelPickerResult = await new Promise(resolve => {
            disposables.add(Event.once(picker.onDidAccept)(async () => {
                resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
            }));
        });
        return secondLevelPickerResult;
    }
    static allSettingEntries(configurationService) {
        const entries = [];
        const gruntEntry = TaskQuickPick_1.getSettingEntry(configurationService, 'grunt');
        if (gruntEntry) {
            entries.push(gruntEntry);
        }
        const gulpEntry = TaskQuickPick_1.getSettingEntry(configurationService, 'gulp');
        if (gulpEntry) {
            entries.push(gulpEntry);
        }
        const jakeEntry = TaskQuickPick_1.getSettingEntry(configurationService, 'jake');
        if (jakeEntry) {
            entries.push(jakeEntry);
        }
        return entries;
    }
    static getSettingEntry(configurationService, type) {
        if (configurationService.getValue(`${type}.autoDetect`) === 'off') {
            return {
                label: '$(gear) ' + nls.localize('TaskQuickPick.changeSettingsOptions', "{0} task detection is turned off. Enable {1} task detection...", type[0].toUpperCase() + type.slice(1), type),
                task: null,
                settingType: type,
                alwaysShow: true
            };
        }
        return undefined;
    }
    async _getEntriesForProvider(type) {
        const tasks = (await this._taskService.tasks({ type })).sort((a, b) => this._sorter.compare(a, b));
        let taskQuickPickEntries = [];
        if (tasks.length > 0) {
            for (const task of tasks) {
                if (!task.configurationProperties.hide) {
                    taskQuickPickEntries.push(this._createTaskEntry(task));
                }
            }
            taskQuickPickEntries.push({
                type: 'separator'
            }, {
                label: nls.localize('TaskQuickPick.goBack', 'Go back ↩'),
                task: null,
                alwaysShow: true
            });
        }
        else {
            taskQuickPickEntries = [{
                    label: nls.localize('TaskQuickPick.noTasksForType', 'No {0} tasks found. Go back ↩', type),
                    task: null,
                    alwaysShow: true
                }];
        }
        const settingEntry = TaskQuickPick_1.getSettingEntry(this._configurationService, type);
        if (settingEntry) {
            taskQuickPickEntries.push(settingEntry);
        }
        return taskQuickPickEntries;
    }
    async _toTask(task) {
        if (!ConfiguringTask.is(task)) {
            return task;
        }
        const resolvedTask = await this._taskService.tryResolveTask(task);
        if (!resolvedTask) {
            this._notificationService.error(nls.localize('noProviderForTask', "There is no task provider registered for tasks of type \"{0}\".", task.type));
        }
        return resolvedTask;
    }
};
TaskQuickPick = TaskQuickPick_1 = __decorate([
    __param(0, ITaskService),
    __param(1, IConfigurationService),
    __param(2, IQuickInputService),
    __param(3, INotificationService),
    __param(4, IThemeService),
    __param(5, IDialogService),
    __param(6, IStorageService)
], TaskQuickPick);
export { TaskQuickPick };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1F1aWNrUGljay5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvdGFza1F1aWNrUGljay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBUSxlQUFlLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBbUMsTUFBTSxvQkFBb0IsQ0FBQztBQUV6SCxPQUFPLEtBQUssS0FBSyxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxZQUFZLEVBQThCLE1BQU0sMEJBQTBCLENBQUM7QUFDcEYsT0FBTyxFQUFpRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pKLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFB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