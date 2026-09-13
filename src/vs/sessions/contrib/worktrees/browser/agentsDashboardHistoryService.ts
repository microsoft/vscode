/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { parseOpenSessionLinkChatId } from '../../../../platform/agentHost/common/openSessionLink.js';
import { getGitHubPullRequestRefs, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ChatRequestOriginKind } from '../../../../workbench/contrib/chat/common/chatRequestOrigin.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { AgentsDashboardChatKind, AgentsDashboardChatStatus, AgentsDashboardHistoryEvent, AgentsDashboardHistoryEventType, getAgentsDashboardChatId, getAgentsDashboardChatKind, getAgentsDashboardChatStatus, IAgentsDashboardCalculatedUsage, IAgentsDashboardHistoryService } from '../common/agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService } from '../common/worktreeDashboard.js';

const STORAGE_KEY = 'sessions.agentsDashboard.history';
const RETENTION_DAYS = 31;
const MAX_EVENTS = 10_000;
const MAX_SESSIONS = 2_000;
const CHAT_MODEL_BACKFILL_BATCH_SIZE = 4;

interface IStoredSessionSnapshot {
	readonly createdAt: number;
	readonly status: SessionStatus;
	readonly pullRequests: Record<string, 'open' | 'closed' | 'merged'>;
	readonly chats: Record<string, IStoredChatSnapshot>;
	readonly done: boolean;
	readonly observedAt: number;
}

interface IStoredChatSnapshot {
	readonly createdAt: number;
	readonly status: AgentsDashboardChatStatus;
	readonly kind: AgentsDashboardChatKind;
	readonly parentChatId: string | undefined;
}

interface IStoredHistory {
	readonly events: readonly AgentsDashboardHistoryEvent[];
	readonly sessions: Record<string, IStoredSessionSnapshot>;
	readonly calculatedUsage: Record<string, IAgentsDashboardCalculatedUsage>;
	readonly diskUsageBytes: number | undefined;
	readonly medianSessionStorageBytes: number | undefined;
	readonly largestSessionStorageBytes: number | undefined;
	readonly updatedAt: number;
}

