/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from '../../../services/sessions/common/session.js';

/** Storage key for the cumulative number of times this client has been launched. */
const APP_LAUNCH_COUNT_KEY = 'agentSessions.telemetry.summary.appLaunchCount';
/** Storage key for the per-session lifecycle stats map (JSON encoded). Exported for tests. */
export const SESSIONS_KEY = 'agentSessions.telemetry.summary.sessions';
/** Storage key for the cumulative number of sessions started from the Agents window across all workspaces and providers. */
export const TOTAL_SESSIONS_KEY = 'agentSessions.telemetry.totalSessions';
/** Storage key for the cumulative number of sessions started in each workspace (JSON encoded map of workspace URI -> count). */
const WORKSPACE_SESSIONS_KEY = 'agentSessions.telemetry.workspaceSessions';
/** Storage key for the cumulative number of sessions started for each sessions provider (JSON encoded map of providerId -> count). */
const PROVIDER_SESSIONS_KEY = 'agentSessions.telemetry.providerSessions';
/** Hard cap on the number of tracked sessions to prevent unbounded storage growth. Exported for tests. */
export const MAX_TRACKED_SESSIONS = 2000;

/** Reason a session is considered "done" and the summary is emitted. */
export type SessionDoneReason = 'archived' | 'deleted' | 'archivedRemotely' | 'deletedRemotely';

/**
 * Cumulative user-request counters maintained by {@link SessionsLifecycleTracker}.
 * The values are returned post-increment by
 * {@link SessionsLifecycleTracker.incrementAndGetUserRequestCounters}, or read
 * unchanged via {@link SessionsLifecycleTracker.getUserRequestCounters}.
 */
export interface IUserRequestCounters {
	readonly userSessionsTotal: number;
	readonly userSessionsInWorkspace: number;
	readonly userSessionsForProvider: number;
}

/** Keys of {@link IStoredSessionStats} that hold simple incrementable counters. */
export type SessionLifecycleCounterKey =
	| 'feedbackAdded' | 'feedbackConverted' | 'feedbackReplyAdded' | 'feedbackSubmitted'
	| 'createPullRequest' | 'createDraftPullRequest' | 'updatePullRequest' | 'mergePullRequest' | 'checkoutPullRequest'
	| 'initializeRepository' | 'commit' | 'commitAndSync'
	| 'sessionRestored' | 'stickinessToggled' | 'maximizeToggled'
	| 'chatDeleted' | 'chatRenamed' | 'sessionRenamed' | 'fixCIChecks' | 'taskRun';

/**
 * Persisted shape of a single tracked session. Stored as a JSON value in the
 * application-scoped storage so that tracking survives app restarts and
 * spans across workspaces.
 */
interface IStoredSessionStats {
	// Identification (captured at first-observed time)
	providerId: string;
	providerType: string;
	sessionResourceUri: string;
	workspaceUriString: string;
	isolationKind: 'worktree' | 'folder';
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;

	// Origin
	firstRequestSentInThisClient: boolean;

	// Task state observed at the time of the first request (only set once).
	// `undefined` until recorded.
	hasWorktreeCreatedTask: boolean | undefined;
	configuredTasksCount: number | undefined;

	// Timing (ms epoch)
	firstObservedAt: number;
	firstRequestSentAt: number;

	// App launches
	appLaunchCountAtFirstObserved: number;

	// Per-event counters
	requestsSent: number;
	chatCount: number;
	feedbackAdded: number;
	feedbackConverted: number;
	feedbackReplyAdded: number;
	feedbackSubmitted: number;
	createPullRequest: number;
	createDraftPullRequest: number;
	updatePullRequest: number;
	mergePullRequest: number;
	checkoutPullRequest: number;
	initializeRepository: number;
	commit: number;
	commitAndSync: number;
	sessionRestored: number;
	stickinessToggled: number;
	maximizeToggled: number;
	chatDeleted: number;
	chatRenamed: number;
	sessionRenamed: number;
	fixCIChecks: number;
	taskRun: number;

