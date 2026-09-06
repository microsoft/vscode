/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash, StringSHA1 } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getPullRequestStatusFromIcon, PullRequestStatus } from '../../github/common/types.js';
import { classifySessionWorkspaceTopology, getSessionsTelemetryProviderId, hashSessionIdForTelemetry } from '../../../common/sessionsTelemetry.js';

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
/**
 * Hard cap on the number of distinct typed-in files remembered per session.
 * Beyond this the reported count saturates, which keeps persisted state
 * bounded for sessions that touch very many files. Exported for tests.
 */
export const MAX_TYPED_FILES_PER_SESSION = 250;

/**
 * Length of the persisted per-file digests.
 *
 * A truncated SHA-1 rather than {@link hash}: that is a 32-bit polynomial
 * string hash whose collisions are structural rather than random, so ordinary
 * sibling paths collide outright (`.../Aa.ts` and `.../BB.ts` hash equal) and
 * silently undercount distinct files. 48 bits of a cryptographic digest keeps
 * the stored rows small while making a collision within the
 * {@link MAX_TYPED_FILES_PER_SESSION} cap a birthday-bound accident of roughly
 * one in ten billion.
 */
const TYPED_FILE_HASH_LENGTH = 12;

/**
 * Derives the stored identity of a typed-in file. Only used to tell files
 * apart when counting; the digest itself is never reported.
 */
function hashTypedFilePath(resource: URI): string {
	const sha1 = new StringSHA1();
	sha1.update(resource.toString());
	return sha1.digest().substring(0, TYPED_FILE_HASH_LENGTH);
}

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
	// Session and workspace context captured at first observation.
	providerId: string;
	providerType: string;
	sessionResourceUri: string;
	workspaceUriString: string;
	isolationKind: 'worktree' | 'folder';
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	// Optional so rows persisted before the field existed still load;
	// `createEntry` always sets it and `buildSummary` defaults it.
	isExternal?: boolean;
	// Topology fields are optional so rows persisted before they existed still
	// load; `createEntry` always sets them and `buildSummary` defaults them.
	// Refreshed on every interaction, since a session's workspace resolves
	// asynchronously and can gain folders after tracking started.
	isMultiRoot?: boolean;
	folderCount?: number;
	gitFolderCount?: number;
	nonGitFolderCount?: number;

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

	// Characters the user manually typed into the session's workspace folders
	// from this client. Optional so rows persisted before the field existed
	// still load; `createEntry` always sets it and `buildSummary` defaults it.
	typedCharacters?: number;
	// Hashes of the distinct files the user typed into. Hashed rather than
	// stored as paths so persisted state discloses nothing about the user's
	// file system; only the count is ever reported.
	typedFileHashes?: string[];

	// End state (refreshed on every interaction)
	filesChanged: number;
	linesAdded: number;
	linesDeleted: number;
	// Pull requests observed on the session. Optional so rows persisted before
	// the fields existed still load; `buildSummary` defaults them.
	pullRequestCount?: number;
	pullRequestStatus?: PullRequestStatus;
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
	isExternal: boolean;
	isMultiRoot: boolean;
	folderCount: number;
	gitFolderCount: number;
	nonGitFolderCount: number;
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
	typedCharacters: number;
	typedFileCount: number;
	filesChanged: number;
	linesAdded: number;
	linesDeleted: number;
	pullRequestCount: number;
	pullRequestStatus: PullRequestStatus | undefined;
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
		this._updateObservedState(entry, session);
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
		this._updateObservedState(entry, session);
		this._save();
	}

	/**
	 * Adds characters the user manually typed into `resource`, which must live
	 * in the session's workspace folders. Unlike {@link bumpCounter} this never
	 * starts tracking a session: editing a folder is not by itself an
	 * interaction with the session that happens to use it.
	 *
	 * `resource` is only used to tell files apart for {@link ISessionLifecycleSummary.typedFileCount}
	 * and is stored as a hash, never as a path.
	 */
	addTypedCharacters(sessionId: string, resource: URI, characters: number): void {
		const entry = this._stats.get(sessionId);
		if (!entry || characters <= 0) {
			return;
		}
		entry.typedCharacters = (entry.typedCharacters ?? 0) + characters;
		const fileHash = hashTypedFilePath(resource);
		const typedFileHashes = entry.typedFileHashes ?? (entry.typedFileHashes = []);
		if (typedFileHashes.length < MAX_TYPED_FILES_PER_SESSION && !typedFileHashes.includes(fileHash)) {
			typedFileHashes.push(fileHash);
		}
		this._save();
	}

	/** Refresh observed session state (pull requests, changes) for a tracked session. No-op when not tracked. */
	updateSessionState(session: ISession): void {
		const entry = this._stats.get(session.sessionId);
		if (!entry) {
			return;
		}
		this._updateObservedState(entry, session);
		this._save();
	}

	/**
	 * Increments the persisted user-request counters (total, per-workspace,
	 * per-provider) and returns the new values. Should be called once per
	 * brand-new session the user starts from the Agents window.
	 */
	incrementAndGetUserRequestCounters(session: ISession): IUserRequestCounters {
		const providerId = getSessionsTelemetryProviderId(session.providerId);
		const workspaceUri = session.workspace.get()?.uri.toString();

		const userSessionsTotal = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) + 1;
		this._storageService.store(TOTAL_SESSIONS_KEY, userSessionsTotal, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const providerCounts = this._readProviderCounterMap();
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
			this._updateObservedState(entry, finalSession);
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
		const providerCounts = this._readProviderCounterMap();
		const userSessionsForProvider = providerCounts[getSessionsTelemetryProviderId(providerId)] ?? 0;
		let userSessionsInWorkspace = 0;
		if (workspaceUri) {
			const workspaceCounts = this._readCounterMap(WORKSPACE_SESSIONS_KEY);
			userSessionsInWorkspace = workspaceCounts[workspaceUri] ?? 0;
		}
		return { userSessionsTotal, userSessionsInWorkspace, userSessionsForProvider };
	}

	private _readProviderCounterMap(): Record<string, number> {
		const storedCounts = this._readCounterMap(PROVIDER_SESSIONS_KEY);
		const providerCounts: Record<string, number> = {};
		for (const [providerId, count] of Object.entries(storedCounts)) {
			const telemetryProviderId = getSessionsTelemetryProviderId(providerId);
			providerCounts[telemetryProviderId] = (providerCounts[telemetryProviderId] ?? 0) + count;
		}
		return providerCounts;
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

	/**
	 * Refreshes the parts of the entry that mirror live session state, so the
	 * summary reports what was last observed rather than what was known when
	 * tracking started.
	 */
	private _updateObservedState(entry: IStoredSessionStats, session: ISession): void {
		// Provenance is only known once the session metadata has loaded, which
		// may happen after the entry was created.
		entry.isExternal = session.isExternal?.get() ?? entry.isExternal ?? false;
		this._updateWorkspaceTopology(entry, session);
		this._updatePullRequestState(entry, session);
		this._updateChangesSummary(entry, session);
	}

	/**
	 * Refreshes the folder counts. A session's workspace is resolved
	 * asynchronously and can gain folders later, so the counts known when
	 * tracking started are not what the user ended up working with.
	 */
	private _updateWorkspaceTopology(entry: IStoredSessionStats, session: ISession): void {
		const folders = session.workspace.get()?.folders;
		if (!folders || folders.length === 0) {
			// Keep the last known values rather than reporting an unresolved
			// or torn-down workspace as an empty one.
			return;
		}
		const topology = classifySessionWorkspaceTopology(folders.length, folders.filter(folder => folder.gitRepository !== undefined).length);
		entry.isMultiRoot = topology.isMultiRoot;
		entry.folderCount = topology.folderCount;
		entry.gitFolderCount = topology.gitFolderCount;
		entry.nonGitFolderCount = topology.nonGitFolderCount;
	}

	private _updatePullRequestState(entry: IStoredSessionStats, session: ISession): void {
		const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo) {
			// Keep the last known values: GitHub info is resolved asynchronously
			// and is absent for sessions without a GitHub repository.
			return;
		}
		const pullRequests = gitHubInfo.pullRequests;
		entry.pullRequestCount = pullRequests?.length ?? (gitHubInfo.pullRequest ? 1 : 0);
		entry.pullRequestStatus = getPullRequestStatusFromIcon(gitHubInfo.pullRequest?.icon ?? pullRequests?.[0]?.icon);
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
						const entry = value as IStoredSessionStats;
						// File identities were briefly persisted as 32-bit
						// numbers. They cannot be compared against the digests
						// written now, so drop them rather than double-count
						// files the user already typed into.
						if (entry.typedFileHashes?.some(fileHash => typeof fileHash !== 'string')) {
							entry.typedFileHashes = [];
						}
						map.set(id, entry);
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
	const folders = workspace?.folders ?? [];
	const topology = classifySessionWorkspaceTopology(folders.length, folders.filter(folder => folder.gitRepository !== undefined).length);
	return {
		providerId: session.providerId,
		providerType: session.sessionType,
		sessionResourceUri: session.resource.toString(),
		workspaceUriString,
		isolationKind: hasWorktree ? 'worktree' : 'folder',
		hasGitRepository: hasGit,
		isVirtualWorkspace: isVirtual,
		isExternal: session.isExternal?.get() ?? false,
		isMultiRoot: topology.isMultiRoot,
		folderCount: topology.folderCount,
		gitFolderCount: topology.gitFolderCount,
		nonGitFolderCount: topology.nonGitFolderCount,
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
		typedCharacters: 0,
		typedFileHashes: [],
		filesChanged: 0,
		linesAdded: 0,
		linesDeleted: 0,
		pullRequestCount: 0,
		pullRequestStatus: undefined,
	};
}

