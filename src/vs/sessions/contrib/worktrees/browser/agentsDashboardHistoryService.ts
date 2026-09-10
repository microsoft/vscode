/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { getGitHubPullRequestRefs, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AgentsDashboardHistoryEvent, AgentsDashboardHistoryEventType, IAgentsDashboardHistoryService } from '../common/agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService } from '../common/worktreeDashboard.js';

const STORAGE_KEY = 'sessions.agentsDashboard.history';
const RETENTION_DAYS = 31;
const MAX_EVENTS = 10_000;
const MAX_SESSIONS = 2_000;

interface IStoredSessionSnapshot {
	readonly createdAt: number;
	readonly status: SessionStatus;
	readonly pullRequests: Record<string, 'open' | 'closed' | 'merged'>;
	readonly done: boolean;
	readonly observedAt: number;
}

interface IStoredHistory {
	readonly events: readonly AgentsDashboardHistoryEvent[];
	readonly sessions: Record<string, IStoredSessionSnapshot>;
	readonly diskUsageBytes: number | undefined;
	readonly medianSessionStorageBytes: number | undefined;
	readonly largestSessionStorageBytes: number | undefined;
	readonly updatedAt: number;
}

export class AgentsDashboardHistoryService extends Disposable implements IAgentsDashboardHistoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _events: ISettableObservable<readonly AgentsDashboardHistoryEvent[]>;
	private readonly _developmentEvents = observableValue<readonly AgentsDashboardHistoryEvent[]>(this, []);
	readonly events: IObservable<readonly AgentsDashboardHistoryEvent[]>;
	private readonly _sessions = new Map<string, IStoredSessionSnapshot>();
	private _diskUsageBytes: number | undefined;
	private _medianSessionStorageBytes: number | undefined;
	private _largestSessionStorageBytes: number | undefined;
	private readonly _saveScheduler = this._register(new RunOnceScheduler(() => this._save(), 200));
	private _storageUpdatedAt = 0;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IWorktreeDashboardService worktreeDashboardService: IWorktreeDashboardService,
	) {
		super();
		const stored = this._load();
		this._events = observableValue<readonly AgentsDashboardHistoryEvent[]>(this, stored.events);
		this.events = derived(this, reader => {
			const developmentEvents = this._developmentEvents.read(reader);
			return developmentEvents.length > 0 ? developmentEvents : this._events.read(reader);
		});
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
			this.record(
				sessionsManagementService.getSessions(),
				worktreeDashboardService.entries.read(reader),
				worktreeDashboardService.hasRefreshed.read(reader),
			);
		}));
	}

	setDevelopmentEvents(events: readonly AgentsDashboardHistoryEvent[]): void {
		this._developmentEvents.set(events, undefined);
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
			this._events.set(retained, undefined);
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
		let done = previous?.done ?? false;
		if (!previous) {
			events.push({ id: `${session.sessionId}:started`, type: AgentsDashboardHistoryEventType.SessionStarted, timestamp: Math.min(session.createdAt.getTime(), now) });
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
					events.push({ id: `${session.sessionId}:pr-created:${uri}`, type: AgentsDashboardHistoryEventType.PullRequestCreated, timestamp: now });
				}
				if (state === 'merged' && previousState !== 'merged') {
					events.push({ id: `${session.sessionId}:pr-merged:${uri}`, type: AgentsDashboardHistoryEventType.PullRequestMerged, timestamp: now });
				}
			}
		}
		const snapshot: IStoredSessionSnapshot = {
			createdAt: previous?.createdAt ?? session.createdAt.getTime(),
			status,
			pullRequests,
			done,
			observedAt: now,
		};
		if (previous && sessionSnapshotsEqual(previous, snapshot)) {
			return false;
		}
		this._sessions.set(session.sessionId, snapshot);
		return true;
	}

	private _load(): IStoredHistory {
		const empty: IStoredHistory = {
			events: [],
			sessions: {},
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
			this._events.set(mergedEvents, undefined);
		}
		for (const [sessionId, snapshot] of Object.entries(stored.sessions)) {
			if ((this._sessions.get(sessionId)?.observedAt ?? 0) < snapshot.observedAt) {
				this._sessions.set(sessionId, snapshot);
			}
		}
		if (stored.updatedAt > this._storageUpdatedAt) {
			this._storageUpdatedAt = stored.updatedAt;
			this._diskUsageBytes = stored.diskUsageBytes;
			this._medianSessionStorageBytes = stored.medianSessionStorageBytes;
			this._largestSessionStorageBytes = stored.largestSessionStorageBytes;
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
			done: snapshot.done,
			observedAt: snapshot.observedAt,
		};
	}
	return result;
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
	return firstPullRequests.length === secondPullRequests.length
		&& firstPullRequests.every(([uri, state]) => second.pullRequests[uri] === state);
}

registerSingleton(IAgentsDashboardHistoryService, AgentsDashboardHistoryService, InstantiationType.Eager);
