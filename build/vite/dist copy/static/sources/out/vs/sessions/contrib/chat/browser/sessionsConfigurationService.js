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
var SessionsConfigurationService_1;
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../base/common/observable.js';
import { joinPath, dirname, isEqual } from '../../../../base/common/resources.js';
import { parse } from '../../../../base/common/jsonc.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IJSONEditingService } from '../../../../workbench/services/configuration/common/jsonEditing.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { ITaskService } from '../../../../workbench/contrib/tasks/common/taskService.js';
export const ISessionsConfigurationService = createDecorator('sessionsConfigurationService');
let SessionsConfigurationService = class SessionsConfigurationService extends Disposable {
    static { SessionsConfigurationService_1 = this; }
    static { this._PINNED_TASK_LABELS_KEY = 'agentSessions.pinnedTaskLabels'; }
    constructor(_fileService, _jsonEditingService, _preferencesService, _taskService, _workspaceContextService, _storageService) {
        super();
        this._fileService = _fileService;
        this._jsonEditingService = _jsonEditingService;
        this._preferencesService = _preferencesService;
        this._taskService = _taskService;
        this._workspaceContextService = _workspaceContextService;
        this._storageService = _storageService;
        this._sessionTasks = observableValue(this, []);
        this._fileWatcher = this._register(new MutableDisposable());
        this._pinnedTaskObservables = new Map();
        this._pinnedTaskLabels = this._loadPinnedTaskLabels();
    }
    getSessionTasks(session) {
        const repo = this._getSessionRepo(session);
        const folder = repo?.workingDirectory ?? repo?.uri;
        if (folder) {
            this._ensureFileWatch(folder);
        }
        // Trigger initial read only when the folder changes; the file watcher handles subsequent updates
        if (!isEqual(this._lastRefreshedFolder, folder)) {
            this._lastRefreshedFolder = folder;
            this._refreshSessionTasks(folder);
        }
        return this._sessionTasks;
    }
    async getNonSessionTasks(session) {
        const result = [];
        const workspaceUri = this._getTasksJsonUri(session, 'workspace');
        if (workspaceUri) {
            const workspaceJson = await this._readTasksJson(workspaceUri);
            for (const task of workspaceJson.tasks ?? []) {
                if (!task.inSessions && this._isSupportedTask(task)) {
                    result.push({ task, target: 'workspace' });
                }
            }
        }
        const userUri = this._getTasksJsonUri(session, 'user');
        if (userUri) {
            const userJson = await this._readTasksJson(userUri);
            for (const task of userJson.tasks ?? []) {
                if (!task.inSessions && this._isSupportedTask(task)) {
                    result.push({ task, target: 'user' });
                }
            }
        }
        return result;
    }
    async addTaskToSessions(task, session, target, options) {
        const tasksJsonUri = this._getTasksJsonUri(session, target);
        if (!tasksJsonUri) {
            return;
        }
        const tasksJson = await this._readTasksJson(tasksJsonUri);
        const tasks = tasksJson.tasks ?? [];
        const index = tasks.findIndex(t => t.label === task.label);
        if (index === -1) {
            return;
        }
        const edits = [
            { path: ['tasks', index, 'inSessions'], value: true },
        ];
        if (options) {
            edits.push({
                path: ['tasks', index, 'runOptions'],
                value: options.runOn && options.runOn !== 'default' ? { runOn: options.runOn } : undefined,
            });
        }
        await this._jsonEditingService.write(tasksJsonUri, edits, true);
    }
    async createAndAddTask(label, command, session, target, options) {
        const tasksJsonUri = this._getTasksJsonUri(session, target);
        if (!tasksJsonUri) {
            return undefined;
        }
        const tasksJson = await this._readTasksJson(tasksJsonUri);
        const tasks = tasksJson.tasks ?? [];
        const resolvedLabel = label?.trim() || command;
        const newTask = {
            label: resolvedLabel,
            type: 'shell',
            command,
            inSessions: true,
            ...(options?.runOn && options.runOn !== 'default' ? { runOptions: { runOn: options.runOn } } : {}),
        };
        await this._jsonEditingService.write(tasksJsonUri, [
            { path: ['version'], value: tasksJson.version ?? '2.0.0' },
            { path: ['tasks'], value: [...tasks, newTask] }
        ], true);
        return newTask;
    }
    async updateTask(originalTaskLabel, updatedTask, session, currentTarget, newTarget) {
        const currentTasksJsonUri = this._getTasksJsonUri(session, currentTarget);
        const newTasksJsonUri = this._getTasksJsonUri(session, newTarget);
        if (!currentTasksJsonUri || !newTasksJsonUri) {
            return;
        }
        const currentTasksJson = await this._readTasksJson(currentTasksJsonUri);
        const currentTasks = currentTasksJson.tasks ?? [];
        const currentIndex = currentTasks.findIndex(task => task.label === originalTaskLabel);
        if (currentIndex === -1) {
            return;
        }
        if (currentTasksJsonUri.toString() === newTasksJsonUri.toString()) {
            await this._jsonEditingService.write(currentTasksJsonUri, [
                { path: ['tasks', currentIndex], value: updatedTask },
            ], true);
        }
        else {
            const newTasksJson = await this._readTasksJson(newTasksJsonUri);
            const newTasks = newTasksJson.tasks ?? [];
            await this._jsonEditingService.write(currentTasksJsonUri, [
                { path: ['tasks'], value: currentTasks.filter((_, taskIndex) => taskIndex !== currentIndex) },
            ], true);
            await this._jsonEditingService.write(newTasksJsonUri, [
                { path: ['version'], value: newTasksJson.version ?? '2.0.0' },
                { path: ['tasks'], value: [...newTasks, updatedTask] },
            ], true);
        }
        const repoUri = this._getSessionRepo(session)?.uri;
        if (repoUri) {
            const key = repoUri.toString();
            if (this._pinnedTaskLabels.get(key) === originalTaskLabel) {
                this._setPinnedTaskLabelForKey(key, updatedTask.label);
            }
        }
    }
    async removeTask(taskLabel, session, target) {
        const tasksJsonUri = this._getTasksJsonUri(session, target);
        if (!tasksJsonUri) {
            return;
        }
        const tasksJson = await this._readTasksJson(tasksJsonUri);
        const tasks = tasksJson.tasks ?? [];
        const index = tasks.findIndex(t => t.label === taskLabel);
        if (index === -1) {
            return;
        }
        await this._jsonEditingService.write(tasksJsonUri, [
            { path: ['tasks'], value: tasks.filter((_, taskIndex) => taskIndex !== index) },
        ], true);
        const repoUri = this._getSessionRepo(session)?.uri;
        if (repoUri) {
            const key = repoUri.toString();
            if (this._pinnedTaskLabels.get(key) === taskLabel) {
                this._setPinnedTaskLabelForKey(key, undefined);
            }
        }
    }
    async runTask(task, session) {
        const repo = this._getSessionRepo(session);
        const cwd = repo?.workingDirectory ?? repo?.uri;
        if (!cwd) {
            return;
        }
        const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwd);
        if (!workspaceFolder) {
            return;
        }
        const resolvedTask = await this._taskService.getTask(workspaceFolder, task.label);
        if (!resolvedTask) {
            return;
        }
        await this._taskService.run(resolvedTask, undefined, 1 /* TaskRunSource.User */);
    }
    getPinnedTaskLabel(repository) {
        if (!repository) {
            return observableValue('pinnedTaskLabel', undefined);
        }
        const key = repository.toString();
        let obs = this._pinnedTaskObservables.get(key);
        if (!obs) {
            obs = observableValue('pinnedTaskLabel', this._pinnedTaskLabels.get(key));
            this._pinnedTaskObservables.set(key, obs);
        }
        return obs;
    }
    setPinnedTaskLabel(repository, taskLabel) {
        if (!repository) {
            return;
        }
        this._setPinnedTaskLabelForKey(repository.toString(), taskLabel);
    }
    // --- private helpers ---
    _getSessionRepo(session) {
        return session.workspace.get()?.repositories[0];
    }
    _getTasksJsonUri(session, target) {
        if (target === 'workspace') {
            const repo = this._getSessionRepo(session);
            const folder = repo?.workingDirectory ?? repo?.uri;
            return folder ? joinPath(folder, '.vscode', 'tasks.json') : undefined;
        }
        return joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
    }
    async _readTasksJson(uri) {
        try {
            const content = await this._fileService.readFile(uri);
            return parse(content.value.toString());
        }
        catch {
            return {};
        }
    }
    _isSupportedTask(task) {
        return !!task.label;
    }
    _ensureFileWatch(folder) {
        const tasksUri = joinPath(folder, '.vscode', 'tasks.json');
        if (this._watchedResource && this._watchedResource.toString() === tasksUri.toString()) {
            return;
        }
        this._watchedResource = tasksUri;
        const disposables = new DisposableStore();
        // Watch workspace tasks.json
        disposables.add(this._fileService.watch(tasksUri));
        // Also watch user-level tasks.json so that user session tasks changes refresh the observable
        const userUri = joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
        disposables.add(this._fileService.watch(userUri));
        disposables.add(this._fileService.onDidFilesChange(e => {
            if (e.affects(tasksUri) || e.affects(userUri)) {
                this._refreshSessionTasks(folder);
            }
        }));
        this._fileWatcher.value = disposables;
    }
    async _refreshSessionTasks(folder) {
        if (!folder) {
            transaction(tx => this._sessionTasks.set([], tx));
            return;
        }
        const tasksUri = joinPath(folder, '.vscode', 'tasks.json');
        const tasksJson = await this._readTasksJson(tasksUri);
        const sessionTasks = (tasksJson.tasks ?? [])
            .filter(t => t.inSessions && this._isSupportedTask(t))
            .map(t => ({ task: t, target: 'workspace' }));
        // Also include user-level session tasks
        const userUri = joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
        const userJson = await this._readTasksJson(userUri);
        const userSessionTasks = (userJson.tasks ?? [])
            .filter(t => t.inSessions && this._isSupportedTask(t))
            .map(t => ({ task: t, target: 'user' }));
        transaction(tx => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
    }
    _loadPinnedTaskLabels() {
        const raw = this._storageService.get(SessionsConfigurationService_1._PINNED_TASK_LABELS_KEY, -1 /* StorageScope.APPLICATION */);
        if (raw) {
            try {
                return new Map(Object.entries(JSON.parse(raw)));
            }
            catch {
                // ignore corrupt data
            }
        }
        return new Map();
    }
    _savePinnedTaskLabels() {
        this._storageService.store(SessionsConfigurationService_1._PINNED_TASK_LABELS_KEY, JSON.stringify(Object.fromEntries(this._pinnedTaskLabels)), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    _setPinnedTaskLabelForKey(key, taskLabel) {
        if (taskLabel === undefined) {
            this._pinnedTaskLabels.delete(key);
        }
        else {
            this._pinnedTaskLabels.set(key, taskLabel);
        }
        this._savePinnedTaskLabels();
        const obs = this._pinnedTaskObservables.get(key);
        if (obs) {
            transaction(tx => obs.set(taskLabel, tx));
        }
    }
};
SessionsConfigurationService = SessionsConfigurationService_1 = __decorate([
    __param(0, IFileService),
    __param(1, IJSONEditingService),
    __param(2, IPreferencesService),
    __param(3, ITaskService),
    __param(4, IWorkspaceContextService),
    __param(5, IStorageService)
], SessionsConfigurationService);
export { SessionsConfigurationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNDb25maWd1cmF0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25zQ29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFlLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUU5RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBR3ZHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQXFHekYsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsZUFBZSxDQUFnQyw4QkFBOEIsQ0FBQyxDQUFDO0FBRXJILElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTs7YUFJbkMsNEJBQXVCLEdBQUcsZ0NBQWdD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