function buildSummary(sessionId: string, entry: IStoredSessionStats, reason: SessionDoneReason, appLaunchCount: number, requestCounters: IUserRequestCounters): ISessionLifecycleSummary {
	const now = Date.now();
	return {
		agentSessionId: hashSessionIdForTelemetry(sessionId),
		providerId: getSessionsTelemetryProviderId(entry.providerId),
		providerType: entry.providerType,
		isolationKind: entry.isolationKind,
		workspaceHash: entry.workspaceUriString ? hash(entry.workspaceUriString).toString(16) : '',
		hasGitRepository: entry.hasGitRepository,
		isVirtualWorkspace: entry.isVirtualWorkspace,
		// Back-compat: entries persisted before these fields existed default to 0/false.
		isExternal: entry.isExternal ?? false,
		isMultiRoot: entry.isMultiRoot ?? false,
		folderCount: entry.folderCount ?? 0,
		gitFolderCount: entry.gitFolderCount ?? 0,
		nonGitFolderCount: entry.nonGitFolderCount ?? 0,
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
		typedCharacters: entry.typedCharacters ?? 0,
		typedFileCount: entry.typedFileHashes?.length ?? 0,
		filesChanged: entry.filesChanged,
		linesAdded: entry.linesAdded,
		linesDeleted: entry.linesDeleted,
		pullRequestCount: entry.pullRequestCount ?? 0,
		pullRequestStatus: entry.pullRequestStatus,
		userSessionsTotal: requestCounters.userSessionsTotal,
		userSessionsInWorkspace: requestCounters.userSessionsInWorkspace,
		userSessionsForProvider: requestCounters.userSessionsForProvider,
	};
}
