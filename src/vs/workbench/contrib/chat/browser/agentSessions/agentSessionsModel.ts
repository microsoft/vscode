/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus as AgentSessionStatus, IChatSessionFileChange, IChatSessionItem, IChatSessionsExtensionPoint, IChatSessionsService, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from './agentSessions.js';

//#region Interfaces, Types

export { ChatSessionStatus as AgentSessionStatus } from '../../common/chatSessionsService.js';
export { isSessionInProgressStatus } from '../../common/chatSessionsService.js';

export interface IAgentSessionsModel {

	readonly onWillResolve: Event<void>;
	readonly onDidResolve: Event<void>;

	readonly onDidChangeSessions: Event<void>;

	readonly sessions: IAgentSession[];
	getSession(resource: URI): IAgentSession | undefined;

	resolve(provider: string | string[] | undefined): Promise<void>;
}

interface IAgentSessionData extends Omit<IChatSessionItem, 'archived' | 'iconPath'> {

	readonly providerType: string;
	readonly providerLabel: string;

	readonly resource: URI;

	readonly status: AgentSessionStatus;

	readonly tooltip?: string | IMarkdownString;

	readonly label: string;
	readonly description?: string | IMarkdownString;
	readonly badge?: string | IMarkdownString;
	readonly icon: ThemeIcon;

	readonly timing: IChatSessionItem['timing'] & {
		readonly inProgressTime?: number;
		readonly finishedOrFailedTime?: number;
	};

	readonly changes?: IChatSessionItem['changes'];
}

/**
 * Checks if the provided changes object represents valid diff information.
 */
export function hasValidDiff(changes: IAgentSession['changes']): boolean {
	if (!changes) {
		return false;
	}

	if (changes instanceof Array) {
		return changes.length > 0;
	}

	return changes.files > 0 || changes.insertions > 0 || changes.deletions > 0;
}

/**
 * Gets a summary of agent session changes, converting from array format to object format if needed.
 */
export function getAgentChangesSummary(changes: IAgentSession['changes']) {
	if (!changes) {
		return;
	}

	if (!(changes instanceof Array)) {
		return changes;
	}

	let insertions = 0;
	let deletions = 0;
	for (const change of changes) {
		insertions += change.insertions;
		deletions += change.deletions;
	}

	return { files: changes.length, insertions, deletions };
}

export interface IAgentSession extends IAgentSessionData {
	isArchived(): boolean;
	setArchived(archived: boolean): void;

	isRead(): boolean;
	setRead(read: boolean): void;
}

interface IInternalAgentSessionData extends IAgentSessionData {

	/**
	 * The `archived` property is provided by the session provider
	 * and will be used as the initial value if the user has not
	 * changed the archived state for the session previously. It
	 * is kept internal to not expose it publicly. Use `isArchived()`
	 * and `setArchived()` methods instead.
	 */
	readonly archived: boolean | undefined;
}

interface IInternalAgentSession extends IAgentSession, IInternalAgentSessionData { }

export function isLocalAgentSessionItem(session: IAgentSession): boolean {
	return session.providerType === AgentSessionProviders.Local;
}

export function isAgentSession(obj: unknown): obj is IAgentSession {
	const session = obj as IAgentSession | undefined;

	return URI.isUri(session?.resource) && typeof session.setArchived === 'function' && typeof session.setRead === 'function';
}

export function isAgentSessionsModel(obj: unknown): obj is IAgentSessionsModel {
	const sessionsModel = obj as IAgentSessionsModel | undefined;

	return Array.isArray(sessionsModel?.sessions) && typeof sessionsModel?.getSession === 'function';
}

interface IAgentSessionState {
	readonly archived: boolean;
	readonly read: number /* last date turned read */;
}

export const enum AgentSessionSection {
	InProgress = 'inProgress',
	Today = 'today',
	Yesterday = 'yesterday',
	Week = 'week',
	Older = 'older',
	Archived = 'archived',
}

export interface IAgentSessionSection {
	readonly section: AgentSessionSection;
	readonly label: string;
	readonly sessions: IAgentSession[];
}

export function isAgentSessionSection(obj: IAgentSessionsModel | IAgentSession | IAgentSessionSection): obj is IAgentSessionSection {
	const candidate = obj as IAgentSessionSection;

	return typeof candidate.section === 'string' && Array.isArray(candidate.sessions);
}

