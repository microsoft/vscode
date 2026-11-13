/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSessionApplication, UNKNOWN_SESSION_APPLICATION_ID } from '../../../../services/sessions/common/sessionApplication.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';

export type SessionFilter =
	| { readonly kind: 'harness' | 'environment'; readonly id: string }
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
	return options;
}

export class SessionsListFilters extends Disposable implements ISessionsListResettableState {
	private static readonly STORAGE_KEY = 'sessionsListControl.filters';
	private static readonly INBOX_SCOPE_STORAGE_KEY = 'sessionsListControl.inboxScope';
	private static readonly SHOW_AUTOMATION_RUNS_KEY = 'showAutomationRuns';
	private static readonly SCHEDULED_ONLY_KEY = 'scheduledOnly';
	private readonly excluded: Map<string, boolean>;
	private _inboxScope: IInboxScope = {};
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
				this.excluded = new Map(entries);
			} catch (error) {
				logService.warn('Unable to restore session filter preferences.', error);
			}
		}
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

	matches(session: Pick<ISession, 'harness' | 'environment' | 'application'>, inbox = false): boolean {
		const application = session.application.get();
		return !this.isExcluded({ kind: 'harness', id: session.harness })
			&& (inbox || !this.isExcluded({ kind: 'environment', id: session.environment }))
			&& (application.id === UNKNOWN_SESSION_APPLICATION_ID
				|| !this.isExcluded({ kind: 'application', environment: session.environment, id: application.id }));
	}

	capture(): () => void {
		const excluded = [...this.excluded];
		const inboxScope = this._inboxScope;
		return () => {
			this._inboxScope = inboxScope;
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
		this.save();
	}

	private save(): void {
		if (this.hasInboxScope) {
			this.storageService.store(SessionsListFilters.INBOX_SCOPE_STORAGE_KEY, JSON.stringify(this._inboxScope), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(SessionsListFilters.INBOX_SCOPE_STORAGE_KEY, StorageScope.PROFILE);
		}
		if (this.excluded.size === 0) {
			this.storageService.remove(SessionsListFilters.STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsListFilters.STORAGE_KEY, JSON.stringify([...this.excluded]), StorageScope.PROFILE, StorageTarget.USER);
		}
		this._onDidChange.fire();
	}
}