export class AgentsDashboardHistoryService extends Disposable implements IAgentsDashboardHistoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _events: ISettableObservable<readonly AgentsDashboardHistoryEvent[]>;
	private readonly _eventIds = new Set<string>();
	readonly events: IObservable<readonly AgentsDashboardHistoryEvent[]>;
	private readonly _calculatedUsage: ISettableObservable<ReadonlyMap<string, IAgentsDashboardCalculatedUsage>>;
	readonly calculatedUsage: IObservable<ReadonlyMap<string, IAgentsDashboardCalculatedUsage>>;
	private readonly _sessions = new Map<string, IStoredSessionSnapshot>();
	private _diskUsageBytes: number | undefined;
	private _medianSessionStorageBytes: number | undefined;
	private _largestSessionStorageBytes: number | undefined;
	private readonly _saveScheduler = this._register(new RunOnceScheduler(() => this._save(), 200));
	private readonly _trackedChatModels = this._register(new DisposableMap<string>());
	private readonly _pendingChatModels = new Map<string, IChatModel>();
	private readonly _chatModelBackfillScheduler = this._register(new RunOnceScheduler(() => this._processPendingChatModels(), 0));
	private _storageUpdatedAt = 0;
	private _interactionSequence = 0;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IWorktreeDashboardService worktreeDashboardService: IWorktreeDashboardService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		const stored = this._load();
		this._events = observableValue<readonly AgentsDashboardHistoryEvent[]>(this, stored.events);
		this._resetEventIds(stored.events);
		this.events = this._events;
		this._calculatedUsage = observableValue(this, new Map(Object.entries(stored.calculatedUsage)));
		this.calculatedUsage = this._calculatedUsage;
		for (const [sessionId, snapshot] of Object.entries(stored.sessions)) {
			this._sessions.set(sessionId, snapshot);
		}
		this._diskUsageBytes = stored.diskUsageBytes;
		this._medianSessionStorageBytes = stored.medianSessionStorageBytes;
		this._largestSessionStorageBytes = stored.largestSessionStorageBytes;
		this._storageUpdatedAt = stored.updatedAt;
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY, this._store)(event => {
			if (event.external) {
				this._mergeStoredHistory(this._load());
			}
		}));
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const sessions = sessionsManagementService.getSessions();
			for (const session of sessions) {
				session.status.read(reader);
				session.lastTurnEnd.read(reader);
				for (const folder of session.workspace.read(reader)?.folders ?? []) {
					folder.gitRepository?.gitHubInfo.read(reader);
				}
				for (const chat of session.chats.read(reader)) {
					chat.status.read(reader);
					chat.updatedAt.read(reader);
					const model = this.chatService.getSession(chat.resource);
					if (model) {
						this._queueChatModel(model);
					}
				}
			}
			for (const model of this.chatService.chatModels.read(reader)) {
				this._queueChatModel(model);
			}
			this.record(
				sessions,
				worktreeDashboardService.entries.read(reader),
				worktreeDashboardService.hasRefreshed.read(reader),
			);
		}));
		this._register(sessionsManagementService.onDidSendRequest(event => {
			this._recordChatInteraction(event.session, event.chat);
		}));
	}

	async calculateSessionUsage(session: ISession): Promise<IAgentsDashboardCalculatedUsage | undefined> {
		let credits = 0;
		let hasRecoverableUsage = false;
		let partial = false;
		for (const chat of session.chats.get()) {
			if (getAgentsDashboardChatKind(session, chat) === 'subagent') {
				continue;
			}
			const reference = await this.chatService.acquireOrLoadSession(
				chat.resource,
				ChatAgentLocation.Chat,
				CancellationToken.None,
				'agentsDashboard.calculateCredits',
			);
			if (!reference) {
				partial = true;
				continue;
			}
			try {
				const requests = reference.object.getRequests();
				const reportedUsage = requests.filter(request => {
					const usage = request.response?.usage;
					return typeof usage?.copilotCredits === 'number' || typeof usage?.sessionCopilotCredits === 'number';
				});
				if (reportedUsage.length > 0) {
					hasRecoverableUsage = true;
					credits += reference.object.sessionCost;
				}
				if (reportedUsage.length !== requests.length) {
					partial = true;
				}
			} finally {
				reference.dispose();
			}
		}
		if (!hasRecoverableUsage) {
			return undefined;
		}
		const usage: IAgentsDashboardCalculatedUsage = { credits, partial, updatedAt: Date.now() };
		const calculatedUsage = new Map(this._calculatedUsage.get());
		calculatedUsage.set(session.sessionId, usage);
		if (calculatedUsage.size > MAX_SESSIONS) {
			const oldest = [...calculatedUsage].sort(([, first], [, second]) => first.updatedAt - second.updatedAt)[0]?.[0];
			if (oldest && oldest !== session.sessionId) {
				calculatedUsage.delete(oldest);
			}
		}
		this._calculatedUsage.set(calculatedUsage, undefined);
		this._saveScheduler.schedule();
		return usage;
	}

	private _queueChatModel(model: IChatModel): void {
		const key = model.sessionResource.toString();
		if (this._trackedChatModels.has(key) || this._pendingChatModels.has(key)) {
			return;
		}
		this._pendingChatModels.set(key, model);
		this._chatModelBackfillScheduler.schedule();
	}

	private _processPendingChatModels(): void {
		let processed = 0;
		for (const [key, model] of this._pendingChatModels) {
			this._pendingChatModels.delete(key);
			this._trackChatModel(model);
			if (++processed >= CHAT_MODEL_BACKFILL_BATCH_SIZE) {
				break;
			}
		}
		if (this._pendingChatModels.size > 0) {
			this._chatModelBackfillScheduler.schedule();
		}
	}

	private _trackChatModel(model: IChatModel): void {
		const key = model.sessionResource.toString();
		if (this._trackedChatModels.has(key)) {
			return;
		}
		const store = new DisposableStore();
		store.add(model.onDidChange(() => this._recordChatDelegations(model)));
		store.add(model.onDidDispose(() => this._trackedChatModels.deleteAndDispose(key)));
		this._trackedChatModels.set(key, store);
		this._recordChatDelegations(model);
	}

	private _recordChatDelegations(model: IChatModel): void {
		const target = this.sessionsManagementService.getSessionForChatResource(model.sessionResource);
		if (!target) {
			return;
		}
		const targetKind = getAgentsDashboardChatKind(target.session, target.chat);
		if (targetKind !== 'main' && targetKind !== 'chat') {
			return;
		}
		const chats = target.session.chats.get();
		const newEvents: AgentsDashboardHistoryEvent[] = [];
		const retentionStart = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		for (const request of model.getRequests()) {
			if (request.origin?.kind !== ChatRequestOriginKind.Delegation || request.origin.delegationScope !== 'chat') {
				continue;
			}
			const sourceChatId = parseOpenSessionLinkChatId(request.origin.sourceSessionResource);
			const sourceChat = sourceChatId
				? chats.find(chat => chat.resource.fragment === sourceChatId)
				: target.session.mainChat.get();
			if (!sourceChat || sourceChat.resource.toString() === target.chat.resource.toString()) {
				continue;
			}
			const sourceKind = getAgentsDashboardChatKind(target.session, sourceChat);
			if (sourceKind !== 'main' && sourceKind !== 'chat') {
				continue;
			}
			const timestamp = request.requestTimestamp ?? request.timestamp;
			if (timestamp < retentionStart) {
				continue;
			}
			const id = `${target.session.sessionId}:chat-delegation:${request.id}`;
			if (this._eventIds.has(id)) {
				continue;
			}
			this._eventIds.add(id);
			newEvents.push({
				id,
				type: AgentsDashboardHistoryEventType.ChatDelegatedRequest,
				timestamp,
				sessionId: target.session.sessionId,
				sourceChatId: getAgentsDashboardChatId(sourceChat.resource),
				targetChatId: getAgentsDashboardChatId(target.chat.resource),
			});
		}
		if (newEvents.length > 0) {
			this._setEvents([...this._events.get(), ...newEvents].filter(event => event.timestamp >= retentionStart).slice(-MAX_EVENTS));
			this._saveScheduler.schedule();
		}
	}

	record(sessions: readonly ISession[], worktrees: readonly IWorktreeDashboardEntry[], includeDiskUsage = true): void {
		const now = Date.now();
		const previousEvents = this._events.get();
		const events = [...previousEvents];
		let snapshotsChanged = false;
		for (const session of sessions) {
			snapshotsChanged = this._recordSession(session, events, now) || snapshotsChanged;
		}

		let diskChanged = false;
		if (includeDiskUsage) {
			const sessionSizes = worktrees
				.filter((worktree): worktree is IWorktreeDashboardEntry & { readonly sizeBytes: number } => !!worktree.session && worktree.sizeBytes !== undefined)
				.map(worktree => worktree.sizeBytes)
				.sort((a, b) => a - b);
			const diskUsageBytes = sessionSizes.reduce((total, size) => total + size, 0);
			const medianSessionStorageBytes = median(sessionSizes);
			const largestSessionStorageBytes = sessionSizes.at(-1);
			if (diskUsageBytes !== this._diskUsageBytes
				|| medianSessionStorageBytes !== this._medianSessionStorageBytes
				|| largestSessionStorageBytes !== this._largestSessionStorageBytes) {
				this._diskUsageBytes = diskUsageBytes;
				this._medianSessionStorageBytes = medianSessionStorageBytes;
				this._largestSessionStorageBytes = largestSessionStorageBytes;
				events.push({
					id: `disk:${now}:${diskUsageBytes}:${medianSessionStorageBytes ?? ''}:${largestSessionStorageBytes ?? ''}`,
					type: AgentsDashboardHistoryEventType.DiskUsage,
					timestamp: now,
					value: diskUsageBytes,
					medianSessionBytes: medianSessionStorageBytes,
					largestSessionBytes: largestSessionStorageBytes,
				});
				diskChanged = true;
			}
		}

		const retentionStart = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		const retained = events.filter(event => event.timestamp >= retentionStart).slice(-MAX_EVENTS);
		const eventsChanged = retained.length !== previousEvents.length || retained.some((event, index) => event !== previousEvents[index]);
		if (eventsChanged) {
			this._setEvents(retained);
		}
		const currentSessionIds = new Set(sessions.map(session => session.sessionId));
		for (const sessionId of this._sessions.keys()) {
			if (this._sessions.size <= MAX_SESSIONS) {
				break;
			}
			if (!currentSessionIds.has(sessionId)) {
				this._sessions.delete(sessionId);
				snapshotsChanged = true;
			}
		}
		if (eventsChanged || snapshotsChanged || diskChanged) {
			this._saveScheduler.schedule();
		}
	}

	private _recordSession(session: ISession, events: AgentsDashboardHistoryEvent[], now: number): boolean {
		const previous = this._sessions.get(session.sessionId);
		const status = session.status.get();
		const pullRequests = collectPullRequests(session);
		const chats = collectChats(session);
		let done = previous?.done ?? false;
		if (!previous) {
			events.push({ id: `${session.sessionId}:started`, type: AgentsDashboardHistoryEventType.SessionStarted, timestamp: Math.min(session.createdAt.getTime(), now) });
			for (const [chatId, chat] of Object.entries(chats)) {
				events.push(toChatCreatedEvent(session.sessionId, chatId, chat));
				events.push(toChatStatusEvent(session.sessionId, chatId, chat.status, now, 'initial'));
			}
			const lastTurnEnd = session.lastTurnEnd.get()?.getTime();
			if (status === SessionStatus.Completed && lastTurnEnd !== undefined) {
				const completedAt = Math.max(session.createdAt.getTime(), Math.min(lastTurnEnd, now));
				events.push({
					id: `${session.sessionId}:done`,
					type: AgentsDashboardHistoryEventType.SessionDone,
					timestamp: completedAt,
					durationMs: completedAt - session.createdAt.getTime(),
				});
				done = true;
			}
		} else {
			for (const [chatId, chat] of Object.entries(chats)) {
				const previousChat = previous.chats[chatId];
				if (!previousChat) {
					events.push(toChatCreatedEvent(session.sessionId, chatId, chat));
					events.push(toChatStatusEvent(session.sessionId, chatId, chat.status, now, 'initial'));
				} else if (previousChat.status !== chat.status) {
					events.push(toChatStatusEvent(session.sessionId, chatId, chat.status, now, String(this._interactionSequence++)));
				}
			}
			if (!previous.done && status === SessionStatus.Completed) {
				const completedAt = Math.max(previous.createdAt, Math.min(session.lastTurnEnd.get()?.getTime() ?? now, now));
				events.push({
					id: `${session.sessionId}:done`,
					type: AgentsDashboardHistoryEventType.SessionDone,
					timestamp: completedAt,
					durationMs: completedAt - previous.createdAt,
				});
				done = true;
			}
			for (const [uri, state] of Object.entries(pullRequests)) {
				const previousState = previous.pullRequests[uri];
				if (!previousState) {
					events.push({ id: `${session.sessionId}:pr-created:${uri}`, type: AgentsDashboardHistoryEventType.PullRequestCreated, timestamp: now, sessionId: session.sessionId });
				}
				if (state === 'merged' && previousState !== 'merged') {
					events.push({ id: `${session.sessionId}:pr-merged:${uri}`, type: AgentsDashboardHistoryEventType.PullRequestMerged, timestamp: now, sessionId: session.sessionId });
				}
			}
		}
		const snapshot: IStoredSessionSnapshot = {
			createdAt: previous?.createdAt ?? session.createdAt.getTime(),
			status,
			pullRequests,
			chats,
			done,
			observedAt: now,
		};
		if (previous && sessionSnapshotsEqual(previous, snapshot)) {
			return false;
		}
		this._sessions.set(session.sessionId, snapshot);
		return true;
	}

	private _recordChatInteraction(session: ISession, chat: IChat): void {
		const timestamp = Date.now();
		const chatId = getAgentsDashboardChatId(chat.resource);
		const event: AgentsDashboardHistoryEvent = {
			id: `${session.sessionId}:chat:${chatId}:interaction:${timestamp}:${this._interactionSequence++}`,
			type: AgentsDashboardHistoryEventType.ChatInteraction,
			timestamp,
			sessionId: session.sessionId,
			chatId,
		};
		const retentionStart = timestamp - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		this._setEvents([...this._events.get(), event].filter(candidate => candidate.timestamp >= retentionStart).slice(-MAX_EVENTS));
		this._saveScheduler.schedule();
	}

	private _load(): IStoredHistory {
		const empty: IStoredHistory = {
			events: [],
			sessions: {},
			calculatedUsage: {},
			diskUsageBytes: undefined,
			medianSessionStorageBytes: undefined,
			largestSessionStorageBytes: undefined,
			updatedAt: 0,
		};
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return empty;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return empty;
			}
			const stored = parsed as Partial<IStoredHistory>;
			return {
				events: Array.isArray(stored.events) ? stored.events.filter(isHistoryEvent).slice(-MAX_EVENTS) : [],
				sessions: readStoredSessions(stored.sessions),
				calculatedUsage: readCalculatedUsage(stored.calculatedUsage),
				diskUsageBytes: typeof stored.diskUsageBytes === 'number' && stored.diskUsageBytes >= 0 ? stored.diskUsageBytes : undefined,
				medianSessionStorageBytes: isNonNegativeFiniteNumber(stored.medianSessionStorageBytes) ? stored.medianSessionStorageBytes : undefined,
				largestSessionStorageBytes: isNonNegativeFiniteNumber(stored.largestSessionStorageBytes) ? stored.largestSessionStorageBytes : undefined,
				updatedAt: isNonNegativeFiniteNumber(stored.updatedAt) ? stored.updatedAt : 0,
			};
		} catch {
			return empty;
		}
	}

	private _save(): void {
		this._mergeStoredHistory(this._load());
		const sessions: Record<string, IStoredSessionSnapshot> = {};
		for (const [sessionId, snapshot] of this._sessions) {
			sessions[sessionId] = snapshot;
		}
		this._storageUpdatedAt = Date.now();
		this.storageService.store(STORAGE_KEY, JSON.stringify({
			events: this._events.get(),
			sessions,
			calculatedUsage: Object.fromEntries(this._calculatedUsage.get()),
			diskUsageBytes: this._diskUsageBytes,
			medianSessionStorageBytes: this._medianSessionStorageBytes,
			largestSessionStorageBytes: this._largestSessionStorageBytes,
			updatedAt: this._storageUpdatedAt,
		} satisfies IStoredHistory), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _mergeStoredHistory(stored: IStoredHistory): void {
		const events = new Map(this._events.get().map(event => [event.id, event]));
		for (const event of stored.events) {
			if (!events.has(event.id)) {
				events.set(event.id, event);
			}
		}
		const mergedEvents = [...events.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_EVENTS);
		if (mergedEvents.length !== this._events.get().length || mergedEvents.some((event, index) => event.id !== this._events.get()[index]?.id)) {
			this._setEvents(mergedEvents);
		}
		for (const [sessionId, snapshot] of Object.entries(stored.sessions)) {
			if ((this._sessions.get(sessionId)?.observedAt ?? 0) < snapshot.observedAt) {
				this._sessions.set(sessionId, snapshot);
			}
		}
		const calculatedUsage = new Map(this._calculatedUsage.get());
		let calculatedUsageChanged = false;
		for (const [sessionId, usage] of Object.entries(stored.calculatedUsage)) {
			if ((calculatedUsage.get(sessionId)?.updatedAt ?? 0) < usage.updatedAt) {
				calculatedUsage.set(sessionId, usage);
				calculatedUsageChanged = true;
			}
		}
		if (calculatedUsageChanged) {
			this._calculatedUsage.set(calculatedUsage, undefined);
		}
		if (stored.updatedAt > this._storageUpdatedAt) {
			this._storageUpdatedAt = stored.updatedAt;
			this._diskUsageBytes = stored.diskUsageBytes;
			this._medianSessionStorageBytes = stored.medianSessionStorageBytes;
			this._largestSessionStorageBytes = stored.largestSessionStorageBytes;
		}
	}

	private _setEvents(events: readonly AgentsDashboardHistoryEvent[]): void {
		this._events.set(events, undefined);
		this._resetEventIds(events);
	}

	private _resetEventIds(events: readonly AgentsDashboardHistoryEvent[]): void {
		this._eventIds.clear();
		for (const event of events) {
			this._eventIds.add(event.id);
		}
	}
}

function collectPullRequests(session: ISession): Record<string, 'open' | 'closed' | 'merged'> {
	const result: Record<string, 'open' | 'closed' | 'merged'> = {};
	for (const folder of session.workspace.get()?.folders ?? []) {
		const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
		for (const pullRequest of getGitHubPullRequestRefs(gitHubInfo)) {
			if (gitHubInfo?.pullRequests && pullRequest.createdByThisSession !== true) {
				continue;
			}
			result[pullRequest.uri.toString()] = pullRequest.liveState ?? pullRequest.state ?? 'open';
		}
	}
	return result;
}

function isHistoryEvent(value: unknown): value is AgentsDashboardHistoryEvent {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const event = value as Record<string, unknown>;
	if (typeof event.id !== 'string' || !event.id || typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp) || event.timestamp < 0) {
		return false;
	}
	switch (event.type) {
		case AgentsDashboardHistoryEventType.SessionStarted:
		case AgentsDashboardHistoryEventType.PullRequestCreated:
		case AgentsDashboardHistoryEventType.PullRequestMerged:
			return true;
		case AgentsDashboardHistoryEventType.SessionDone:
			return isNonNegativeFiniteNumber(event.durationMs);
		case AgentsDashboardHistoryEventType.DiskUsage:
			return isNonNegativeFiniteNumber(event.value)
				&& (event.medianSessionBytes === undefined || isNonNegativeFiniteNumber(event.medianSessionBytes))
				&& (event.largestSessionBytes === undefined || isNonNegativeFiniteNumber(event.largestSessionBytes));
		case AgentsDashboardHistoryEventType.ChatCreated:
			return isChatIdentityEvent(event)
				&& isChatKind(event.chatKind)
				&& (event.parentChatId === undefined || typeof event.parentChatId === 'string');
		case AgentsDashboardHistoryEventType.ChatInteraction:
			return isChatIdentityEvent(event);
		case AgentsDashboardHistoryEventType.ChatDelegatedRequest:
			return typeof event.sessionId === 'string' && !!event.sessionId
				&& typeof event.sourceChatId === 'string' && !!event.sourceChatId
				&& typeof event.targetChatId === 'string' && !!event.targetChatId;
		case AgentsDashboardHistoryEventType.ChatStatusChanged:
			return isChatIdentityEvent(event) && isChatStatus(event.status);
		default:
			return false;
	}
}