export interface IMarshalledAgentSessionContext {
	readonly $mid: MarshalledId.AgentSessionContext;
	readonly session: IAgentSession;
}

export function isMarshalledAgentSessionContext(thing: unknown): thing is IMarshalledAgentSessionContext {
	if (typeof thing === 'object' && thing !== null) {
		const candidate = thing as IMarshalledAgentSessionContext;
		return candidate.$mid === MarshalledId.AgentSessionContext && typeof candidate.session === 'object' && candidate.session !== null;
	}

	return false;
}

//#endregion

export class AgentSessionsModel extends Disposable implements IAgentSessionsModel {

	private readonly _onWillResolve = this._register(new Emitter<void>());
	readonly onWillResolve = this._onWillResolve.event;

	private readonly _onDidResolve = this._register(new Emitter<void>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _sessions: ResourceMap<IInternalAgentSession>;
	get sessions(): IAgentSession[] { return Array.from(this._sessions.values()); }

	private readonly resolver = this._register(new ThrottledDelayer<void>(100));
	private readonly providersToResolve = new Set<string | undefined>();

	private readonly mapSessionToState = new ResourceMap<{
		status: AgentSessionStatus;

		inProgressTime?: number;
		finishedOrFailedTime?: number;
	}>();

	private readonly cache: AgentSessionsCache;

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._sessions = new ResourceMap<IInternalAgentSession>();

		this.cache = this.instantiationService.createInstance(AgentSessionsCache);
		for (const data of this.cache.loadCachedSessions()) {
			const session = this.toAgentSession(data);
			this._sessions.set(session.resource, session);
		}
		this.sessionStates = this.cache.loadSessionStates();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Sessions changes
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType: provider }) => this.resolve(provider)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(provider => this.resolve(provider)));

		// State
		this._register(this.storageService.onWillSaveState(() => {
			this.cache.saveCachedSessions(Array.from(this._sessions.values()));
			this.cache.saveSessionStates(this.sessionStates);
		}));
	}

	getSession(resource: URI): IAgentSession | undefined {
		return this._sessions.get(resource);
	}

	async resolve(provider: string | string[] | undefined): Promise<void> {
		if (Array.isArray(provider)) {
			for (const p of provider) {
				this.providersToResolve.add(p);
			}
		} else {
			this.providersToResolve.add(provider);
		}

		return this.resolver.trigger(async token => {
			if (token.isCancellationRequested || this.lifecycleService.willShutdown) {
				return;
			}

			try {
				this._onWillResolve.fire();
				return await this.doResolve(token);
			} finally {
				this._onDidResolve.fire();
			}
		});
	}

	private async doResolve(token: CancellationToken): Promise<void> {
		const providersToResolve = Array.from(this.providersToResolve);
		this.providersToResolve.clear();

		const mapSessionContributionToType = new Map<string, IChatSessionsExtensionPoint>();
		for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
			mapSessionContributionToType.set(contribution.type, contribution);
		}

		const resolvedProviders = new Set<string>();
		const sessions = new ResourceMap<IInternalAgentSession>();
		for (const provider of this.chatSessionsService.getAllChatSessionItemProviders()) {
			if (!providersToResolve.includes(undefined) && !providersToResolve.includes(provider.chatSessionType)) {
				continue; // skip: not considered for resolving
			}

			let providerSessions: IChatSessionItem[];
			try {
				providerSessions = await provider.provideChatSessionItems(token);
			} catch (error) {
				this.logService.error(`Failed to resolve sessions for provider ${provider.chatSessionType}`, error);
				continue; // skip: failed to resolve sessions for provider
			}

			resolvedProviders.add(provider.chatSessionType);

			if (token.isCancellationRequested) {
				return;
			}

			for (const session of providerSessions) {

				// Icon + Label
				let icon: ThemeIcon;
				let providerLabel: string;
				switch ((provider.chatSessionType)) {
					case AgentSessionProviders.Local:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Local);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Local);
						break;
					case AgentSessionProviders.Background:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Background);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Background);
						break;
					case AgentSessionProviders.Cloud:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Cloud);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Cloud);
						break;
					default: {
						providerLabel = mapSessionContributionToType.get(provider.chatSessionType)?.name ?? provider.chatSessionType;
						icon = session.iconPath ?? Codicon.terminal;
					}
				}

				// State + Timings
				// TODO@bpasero this is a workaround for not having precise timing info in sessions
				// yet: we only track the time when a transition changes because then we can say with
				// confidence that the time is correct by assuming `Date.now()`. A better approach would
				// be to get all this information directly from the session.
				const status = session.status ?? AgentSessionStatus.Completed;
				const state = this.mapSessionToState.get(session.resource);
				let inProgressTime = state?.inProgressTime;
				let finishedOrFailedTime = state?.finishedOrFailedTime;

				// No previous state, just add it
				if (!state) {
					this.mapSessionToState.set(session.resource, {
						status,
						inProgressTime: isSessionInProgressStatus(status) ? Date.now() : undefined, // this is not accurate but best effort
					});
				}

				// State changed, update it
				else if (status !== state.status) {
					inProgressTime = isSessionInProgressStatus(status) ? Date.now() : state.inProgressTime;
					finishedOrFailedTime = !isSessionInProgressStatus(status) ? Date.now() : state.finishedOrFailedTime;

					this.mapSessionToState.set(session.resource, {
						status,
						inProgressTime,
						finishedOrFailedTime
					});
				}

				const changes = session.changes;
				const normalizedChanges = changes && !(changes instanceof Array)
					? { files: changes.files, insertions: changes.insertions, deletions: changes.deletions }
					: changes;

				// Times: it is important to always provide a start and end time to track
				// unread/read state for example.
				// If somehow the provider does not provide any, fallback to last known
				let startTime = session.timing.startTime;
				let endTime = session.timing.endTime;
				if (!startTime || !endTime) {
					const existing = this._sessions.get(session.resource);
					if (!startTime && existing?.timing.startTime) {
						startTime = existing.timing.startTime;
					}

					if (!endTime && existing?.timing.endTime) {
						endTime = existing.timing.endTime;
					}
				}

				sessions.set(session.resource, this.toAgentSession({
					providerType: provider.chatSessionType,
					providerLabel,
					resource: session.resource,
					label: session.label,
					description: session.description,
					icon,
					badge: session.badge,
					tooltip: session.tooltip,
					status,
					archived: session.archived,
					timing: { startTime, endTime, inProgressTime, finishedOrFailedTime },
					changes: normalizedChanges,
				}));
			}
		}

		for (const [, session] of this._sessions) {
			if (!resolvedProviders.has(session.providerType)) {
				sessions.set(session.resource, session); // fill in existing sessions for providers that did not resolve
			}
		}

		this._sessions = sessions;

		for (const [resource] of this.mapSessionToState) {
			if (!sessions.has(resource)) {
				this.mapSessionToState.delete(resource); // clean up tracking for removed sessions
			}
		}

		for (const [resource] of this.sessionStates) {
			if (!sessions.has(resource)) {
				this.sessionStates.delete(resource); // clean up states for removed sessions
			}
		}

		this._onDidChangeSessions.fire();
	}

	private toAgentSession(data: IInternalAgentSessionData): IInternalAgentSession {
		return {
			...data,
			isArchived: () => this.isArchived(data),
			setArchived: (archived: boolean) => this.setArchived(data, archived),
			isRead: () => this.isRead(data),
			setRead: (read: boolean) => this.setRead(data, read),
		};
	}

	//#region States

	// In order to reduce the amount of unread sessions a user will
	// see after updating to 1.107, we specify a fixed date that a
	// session needs to be created after to be considered unread unless
	// the user has explicitly marked it as read.
	private static readonly READ_STATE_INITIAL_DATE = Date.UTC(2025, 11 /* December */, 8);

	private readonly sessionStates: ResourceMap<IAgentSessionState>;

	private isArchived(session: IInternalAgentSessionData): boolean {
		return this.sessionStates.get(session.resource)?.archived ?? Boolean(session.archived);
	}

	private setArchived(session: IInternalAgentSessionData, archived: boolean): void {
		if (archived === this.isArchived(session)) {
			return; // no change
		}

		const state = this.sessionStates.get(session.resource) ?? { archived: false, read: 0 };
		this.sessionStates.set(session.resource, { ...state, archived });

		this._onDidChangeSessions.fire();
	}

	private isRead(session: IInternalAgentSessionData): boolean {
		const readDate = this.sessionStates.get(session.resource)?.read;

		return (readDate ?? AgentSessionsModel.READ_STATE_INITIAL_DATE) >= (session.timing.endTime ?? session.timing.startTime);
	}

	private setRead(session: IInternalAgentSessionData, read: boolean): void {
		if (read === this.isRead(session)) {
			return; // no change
		}

		const state = this.sessionStates.get(session.resource) ?? { archived: false, read: 0 };
		this.sessionStates.set(session.resource, { ...state, read: read ? Date.now() : 0 });

		this._onDidChangeSessions.fire();
	}

	//#endregion
}

