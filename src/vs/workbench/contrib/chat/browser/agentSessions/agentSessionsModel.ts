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
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus, IChatSessionFileChange, IChatSessionItem, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from './agentSessions.js';

//#region Interfaces, Types

/**
 * The main model for managing agent sessions in the workbench.
 *
 * Provides access to sessions, resolving session data from providers,
 * and notifying consumers of changes to session state.
 */
export interface IAgentSessionsModel {

	/**
	 * Event fired when session resolution is about to start.
	 */
	readonly onWillResolve: Event<void>;

	/**
	 * Event fired when session resolution has completed.
	 */
	readonly onDidResolve: Event<void>;

	/**
	 * Event fired when the sessions collection has changed.
	 */
	readonly onDidChangeSessions: Event<void>;

	/**
	 * All currently loaded agent sessions.
	 */
	readonly sessions: IAgentSession[];

	/**
	 * Retrieves a session by its resource URI.
	 *
	 * @param resource The URI of the session resource.
	 * @returns The session if found, undefined otherwise.
	 */
	getSession(resource: URI): IAgentSession | undefined;

	/**
	 * Resolves sessions from the specified provider(s).
	 *
	 * @param provider The provider type(s) to resolve, or undefined to resolve all providers.
	 */
	resolve(provider: string | string[] | undefined): Promise<void>;
}

/**
 * Core data structure representing an agent session.
 */
interface IAgentSessionData {

	/**
	 * The type identifier for the session provider.
	 */
	readonly providerType: string;

	/**
	 * The display label for the session provider.
	 */
	readonly providerLabel: string;

	/**
	 * The unique resource URI identifying this session.
	 */
	readonly resource: URI;

	/**
	 * The current status of the session.
	 */
	readonly status: ChatSessionStatus;

	/**
	 * Optional tooltip text or markdown to display for this session.
	 */
	readonly tooltip?: string | IMarkdownString;

	/**
	 * The display label for this session.
	 */
	readonly label: string;

	/**
	 * Optional description text or markdown for this session.
	 */
	readonly description?: string | IMarkdownString;

	/**
	 * The icon to display for this session.
	 */
	readonly icon: ThemeIcon;

	/**
	 * Timing information for the session lifecycle.
	 */
	readonly timing: {
		/** The time when the session started. */
		readonly startTime: number;
		/** The time when the session ended (if completed). */
		readonly endTime?: number;

		/** The time when the session transitioned to in-progress state. */
		readonly inProgressTime?: number;
		/** The time when the session finished or failed. */
		readonly finishedOrFailedTime?: number;
	};

	/**
	 * File changes associated with this session, either as detailed changes or a summary.
	 */
	readonly changes?: readonly IChatSessionFileChange[] | {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	};
}

/**
 * Computes a summary of file changes from an agent session.
 *
 * If the changes are already in summary format, returns them as-is.
 * If the changes are detailed file changes, aggregates them into a summary.
 *
 * @param changes The changes to summarize.
 * @returns A summary object with file count and insertion/deletion totals, or undefined if no changes.
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

/**
 * An agent session with methods to manage its archived and read states.
 */
export interface IAgentSession extends IAgentSessionData {
	/**
	 * Checks if this session is archived.
	 *
	 * @returns `true` if the session is archived, `false` otherwise.
	 */
	isArchived(): boolean;

	/**
	 * Sets the archived state of this session.
	 *
	 * @param archived The new archived state.
	 */
	setArchived(archived: boolean): void;

	/**
	 * Checks if this session has been marked as read.
	 *
	 * @returns `true` if the session has been read, `false` otherwise.
	 */
	isRead(): boolean;

	/**
	 * Sets the read state of this session.
	 *
	 * @param read The new read state.
	 */
	setRead(read: boolean): void;
}

/**
 * Internal session data structure that includes the provider-supplied archived state.
 */
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

/**
 * Internal representation combining session data and methods.
 */
interface IInternalAgentSession extends IAgentSession, IInternalAgentSessionData { }

/**
 * Type guard to check if a session is a local agent session.
 *
 * @param session The session to check.
 * @returns `true` if the session is a local session, `false` otherwise.
 */
export function isLocalAgentSessionItem(session: IAgentSession): boolean {
	return session.providerType === localChatSessionType;
}

/**
 * Type guard to determine if an object is an agent session.
 *
 * @param obj The object to check.
 * @returns `true` if the object is an IAgentSession, `false` otherwise.
 */
export function isAgentSession(obj: IAgentSessionsModel | IAgentSession): obj is IAgentSession {
	const session = obj as IAgentSession | undefined;

	return URI.isUri(session?.resource);
}

/**
 * Type guard to determine if an object is an agent sessions model.
 *
 * @param obj The object to check.
 * @returns `true` if the object is an IAgentSessionsModel, `false` otherwise.
 */
export function isAgentSessionsModel(obj: IAgentSessionsModel | IAgentSession): obj is IAgentSessionsModel {
	const sessionsModel = obj as IAgentSessionsModel | undefined;

	return Array.isArray(sessionsModel?.sessions);
}

/**
 * Persistent state information for an agent session.
 */
interface IAgentSessionState {
	/** Whether the session is archived. */
	readonly archived: boolean;
	/** The last date the session was marked as read (timestamp in milliseconds). */
	readonly read: number;
}

