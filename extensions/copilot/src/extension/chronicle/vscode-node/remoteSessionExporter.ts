/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/genAiAttributes';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { type ICompletedSpanData, IOTelService } from '../../../platform/otel/common/otelService';
import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { IGithubRepositoryService } from '../../../platform/github/common/githubService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { IExtensionContribution } from '../../common/contributions';
import { CircuitBreaker } from '../common/circuitBreaker';
import {
	createSessionTranslationState,
	makeShutdownEvent,
	translateSpan,
	type SessionTranslationState,
} from '../common/eventTranslator';
import type { GitHubRepository, CloudSessionIds, SessionEvent, WorkingDirectoryContext } from '../common/cloudSessionTypes';
import { filterSecretsFromObj, addSecretValues } from '../common/secretFilter';
import { SessionIndexingPreference, type SessionIndexingLevel } from '../common/sessionIndexingPreference';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { CloudSessionApiClient } from '../node/cloudSessionApiClient';

// ── Configuration ───────────────────────────────────────────────────────────────

/** How often to flush buffered events to the cloud (ms). */
const BATCH_INTERVAL_MS = 500;

/** Faster drain interval when buffer is above soft cap. */
const FAST_BATCH_INTERVAL_MS = 200;

/** Max events per flush request. */
const MAX_EVENTS_PER_FLUSH = 500;

/** Hard cap on buffered events (drop oldest beyond this). */
const MAX_BUFFER_SIZE = 1_000;

/** Soft cap — switch to faster drain. */
const SOFT_BUFFER_CAP = 500;

/**
 * Exports VS Code chat session events to the cloud in real-time.
 *
 * - Listens to OTel spans, translates to cloud SessionEvent format
 * - Buffers events and flushes in batches every 500ms
 * - Circuit breaker prevents cascading failures when the cloud is unavailable
 * - Lazy initialization: no work until the first real chat interaction
 *
 * All cloud operations are fire-and-forget — never blocks or slows the chat session.
 */
export class RemoteSessionExporter extends Disposable implements IExtensionContribution {

	// ── Per-session state ────────────────────────────────────────────────────────

	/** Per-session cloud IDs (created lazily on first interaction). */
	private readonly _cloudSessions = new Map<string, CloudSessionIds>();

	/** Per-session translation state (parentId chaining, session.start tracking). */
	private readonly _translationStates = new Map<string, SessionTranslationState>();

	/** Sessions that failed cloud initialization — don't retry. */
	private readonly _disabledSessions = new Set<string>();

	/** Sessions currently initializing (prevent concurrent init). */
	private readonly _initializingSessions = new Set<string>();

	// ── Shared state ─────────────────────────────────────────────────────────────

	/** Buffered events tagged with their chat session ID for correct routing. */
	private readonly _eventBuffer: Array<{ chatSessionId: string; event: SessionEvent }> = [];
	private readonly _cloudClient: CloudSessionApiClient;
	private readonly _circuitBreaker: CircuitBreaker;

	private _flushTimer: ReturnType<typeof setInterval> | undefined;
	private _isFlushing = false;
	private _firstCloudWriteLogged = false;

	/** The session source of the first initialized session (for firstWrite telemetry). */
	private _firstCloudWriteSessionSource: string | undefined;

	/** Resolved lazily on first use. */
	private _repository: GitHubRepository | undefined;
	private _repositoryResolved = false;

	/** User's session indexing preference (resolved once per repo). */
	private readonly _indexingPreference: SessionIndexingPreference;

	constructor(
		@IOTelService private readonly _otelService: IOTelService,
		@IChatSessionService private readonly _chatSessionService: IChatSessionService,
		@ICopilotTokenManager private readonly _tokenManager: ICopilotTokenManager,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IGitService private readonly _gitService: IGitService,
		@IGithubRepositoryService private readonly _githubRepoService: IGithubRepositoryService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
	) {
		super();

		this._indexingPreference = new SessionIndexingPreference(this._configService);
		this._cloudClient = new CloudSessionApiClient(this._tokenManager, this._authService, this._fetcherService);
		this._circuitBreaker = new CircuitBreaker({
			failureThreshold: 5,
			resetTimeoutMs: 1_000,
			maxResetTimeoutMs: 30_000,
		});

		// Register known auth tokens as dynamic secrets for filtering
		this._registerAuthSecrets();

		// Only set up span listener when both local index and cloud sync are enabled.
		// Uses autorun to react if settings change at runtime.
		// Both new and old settings taken into account for backward compatibility
		const localEnabled = this._configService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.SessionSearchLocalIndexEnabled, this._expService);
		const cloudEnabledInternal = this._configService.getConfigObservable(ConfigKey.TeamInternal.SessionSearchCloudSyncEnabled);
		const cloudEnabledPublic = this._configService.getConfigObservable(ConfigKey.Advanced.SessionSearchCloudSync);
		const spanListenerStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			spanListenerStore.clear();
			const publicValue = cloudEnabledPublic.read(reader);
			const cloudEnabled = this._configService.isConfigured(ConfigKey.Advanced.SessionSearchCloudSync) ? publicValue : cloudEnabledInternal.read(reader);
			if (!localEnabled.read(reader) || !cloudEnabled) {
				return;
			}