function readStoredSessions(value: unknown): Record<string, IStoredSessionSnapshot> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, IStoredSessionSnapshot> = {};
	for (const [sessionId, candidate] of Object.entries(value as Record<string, unknown>)) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			continue;
		}
		const snapshot = candidate as Record<string, unknown>;
		if (!isNonNegativeFiniteNumber(snapshot.createdAt)
			|| !isSessionStatus(snapshot.status)
			|| !snapshot.pullRequests || typeof snapshot.pullRequests !== 'object' || Array.isArray(snapshot.pullRequests)
			|| (snapshot.chats !== undefined && (!snapshot.chats || typeof snapshot.chats !== 'object' || Array.isArray(snapshot.chats)))
			|| typeof snapshot.done !== 'boolean'
			|| !isNonNegativeFiniteNumber(snapshot.observedAt)) {
			continue;
		}
		const pullRequests: Record<string, 'open' | 'closed' | 'merged'> = {};
		for (const [uri, state] of Object.entries(snapshot.pullRequests as Record<string, unknown>)) {
			if (state === 'open' || state === 'closed' || state === 'merged') {
				pullRequests[uri] = state;
			}
		}
		result[sessionId] = {
			createdAt: snapshot.createdAt,
			status: snapshot.status as SessionStatus,
			pullRequests,
			chats: readStoredChats(snapshot.chats),
			done: snapshot.done,
			observedAt: snapshot.observedAt,
		};
	}
	return result;
}