//#endregion

/**
 * The main implementation of the agent sessions model.
 *
 * This class manages the lifecycle of agent sessions, including:
 * - Loading and caching sessions from storage
 * - Resolving sessions from registered providers
 * - Tracking session state (archived, read status)
 * - Notifying consumers of changes
 */
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
		status: ChatSessionStatus;

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
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType: provider }) => this.resolve(provider)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(provider => this.resolve(provider)));
		this._register(this.storageService.onWillSaveState(() => {
			this.cache.saveCachedSessions(Array.from(this._sessions.values()));
			this.cache.saveSessionStates(this.sessionStates);
		}));
	}

	/**
	 * Retrieves a session by its resource URI.
	 */
	getSession(resource: URI): IAgentSession | undefined {
		return this._sessions.get(resource);
	}

	/**
	 * Resolves sessions from the specified provider(s).
	 *
	 * This method throttles multiple resolve requests and batches them together.
	 * The actual resolution happens in doResolve().
	 */
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
				const status = session.status ?? ChatSessionStatus.Completed;
				const state = this.mapSessionToState.get(session.resource);
				let inProgressTime = state?.inProgressTime;
				let finishedOrFailedTime = state?.finishedOrFailedTime;

				// No previous state, just add it
				if (!state) {
					this.mapSessionToState.set(session.resource, {
						status,
						inProgressTime: status === ChatSessionStatus.InProgress ? Date.now() : undefined, // this is not accurate but best effort
					});
				}

				// State changed, update it
				else if (status !== state.status) {
					inProgressTime = status === ChatSessionStatus.InProgress ? Date.now() : state.inProgressTime;
					finishedOrFailedTime = (status !== ChatSessionStatus.InProgress) ? Date.now() : state.finishedOrFailedTime;

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

				sessions.set(session.resource, this.toAgentSession({
					providerType: provider.chatSessionType,
					providerLabel,
					resource: session.resource,
					label: session.label,
					description: session.description,
					icon,
					tooltip: session.tooltip,
					status,
					archived: session.archived,
					timing: {
						startTime: session.timing.startTime,
						endTime: session.timing.endTime,
						inProgressTime,
						finishedOrFailedTime
					},
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

		return (readDate ?? 0) >= (session.timing.endTime ?? session.timing.startTime);
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

/**
 * Serializable representation of an agent session for persistence.
 */
interface ISerializedAgentSession {

	readonly providerType: string;
	readonly providerLabel: string;

	/** The session resource URI in serialized form. */
	readonly resource: UriComponents;

	/** The icon ID as a string. */
	readonly icon: string;

	readonly label: string;

	readonly description?: string | IMarkdownString;
	readonly tooltip?: string | IMarkdownString;

	readonly status: ChatSessionStatus;
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

/**
 * Serializable representation of agent session state for persistence.
 */
interface ISerializedAgentSessionState extends IAgentSessionState {
	/** The session resource URI in serialized form. */
	readonly resource: UriComponents;
}

/**
 * Handles caching and restoration of agent sessions and their states to/from storage.
 */
class AgentSessionsCache {

	private static readonly SESSIONS_STORAGE_KEY = 'agentSessions.model.cache';
	private static readonly STATE_STORAGE_KEY = 'agentSessions.state.cache';

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) { }

	//#region Sessions

	/**
	 * Saves the current sessions to storage.
	 *
	 * @param sessions The sessions to cache.
	 */
	saveCachedSessions(sessions: IInternalAgentSessionData[]): void {
		const serialized: ISerializedAgentSession[] = sessions.map(session => ({
			providerType: session.providerType,
			providerLabel: session.providerLabel,

			resource: session.resource.toJSON(),

			icon: session.icon.id,
			label: session.label,
			description: session.description,
			tooltip: session.tooltip,

			status: session.status,
			archived: session.archived,

			timing: {
				startTime: session.timing.startTime,
				endTime: session.timing.endTime,
			},

			changes: session.changes,
		}));

		this.storageService.store(AgentSessionsCache.SESSIONS_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	/**
	 * Loads cached sessions from storage.
	 *
	 * @returns An array of session data, or an empty array if no valid cache exists.
	 */
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

				resource: URI.revive(session.resource),

				icon: ThemeIcon.fromId(session.icon),
				label: session.label,
				description: session.description,
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

	/**
	 * Saves session states (archived, read) to storage.
	 *
	 * @param states The session states to cache.
	 */
	saveSessionStates(states: ResourceMap<IAgentSessionState>): void {
		const serialized: ISerializedAgentSessionState[] = Array.from(states.entries()).map(([resource, state]) => ({
			resource: resource.toJSON(),
			archived: state.archived,
			read: state.read
		}));

		this.storageService.store(AgentSessionsCache.STATE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	/**
	 * Loads session states from storage.
	 *
	 * @returns A resource map of session states, or an empty map if no valid cache exists.
	 */
	loadSessionStates(): ResourceMap<IAgentSessionState> {
		const states = new ResourceMap<IAgentSessionState>();

		const statesCache = this.storageService.get(AgentSessionsCache.STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!statesCache) {
			return states;
		}

		try {
			const cached = JSON.parse(statesCache) as ISerializedAgentSessionState[];

			for (const entry of cached) {
				states.set(URI.revive(entry.resource), {
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