//#region Sessions Cache

interface ISerializedAgentSession extends Omit<IAgentSessionData, 'iconPath' | 'resource' | 'icon'> {

	readonly providerType: string;
	readonly providerLabel: string;

	readonly resource: UriComponents /* old shape */ | string /* new shape that is more compact */;

	readonly status: AgentSessionStatus;

	readonly tooltip?: string | IMarkdownString;

	readonly label: string;
	readonly description?: string | IMarkdownString;
	readonly badge?: string | IMarkdownString;
	readonly icon: string;

	readonly archived: boolean | undefined;

	readonly timing: {
		readonly startTime: number;
		readonly endTime?: number;
	};

	readonly changes?: readonly IChatSessionFileChange[] | {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	};
}

interface ISerializedAgentSessionState extends IAgentSessionState {
	readonly resource: UriComponents /* old shape */ | string /* new shape that is more compact */;
}

class AgentSessionsCache {

	private static readonly SESSIONS_STORAGE_KEY = 'agentSessions.model.cache';
	private static readonly STATE_STORAGE_KEY = 'agentSessions.state.cache';

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) { }

	//#region Sessions

	saveCachedSessions(sessions: IInternalAgentSessionData[]): void {
		const serialized: ISerializedAgentSession[] = sessions.map(session => ({
			providerType: session.providerType,
			providerLabel: session.providerLabel,

			resource: session.resource.toString(),

			icon: session.icon.id,
			label: session.label,
			description: session.description,
			badge: session.badge,
			tooltip: session.tooltip,

			status: session.status,
			archived: session.archived,

			timing: {
				startTime: session.timing.startTime,
				endTime: session.timing.endTime,
			},

			changes: session.changes,
		} satisfies ISerializedAgentSession));

		this.storageService.store(AgentSessionsCache.SESSIONS_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	loadCachedSessions(): IInternalAgentSessionData[] {
		const sessionsCache = this.storageService.get(AgentSessionsCache.SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!sessionsCache) {
			return [];
		}

		try {
			const cached = JSON.parse(sessionsCache) as ISerializedAgentSession[];
			return cached.map(session => ({
				providerType: session.providerType,
				providerLabel: session.providerLabel,

				resource: typeof session.resource === 'string' ? URI.parse(session.resource) : URI.revive(session.resource),

				icon: ThemeIcon.fromId(session.icon),
				label: session.label,
				description: session.description,
				badge: session.badge,
				tooltip: session.tooltip,

				status: session.status,
				archived: session.archived,

				timing: {
					startTime: session.timing.startTime,
					endTime: session.timing.endTime,
				},

				changes: Array.isArray(session.changes) ? session.changes.map((change: IChatSessionFileChange) => ({
					modifiedUri: URI.revive(change.modifiedUri),
					originalUri: change.originalUri ? URI.revive(change.originalUri) : undefined,
					insertions: change.insertions,
					deletions: change.deletions,
				})) : session.changes,
			}));
		} catch {
			return []; // invalid data in storage, fallback to empty sessions list
		}
	}

	//#endregion

	//#region States

	saveSessionStates(states: ResourceMap<IAgentSessionState>): void {
		const serialized: ISerializedAgentSessionState[] = Array.from(states.entries()).map(([resource, state]) => ({
			resource: resource.toString(),
			archived: state.archived,
			read: state.read
		}));

		this.storageService.store(AgentSessionsCache.STATE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	loadSessionStates(): ResourceMap<IAgentSessionState> {
		const states = new ResourceMap<IAgentSessionState>();

		const statesCache = this.storageService.get(AgentSessionsCache.STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!statesCache) {
			return states;
		}

		try {
			const cached = JSON.parse(statesCache) as ISerializedAgentSessionState[];

			for (const entry of cached) {
				states.set(typeof entry.resource === 'string' ? URI.parse(entry.resource) : URI.revive(entry.resource), {
					archived: entry.archived,
					read: entry.read
				});
			}
		} catch {
			// invalid data in storage, fallback to empty states
		}

		return states;
	}

	//#endregion
}

//#endregion
