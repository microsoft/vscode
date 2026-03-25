/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { joinPath, dirname, isEqual } from '../../../../base/common/resources.js';
import { parse } from '../../../../base/common/jsonc.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionData } from '../../sessions/common/sessionData.js';
import { IJSONEditingService } from '../../../../workbench/services/configuration/common/jsonEditing.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { CommandString } from '../../../../workbench/contrib/tasks/common/taskConfiguration.js';
import { TaskRunSource } from '../../../../workbench/contrib/tasks/common/tasks.js';
import { ITaskService } from '../../../../workbench/contrib/tasks/common/taskService.js';

export type TaskStorageTarget = 'user' | 'workspace';
type TaskRunOnOption = 'default' | 'folderOpen' | 'worktreeCreated';

interface ITaskRunOptions {
	readonly runOn?: TaskRunOnOption;
}

/**
 * Shape of a single task entry inside tasks.json.
 */
export interface ITaskEntry {
	readonly label: string;
	readonly task?: CommandString;
	readonly script?: string;
	readonly type?: string;
	readonly command?: string;
	readonly args?: CommandString[];
	readonly inSessions?: boolean;
	readonly runOptions?: ITaskRunOptions;
	readonly windows?: { command?: string; args?: CommandString[] };
	readonly osx?: { command?: string; args?: CommandString[] };
	readonly linux?: { command?: string; args?: CommandString[] };
	readonly [key: string]: unknown;
}

export interface INonSessionTaskEntry {
	readonly task: ITaskEntry;
	readonly target: TaskStorageTarget;
}

/**
 * A session task together with the storage target it was loaded from.
 */
export interface ISessionTaskWithTarget {
	readonly task: ITaskEntry;
	readonly target: TaskStorageTarget;
}

interface ITasksJson {
	version?: string;
	tasks?: ITaskEntry[];
}

