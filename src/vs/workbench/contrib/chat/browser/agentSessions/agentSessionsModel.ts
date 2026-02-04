/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { safeStringify } from '../../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../../services/output/common/output.js';
import { ChatSessionStatus as AgentSessionStatus, IChatSessionFileChange, IChatSessionFileChange2, IChatSessionItem, IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatWidgetService } from '../chat.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName, isBuiltInAgentSessionProvider } from './agentSessions.js';

//#region Interfaces, Types

export { ChatSessionStatus as AgentSessionStatus, isSessionInProgressStatus } from '../../common/chatSessionsService.js';

export interface IAgentSessionsModel {

	readonly onWillResolve: Event<void>;
	readonly onDidResolve: Event<void>;

	readonly onDidChangeSessions: Event<void>;
	readonly onDidChangeSessionArchivedState: Event<IAgentSession>;

	readonly resolved: boolean;

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

	readonly timing: IChatSessionItem['timing'];

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
	readonly archived?: boolean;
	readonly read?: number /* last date turned read */;
}

export const enum AgentSessionSection {

	// Default Grouping (by date)
	InProgress = 'inProgress',
	Today = 'today',
	Yesterday = 'yesterday',
	Week = 'week',
	Older = 'older',
	Archived = 'archived',

	// Capped Grouping
	More = 'more',
}

export interface IAgentSessionSection {
	readonly section: AgentSessionSection;
	readonly label: string;
	readonly sessions: IAgentSession[];
}

export function isAgentSessionSection(obj: unknown): obj is IAgentSessionSection {
	const candidate = obj as IAgentSessionSection;

	return typeof candidate.section === 'string' && Array.isArray(candidate.sessions);
}

export interface IMarshalledAgentSessionContext {
	readonly $mid: MarshalledId.AgentSessionContext;

	readonly session: IAgentSession;
	readonly sessions: IAgentSession[]; // support for multi-selection
}

export function isMarshalledAgentSessionContext(thing: unknown): thing is IMarshalledAgentSessionContext {
	if (typeof thing === 'object' && thing !== null) {
		const candidate = thing as IMarshalledAgentSessionContext;
		return candidate.$mid === MarshalledId.AgentSessionContext && typeof candidate.session === 'object' && candidate.session !== null;
	}

	return false;
}

//#endregion

//#region Sessions Logger

const agentSessionsOutputChannelId = 'agentSessionsOutput';
const agentSessionsOutputChannelLabel = localize('agentSessionsOutput', "Agent Sessions");

function statusToString(status: AgentSessionStatus): string {
	switch (status) {
		case AgentSessionStatus.Failed: return 'Failed';
		case AgentSessionStatus.Completed: return 'Completed';
		case AgentSessionStatus.InProgress: return 'InProgress';
		case AgentSessionStatus.NeedsInput: return 'NeedsInput';
		default: return `Unknown(${status})`;
	}
}

class AgentSessionsLogger extends Disposable {

	private isChannelRegistered = false;

	constructor(
		private readonly getSessionsData: () => {
			sessions: Iterable<IInternalAgentSession>;
			sessionStates: ResourceMap<IAgentSessionState>;
		},
		@ILogService private readonly logService: ILogService,
		@IOutputService private readonly outputService: IOutputService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();

		this.updateChannelRegistration();
		this.registerListeners();
	}

