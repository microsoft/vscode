/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { getSessionWorktreeFolder, getWorktreeFilterKey, getWorktreeFilterOptions, getWorktreeSessionToOpen, ISessionWorktreeFolder, IWorktreeFilterSession, WorktreeLastSessions } from '../../../../../platform/agentHost/common/sessionWorktreeFolders.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSessionApplication, UNKNOWN_SESSION_APPLICATION_ID } from '../../../../services/sessions/common/sessionApplication.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';
import { isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';

export type SessionFilter =
	| { readonly kind: 'harness' | 'environment' | 'worktree'; readonly id: string }
	| { readonly kind: 'application'; readonly environment: string; readonly id: string };

export interface ISessionFilterOption {
	readonly filter: SessionFilter;
	readonly label: string;
	readonly group: string;
}

export interface IInboxWorkspaceFilter {
	readonly environment: string;
	readonly resource: string;
	readonly label: string;
	readonly description?: string;
}

export interface IInboxScope {
	readonly environment?: { readonly id: string; readonly label: string };
	readonly workspace?: IInboxWorkspaceFilter | 'none';
}

export function getInboxWorkspaceFilter(session: ISession, reader?: IReader): IInboxWorkspaceFilter | undefined {
	const workspace = session.workspace.read(reader);
	if (!workspace || session.isQuickChat?.read(reader)) {
		return undefined;
	}
	return {
		environment: session.environment,
		resource: getComparisonKey(workspace.uri),
		label: workspace.label,
		description: workspace.description ?? workspace.uri.path,
	};
}

export function getInboxWorkspaceOptions(sessions: readonly ISession[], environment?: string, reader?: IReader): IInboxWorkspaceFilter[] {
	const options = new Map<string, IInboxWorkspaceFilter>();
	for (const session of sessions) {
		const workspace = getInboxWorkspaceFilter(session, reader);
		if (workspace && (environment === undefined || workspace.environment === environment)) {
			options.set(JSON.stringify([workspace.environment, workspace.resource]), workspace);
		}
	}
	return [...options.values()].sort((a, b) => a.label.localeCompare(b.label) || a.resource.localeCompare(b.resource) || a.environment.localeCompare(b.environment));
}

function isInboxScope(value: unknown): value is IInboxScope {
	if (!isObject(value)) {
		return false;
	}
	const environment = 'environment' in value ? value.environment : undefined;
	const workspace = 'workspace' in value ? value.workspace : undefined;
	return (environment === undefined || typeof environment === 'object' && environment !== null
		&& 'id' in environment && typeof environment.id === 'string' && environment.id.length > 0
		&& 'label' in environment && typeof environment.label === 'string')
		&& (workspace === undefined || workspace === 'none' || typeof workspace === 'object' && workspace !== null
			&& 'environment' in workspace && typeof workspace.environment === 'string'
			&& 'resource' in workspace && typeof workspace.resource === 'string' && workspace.resource.length > 0
			&& 'label' in workspace && typeof workspace.label === 'string'
			&& (!('description' in workspace) || workspace.description === undefined || typeof workspace.description === 'string'));
}

export function sessionFilterKey(filter: SessionFilter): string {
	return JSON.stringify(filter.kind === 'application' ? [filter.kind, filter.environment, filter.id] : [filter.kind, filter.id]);
}

/**
 * Where `session` works, for the Worktrees filter: the worktree of its first folder, else that folder's working directory,
 * of the folder's repository. Quick chats and sessions without a folder have none, and no Worktrees filter hides them.
 */
export function getSessionWorktreeFilterFolder(session: Pick<ISession, 'workspace' | 'isQuickChat'>, reader?: IReader): ISessionWorktreeFolder | undefined {
	if (session.isQuickChat?.read(reader)) {
		return undefined;
	}
	const folder = session.workspace.read(reader)?.folders[0];
	return folder && getSessionWorktreeFolder(folder.gitRepository?.workTreeUri ?? folder.workingDirectory, folder.gitRepository?.uri);
}

/**
 * Whether a window's Sessions list lists quick chats, which have no workspace: always in the Agents window, and in an editor
 * window only while it has no folder, following its folders as they are added and removed.
 */
export function listsQuickChatsIn(isSessionsWindow: boolean, workspaceContextService: IWorkspaceContextService): IObservable<boolean> {
	const foldersChanged = observableSignalFromEvent('workspaceFolders', workspaceContextService.onDidChangeWorkspaceFolders);
	return derived(reader => {
		foldersChanged.read(reader);
		return isSessionsWindow || workspaceContextService.getWorkspace().folders.length === 0;
	});
}

/** Orders environments as the Environment filter lists them: this computer, the cloud, then remote hosts by name. */
export function compareSessionEnvironments(a: ISessionEnvironment, b: ISessionEnvironment): number {
	const rank = (id: string) => id === 'local' ? 0 : id === 'cloud' ? 1 : 2;
	return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

/**
 * Sessions list state that Reset Filters returns to its default. Reset Filters
 * captures every such state before resetting it, so that undoing the reset
 * restores the list exactly as it was.
 */
export interface ISessionsListResettableState {
	/** Captures the current state and returns a function that restores it. */
	capture(): () => void;
	/** Returns the state to its default. */
	reset(): void;
}

export function getSessionEnvironments(environments: readonly ISessionEnvironment[]): ISessionEnvironment[] {
	const byId = new Map<string, ISessionEnvironment>([
		['local', { id: 'local', label: localize('environment.local', "This Computer") }],
		['cloud', { id: 'cloud', label: localize('environment.cloud', "Cloud") }],
	]);
	for (const environment of environments) {
		byId.set(environment.id, environment);
	}
	return [...byId.values()].sort(compareSessionEnvironments);
}

/** Sharing registrations of this computer are already represented by This Computer. */
export function getSessionFilterEnvironments(providers: readonly ISessionsProvider[], reader?: IReader): { environments: ISessionEnvironment[]; localEnvironmentIds: ReadonlySet<string> } {
	const environments: ISessionEnvironment[] = [];
	const localEnvironmentIds = new Set<string>();
	for (const provider of providers) {
		if (isAgentHostProvider(provider) && provider.localRegistration?.read(reader)) {
			localEnvironmentIds.add(provider.environment.id);
		} else {
			environments.push(provider.environment);
		}
	}
	return { environments, localEnvironmentIds };
}

/**
 * The filter options for the given sessions. Only sessions the list includes, as
 * decided by `isSessionListed`, contribute their creating applications.
 */
export function getSessionFilterOptions(sessions: readonly ISession[], environments: readonly ISessionEnvironment[], isSessionListed: (session: ISession, reader: IReader | undefined) => boolean, reader?: IReader): ISessionFilterOption[] {
	const options: ISessionFilterOption[] = [
		{ filter: { kind: 'harness', id: 'copilot' }, label: localize('harness.copilot', "Copilot"), group: '1_harnesses' },
		{ filter: { kind: 'harness', id: 'claude' }, label: localize('harness.claude', "Claude"), group: '1_harnesses' },
		{ filter: { kind: 'harness', id: 'codex' }, label: localize('harness.codex', "Codex"), group: '1_harnesses' },
	];
	const ordered = getSessionEnvironments(environments);
	for (const environment of ordered) {
		if (environment.isConnected?.read(reader) !== false) {
			options.push({ filter: { kind: 'environment', id: environment.id }, label: environment.label, group: '2_environments' });
		}
	}
	const vscodeApplication = getSessionApplication('vscode');
	for (const [index, environment] of ordered.entries()) {
		const applications = new Map<string, string>();
		for (const session of sessions) {
			if (session.environment === environment.id && isSessionListed(session, reader)) {
				const application = session.application.read(reader);
				if (application.id !== UNKNOWN_SESSION_APPLICATION_ID) {
					applications.set(application.id, application.label);
				}
			}
		}
		if (applications.size > 0 || environment.isConnected?.read(reader) !== false) {
			applications.set(vscodeApplication.id, vscodeApplication.label);
		}
		for (const [id, label] of [...applications].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) {
			options.push({
				filter: { kind: 'application', environment: environment.id, id },
				label: localize('application.environment', "{0} ({1})", label, environment.label),
				group: `3_applications_${String(index).padStart(6, '0')}`,
			});
		}
	}
	// The worktrees that listed sessions not archived work in, with their repository's own folder
	for (const option of getListedWorktreeOptions(sessions, isSessionListed, reader)) {
		options.push({ filter: { kind: 'worktree', id: option.key }, label: option.label, group: option.isRepository ? '4_worktrees_1_repository' : '4_worktrees_2_worktrees' });
	}
	return options;
}

/** `session` as the Worktrees filter picks one to open as the user picks its folder. */
export function getWorktreeFilterSession(session: ISession): IWorktreeFilterSession {
	const worktree = getSessionWorktreeFilterFolder(session);
	return {
		id: session.sessionId,
		worktree: worktree && getWorktreeFilterKey(worktree.folder),
		isArchived: session.isArchived.get(),
		time: (session.updatedAt.get() ?? session.createdAt).getTime(),
	};
}

/** The Worktrees filter's options: the folders that listed sessions not archived work in. */
function getListedWorktreeOptions(sessions: readonly ISession[], isSessionListed: (session: ISession, reader: IReader | undefined) => boolean, reader?: IReader) {
	return getWorktreeFilterOptions(sessions.filter(session => isSessionListed(session, reader) && !session.isArchived.read(reader)).map(session => getSessionWorktreeFilterFolder(session, reader)));
}

/** The keys of the folders the Worktrees filter offers for `sessions`: of those the list includes, not archived. */
export function getWorktreeFilterKeys(sessions: readonly ISession[], isSessionListed: (session: ISession, reader: IReader | undefined) => boolean, reader?: IReader): ReadonlySet<string> {
	return new Set(getListedWorktreeOptions(sessions, isSessionListed, reader).map(option => option.key));
}

/**
 * Opens a session of the worktree folder the user picks in the Worktrees filter, unless the shown session works in it already:
 * the one of it shown last, else its most recent session that is not archived. As a click in the list, it first asks
 * `canOpen`, such as whether its folder is trusted, and opens nothing where refused, or where a later pick or another change
 * of the filters came meanwhile.
 */
export class SessionsWorktreeOpener extends Disposable {

	private readonly _lastSessions = new WorktreeLastSessions();
	/** Increases with each pick and each change of the filters: an open asked for before does not apply. */
	private _generation = 0;

	constructor(
		private readonly _shown: IObservable<ISession | undefined>,
		private readonly _sessions: () => readonly ISession[],
		private readonly _canOpen: (session: ISession) => Promise<boolean>,
		private readonly _open: (session: ISession) => void,
		onDidChangeFilters: Event<void>,
	) {
		super();
		this._register(onDidChangeFilters(() => this._generation++));
		this._register(autorun(reader => {
			// Also as the shown session's workspace becomes known or changes, which it can after it shows
			const shown = this._shown.read(reader);
			const folder = shown && getSessionWorktreeFilterFolder(shown, reader);
			if (shown && folder) {
				this._lastSessions.remember(getWorktreeFilterKey(folder.folder), shown.sessionId);
			}
		}));
	}

	async open(worktree: string): Promise<void> {
		const generation = ++this._generation;
		const shown = this._shown.get();
		const sessions = this._sessions();
		const pick = getWorktreeSessionToOpen(worktree, shown && getWorktreeFilterSession(shown), sessions.map(session => getWorktreeFilterSession(session)), this._lastSessions.get(worktree));
		const session = pick && sessions.find(candidate => candidate.sessionId === pick.id);
		if (!session || !await this._canOpen(session) || generation !== this._generation || this._store.isDisposed) {
			return;
		}
		// Asked for that session only: where it no longer is one of the folder's to open, such as archived, removed or moved
		// meanwhile, it opens nothing rather than another that was not asked for
		const current = this._sessions().find(candidate => candidate.sessionId === session.sessionId);
		const now = current && getWorktreeFilterSession(current);
		if (now && now.worktree === worktree && !now.isArchived) {
			this._open(current);
		}
	}
}

export class SessionsListFilters extends Disposable implements ISessionsListResettableState {
	private static readonly STORAGE_KEY = 'sessionsListControl.filters';
	private static readonly INBOX_SCOPE_STORAGE_KEY = 'sessionsListControl.inboxScope';
	private static readonly WORKTREE_STORAGE_KEY = 'sessionsListControl.worktree';
	private static readonly SHOW_AUTOMATION_RUNS_KEY = 'showAutomationRuns';
	private static readonly SCHEDULED_ONLY_KEY = 'scheduledOnly';
	private readonly excluded: Map<string, boolean>;
	private _inboxScope: IInboxScope = {};
	private _worktree: string | undefined;
	get inboxScope(): IInboxScope { return this._inboxScope; }
	get hasInboxScope(): boolean { return this._inboxScope.workspace !== undefined || this._inboxScope.environment !== undefined; }
	get hasInboxWorkspaceScope(): boolean { return !!this._inboxScope.workspace && this._inboxScope.workspace !== 'none'; }
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly changeSignal = observableSignalFromEvent(this, this.onDidChange);

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		this.excluded = new Map();
		const raw = storageService.get(SessionsListFilters.STORAGE_KEY, StorageScope.PROFILE);
		if (raw !== undefined) {
			try {
				const entries: unknown = JSON.parse(raw);
				if (!Array.isArray(entries) || !entries.every((entry): entry is [string, boolean] =>
					Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'boolean')) {
					throw new Error('Invalid session filter preferences.');
				}
				// Earlier builds stored hidden worktree folders here: those show all folders again
				this.excluded = new Map(entries.filter(([key]) => !key.startsWith('["worktree",')));
			} catch (error) {
				logService.warn('Unable to restore session filter preferences.', error);
			}
		}
		this._worktree = storageService.get(SessionsListFilters.WORKTREE_STORAGE_KEY, StorageScope.PROFILE) || undefined;
		const scope = storageService.get(SessionsListFilters.INBOX_SCOPE_STORAGE_KEY, StorageScope.PROFILE);
		if (scope !== undefined) {
			try {
				const value: unknown = JSON.parse(scope);
				if (!isInboxScope(value)) {
					throw new Error('Invalid Inbox scope.');
				}
				this._inboxScope = value;
			} catch (error) {
				logService.warn('Unable to restore Inbox scope.', error);
			}
		}
	}

	isExcluded(filter: SessionFilter): boolean {
		return this.excluded.get(sessionFilterKey(filter))
			?? (filter.kind === 'application' && (
				(filter.environment !== 'cloud' && filter.id !== 'vscode') ||
				(filter.environment === 'cloud' && (filter.id === 'slack' || filter.id === 'teams'))
			));
	}

	setExcluded(filter: SessionFilter, excluded: boolean): void {
		this.excluded.set(sessionFilterKey(filter), excluded);
		this.save();
	}

	isShowAutomationRuns(reader?: IReader): boolean {
		if (reader) {
			this.changeSignal.read(reader);
		}
		return this.excluded.get(SessionsListFilters.SHOW_AUTOMATION_RUNS_KEY) ?? false;
	}

	/**
	 * The worktree folder, by its Worktrees filter key, whose sessions alone show: the selected one where `available`, the
	 * keys of the folders the Worktrees filter offers, has it, else none, so that the list never stays empty for a folder
	 * the filter no longer offers. All folders show where `undefined`.
	 */
	getSelectedWorktree(available: ReadonlySet<string>): string | undefined {
		return this._worktree !== undefined && available.has(this._worktree) ? this._worktree : undefined;
	}

	/** Shows the sessions of the worktree folder `worktree` alone, or of all folders where `undefined`. */
	setSelectedWorktree(worktree: string | undefined): void {
		this._worktree = worktree;
		this.save();
	}

	setShowAutomationRuns(show: boolean): void {
		this.excluded.set(SessionsListFilters.SHOW_AUTOMATION_RUNS_KEY, show);
		this.save();
	}

	isScheduledOnly(): boolean {
		return this.excluded.get(SessionsListFilters.SCHEDULED_ONLY_KEY) ?? false;
	}

	setScheduledOnly(scheduledOnly: boolean): void {
		this.excluded.set(SessionsListFilters.SCHEDULED_ONLY_KEY, scheduledOnly);
		this.save();
	}

	setInboxWorkspace(workspace: IInboxScope['workspace']): void {
		this._inboxScope = { ...this._inboxScope, workspace };
		this.save();
	}

	setInboxEnvironment(environment: IInboxScope['environment']): boolean {
		const workspace = this._inboxScope.workspace;
		const resetWorkspace = !!environment && !!workspace && workspace !== 'none' && workspace.environment !== environment.id;
		this._inboxScope = { environment, workspace: resetWorkspace ? undefined : workspace };
		this.save();
		return resetWorkspace;
	}

	matchesInboxScope(session: ISession): boolean {
		const { environment, workspace } = this._inboxScope;
		if (environment && session.environment !== environment.id) {
			return false;
		}
		if (workspace === 'none') {
			return session.isQuickChat?.get() === true;
		}
		if (workspace) {
			const candidate = getInboxWorkspaceFilter(session);
			return candidate?.environment === workspace.environment && candidate.resource === workspace.resource;
		}
		return true;
	}

	/**
	 * Whether the list shows `session`. `availableWorktrees` are the keys of the folders the Worktrees filter offers
	 * ({@link getWorktreeFilterKeys}): the selected one applies only where it is one of them.
	 */
	matches(session: Pick<ISession, 'harness' | 'environment' | 'application'> & Partial<Pick<ISession, 'workspace' | 'isQuickChat'>>, inbox = false, availableWorktrees: ReadonlySet<string> = new Set()): boolean {
		const application = session.application.get();
		const selectedWorktree = this.getSelectedWorktree(availableWorktrees);
		const worktree = selectedWorktree !== undefined && session.workspace && getSessionWorktreeFilterFolder({ workspace: session.workspace, isQuickChat: session.isQuickChat });
		return !this.isExcluded({ kind: 'harness', id: session.harness })
			&& (!worktree || getWorktreeFilterKey(worktree.folder) === selectedWorktree)
			&& (inbox || !this.isExcluded({ kind: 'environment', id: session.environment }))
			&& (application.id === UNKNOWN_SESSION_APPLICATION_ID
				|| !this.isExcluded({ kind: 'application', environment: session.environment, id: application.id }));
	}

	capture(): () => void {
		const excluded = [...this.excluded];
		const inboxScope = this._inboxScope;
		const worktree = this._worktree;
		return () => {
			this._inboxScope = inboxScope;
			this._worktree = worktree;
			this.excluded.clear();
			for (const [key, value] of excluded) {
				this.excluded.set(key, value);
			}
			this.save();
		};
	}

	reset(): void {
		this.excluded.clear();
		this._inboxScope = {};
		this._worktree = undefined;
		this.save();
	}

	private save(): void {
		if (this.hasInboxScope) {
			this.storageService.store(SessionsListFilters.INBOX_SCOPE_STORAGE_KEY, JSON.stringify(this._inboxScope), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(SessionsListFilters.INBOX_SCOPE_STORAGE_KEY, StorageScope.PROFILE);
		}
		if (this._worktree === undefined) {
			this.storageService.remove(SessionsListFilters.WORKTREE_STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsListFilters.WORKTREE_STORAGE_KEY, this._worktree, StorageScope.PROFILE, StorageTarget.USER);
		}
		if (this.excluded.size === 0) {
			this.storageService.remove(SessionsListFilters.STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsListFilters.STORAGE_KEY, JSON.stringify([...this.excluded]), StorageScope.PROFILE, StorageTarget.USER);
		}
		this._onDidChange.fire();
	}
}