export interface ISessionsConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable list of tasks with `inSessions: true`, automatically
	 * updated when the tasks.json file changes. Each entry includes the
	 * storage target the task was loaded from.
	 */
	getSessionTasks(session: ISessionData): IObservable<readonly ISessionTaskWithTarget[]>;

	/**
	 * Returns tasks that do NOT have `inSessions: true` — used as
	 * suggestions in the "Add Run Action" picker.
	 */
	getNonSessionTasks(session: ISessionData): Promise<readonly INonSessionTaskEntry[]>;

	/**
	 * Sets `inSessions: true` on an existing task (identified by label),
	 * updating it in place in its tasks.json.
	 */
	addTaskToSessions(task: ITaskEntry, session: ISessionData, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void>;

	/**
	 * Creates a new shell task with `inSessions: true` and writes it to
	 * the appropriate tasks.json (user or workspace).
	 */
	createAndAddTask(label: string | undefined, command: string, session: ISessionData, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined>;

	/**
	 * Updates an existing task entry, optionally moving it between user and
	 * workspace storage.
	 */
	updateTask(originalTaskLabel: string, updatedTask: ITaskEntry, session: ISessionData, currentTarget: TaskStorageTarget, newTarget: TaskStorageTarget): Promise<void>;

	/**
	 * Removes an existing task entry from its tasks.json.
	 */
	removeTask(taskLabel: string, session: ISessionData, target: TaskStorageTarget): Promise<void>;

	/**
	 * Runs a task via the task service, looking it up by label in the
	 * workspace folder corresponding to the session worktree.
	 */
	runTask(task: ITaskEntry, session: ISessionData): Promise<void>;

	/**
	 * Observable label of the pinned task for the given repository.
	 */
	getPinnedTaskLabel(repository: URI | undefined): IObservable<string | undefined>;

	/**
	 * Sets or clears the pinned task for the given repository.
	 */
	setPinnedTaskLabel(repository: URI | undefined, taskLabel: string | undefined): void;
}

export const ISessionsConfigurationService = createDecorator<ISessionsConfigurationService>('sessionsConfigurationService');

export class SessionsConfigurationService extends Disposable implements ISessionsConfigurationService {

	declare readonly _serviceBrand: undefined;

	private static readonly _PINNED_TASK_LABELS_KEY = 'agentSessions.pinnedTaskLabels';
	private readonly _sessionTasks = observableValue<readonly ISessionTaskWithTarget[]>(this, []);
	private readonly _fileWatcher = this._register(new MutableDisposable());
	private readonly _pinnedTaskLabels: Map<string, string>;
	private readonly _pinnedTaskObservables = new Map<string, ReturnType<typeof observableValue<string | undefined>>>();

	private _watchedResource: URI | undefined;
	private _lastRefreshedFolder: URI | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IJSONEditingService private readonly _jsonEditingService: IJSONEditingService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._pinnedTaskLabels = this._loadPinnedTaskLabels();
	}

	getSessionTasks(session: ISessionData): IObservable<readonly ISessionTaskWithTarget[]> {
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

	async getNonSessionTasks(session: ISessionData): Promise<readonly INonSessionTaskEntry[]> {
		const result: INonSessionTaskEntry[] = [];

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

	async addTaskToSessions(task: ITaskEntry, session: ISessionData, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void> {
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

		const edits: { path: (string | number)[]; value: unknown }[] = [
			{ path: ['tasks', index, 'inSessions'], value: true },
		];

		if (options) {
			edits.push({
				path: ['tasks', index, 'runOptions'],
				value: options.runOn && options.runOn !== 'default' ? { runOn: options.runOn } : undefined,
			});
		}

		await this._jsonEditingService.write(tasksJsonUri, edits, true);

		if (target === 'workspace') {
			await this._commitTasksFile(session);
		}
	}

	async createAndAddTask(label: string | undefined, command: string, session: ISessionData, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined> {
		const tasksJsonUri = this._getTasksJsonUri(session, target);
		if (!tasksJsonUri) {
			return undefined;
		}

		const tasksJson = await this._readTasksJson(tasksJsonUri);
		const tasks = tasksJson.tasks ?? [];
		const resolvedLabel = label?.trim() || command;
		const newTask: ITaskEntry = {
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

		if (target === 'workspace') {
			await this._commitTasksFile(session);
		}

		return newTask;
	}

	async updateTask(originalTaskLabel: string, updatedTask: ITaskEntry, session: ISessionData, currentTarget: TaskStorageTarget, newTarget: TaskStorageTarget): Promise<void> {
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
		} else {
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

		if (currentTarget === 'workspace' || newTarget === 'workspace') {
			await this._commitTasksFile(session);
		}

		const repoUri = this._getSessionRepo(session)?.uri;
		if (repoUri) {
			const key = repoUri.toString();
			if (this._pinnedTaskLabels.get(key) === originalTaskLabel) {
				this._setPinnedTaskLabelForKey(key, updatedTask.label);
			}
		}
	}

	async removeTask(taskLabel: string, session: ISessionData, target: TaskStorageTarget): Promise<void> {
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

		if (target === 'workspace') {
			await this._commitTasksFile(session);
		}

		const repoUri = this._getSessionRepo(session)?.uri;
		if (repoUri) {
			const key = repoUri.toString();
			if (this._pinnedTaskLabels.get(key) === taskLabel) {
				this._setPinnedTaskLabelForKey(key, undefined);
			}
		}
	}

	async runTask(task: ITaskEntry, session: ISessionData): Promise<void> {
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

		await this._taskService.run(resolvedTask, undefined, TaskRunSource.User);
	}

	getPinnedTaskLabel(repository: URI | undefined): IObservable<string | undefined> {
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

	setPinnedTaskLabel(repository: URI | undefined, taskLabel: string | undefined): void {
		if (!repository) {
			return;
		}

		this._setPinnedTaskLabelForKey(repository.toString(), taskLabel);
	}

	// --- private helpers ---

	private _getSessionRepo(session: ISessionData) {
		return session.workspace.get()?.repositories[0];
	}

	private _getTasksJsonUri(session: ISessionData, target: TaskStorageTarget): URI | undefined {
		if (target === 'workspace') {
			const repo = this._getSessionRepo(session);
			const folder = repo?.workingDirectory ?? repo?.uri;
			return folder ? joinPath(folder, '.vscode', 'tasks.json') : undefined;
		}
		return joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
	}

	private async _readTasksJson(uri: URI): Promise<ITasksJson> {
		try {
			const content = await this._fileService.readFile(uri);
			return parse<ITasksJson>(content.value.toString());
		} catch {
			return {};
		}
	}

	private _isSupportedTask(task: ITaskEntry): boolean {
		return !!task.label;
	}

	private _ensureFileWatch(folder: URI): void {
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

	private async _refreshSessionTasks(folder: URI | undefined): Promise<void> {
		if (!folder) {
			transaction(tx => this._sessionTasks.set([], tx));
			return;
		}

		const tasksUri = joinPath(folder, '.vscode', 'tasks.json');
		const tasksJson = await this._readTasksJson(tasksUri);
		const sessionTasks: ISessionTaskWithTarget[] = (tasksJson.tasks ?? [])
			.filter(t => t.inSessions && this._isSupportedTask(t))
			.map(t => ({ task: t, target: 'workspace' as TaskStorageTarget }));

		// Also include user-level session tasks
		const userUri = joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
		const userJson = await this._readTasksJson(userUri);
		const userSessionTasks: ISessionTaskWithTarget[] = (userJson.tasks ?? [])
			.filter(t => t.inSessions && this._isSupportedTask(t))
			.map(t => ({ task: t, target: 'user' as TaskStorageTarget }));

		transaction(tx => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
	}

	private async _commitTasksFile(session: ISessionData): Promise<void> {
		const worktree = this._getSessionRepo(session)?.workingDirectory; // Only commit if there's a worktree. The local scenario does not need it
		if (!worktree) {
			return;
		}
		const tasksUri = joinPath(worktree, '.vscode', 'tasks.json');
		await this._sessionsManagementService.commitWorktreeFiles(session, [tasksUri]);
	}

	private _loadPinnedTaskLabels(): Map<string, string> {
		const raw = this._storageService.get(SessionsConfigurationService._PINNED_TASK_LABELS_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				return new Map(Object.entries(JSON.parse(raw)));
			} catch {
				// ignore corrupt data
			}
		}
		return new Map();
	}

	private _savePinnedTaskLabels(): void {
		this._storageService.store(
			SessionsConfigurationService._PINNED_TASK_LABELS_KEY,
			JSON.stringify(Object.fromEntries(this._pinnedTaskLabels)),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}

	private _setPinnedTaskLabelForKey(key: string, taskLabel: string | undefined): void {
		if (taskLabel === undefined) {
			this._pinnedTaskLabels.delete(key);
		} else {
			this._pinnedTaskLabels.set(key, taskLabel);
		}

		this._savePinnedTaskLabels();

		const obs = this._pinnedTaskObservables.get(key);
		if (obs) {
			transaction(tx => obs.set(taskLabel, tx));
		}
	}
}