	private updateChannelRegistration(): void {
		const chatDisabled = this.chatEntitlementService.sentiment.hidden;

		if (chatDisabled && this.isChannelRegistered) {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).removeChannel(agentSessionsOutputChannelId);
			this.isChannelRegistered = false;
		} else if (!chatDisabled && !this.isChannelRegistered) {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({
				id: agentSessionsOutputChannelId,
				label: agentSessionsOutputChannelLabel,
				log: false
			});
			this.isChannelRegistered = true;
		}
	}

	private registerListeners(): void {
		this._register(this.logService.onDidChangeLogLevel(level => {
			if (level === LogLevel.Trace) {
				this.logAllStatsIfTrace('Log level changed to trace');
			}
		}));

		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			this.updateChannelRegistration();
		}));
	}

	logIfTrace(msg: string): void {
		if (this.logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		this.trace(`[Agent Sessions] ${msg}`);
	}

	logAllStatsIfTrace(reason: string): void {
		if (this.logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		this.logAllSessions(reason);
		this.logSessionStates();
	}

	private logAllSessions(reason: string): void {
		const { sessions, sessionStates } = this.getSessionsData();

		const lines: string[] = [];
		lines.push(`=== Agent Sessions (${reason}) ===`);

		let count = 0;
		for (const session of sessions) {
			count++;
			const state = sessionStates.get(session.resource);

			lines.push(`--- Session: ${session.label} ---`);
			lines.push(`  Resource: ${session.resource.toString()}`);
			lines.push(`  Provider Type: ${session.providerType}`);
			lines.push(`  Provider Label: ${session.providerLabel}`);
			lines.push(`  Status: ${statusToString(session.status)}`);
			lines.push(`  Icon: ${session.icon.id}`);

			if (session.description) {
				lines.push(`  Description: ${typeof session.description === 'string' ? session.description : session.description.value}`);
			}
			if (session.badge) {
				lines.push(`  Badge: ${typeof session.badge === 'string' ? session.badge : session.badge.value}`);
			}
			if (session.tooltip) {
				lines.push(`  Tooltip: ${typeof session.tooltip === 'string' ? session.tooltip : session.tooltip.value}`);
			}

			// Timing info
			lines.push(`  Timing:`);
			lines.push(`    Created: ${session.timing.created ? new Date(session.timing.created).toISOString() : 'N/A'}`);
			lines.push(`    Last Request Started: ${session.timing.lastRequestStarted ? new Date(session.timing.lastRequestStarted).toISOString() : 'N/A'}`);
			lines.push(`    Last Request Ended: ${session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded).toISOString() : 'N/A'}`);

			// Changes info
			if (session.changes) {
				const summary = getAgentChangesSummary(session.changes);
				if (summary) {
					lines.push(`  Changes: ${summary.files} files, +${summary.insertions} -${summary.deletions}`);
				}
			}

			// Our state (read/unread, archived)
			lines.push(`  State:`);
			lines.push(`    Archived (provider): ${session.archived ?? 'N/A'}`);
			lines.push(`    Archived (computed): ${session.isArchived()}`);
			lines.push(`    Archived (stored): ${state?.archived ?? 'N/A'}`);
			lines.push(`    Read: ${session.isRead()}`);
			lines.push(`    Read date (stored): ${state?.read ? new Date(state.read).toISOString() : 'N/A'}`);

			lines.push('');
		}

		lines.unshift(`Total sessions: ${count}`, '');

		lines.push(`=== End Agent Sessions ===`);

		this.trace(lines.join('\n'));
	}

	private logSessionStates(): void {
		const { sessionStates } = this.getSessionsData();

		const lines: string[] = [];
		lines.push(`=== Session States ===`);
		lines.push(`Total stored states: ${sessionStates.size}`);
		lines.push('');

		for (const [resource, state] of sessionStates) {
			lines.push(`URI: ${resource.toString()}`);
			lines.push(`  Archived: ${state.archived}`);
			lines.push(`  Read: ${state.read ? new Date(state.read).toISOString() : '0 (unread)'}`);
			lines.push('');
		}

		lines.push(`=== End Session States ===`);

		this.trace(lines.join('\n'));
	}

	private trace(msg: string): void {
		const channel = this.outputService.getChannel(agentSessionsOutputChannelId);
		if (!channel) {
			return;
		}

		channel.append(`${msg}\n`);
	}
}

//#endregion

export class AgentSessionsModel extends Disposable implements IAgentSessionsModel {

	private readonly _onWillResolve = this._register(new Emitter<void>());
	readonly onWillResolve = this._onWillResolve.event;

	private readonly _onDidResolve = this._register(new Emitter<void>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionArchivedState = this._register(new Emitter<IAgentSession>());
	readonly onDidChangeSessionArchivedState = this._onDidChangeSessionArchivedState.event;

	private _resolved = false;
	get resolved(): boolean { return this._resolved; }

	private _sessions: ResourceMap<IInternalAgentSession>;
	get sessions(): IAgentSession[] { return Array.from(this._sessions.values()); }

	private readonly resolver = this._register(new ThrottledDelayer<void>(300));
	private readonly providersToResolve = new Set<string | undefined>();

	private readonly cache: AgentSessionsCache;
	private readonly logger: AgentSessionsLogger;

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService
	) {
		super();

		this._sessions = new ResourceMap<IInternalAgentSession>();

		this.cache = this.instantiationService.createInstance(AgentSessionsCache);
		for (const data of this.cache.loadCachedSessions()) {
			const session = this.toAgentSession(data);
			this._sessions.set(session.resource, session);
		}
		this.sessionStates = this.cache.loadSessionStates();

		this.logger = this._register(this.instantiationService.createInstance(
			AgentSessionsLogger,
			() => ({
				sessions: this._sessions.values(),
				sessionStates: this.sessionStates,
			})
		));
		this.logger.logAllStatsIfTrace('Loaded cached sessions');

		this.readDateBaseline = this.resolveReadDateBaseline(); // we use this to account for bugfixes in the read/unread tracking

		this.registerListeners();
	}

	private registerListeners(): void {

		// Sessions changes
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType }) => this.resolve(chatSessionType)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(({ chatSessionType }) => this.resolve(chatSessionType)));

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

		const providerFilter = providersToResolve.includes(undefined) ? undefined : coalesce(providersToResolve);
		const providerResults = await this.chatSessionsService.getChatSessionItems(providerFilter, token);

		const resolvedProviders = new Set<string>();
		const sessions = new ResourceMap<IInternalAgentSession>();

		for (const { chatSessionType, items: providerSessions } of providerResults) {
			resolvedProviders.add(chatSessionType);

			if (token.isCancellationRequested) {
				return;
			}

			for (const session of providerSessions) {
				let icon: ThemeIcon;
				let providerLabel: string;
				const agentSessionProvider = getAgentSessionProvider(chatSessionType);
				if (agentSessionProvider !== undefined) {
					providerLabel = getAgentSessionProviderName(agentSessionProvider);
					icon = getAgentSessionProviderIcon(agentSessionProvider);
				} else {
					providerLabel = mapSessionContributionToType.get(chatSessionType)?.name ?? chatSessionType;
					icon = session.iconPath ?? Codicon.terminal;
				}

				const changes = session.changes;
				const normalizedChanges = changes && !(changes instanceof Array)
					? { files: changes.files, insertions: changes.insertions, deletions: changes.deletions }
					: changes;

				sessions.set(session.resource, this.toAgentSession({
					providerType: chatSessionType,
					providerLabel,
					resource: session.resource,
					label: session.label.split('\n')[0], // protect against weird multi-line labels that break our layout
					description: session.description,
					icon,
					badge: session.badge,
					tooltip: session.tooltip,
					status: session.status ?? AgentSessionStatus.Completed,
					archived: session.archived,
					timing: session.timing,
					changes: normalizedChanges,
					metadata: session.metadata,
				}));
			}
		}

		for (const [, session] of this._sessions) {
			if (!resolvedProviders.has(session.providerType) && (isBuiltInAgentSessionProvider(session.providerType) || mapSessionContributionToType.has(session.providerType))) {
				sessions.set(session.resource, session); // fill in existing sessions for providers that did not resolve if they are known or built-in
			}
		}

		this._sessions = sessions;
		this._resolved = true;

		this.logger.logAllStatsIfTrace('Sessions resolved from providers');

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

	private static readonly UNREAD_MARKER = -1;

	private readonly sessionStates: ResourceMap<IAgentSessionState>;

	private isArchived(session: IInternalAgentSessionData): boolean {
		return this.sessionStates.get(session.resource)?.archived ?? Boolean(session.archived);
	}

	private setArchived(session: IInternalAgentSessionData, archived: boolean): void {
		if (archived) {
			this.setRead(session, true); // mark as read when archiving
		}

		if (archived === this.isArchived(session)) {
			return; // no change
		}

		const state = this.sessionStates.get(session.resource) ?? {};
		this.sessionStates.set(session.resource, { ...state, archived });

		const agentSession = this._sessions.get(session.resource);
		if (agentSession) {
			this._onDidChangeSessionArchivedState.fire(agentSession);
		}

		this._onDidChangeSessions.fire();
	}

	private isRead(session: IInternalAgentSessionData): boolean {
		if (this.isArchived(session)) {
			return true; // archived sessions are always read
		}

		const storedReadDate = this.sessionStates.get(session.resource)?.read;
		if (storedReadDate === AgentSessionsModel.UNREAD_MARKER) {
			return false;
		}

		const readDate = Math.max(storedReadDate ?? 0, this.readDateBaseline /* Use read date baseline when no read date is stored */);

		// Install a heuristic to reduce false positives: a user might observe
		// the output of a session and quickly click on another session before
		// it is finished. Strictly speaking the session is unread, but we
		// allow a certain threshold of time to count as read to accommodate.
		if (readDate >= this.sessionTimeForReadStateTracking(session) - 2000) {
			return true;
		}

		// Never consider a session as unread if its connected to a widget
		return !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
	}

	private sessionTimeForReadStateTracking(session: IInternalAgentSessionData): number {
		return session.timing.lastRequestEnded ?? session.timing.created;
	}

	private setRead(session: IInternalAgentSessionData, read: boolean, skipEvent?: boolean): void {
		const state = this.sessionStates.get(session.resource) ?? {};

		let newRead: number;
		if (read) {
			newRead = Math.max(Date.now(), this.sessionTimeForReadStateTracking(session));

			if (typeof state.read === 'number' && state.read >= newRead) {
				return; // already read with a sufficient timestamp
			}
		} else {
			newRead = AgentSessionsModel.UNREAD_MARKER;
			if (state.read === AgentSessionsModel.UNREAD_MARKER) {
				return; // already unread
			}
		}

		this.sessionStates.set(session.resource, { ...state, read: newRead });

		if (!skipEvent) {
			this._onDidChangeSessions.fire();
		}
	}

	private static readonly READ_DATE_BASELINE_KEY = 'agentSessions.readDateBaseline2';

	private readonly readDateBaseline: number;

	private resolveReadDateBaseline(): number {
		let readDateBaseline = this.storageService.getNumber(AgentSessionsModel.READ_DATE_BASELINE_KEY, StorageScope.WORKSPACE, 0);
		if (readDateBaseline > 0) {
			return readDateBaseline; // already resolved
		}

		// For stable, preserve unread state for sessions from the last 7 days
		// For other qualities, mark all sessions as read
		readDateBaseline = this.productService.quality === 'stable'
			? Date.now() - (7 * 24 * 60 * 60 * 1000)
			: Date.now();

		this.storageService.store(AgentSessionsModel.READ_DATE_BASELINE_KEY, readDateBaseline, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		return readDateBaseline;
	}

	//#endregion
}