	// End state (refreshed on every interaction)
	filesChanged: number;
	linesAdded: number;
	linesDeleted: number;
}

/**
 * Flat summary produced by {@link SessionsLifecycleTracker.finalize}. The
 * shape matches the fields of the `agents/sessionSummary` telemetry event
 * declared in `sessionsTelemetry.contribution.ts`.
 */
export interface ISessionLifecycleSummary {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	isolationKind: 'worktree' | 'folder';
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	doneReason: SessionDoneReason;
	firstRequestSentInThisClient: boolean;
	hasWorktreeCreatedTask: boolean | undefined;
	configuredTasksCount: number | undefined;
	timeSinceFirstObservedMs: number;
	timeSinceFirstRequestMs: number;
	appLaunchesSinceFirstObserved: number;
	requestsSent: number;
	chatCount: number;
	feedbackAdded: number;
	feedbackConverted: number;
	feedbackReplyAdded: number;
	feedbackSubmitted: number;
	createPullRequest: number;
	createDraftPullRequest: number;
	updatePullRequest: number;
	mergePullRequest: number;
	checkoutPullRequest: number;
	initializeRepository: number;
	commit: number;
	commitAndSync: number;
	sessionRestored: number;
	stickinessToggled: number;
	maximizeToggled: number;
	chatDeleted: number;
	chatRenamed: number;
	sessionRenamed: number;
	fixCIChecks: number;
	taskRun: number;
	filesChanged: number;
	linesAdded: number;
	linesDeleted: number;
	userSessionsTotal: number;
	userSessionsInWorkspace: number;
	userSessionsForProvider: number;
}

/**
 * Tracks per-session lifecycle stats for the `agents/sessionSummary` telemetry
 * event. Tracking starts the first time the user interacts with a session in
 * this client (sending a request, running a session-scoped command, adding
 * feedback, …) and ends when the session is considered done — locally
 * archived/deleted or observed as archived/deleted via the provider (i.e.,
 * the user finished it in a different client).
 *
 * State is persisted in application-scoped storage so a session opened today
 * and archived next week — possibly across many app launches and in a
 * different workspace — still produces a single summary event covering the
 * entire lifetime.
 */
export class SessionsLifecycleTracker extends Disposable {

	private readonly _appLaunchCount: number;
	private readonly _stats: Map<string, IStoredSessionStats>;

	constructor(private readonly _storageService: IStorageService) {
		super();

		const previousAppLaunches = this._storageService.getNumber(APP_LAUNCH_COUNT_KEY, StorageScope.APPLICATION, 0);
		this._appLaunchCount = previousAppLaunches + 1;
		this._storageService.store(APP_LAUNCH_COUNT_KEY, this._appLaunchCount, StorageScope.APPLICATION, StorageTarget.MACHINE);

		this._stats = this._load();
	}

	/** Record a request that creates a new chat for the given session. Bumps both `requestsSent` and `chatCount`. */
	recordNewChatRequestSent(session: ISession): void {
		this._recordRequestSent(session, /* isNewChat */ true);
	}

	/** Record a follow-up request within an existing chat. Bumps `requestsSent` but not `chatCount`. */
	recordRequestSent(session: ISession): void {
		this._recordRequestSent(session, /* isNewChat */ false);
	}

	private _recordRequestSent(session: ISession, isNewChat: boolean): void {
		const entry = this._ensure(session);
		entry.requestsSent++;
		if (isNewChat) {
			entry.chatCount++;
		}
		if (entry.firstRequestSentAt === 0) {
			entry.firstRequestSentAt = Date.now();
			entry.firstRequestSentInThisClient = true;
		}
		this._updateChangesSummary(entry, session);
		this._save();
	}

