/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { joinPath, dirname } from '../../../../base/common/resources.js';
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

export type TaskStorageTarget = 'user' | 'workspace';

/**
 * Shape of a single task entry inside tasks.json.
 */
export interface ITaskEntry {
	readonly label: string;
	readonly type?: string;
	readonly command?: string;
	readonly inSessions?: boolean;
	readonly windows?: { command?: string };
	readonly osx?: { command?: string };
	readonly linux?: { command?: string };
	readonly [key: string]: unknown;
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
	getNonSessionTasks(session: IActiveSessionItem): Promise<readonly ITaskEntry[]>;

	/**
	 * Sets `inSessions: true` on an existing task (identified by label),
	 * updating it in place in its tasks.json.
	 */
	addTaskToSessions(task: ITaskEntry, session: IActiveSessionItem, target: TaskStorageTarget): Promise<void>;

	/**
	 * Creates a new shell task with `inSessions: true` and writes it to
	 * the appropriate tasks.json (user or workspace).
	 */
	createAndAddTask(command: string, session: IActiveSessionItem, target: TaskStorageTarget): Promise<void>;

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

	private readonly _sessionTasks = observableValue<readonly ITaskEntry[]>(this, []);
	private readonly _fileWatcher = this._register(new MutableDisposable());
	/** Maps `cwd.toString() + command` to the terminal `instanceId`. */
	private readonly _taskTerminals = new Map<string, number>();
	private readonly _lastRunTaskLabels: Map<string, string>;
	private readonly _lastRunTaskObservables = new Map<string, ReturnType<typeof observableValue<string | undefined>>>();

	private _watchedResource: URI | undefined;

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
	}

	getSessionTasks(session: IActiveSessionItem): IObservable<readonly ITaskEntry[]> {
		const worktree = session.worktree;
		if (worktree) {
			this._ensureFileWatch(worktree);
		}
		// Trigger initial read
		this._refreshSessionTasks(worktree);
		return this._sessionTasks;
	}

	async getNonSessionTasks(session: IActiveSessionItem): Promise<readonly ITaskEntry[]> {
		const allTasks = await this._readAllTasks(session);
		return allTasks.filter(t => !t.inSessions);
	}

	async addTaskToSessions(task: ITaskEntry, session: IActiveSessionItem, target: TaskStorageTarget): Promise<void> {
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

		await this._jsonEditingService.write(tasksJsonUri, [
			{ path: ['tasks', index, 'inSessions'], value: true }
		], true);

		if (target === 'workspace') {
			await this._commitTasksFile(session);
		}
	}

	async createAndAddTask(command: string, session: IActiveSessionItem, target: TaskStorageTarget): Promise<void> {
		const tasksJsonUri = this._getTasksJsonUri(session, target);
		if (!tasksJsonUri) {
			return;
		}

		const tasksJson = await this._readTasksJson(tasksJsonUri);
		const tasks = tasksJson.tasks ?? [];
		const newTask: ITaskEntry = {
			label: command,
			type: 'shell',
			command,
			inSessions: true,
		};

		await this._jsonEditingService.write(tasksJsonUri, [
			{ path: ['version'], value: tasksJson.version ?? '2.0.0' },
			{ path: ['tasks'], value: [...tasks, newTask] }
		], true);

		if (target === 'workspace') {
			await this._commitTasksFile(session);
		}
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
			const worktree = session.worktree;
			return worktree ? joinPath(worktree, '.vscode', 'tasks.json') : undefined;
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
				result.push(...workspaceJson.tasks);
			}
		}

		// Read user tasks
		const userUri = this._getTasksJsonUri(session, 'user');
		if (userUri) {
			const userJson = await this._readTasksJson(userUri);
			if (userJson.tasks) {
				result.push(...userJson.tasks);
			}
		}

		return result;
	}

	private _resolveCommand(task: ITaskEntry): string | undefined {
		if (isWindows && task.windows?.command) {
			return task.windows.command;
		}
		if (isMacintosh && task.osx?.command) {
			return task.osx.command;
		}
		if (!isWindows && !isMacintosh && task.linux?.command) {
			return task.linux.command;
		}
		return task.command;
	}

	private _ensureFileWatch(worktree: URI): void {
		const tasksUri = joinPath(worktree, '.vscode', 'tasks.json');
		if (this._watchedResource && this._watchedResource.toString() === tasksUri.toString()) {
			return;
		}
		this._watchedResource = tasksUri;

		const disposables = new DisposableStore();

		disposables.add(this._fileService.watch(tasksUri));
		disposables.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(tasksUri)) {
				this._refreshSessionTasks(worktree);
			}
		}));

		this._fileWatcher.value = disposables;
	}

	private async _refreshSessionTasks(worktree: URI | undefined): Promise<void> {
		if (!worktree) {
			transaction(tx => this._sessionTasks.set([], tx));
			return;
		}

		const tasksUri = joinPath(worktree, '.vscode', 'tasks.json');
		const tasksJson = await this._readTasksJson(tasksUri);
		const sessionTasks = (tasksJson.tasks ?? []).filter(t => t.inSessions);

		// Also include user-level session tasks
		const userUri = joinPath(dirname(this._preferencesService.userSettingsResource), 'tasks.json');
		const userJson = await this._readTasksJson(userUri);
		const userSessionTasks = (userJson.tasks ?? []).filter(t => t.inSessions);

		transaction(tx => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
	}

	private async _commitTasksFile(session: IActiveSessionItem): Promise<void> {
		const worktree = session.worktree;
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
