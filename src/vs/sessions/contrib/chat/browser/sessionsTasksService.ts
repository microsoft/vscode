/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { joinPath, dirname } from '../../../../base/common/resources.js';
import { parse } from '../../../../base/common/jsonc.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { IJSONEditingService } from '../../../../workbench/services/configuration/common/jsonEditing.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { CommandString } from '../../../../workbench/contrib/tasks/common/taskConfiguration.js';
import { ISessionTaskRunnerRegistry } from './sessionTaskRunner.js';

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
	readonly inAgents?: boolean;
	readonly runOptions?: ITaskRunOptions;
	readonly windows?: { command?: string; args?: CommandString[] };
	readonly osx?: { command?: string; args?: CommandString[] };
	readonly linux?: { command?: string; args?: CommandString[] };
	readonly dependsOn?: string | readonly string[];
	readonly dependsOrder?: 'sequence' | 'parallel';
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

/**
 * Payload fired by {@link ISessionsTasksService.onDidRunTask} after a
 * session task has been successfully dispatched to its runner.
 */
export interface ISessionTaskRunEvent {
	readonly task: ITaskEntry;
	readonly session: ISession;
}

interface ITasksJson {
	version?: string;
	tasks?: ITaskEntry[];
}

export interface ISessionsTasksService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires after a session task has been successfully dispatched to its
	 * runner via {@link runTask}. Does not fire when the task throws or when
	 * no runner is registered for the session.
	 */
	readonly onDidRunTask: Event<ISessionTaskRunEvent>;

	/**
	 * Observable list of tasks with `inAgents: true`, automatically
	 * updated when the tasks.json file changes. Each entry includes the
	 * storage target the task was loaded from.
	 *
	 * **Note:** This observable is shared across all sessions — repeated
	 * calls with different sessions overwrite it with the most recently
	 * requested session's tasks. It is intended for a single follower
	 * (e.g. the toolbar tracking the active session). Consumers that need
	 * a one-time snapshot for a specific session should use
	 * {@link getSessionTasksOnce} instead.
	 */
	getSessionTasks(session: ISession | IChat): IObservable<readonly ISessionTaskWithTarget[]>;

	/**
	 * Returns a one-shot snapshot of the tasks (with `inAgents: true`) for the
	 * given session or chat, reading from both workspace and user `tasks.json`.
	 *
	 * Unlike {@link getSessionTasks}, this method does NOT touch the shared
	 * per-folder observable, so it is safe to call concurrently for
	 * multiple sessions or chats.
	 */
	getSessionTasksOnce(session: ISession | IChat): Promise<readonly ISessionTaskWithTarget[]>;

	/**
	 * Returns a one-shot snapshot of **all** tasks (with or without `inAgents`)
	 * declared for the given session or chat, reading from both workspace and
	 * user `tasks.json`. Used by the agent-host runner to look up dependency
	 * tasks referenced via `dependsOn`.
	 */
	getAllTasks(session: ISession | IChat): Promise<readonly ISessionTaskWithTarget[]>;

	/**
	 * Returns tasks that do NOT have `inAgents: true` — used as
	 * suggestions in the "Add Run Action" picker.
	 */
	getNonSessionTasks(session: ISession | IChat): Promise<readonly INonSessionTaskEntry[]>;

	/**
	 * Sets `inAgents: true` on an existing task (identified by label),
	 * updating it in place in its tasks.json.
	 */
	addTaskToSessions(task: ITaskEntry, session: ISession | IChat, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void>;

	/**
	 * Creates a new shell task with `inAgents: true` and writes it to
	 * the appropriate tasks.json (user or workspace).
	 */
	createAndAddTask(label: string | undefined, command: string, session: ISession | IChat, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined>;

	/**
	 * Updates an existing task entry, optionally moving it between user and
	 * workspace storage.
	 */
	updateTask(originalTaskLabel: string, updatedTask: ITaskEntry, session: ISession | IChat, currentTarget: TaskStorageTarget, newTarget: TaskStorageTarget): Promise<void>;

	/**
	 * Removes an existing task entry from its tasks.json.
	 */
	removeTask(taskLabel: string, session: ISession | IChat, target: TaskStorageTarget): Promise<void>;

	/**
	 * Runs a task via the task service, looking it up by label in the active
	 * chat's workspace folder when provided.
	 *
	 * May resolve to an {@link IDisposable} that stops the launched task; see
	 * {@link ISessionTaskRunner.runTask}.
	 */
	runTask(task: ITaskEntry, session: ISession, chat?: IChat): Promise<IDisposable | undefined>;

	/**
	 * Observable label of the pinned task for the given repository.
	 */
	getPinnedTaskLabel(repository: URI | undefined): IObservable<string | undefined>;

	/**
	 * Sets or clears the pinned task for the given repository.
	 */
	setPinnedTaskLabel(repository: URI | undefined, taskLabel: string | undefined): void;

	/**
	 * Observable URL configured for the integrated browser action for the given repository.
	 */
	getBrowserUrl(repository: URI | undefined): IObservable<string | undefined>;

	/**
	 * Sets or clears the configured browser URL for the given repository.
	 */
	setBrowserUrl(repository: URI | undefined, url: string | undefined): void;

	/**
	 * Observable indicating whether the integrated browser action is pinned as the primary action for the given repository.
	 */
	getPinnedBrowser(repository: URI | undefined): IObservable<boolean>;

	/**
	 * Sets or clears whether the integrated browser action is pinned as the primary action for the given repository.
	 * Pinning the browser clears any pinned task; pinning a task clears the pinned browser.
	 */
	setPinnedBrowser(repository: URI | undefined, pinned: boolean): void;
}

export const ISessionsTasksService = createDecorator<ISessionsTasksService>('sessionsTasksService');

export class SessionsTasksService extends Disposable implements ISessionsTasksService {

	declare readonly _serviceBrand: undefined;

	private static readonly _PINNED_TASK_LABELS_KEY = 'agentSessions.pinnedTaskLabels';
	private static readonly _BROWSER_URLS_KEY = 'agentSessions.browserUrls';
	private static readonly _PINNED_BROWSERS_KEY = 'agentSessions.pinnedBrowsers';

	private readonly _onDidRunTask = this._register(new Emitter<ISessionTaskRunEvent>());
	readonly onDidRunTask = this._onDidRunTask.event;

	/** The most recently used folders, each read once and again only when its `tasks.json` changes; evicted entries release their watcher. */
	private readonly _folderTasks = new Map<string, { readonly tasks: IObservable<readonly ISessionTaskWithTarget[]>; readonly store: DisposableStore }>();
	/** The current profile's user `tasks.json`, read and watched once for all folders and re-watched when the profile changes. */
	private _userTasks: ISettableObservable<readonly ISessionTaskWithTarget[]> | undefined;
	private readonly _userTasksWatcher = this._register(new MutableDisposable<DisposableStore>());
	private static readonly MaxWatchedFolders = 16;
	private readonly _noTasks = constObservable<readonly ISessionTaskWithTarget[]>([]);
	private readonly _pinnedTaskLabels: Map<string, string>;
	private readonly _pinnedTaskObservables = new Map<string, ReturnType<typeof observableValue<string | undefined>>>();
	private readonly _browserUrls: Map<string, string>;
	private readonly _browserUrlObservables = new Map<string, ReturnType<typeof observableValue<string | undefined>>>();
	private readonly _pinnedBrowsers: Set<string>;
	private readonly _pinnedBrowserObservables = new Map<string, ReturnType<typeof observableValue<boolean>>>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IJSONEditingService private readonly _jsonEditingService: IJSONEditingService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@ISessionTaskRunnerRegistry private readonly _taskRunnerRegistry: ISessionTaskRunnerRegistry,
		@IStorageService private readonly _storageService: IStorageService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super();
		this._register(userDataProfileService.onDidChangeCurrentProfile(() => {
			if (this._userTasks) {
				this._watchUserTasks(this._userTasks);
			}
		}));
		this._pinnedTaskLabels = this._loadPinnedTaskLabels();
		this._browserUrls = this._loadBrowserUrls();
		this._pinnedBrowsers = this._loadPinnedBrowsers();
	}

	getSessionTasks(session: ISession | IChat): IObservable<readonly ISessionTaskWithTarget[]> {
		const folder = this._getSessionFolder(session);
		if (!folder) {
			return this._noTasks;
		}
		const key = folder.toString();
		let entry = this._folderTasks.get(key);
		if (entry) {
			this._folderTasks.delete(key);
		} else {
			entry = this._createFolderTasks(folder);
			for (const [oldest, evicted] of this._folderTasks) {
				if (this._folderTasks.size < SessionsTasksService.MaxWatchedFolders) {
					break;
				}
				evicted.store.dispose();
				this._folderTasks.delete(oldest);
			}
		}
		this._folderTasks.set(key, entry);
		return entry.tasks;
	}

	async getSessionTasksOnce(session: ISession | IChat): Promise<readonly ISessionTaskWithTarget[]> {
		return this._readTasksFromBothTargets(session, t => !!t.inAgents);
	}

	async getAllTasks(session: ISession | IChat): Promise<readonly ISessionTaskWithTarget[]> {
		return this._readTasksFromBothTargets(session, () => true);
	}

	async getNonSessionTasks(session: ISession | IChat): Promise<readonly INonSessionTaskEntry[]> {
		return this._readTasksFromBothTargets(session, t => !t.inAgents);
	}

	/**
	 * Reads tasks from both workspace and user `tasks.json` for a session,
	 * filtering each entry through `predicate` (in addition to the supported-type
	 * check) and tagging it with its storage target.
	 */
	private async _readTasksFromBothTargets(session: ISession | IChat, predicate: (task: ITaskEntry) => boolean): Promise<ISessionTaskWithTarget[]> {
		const result: ISessionTaskWithTarget[] = [];
		const targets: TaskStorageTarget[] = ['workspace', 'user'];
		for (const target of targets) {
			const uri = this._getTasksJsonUri(session, target);
			if (!uri) {
				continue;
			}
			const json = await this._readTasksJson(uri);
			for (const task of json.tasks ?? []) {
				if (predicate(task) && this._isSupportedTask(task)) {
					result.push({ task, target });
				}
			}
		}
		return result;
	}

	async addTaskToSessions(task: ITaskEntry, session: ISession | IChat, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void> {
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
			{ path: ['tasks', index, 'inAgents'], value: true },
		];

		if (options) {
			edits.push({
				path: ['tasks', index, 'runOptions'],
				value: options.runOn && options.runOn !== 'default' ? { runOn: options.runOn } : undefined,
			});
		}

		await this._jsonEditingService.write(tasksJsonUri, edits, true);
	}

	async createAndAddTask(label: string | undefined, command: string, session: ISession | IChat, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined> {
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
			inAgents: true,
			...(options?.runOn && options.runOn !== 'default' ? { runOptions: { runOn: options.runOn } } : {}),
		};

		await this._jsonEditingService.write(tasksJsonUri, [
			{ path: ['version'], value: tasksJson.version ?? '2.0.0' },
			{ path: ['tasks'], value: [...tasks, newTask] }
		], true);

		return newTask;
	}

	async updateTask(originalTaskLabel: string, updatedTask: ITaskEntry, session: ISession | IChat, currentTarget: TaskStorageTarget, newTarget: TaskStorageTarget): Promise<void> {
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
			const updatedTasks = currentTasks.map((task, i) => i === currentIndex ? updatedTask : task);
			await this._jsonEditingService.write(currentTasksJsonUri, [
				{ path: ['tasks'], value: updatedTasks },
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

		const repoUri = this._getSessionRepo(session)?.root;
		if (repoUri) {
			const key = repoUri.toString();
			if (this._pinnedTaskLabels.get(key) === originalTaskLabel) {
				this._setPinnedTaskLabelForKey(key, updatedTask.label);
			}
		}
	}

	async removeTask(taskLabel: string, session: ISession | IChat, target: TaskStorageTarget): Promise<void> {
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

		const repoUri = this._getSessionRepo(session)?.root;
		if (repoUri) {
			const key = repoUri.toString();
			if (this._pinnedTaskLabels.get(key) === taskLabel) {
				this._setPinnedTaskLabelForKey(key, undefined);
			}
		}
	}

	async runTask(task: ITaskEntry, session: ISession, chat?: IChat): Promise<IDisposable | undefined> {
		const runner = this._taskRunnerRegistry.getRunner(session, chat);
		if (!runner) {
			return undefined;
		}
		const handle = await runner.runTask(task, session, chat);
		this._onDidRunTask.fire({ task, session });
		return handle;
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

		const key = repository.toString();
		this._setPinnedTaskLabelForKey(key, taskLabel);
		if (taskLabel !== undefined) {
			this._setPinnedBrowserForKey(key, false);
		}
	}

	getBrowserUrl(repository: URI | undefined): IObservable<string | undefined> {
		if (!repository) {
			return observableValue('browserUrl', undefined);
		}

		const key = repository.toString();
		let obs = this._browserUrlObservables.get(key);
		if (!obs) {
			obs = observableValue('browserUrl', this._browserUrls.get(key));
			this._browserUrlObservables.set(key, obs);
		}
		return obs;
	}

	setBrowserUrl(repository: URI | undefined, url: string | undefined): void {
		if (!repository) {
			return;
		}

		const key = repository.toString();
		const trimmed = url?.trim();
		if (!trimmed) {
			this._browserUrls.delete(key);
		} else {
			this._browserUrls.set(key, trimmed);
		}

		this._saveBrowserUrls();

		const obs = this._browserUrlObservables.get(key);
		if (obs) {
			transaction(tx => obs.set(trimmed || undefined, tx));
		}
	}

	getPinnedBrowser(repository: URI | undefined): IObservable<boolean> {
		if (!repository) {
			return observableValue('pinnedBrowser', false);
		}

		const key = repository.toString();
		let obs = this._pinnedBrowserObservables.get(key);
		if (!obs) {
			obs = observableValue('pinnedBrowser', this._pinnedBrowsers.has(key));
			this._pinnedBrowserObservables.set(key, obs);
		}
		return obs;
	}

	setPinnedBrowser(repository: URI | undefined, pinned: boolean): void {
		if (!repository) {
			return;
		}

		const key = repository.toString();
		this._setPinnedBrowserForKey(key, pinned);
		if (pinned) {
			this._setPinnedTaskLabelForKey(key, undefined);
		}
	}

	// --- private helpers ---

	private _getSessionRepo(session: ISession | IChat) {
		return session.workspace.get()?.folders[0];
	}

	private _getSessionFolder(session: ISession | IChat): URI | undefined {
		const repo = this._getSessionRepo(session);
		return repo?.workingDirectory ?? repo?.root;
	}

	private _getTasksJsonUri(session: ISession | IChat, target: TaskStorageTarget): URI | undefined {
		if (target === 'workspace') {
			return this._getWorkspaceTasksJsonUri(this._getSessionFolder(session));
		}
		return this._getUserTasksJsonUri();
	}

	private _getWorkspaceTasksJsonUri(folder: URI | undefined): URI | undefined {
		return folder?.path ? joinPath(folder, '.vscode', 'tasks.json') : undefined;
	}

	private _getUserTasksJsonUri(): URI | undefined {
		const userSettingsResource = this._preferencesService.userSettingsResource;
		if (!userSettingsResource.path) {
			return undefined;
		}

		const userSettingsFolder = dirname(userSettingsResource);
		return userSettingsFolder.path ? joinPath(userSettingsFolder, 'tasks.json') : undefined;
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

	private _createFolderTasks(folder: URI): { readonly tasks: IObservable<readonly ISessionTaskWithTarget[]>; readonly store: DisposableStore } {
		const store = new DisposableStore();
		const workspaceTasks = observableValue<readonly ISessionTaskWithTarget[]>(this, []);
		const userTasks = this._getUserTasks();
		const tasksUri = this._getWorkspaceTasksJsonUri(folder);
		if (tasksUri) {
			store.add(this._fileService.watch(tasksUri));
			store.add(this._fileService.onDidFilesChange(e => {
				if (e.affects(tasksUri)) {
					this._readTasks(tasksUri, 'workspace').then(tasks => transaction(tx => workspaceTasks.set(tasks, tx)));
				}
			}));
			this._readTasks(tasksUri, 'workspace').then(tasks => transaction(tx => workspaceTasks.set(tasks, tx)));
		}
		return { tasks: derived(this, reader => [...workspaceTasks.read(reader), ...userTasks.read(reader)]), store };
	}

	private _getUserTasks(): IObservable<readonly ISessionTaskWithTarget[]> {
		if (!this._userTasks) {
			this._userTasks = observableValue<readonly ISessionTaskWithTarget[]>(this, []);
			this._watchUserTasks(this._userTasks);
		}
		return this._userTasks;
	}

	private _watchUserTasks(userTasks: ISettableObservable<readonly ISessionTaskWithTarget[]>): void {
		const store = this._userTasksWatcher.value = new DisposableStore();
		const userUri = this._getUserTasksJsonUri();
		if (!userUri) {
			transaction(tx => userTasks.set([], tx));
			return;
		}
		const refresh = () => this._readTasks(userUri, 'user').then(tasks => {
			// Ignore reads of a previous profile's tasks.json that complete after a profile switch
			if (!store.isDisposed) {
				transaction(tx => userTasks.set(tasks, tx));
			}
		});
		store.add(this._fileService.watch(userUri));
		store.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(userUri)) {
				refresh();
			}
		}));
		refresh();
	}

	override dispose(): void {
		this._folderTasks.forEach(entry => entry.store.dispose());
		this._folderTasks.clear();
		super.dispose();
	}

	private async _readTasks(uri: URI, target: TaskStorageTarget): Promise<readonly ISessionTaskWithTarget[]> {
		const json = await this._readTasksJson(uri);
		return (json.tasks ?? [])
			.filter(t => t.inAgents && this._isSupportedTask(t))
			.map(t => ({ task: t, target }));
	}

	private _loadPinnedTaskLabels(): Map<string, string> {
		const raw = this._storageService.get(SessionsTasksService._PINNED_TASK_LABELS_KEY, StorageScope.APPLICATION);
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
			SessionsTasksService._PINNED_TASK_LABELS_KEY,
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

	private _loadBrowserUrls(): Map<string, string> {
		const raw = this._storageService.get(SessionsTasksService._BROWSER_URLS_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				return new Map(Object.entries(JSON.parse(raw)));
			} catch {
				// ignore corrupt data
			}
		}
		return new Map();
	}

	private _saveBrowserUrls(): void {
		this._storageService.store(
			SessionsTasksService._BROWSER_URLS_KEY,
			JSON.stringify(Object.fromEntries(this._browserUrls)),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}

	private _loadPinnedBrowsers(): Set<string> {
		const raw = this._storageService.get(SessionsTasksService._PINNED_BROWSERS_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					return new Set(arr);
				}
			} catch {
				// ignore corrupt data
			}
		}
		return new Set();
	}

	private _savePinnedBrowsers(): void {
		this._storageService.store(
			SessionsTasksService._PINNED_BROWSERS_KEY,
			JSON.stringify([...this._pinnedBrowsers]),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}

	private _setPinnedBrowserForKey(key: string, pinned: boolean): void {
		if (pinned) {
			this._pinnedBrowsers.add(key);
		} else {
			this._pinnedBrowsers.delete(key);
		}

		this._savePinnedBrowsers();

		const obs = this._pinnedBrowserObservables.get(key);
		if (obs) {
			transaction(tx => obs.set(pinned, tx));
		}
	}
}