	/**
	 * Records task-related state observed at the time of the first user
	 * request for the given session. Only the first call per tracked session
	 * has an effect; subsequent calls are ignored.
	 */
	recordFirstRequestTaskInfo(session: ISession, info: { readonly hasWorktreeCreatedTask: boolean; readonly configuredTasksCount: number }): void {
		const entry = this._stats.get(session.sessionId);
		if (!entry || entry.hasWorktreeCreatedTask !== undefined) {
			return;
		}
		entry.hasWorktreeCreatedTask = info.hasWorktreeCreatedTask;
		entry.configuredTasksCount = info.configuredTasksCount;
		this._save();
	}

	/** Increment a named counter. Creates a tracking entry if the session is not yet tracked. */
	bumpCounter(session: ISession, key: SessionLifecycleCounterKey): void {
		const entry = this._ensure(session);
		entry[key]++;
		this._updateChangesSummary(entry, session);
		this._save();
	}

	/** Refresh observed change summary for a tracked session. No-op when not tracked. */
	updateSessionState(session: ISession): void {
		const entry = this._stats.get(session.sessionId);
		if (!entry) {
			return;
		}
		this._updateChangesSummary(entry, session);
		this._save();
	}

	/**
	 * Increments the persisted user-request counters (total, per-workspace,
	 * per-provider) and returns the new values. Should be called once per
	 * brand-new session the user starts from the Agents window.
	 */
	incrementAndGetUserRequestCounters(session: ISession): IUserRequestCounters {
		const providerId = session.providerId;
		const workspaceUri = session.workspace.get()?.uri.toString();

		const userSessionsTotal = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) + 1;
		this._storageService.store(TOTAL_SESSIONS_KEY, userSessionsTotal, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const providerCounts = this._readCounterMap(PROVIDER_SESSIONS_KEY);
		const userSessionsForProvider = (providerCounts[providerId] ?? 0) + 1;
		providerCounts[providerId] = userSessionsForProvider;
		this._storageService.store(PROVIDER_SESSIONS_KEY, JSON.stringify(providerCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);

		let userSessionsInWorkspace = 0;
		if (workspaceUri) {
			const workspaceCounts = this._readCounterMap(WORKSPACE_SESSIONS_KEY);
			userSessionsInWorkspace = (workspaceCounts[workspaceUri] ?? 0) + 1;
			workspaceCounts[workspaceUri] = userSessionsInWorkspace;
			this._storageService.store(WORKSPACE_SESSIONS_KEY, JSON.stringify(workspaceCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		return { userSessionsTotal, userSessionsInWorkspace, userSessionsForProvider };
	}

	/** Reads the persisted user-request counters without incrementing them. */
	getUserRequestCounters(session: ISession): IUserRequestCounters {
		return this._readUserRequestCounters(session.providerId, session.workspace.get()?.uri.toString());
	}

	/** Whether the given session id has a tracking entry. */
	isTracked(sessionId: string): boolean {
		return this._stats.has(sessionId);
	}

	/** Snapshot of tracked session ids. */
	getTrackedIds(): string[] {
		return [...this._stats.keys()];
	}

	/** Snapshot of tracked sessions as `(sessionId, providerId)` pairs. */
	getTrackedEntries(): readonly { readonly sessionId: string; readonly providerId: string }[] {
		const result: { sessionId: string; providerId: string }[] = [];
		for (const [sessionId, entry] of this._stats) {
			result.push({ sessionId, providerId: entry.providerId });
		}
		return result;
	}

	/**
	 * Build a summary for the given tracked session and remove its entry.
	 * Returns `undefined` if the session was not tracked (e.g., already
	 * finalized by a competing event).
	 */
	finalize(sessionId: string, reason: SessionDoneReason, finalSession?: ISession): ISessionLifecycleSummary | undefined {
		const entry = this._stats.get(sessionId);
		if (!entry) {
			return undefined;
		}
		if (finalSession) {
			this._updateChangesSummary(entry, finalSession);
		}
		this._stats.delete(sessionId);
		this._save();
		return buildSummary(sessionId, entry, reason, this._appLaunchCount, this._readUserRequestCountersForSummary(entry));
	}

	// -- internals -------------------------------------------------------------

	private _readUserRequestCountersForSummary(entry: IStoredSessionStats): IUserRequestCounters {
		return this._readUserRequestCounters(entry.providerId, entry.workspaceUriString || undefined);
	}

	private _readUserRequestCounters(providerId: string, workspaceUri: string | undefined): IUserRequestCounters {
		const userSessionsTotal = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
		const providerCounts = this._readCounterMap(PROVIDER_SESSIONS_KEY);
		const userSessionsForProvider = providerCounts[providerId] ?? 0;
		let userSessionsInWorkspace = 0;
		if (workspaceUri) {
			const workspaceCounts = this._readCounterMap(WORKSPACE_SESSIONS_KEY);
			userSessionsInWorkspace = workspaceCounts[workspaceUri] ?? 0;
		}
		return { userSessionsTotal, userSessionsInWorkspace, userSessionsForProvider };
	}

	private _readCounterMap(key: string): Record<string, number> {
		const raw = this._storageService.get(key, StorageScope.APPLICATION);
		if (!raw) {
			return {};
		}
		try {
			const parsed = JSON.parse(raw);
			return (parsed && typeof parsed === 'object') ? parsed as Record<string, number> : {};
		} catch {
			return {};
		}
	}

	private _ensure(session: ISession): IStoredSessionStats {
		const id = session.sessionId;
		let entry = this._stats.get(id);
		if (!entry) {
			if (this._stats.size >= MAX_TRACKED_SESSIONS) {
				this._evictOldest();
			}
			entry = createEntry(session, this._appLaunchCount);
			this._stats.set(id, entry);
		}
		return entry;
	}

	private _updateChangesSummary(entry: IStoredSessionStats, session: ISession): void {
		const summary = session.changesSummary?.get();
		if (summary) {
			entry.filesChanged = summary.files;
			entry.linesAdded = summary.additions;
			entry.linesDeleted = summary.deletions;
			return;
		}
		let files = 0;
		let additions = 0;
		let deletions = 0;
		for (const change of session.changes.get()) {
			files++;
			additions += change.insertions;
			deletions += change.deletions;
		}
		entry.filesChanged = files;
		entry.linesAdded = additions;
		entry.linesDeleted = deletions;
	}

	private _evictOldest(): void {
		let oldestId: string | undefined;
		let oldestTime = Number.POSITIVE_INFINITY;
		for (const [id, entry] of this._stats) {
			if (entry.firstObservedAt < oldestTime) {
				oldestTime = entry.firstObservedAt;
				oldestId = id;
			}
		}
		if (oldestId !== undefined) {
			this._stats.delete(oldestId);
		}
	}

	private _load(): Map<string, IStoredSessionStats> {
		const raw = this._storageService.get(SESSIONS_KEY, StorageScope.APPLICATION);
		const map = new Map<string, IStoredSessionStats>();
		if (!raw) {
			return map;
		}
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
					if (value && typeof value === 'object') {
						map.set(id, value as IStoredSessionStats);
					}
				}
			}
		} catch {
			// Ignore corrupt storage; start fresh.
		}
		return map;
	}

	private _save(): void {
		if (this._stats.size === 0) {
			this._storageService.remove(SESSIONS_KEY, StorageScope.APPLICATION);
			return;
		}
		const obj: Record<string, IStoredSessionStats> = {};
		for (const [id, entry] of this._stats) {
			obj[id] = entry;
		}
		this._storageService.store(SESSIONS_KEY, JSON.stringify(obj), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

function createEntry(session: ISession, appLaunchCount: number): IStoredSessionStats {
	const workspace = session.workspace.get();
	const workspaceUriString = workspace?.uri.toString() ?? '';
	const hasWorktree = workspace?.folders.some(folder => folder.gitRepository?.workTreeUri !== undefined) ?? false;
	const hasGit = workspace?.folders.some(folder => folder.gitRepository !== undefined) ?? false;
	const isVirtual = workspace ? workspace.uri.scheme !== Schemas.file : false;
	return {
		providerId: session.providerId,
		providerType: session.sessionType,
		sessionResourceUri: session.resource.toString(),
		workspaceUriString,
		isolationKind: hasWorktree ? 'worktree' : 'folder',
		hasGitRepository: hasGit,
		isVirtualWorkspace: isVirtual,
		firstRequestSentInThisClient: false,
		hasWorktreeCreatedTask: undefined,
		configuredTasksCount: undefined,
		firstObservedAt: Date.now(),
		firstRequestSentAt: 0,
		appLaunchCountAtFirstObserved: appLaunchCount,
		requestsSent: 0,
		chatCount: 0,
		feedbackAdded: 0,
		feedbackConverted: 0,
		feedbackReplyAdded: 0,
		feedbackSubmitted: 0,
		createPullRequest: 0,
		createDraftPullRequest: 0,
		updatePullRequest: 0,
		mergePullRequest: 0,
		checkoutPullRequest: 0,
		initializeRepository: 0,
		commit: 0,
		commitAndSync: 0,
		sessionRestored: 0,
		stickinessToggled: 0,
		maximizeToggled: 0,
		chatDeleted: 0,
		chatRenamed: 0,
		sessionRenamed: 0,
		fixCIChecks: 0,
		taskRun: 0,
		filesChanged: 0,
		linesAdded: 0,
		linesDeleted: 0,
	};
}

function buildSummary(sessionId: string, entry: IStoredSessionStats, reason: SessionDoneReason, appLaunchCount: number, requestCounters: IUserRequestCounters): ISessionLifecycleSummary {
	const now = Date.now();
	return {
		agentSessionId: sessionId,
		providerId: entry.providerId,
		providerType: entry.providerType,
		isolationKind: entry.isolationKind,
		workspaceHash: entry.workspaceUriString ? hash(entry.workspaceUriString).toString(16) : '',
		hasGitRepository: entry.hasGitRepository,
		isVirtualWorkspace: entry.isVirtualWorkspace,
		doneReason: reason,
		firstRequestSentInThisClient: entry.firstRequestSentInThisClient,
		hasWorktreeCreatedTask: entry.hasWorktreeCreatedTask,
		configuredTasksCount: entry.configuredTasksCount,
		timeSinceFirstObservedMs: now - entry.firstObservedAt,
		timeSinceFirstRequestMs: entry.firstRequestSentAt > 0 ? (now - entry.firstRequestSentAt) : -1,
		appLaunchesSinceFirstObserved: appLaunchCount - entry.appLaunchCountAtFirstObserved,
		requestsSent: entry.requestsSent,
		chatCount: entry.chatCount,
		feedbackAdded: entry.feedbackAdded,
		feedbackConverted: entry.feedbackConverted,
		feedbackReplyAdded: entry.feedbackReplyAdded,
		feedbackSubmitted: entry.feedbackSubmitted,
		createPullRequest: entry.createPullRequest,
		createDraftPullRequest: entry.createDraftPullRequest,
		updatePullRequest: entry.updatePullRequest,
		mergePullRequest: entry.mergePullRequest,
		checkoutPullRequest: entry.checkoutPullRequest,
		initializeRepository: entry.initializeRepository,
		commit: entry.commit,
		commitAndSync: entry.commitAndSync,
		sessionRestored: entry.sessionRestored,
		stickinessToggled: entry.stickinessToggled,
		maximizeToggled: entry.maximizeToggled,
		chatDeleted: entry.chatDeleted,
		chatRenamed: entry.chatRenamed,
		sessionRenamed: entry.sessionRenamed,
		fixCIChecks: entry.fixCIChecks,
		taskRun: entry.taskRun,
		filesChanged: entry.filesChanged,
		linesAdded: entry.linesAdded,
		linesDeleted: entry.linesDeleted,
		userSessionsTotal: requestCounters.userSessionsTotal,
		userSessionsInWorkspace: requestCounters.userSessionsInWorkspace,
		userSessionsForProvider: requestCounters.userSessionsForProvider,
	};
}