function readCalculatedUsage(value: unknown): Record<string, IAgentsDashboardCalculatedUsage> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, IAgentsDashboardCalculatedUsage> = {};
	for (const [sessionId, candidate] of Object.entries(value as Record<string, unknown>)) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			continue;
		}
		const usage = candidate as Record<string, unknown>;
		if (isNonNegativeFiniteNumber(usage.credits) && typeof usage.partial === 'boolean' && isNonNegativeFiniteNumber(usage.updatedAt)) {
			result[sessionId] = { credits: usage.credits, partial: usage.partial, updatedAt: usage.updatedAt };
		}
	}
	return Object.fromEntries(Object.entries(result)
		.sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
		.slice(0, MAX_SESSIONS));
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function median(values: readonly number[]): number | undefined {
	if (values.length === 0) {
		return undefined;
	}
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function isSessionStatus(value: unknown): value is SessionStatus {
	return value === SessionStatus.Untitled
		|| value === SessionStatus.InProgress
		|| value === SessionStatus.NeedsInput
		|| value === SessionStatus.Completed
		|| value === SessionStatus.Error;
}

function sessionSnapshotsEqual(first: IStoredSessionSnapshot, second: IStoredSessionSnapshot): boolean {
	if (first.createdAt !== second.createdAt
		|| first.status !== second.status
		|| first.done !== second.done) {
		return false;
	}
	const firstPullRequests = Object.entries(first.pullRequests);
	const secondPullRequests = Object.entries(second.pullRequests);
	const firstChats = Object.entries(first.chats);
	const secondChats = Object.entries(second.chats);
	return firstPullRequests.length === secondPullRequests.length
		&& firstPullRequests.every(([uri, state]) => second.pullRequests[uri] === state)
		&& firstChats.length === secondChats.length
		&& firstChats.every(([chatId, chat]) => {
			const candidate = second.chats[chatId];
			return candidate?.createdAt === chat.createdAt
				&& candidate.status === chat.status
				&& candidate.kind === chat.kind
				&& candidate.parentChatId === chat.parentChatId;
		});
}

function collectChats(session: ISession): Record<string, IStoredChatSnapshot> {
	const result: Record<string, IStoredChatSnapshot> = {};
	for (const chat of session.chats.get()) {
		result[getAgentsDashboardChatId(chat.resource)] = {
			createdAt: chat.createdAt.getTime(),
			status: getAgentsDashboardChatStatus(chat.status.get()),
			kind: getAgentsDashboardChatKind(session, chat),
			parentChatId: chat.origin?.parentChat ? getAgentsDashboardChatId(chat.origin.parentChat) : undefined,
		};
	}
	return result;
}

function toChatCreatedEvent(sessionId: string, chatId: string, chat: IStoredChatSnapshot): AgentsDashboardHistoryEvent {
	return {
		id: `${sessionId}:chat:${chatId}:created`,
		type: AgentsDashboardHistoryEventType.ChatCreated,
		timestamp: chat.createdAt,
		sessionId,
		chatId,
		chatKind: chat.kind,
		parentChatId: chat.parentChatId,
	};
}

function toChatStatusEvent(sessionId: string, chatId: string, status: AgentsDashboardChatStatus, timestamp: number, suffix: string): AgentsDashboardHistoryEvent {
	return {
		id: `${sessionId}:chat:${chatId}:status:${status}:${suffix}`,
		type: AgentsDashboardHistoryEventType.ChatStatusChanged,
		timestamp,
		sessionId,
		chatId,
		status,
	};
}

function readStoredChats(value: unknown): Record<string, IStoredChatSnapshot> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, IStoredChatSnapshot> = {};
	for (const [chatId, candidate] of Object.entries(value as Record<string, unknown>)) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			continue;
		}
		const chat = candidate as Record<string, unknown>;
		if (!isNonNegativeFiniteNumber(chat.createdAt)
			|| !isChatStatus(chat.status)
			|| !isChatKind(chat.kind)
			|| (chat.parentChatId !== undefined && typeof chat.parentChatId !== 'string')) {
			continue;
		}
		result[chatId] = {
			createdAt: chat.createdAt,
			status: chat.status,
			kind: chat.kind,
			parentChatId: chat.parentChatId as string | undefined,
		};
	}
	return result;
}

function isChatIdentityEvent(event: Record<string, unknown>): boolean {
	return typeof event.sessionId === 'string' && !!event.sessionId
		&& typeof event.chatId === 'string' && !!event.chatId;
}

function isChatKind(value: unknown): value is AgentsDashboardChatKind {
	return value === 'main' || value === 'chat' || value === 'fork' || value === 'sideChat' || value === 'subagent';
}

function isChatStatus(value: unknown): value is AgentsDashboardChatStatus {
	return value === 'working' || value === 'inputNeeded' || value === 'done' || value === 'failed';
}

registerSingleton(IAgentsDashboardHistoryService, AgentsDashboardHistoryService, InstantiationType.Eager);
