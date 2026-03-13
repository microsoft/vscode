/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { joinPath, dirname, isEqual } from '../../../../base/common/resources.js';
import { parse } from '../../../../base/common/jsonc.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IJSONEditingService } from '../../../../workbench/services/configuration/common/jsonEditing.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { CommandString } from '../../../../workbench/contrib/tasks/common/taskConfiguration.js';

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

interface ITasksJson {
	version?: string;
	tasks?: ITaskEntry[];
}

export interface ISessionsConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable list of tasks with `inSessions: true`, automatically
	 * updated when the tasks.json file changes.
	 */
	getSessionTasks(session: IActiveSessionItem): IObservable<readonly ITaskEntry[]>;

	/**
	 * Returns tasks that do NOT have `inSessions: true` — used as
	 * suggestions in the "Add Run Action" picker.
	 */
	getNonSessionTasks(session: IActiveSessionItem): Promise<readonly INonSessionTaskEntry[]>;

	/**
	 * Sets `inSessions: true` on an existing task (identified by label),
	 * updating it in place in its tasks.json.
	 */
	addTaskToSessions(task: ITaskEntry, session: IActiveSessionItem, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void>;

	/**
	 * Creates a new shell task with `inSessions: true` and writes it to
	 * the appropriate tasks.json (user or workspace).
	 */
	createAndAddTask(label: string | undefined, command: string, session: IActiveSessionItem, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined>;

	/**
	 * Runs a task entry in a terminal, resolving the correct platform
	 * command and using the session worktree as cwd.
	 */
	runTask(task: ITaskEntry, session: IActiveSessionItem): Promise<void>;

	/**
	 * Observable label of the most recently run task for the given repository.
	 */
	getLastRunTaskLabel(repository: URI | undefined): IObservable<string | undefined>;
}

export const ISessionsConfigurationService = createDecorator<ISessionsConfigurationService>('sessionsConfigurationService');

export class SessionsConfigurationService extends Disposable implements ISessionsConfigurationService {

	declare readonly _serviceBrand: undefined;

	private static readonly _LAST_RUN_TASK_LABELS_KEY = 'agentSessions.lastRunTaskLabels';
	private static readonly _SUPPORTED_TASK_TYPES = new Set(['shell', 'npm']);

	private readonly _sessionTasks = observableValue<readonly ITaskEntry[]>(this, []);
	private readonly _fileWatcher = this._register(new MutableDisposable());
	/** Maps `cwd.toString() + command` to the terminal `instanceId`. */
	private readonly _taskTerminals = new Map<string, number>();
	private readonly _knownSessionWorktrees = new Map<string, string | undefined>();
	private readonly _lastRunTaskLabels: Map<string, string>;
	private readonly _lastRunTaskObservables = new Map<string, ReturnType<typeof observableValue<string | undefined>>>();

	private _watchedResource: URI | undefined;
	private _lastRefreshedFolder: URI | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IJSONEditingService private readonly _jsonEditingService: IJSONEditingService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._lastRunTaskLabels = this._loadLastRunTaskLabels();

		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			this._handleActiveSessionChange(activeSession);
		}));
	}

	getSessionTasks(session: IActiveSessionItem): IObservable<readonly ITaskEntry[]> {
		const folder = session.worktree ?? session.repository;
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

	async getNonSessionTasks(session: IActiveSessionItem): Promise<readonly INonSessionTaskEntry[]> {
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

	async addTaskToSessions(task: ITaskEntry, session: IActiveSessionItem, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<void> {
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

	async createAndAddTask(label: string | undefined, command: string, session: IActiveSessionItem, target: TaskStorageTarget, options?: ITaskRunOptions): Promise<ITaskEntry | undefined> {
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

	async runTask(task: ITaskEntry, session: IActiveSessionItem): Promise<void> {
		const command = this._resolveCommand(task);
		if (!command) {
			return;
		}

		const cwd = session.worktree ?? session.repository;
		if (!cwd) {
			return;
		}

		const terminalKey = `${cwd.toString()}${command}`;
		let terminal = this._getExistingTerminalInstance(terminalKey);
		if (!terminal) {
			terminal = await this._terminalService.createTerminal({
				location: TerminalLocation.Panel,
				config: { name: task.label },
				cwd
			});
			this._taskTerminals.set(terminalKey, terminal.instanceId);
		}
		await terminal.sendText(command, true);
		this._terminalService.setActiveInstance(terminal);
		await this._terminalService.revealActiveTerminal();

		if (session.repository) {
			const key = session.repository.toString();
			this._lastRunTaskLabels.set(key, task.label);
			this._saveLastRunTaskLabels();
			const obs = this._lastRunTaskObservables.get(key);
			if (obs) {
				transaction(tx => obs.set(task.label, tx));
			}
		}
	}

	getLastRunTaskLabel(repository: URI | undefined): IObservable<string | undefined> {
		if (!repository) {
			return observableValue('lastRunTaskLabel', undefined);
		}
		const key = repository.toString();
		let obs = this._lastRunTaskObservables.get(key);
		if (!obs) {
			obs = observableValue('lastRunTaskLabel', this._lastRunTaskLabels.get(key));
			this._lastRunTaskObservables.set(key, obs);
		}
		return obs;
	}

	// --- private helpers ---

	private _getExistingTerminalInstance(terminalKey: string): ITerminalInstance | undefined {
		const instanceId = this._taskTerminals.get(terminalKey);
		if (instanceId === undefined) {
			return undefined;
		}
		const instance = this._terminalService.instances.find(i => i.instanceId === instanceId);
		if (!instance || instance.hasChildProcesses) {
			this._taskTerminals.delete(terminalKey);
			return undefined;
		}
		return instance;
	}

	private _getTasksJsonUri(session: IActiveSessionItem, target: TaskStorageTarget): URI | undefined {
		if (target === 'workspace') {
			const folder = session.worktree ?? session.repository;
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

	private async _readAllTasks(session: IActiveSessionItem): Promise<readonly ITaskEntry[]> {
		const result: ITaskEntry[] = [];

		// Read workspace tasks
		const workspaceUri = this._getTasksJsonUri(session, 'workspace');
		if (workspaceUri) {
			const workspaceJson = await this._readTasksJson(workspaceUri);
			if (workspaceJson.tasks) {
				result.push(...workspaceJson.tasks.filter(t => this._isSupportedTask(t)));
			}
		}

		// Read user tasks
		const userUri = this._getTasksJsonUri(session, 'user');
		if (userUri) {
			const userJson = await this._readTasksJson(userUri);
			if (userJson.tasks) {
				result.push(...userJson.tasks.filter(t => this._isSupportedTask(t)));
			}
		}

		return result;
	}

	private _isSupportedTask(task: ITaskEntry): boolean {
		return !!task.type && SessionsConfigurationService._SUPPORTED_TASK_TYPES.has(task.type);
	}

	private _resolveCommand(task: ITaskEntry): string | undefined {
		if (task.type === 'npm') {
			if (!task.script) {
				return undefined;
			}
			const base = task.path
				? `npm --prefix ${task.path} run ${task.script}`
				: `npm run ${task.script}`;
			return this._appendArgs(base, task.args);
		}

		let command: string | undefined;
		let platformArgs: CommandString[] | undefined;

		if (isWindows && task.windows?.command) {
			command = task.windows.command;
			platformArgs = task.windows.args;
		} else if (isMacintosh && task.osx?.command) {
			command = task.osx.command;
			platformArgs = task.osx.args;
		} else if (!isWindows && !isMacintosh && task.linux?.command) {
			command = task.linux.command;
			platformArgs = task.linux.args;
		} else {
			command = task.command;
		}

		// Platform-specific args override task-level args
		const args = platformArgs ?? task.args;
		return this._appendArgs(command, args);
	}

	private _appendArgs(command: string | undefined, args: CommandString[] | undefined): string | undefined {
		if (!command) {
			return undefined;
		}
		if (!args || args.length === 0) {
			return command;
		}
		const resolvedArgs = args.map(a => CommandString.value(a)).join(' ');
		return `${command} ${resolvedArgs}`;
	}

	private _handleActiveSessionChange(session: IActiveSessionItem | undefined): void {
		if (!session) {
			return;
		}

		const sessionKey = session.resource.toString();
		const currentWorktree = session.worktree?.toString();
		if (!this._knownSessionWorktrees.has(sessionKey)) {
			this._knownSessionWorktrees.set(sessionKey, currentWorktree);
			return;
		}

		const previousWorktree = this._knownSessionWorktrees.get(sessionKey);
		this._knownSessionWorktrees.set(sessionKey, currentWorktree);
		if (!currentWorktree || previousWorktree === currentWorktree) {
			return;
		}

		void this._runWorktreeCreatedTasks(session);
	}

	private async _runWorktreeCreatedTasks(session: IActiveSessionItem): Promise<void> {
		const tasks = await this._readAllTasks(session);
		for (const task of tasks) {
			if (!task.inSessions || task.runOptions?.runOn !== 'worktreeCreated') {
				continue;
			}
			await this.runTask(task, session);
		}
	}

	private _ensureFileWatch(folder: URI): void {
		const tasksUri = joinPath(folder, '.vscode', 'tasks.json');
		if (this._watchedResource && this._watchedResource.toString() === tasksUri.toString()) {
			return;
		}
		this._watchedResource = tasksUri;

		const disposables = new DisposableStore();

		disposables.add(this._fileService.watch(tasksUri));
		disposables.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(tasksUri)) {
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
		const sessionTasks = (tasksJson.tasks ?? []).filter(t => t.inSessions && this._isSupportedTask(t));

		// Also include user-level session tasks
		const userUri = joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
		const userJson = await this._readTasksJson(userUri);
		const userSessionTasks = (userJson.tasks ?? []).filter(t => t.inSessions && this._isSupportedTask(t));

		transaction(tx => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
	}

	private async _commitTasksFile(session: IActiveSessionItem): Promise<void> {
		const worktree = session.worktree; // Only commit if there's a worktree. The local scenario does not need it
		if (!worktree) {
			return;
		}
		const tasksUri = joinPath(worktree, '.vscode', 'tasks.json');
		await this._sessionsManagementService.commitWorktreeFiles(session, [tasksUri]);
	}

	private _loadLastRunTaskLabels(): Map<string, string> {
		const raw = this._storageService.get(SessionsConfigurationService._LAST_RUN_TASK_LABELS_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				return new Map(Object.entries(JSON.parse(raw)));
			} catch {
				// ignore corrupt data
			}
		}
		return new Map();
	}

	private _saveLastRunTaskLabels(): void {
		this._storageService.store(
			SessionsConfigurationService._LAST_RUN_TASK_LABELS_KEY,
			JSON.stringify(Object.fromEntries(this._lastRunTaskLabels)),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}
}