//#region Sessions Cache

interface ISerializedAgentSession {

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

	readonly metadata: { [key: string]: unknown } | undefined;

	readonly timing: {
		readonly created: number;
		readonly lastRequestStarted?: number;
		readonly lastRequestEnded?: number;
		// Old format for backward compatibility when reading (TODO@bpasero remove eventually)
		readonly startTime?: number;
		readonly endTime?: number;
	};

	readonly changes?: readonly IChatSessionFileChange[] | readonly IChatSessionFileChange2[] | {
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

			timing: session.timing,

			changes: session.changes,
			metadata: session.metadata
		} satisfies ISerializedAgentSession));

		this.storageService.store(AgentSessionsCache.SESSIONS_STORAGE_KEY, safeStringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	loadCachedSessions(): IInternalAgentSessionData[] {
		const sessionsCache = this.storageService.get(AgentSessionsCache.SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!sessionsCache) {
			return [];
		}

		try {
			const cached = JSON.parse(sessionsCache) as ISerializedAgentSession[];
			return cached.map((session): IInternalAgentSessionData => ({
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
					// Support loading both new and old cache formats (TODO@bpasero remove old format support after some time)
					created: session.timing.created ?? session.timing.startTime ?? 0,
					lastRequestStarted: session.timing.lastRequestStarted ?? session.timing.startTime,
					lastRequestEnded: session.timing.lastRequestEnded ?? session.timing.endTime,
				},

				changes: Array.isArray(session.changes) ? session.changes.map((change: IChatSessionFileChange) => ({
					modifiedUri: URI.revive(change.modifiedUri),
					originalUri: change.originalUri ? URI.revive(change.originalUri) : undefined,
					insertions: change.insertions,
					deletions: change.deletions,
				})) : session.changes,
				metadata: session.metadata,
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