			// Listen to completed OTel spans — deferred off the callback
			spanListenerStore.add(this._otelService.onDidCompleteSpan(span => {
				queueMicrotask(() => this._handleSpan(span));
			}));

			// Clean up on session disposal
			spanListenerStore.add(this._chatSessionService.onDidDisposeChatSession(sessionId => {
				this._handleSessionDispose(sessionId);
			}));
		}));
	}

	override dispose(): void {
		if (this._flushTimer !== undefined) {
			clearInterval(this._flushTimer);
			this._flushTimer = undefined;
		}

		// Best-effort final flush with timeout
		const pending = this._eventBuffer.length;
		if (pending > 0) {
			// Fire-and-forget — cannot block dispose
			this._flushBatch().catch(() => { /* best effort */ });
		}

		this._cloudSessions.clear();
		this._translationStates.clear();
		this._disabledSessions.clear();
		this._initializingSessions.clear();

		super.dispose();
	}

	// ── Span handling ────────────────────────────────────────────────────────────

	private _handleSpan(span: ICompletedSpanData): void {
		try {
			const sessionId = this._getSessionId(span);
			const operationName = span.attributes[GenAiAttr.OPERATION_NAME] as string | undefined;
			if (!sessionId || this._disabledSessions.has(sessionId)) {
				return;
			}

			// Only start tracking on invoke_agent (real user interaction)
			if (!this._cloudSessions.has(sessionId) && !this._initializingSessions.has(sessionId)) {
				if (operationName !== GenAiOperationName.INVOKE_AGENT) {
					return;
				}
				// Trigger lazy initialization — don't await, buffer events in the meantime
				this._initializeSession(sessionId, span);
			}

			// Translate span to cloud events
			const state = this._getOrCreateTranslationState(sessionId);
			const context = this._extractContext(span);
			const events = translateSpan(span, state, context);

			if (events.length > 0) {
				this._bufferEvents(sessionId, events);
				this._ensureFlushTimer();
			}
		} catch {
			// Non-fatal — individual span processing failure
		}
	}

	private _getSessionId(span: ICompletedSpanData): string | undefined {
		return (span.attributes[CopilotChatAttr.CHAT_SESSION_ID] as string | undefined)
			?? (span.attributes[GenAiAttr.CONVERSATION_ID] as string | undefined)
			?? (span.attributes[CopilotChatAttr.SESSION_ID] as string | undefined);
	}

	private _getOrCreateTranslationState(sessionId: string): SessionTranslationState {
		let state = this._translationStates.get(sessionId);
		if (!state) {
			state = createSessionTranslationState();
			this._translationStates.set(sessionId, state);
		}
		return state;
	}

	private _extractContext(span: ICompletedSpanData): WorkingDirectoryContext | undefined {
		const branch = span.attributes[CopilotChatAttr.REPO_HEAD_BRANCH_NAME] as string | undefined;
		const remoteUrl = span.attributes[CopilotChatAttr.REPO_REMOTE_URL] as string | undefined;
		const commitHash = span.attributes[CopilotChatAttr.REPO_HEAD_COMMIT_HASH] as string | undefined;
		if (!branch && !remoteUrl) {
			return undefined;
		}
		return {
			repository: remoteUrl,
			branch,
			headCommit: commitHash,
		};
	}

	// ── Secret registration ─────────────────────────────────────────────────────

	/**
	 * Register known authentication tokens as dynamic secrets so they are
	 * redacted from any event data sent to the cloud.
	 */
	private _registerAuthSecrets(): void {
		// GitHub OAuth token
		const githubToken = this._authService.anyGitHubSession?.accessToken;
		if (githubToken) {
			addSecretValues(githubToken);
		}

		// Copilot proxy token (async — register when available)
		this._tokenManager.getCopilotToken().then(token => {
			if (token.token) {
				addSecretValues(token.token);
			}
		}).catch(() => { /* non-fatal */ });
	}

	// ── Lazy session initialization ──────────────────────────────────────────────

	private async _initializeSession(sessionId: string, triggerSpan: ICompletedSpanData): Promise<void> {
		this._initializingSessions.add(sessionId);

		try {
			const sessionSource = (triggerSpan.attributes[GenAiAttr.AGENT_NAME] as string | undefined) ?? 'unknown';

			// Track the source of the very first session for firstWrite telemetry
			if (!this._firstCloudWriteSessionSource) {
				this._firstCloudWriteSessionSource = sessionSource;
			}
			const repo = await this._resolveRepository();
			if (!repo) {
				this._disabledSessions.add(sessionId);
				return;
			}

			// Only export remotely if the user has cloud consent for this repo
			// Also require localIndex to be enabled (team-internal gate) as defense-in-depth
			const repoNwo = `${repo.owner}/${repo.repo}`;

			if (!this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.SessionSearchLocalIndexEnabled, this._expService) || !this._indexingPreference.hasCloudConsent(repoNwo)) {
				this._disabledSessions.add(sessionId);
				return;
			}
			await this._createCloudSession(sessionId, repo, this._indexingPreference.getStorageLevel(repoNwo));
			/* __GDPR__
"chronicle.cloudSync" : {
"owner": "vijayu",
"comment": "Tracks cloud sync operations (session init, creation, flush, errors)",
"operation": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The operation performed." },
"sessionSource": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The agent name/source for the session, or unknown if unavailable." },
"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the operation succeeded." },
"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Truncated error message if failed." },
"indexingLevel": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The indexing level for the session." },
"droppedEvents": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of events in a failed batch." }
}
*/
			this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
				operation: 'sessionInit',
				success: 'true',
				sessionSource,
			});
		} catch (err) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
				operation: 'sessionInit',
				success: 'false',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, {});
			this._disabledSessions.add(sessionId);
		} finally {
			this._initializingSessions.delete(sessionId);
		}
	}

	/**
	 * Called when the storage level setting changes.
	 * Creates cloud sessions for any pending sessions if cloud sync is now enabled.
	 */
	async notifyConsent(level: SessionIndexingLevel): Promise<void> {
		if (level === 'local') {
			for (const sessionId of this._translationStates.keys()) {
				if (!this._cloudSessions.has(sessionId)) {
					this._disabledSessions.add(sessionId);
				}
			}
			return;
		}

		const repo = this._repository;
		if (!repo) {
			return;
		}

		for (const sessionId of this._translationStates.keys()) {
			if (!this._cloudSessions.has(sessionId) && !this._disabledSessions.has(sessionId)) {
				await this._createCloudSession(sessionId, repo, level);
			}
		}
	}

	private async _createCloudSession(
		sessionId: string,
		repo: GitHubRepository,
		indexingLevel: SessionIndexingLevel,
	): Promise<void> {
		const result = await this._cloudClient.createSession(
			repo.repoIds.ownerId,
			repo.repoIds.repoId,
			sessionId,
			indexingLevel === 'repo_and_user' ? 'repo_and_user' : 'user',
		);

		if (!result.ok) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
				operation: 'createCloudSession',
				success: 'false',
				error: result.reason?.substring(0, 100) ?? 'unknown',
			}, {});
			this._disabledSessions.add(sessionId);
			return;
		}

		if (!result.response.task_id) {
			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
				operation: 'createCloudSession',
				success: 'false',
				error: 'missing_task_id',
			}, {});
			this._disabledSessions.add(sessionId);
			return;
		}

		const cloudIds: CloudSessionIds = {
			cloudSessionId: result.response.id,
			cloudTaskId: result.response.task_id,
		};

		this._cloudSessions.set(sessionId, cloudIds);

		this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
			operation: 'createCloudSession',
			success: 'true',
			indexingLevel,
		});
	}

	/**
	 * Resolve the GitHub repository context (cached after first resolution).
	 * Uses the active git repository to get owner/repo names, then resolves
	 * numeric IDs via the GitHub REST API.
	 */
	private async _resolveRepository(): Promise<GitHubRepository | undefined> {
		if (this._repositoryResolved) {
			return this._repository;
		}
		this._repositoryResolved = true;

		try {
			const repoContext = this._gitService.activeRepository?.get();
			if (!repoContext) {
				return undefined;
			}

			const repoInfo = getGitHubRepoInfoFromContext(repoContext);
			if (!repoInfo) {
				return undefined;
			}

			const { id: repoId } = repoInfo;
			const apiResponse = await this._githubRepoService.getRepositoryInfo(repoId.org, repoId.repo);

			this._repository = {
				owner: repoId.org,
				repo: repoId.repo,
				repoIds: {
					ownerId: apiResponse.owner.id,
					repoId: apiResponse.id,
				},
			};
			return this._repository;
		} catch (err) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
				operation: 'resolveRepository',
				success: 'false',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, {});
			return undefined;
		}
	}

	// ── Session disposal ─────────────────────────────────────────────────────────

	private _handleSessionDispose(sessionId: string): void {
		const state = this._translationStates.get(sessionId);
		if (state && this._cloudSessions.has(sessionId)) {
			const event = makeShutdownEvent(state);
			this._bufferEvents(sessionId, [event]);
		}

		this._cloudSessions.delete(sessionId);
		this._translationStates.delete(sessionId);
		this._disabledSessions.delete(sessionId);
		this._initializingSessions.delete(sessionId);
	}

	// ── Buffering ────────────────────────────────────────────────────────────────

	private _bufferEvents(chatSessionId: string, events: SessionEvent[]): void {
		for (const event of events) {
			this._eventBuffer.push({ chatSessionId, event });
		}

		// Hard cap — drop oldest events
		if (this._eventBuffer.length > MAX_BUFFER_SIZE) {
			const dropped = this._eventBuffer.length - MAX_BUFFER_SIZE;
			this._eventBuffer.splice(0, dropped);
		}
	}

	// ── Flush timer ──────────────────────────────────────────────────────────────

	private _ensureFlushTimer(): void {
		if (this._flushTimer !== undefined) {
			return;
		}

		const interval = this._eventBuffer.length > SOFT_BUFFER_CAP
			? FAST_BATCH_INTERVAL_MS
			: BATCH_INTERVAL_MS;

		this._flushTimer = setInterval(() => {
			this._flushBatch().catch(err => {

				this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
					operation: 'flush',
					success: 'false',
					error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
				}, {});
			});
		}, interval);
	}

	private _stopFlushTimer(): void {
		if (this._flushTimer !== undefined) {
			clearInterval(this._flushTimer);
			this._flushTimer = undefined;
		}
	}

	// ── Batch flush ──────────────────────────────────────────────────────────────

	private async _flushBatch(): Promise<void> {
		if (this._isFlushing) {
			return;
		}

		if (this._eventBuffer.length === 0) {
			if (this._cloudSessions.size === 0) {
				this._stopFlushTimer();
			}
			return;
		}

		if (!this._circuitBreaker.canRequest()) {
			if (this._eventBuffer.length > MAX_BUFFER_SIZE) {
				const dropped = this._eventBuffer.length - MAX_BUFFER_SIZE;
				this._eventBuffer.splice(0, dropped);
			}
			return;
		}

		this._isFlushing = true;
		const batch = this._eventBuffer.splice(0, MAX_EVENTS_PER_FLUSH);

		try {
			// Group events by chat session ID for correct cloud session routing
			const eventsBySession = new Map<string, SessionEvent[]>();
			const orphanedEntries: typeof batch = [];

			for (const entry of batch) {
				const cloudIds = this._cloudSessions.get(entry.chatSessionId);
				if (cloudIds) {
					const arr = eventsBySession.get(cloudIds.cloudSessionId) ?? [];
					arr.push(entry.event);
					eventsBySession.set(cloudIds.cloudSessionId, arr);
				} else {
					orphanedEntries.push(entry);
				}
			}

			// Re-queue events with no cloud session (session not initialized yet),
			// but drop events for sessions that have been disabled (init failed).
			if (orphanedEntries.length > 0) {
				const requeue = orphanedEntries.filter(e =>
					!this._disabledSessions.has(e.chatSessionId)
					&& (this._initializingSessions.has(e.chatSessionId) || this._cloudSessions.has(e.chatSessionId))
				);
				if (requeue.length > 0) {
					this._eventBuffer.unshift(...requeue);
				}
			}

			// Submit each session's events to the correct cloud session
			let allSuccess = true;
			for (const [cloudSessionId, events] of eventsBySession) {
				const filteredEvents = events.map(e => filterSecretsFromObj(e));
				const success = await this._cloudClient.submitSessionEvents(cloudSessionId, filteredEvents);
				if (!success) {
					allSuccess = false;
				}
			}

			if (allSuccess && eventsBySession.size > 0) {
				this._circuitBreaker.recordSuccess();

				if (!this._firstCloudWriteLogged) {
					this._firstCloudWriteLogged = true;

					this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
						operation: 'firstWrite',
						sessionSource: this._firstCloudWriteSessionSource ?? 'unknown',
					}, {});
				}
			} else if (!allSuccess) {
				this._circuitBreaker.recordFailure();
			}
		} catch (err) {
			// Re-queue on unexpected error
			this._eventBuffer.unshift(...batch);
			this._circuitBreaker.recordFailure();

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.cloudSync', {
				operation: 'flushBatch',
				success: 'false',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, { droppedEvents: batch.length });
		} finally {
			this._isFlushing = false;
		}

		if (this._eventBuffer.length > SOFT_BUFFER_CAP && this._flushTimer !== undefined) {
			this._stopFlushTimer();
			this._ensureFlushTimer();
		}
	}

}
