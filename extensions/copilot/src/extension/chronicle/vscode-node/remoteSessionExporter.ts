/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/genAiAttributes';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { type ICompletedSpanData, IOTelService } from '../../../platform/otel/common/otelService';
import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { IGithubRepositoryService } from '../../../platform/github/common/githubService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { Emitter } from '../../../util/vs/base/common/event';
import { autorun, observableFromEventOpts } from '../../../util/vs/base/common/observableInternal';
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
import { ISessionSyncStateService, type SessionSyncState } from '../common/sessionSyncStateService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { CloudSessionIdStore } from '../node/cloudSessionIdStore';
import { reindexSessions, reindexCloudSessions, type CloudReindexResult } from '../node/sessionReindexer';

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
 *
 * Also implements ISessionSyncStateService so that SessionSyncStatus can
 * observe the current sync state via dependency injection.
 */
export class RemoteSessionExporter extends Disposable implements IExtensionContribution, ISessionSyncStateService {

	declare readonly _serviceBrand: undefined;

	// ── Per-session state ────────────────────────────────────────────────────────

	/** Per-session cloud IDs — persisted to globalStorage JSON file. */
	private readonly _cloudSessions: CloudSessionIdStore;

	/** Whether we've reconciled the disk cache with the cloud API this window. */
	private _cloudReconciled = false;

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

	/** Whether the session sync suggestion notification has been shown. */
	private _syncSuggestionShown = false;

	// ── Sync state & status item ────────────────────────────────────────────────

	private readonly _onDidChangeSyncState = this._register(new Emitter<SessionSyncState>());
	readonly onDidChangeSyncState = this._onDidChangeSyncState.event;
	private _syncState: SessionSyncState = { kind: 'not-enabled' };
	get syncState(): SessionSyncState { return this._syncState; }

	private _setSyncState(state: SessionSyncState): void {
		this._syncState = state;
		this._onDidChangeSyncState.fire(state);
	}

	/** Cached local synced count — invalidated on set/delete of cloud sessions. */
	private _cachedLocalSyncedCount: number | undefined;

	/**
	 * Count sessions from this machine that are synced to the cloud.
	 * Cross-references SQLite (local sessions) with the cloud session ID store.
	 * Cached to avoid repeated SQL queries on every flush.
	 * Falls back to the full cloud store size if SQLite is unavailable.
	 */
	private _getLocalSyncedCount(): number {
		if (this._cachedLocalSyncedCount !== undefined) {
			return this._cachedLocalSyncedCount;
		}
		try {
			const localIds = this._sessionStore.executeReadOnlyFallback(
				'SELECT id FROM sessions LIMIT 1000'
			) as Array<{ id: string }>;
			let count = 0;
			for (const row of localIds) {
				if (this._cloudSessions.has(row.id)) {
					count++;
				}
			}
			this._cachedLocalSyncedCount = count;
			return count;
		} catch {
			// SQLite unavailable — fall back to full cloud store size
			return this._cloudSessions.size;
		}
	}

	/** Invalidate the cached local synced count (call after cloud session set/delete). */
	private _invalidateLocalSyncedCount(): void {
		this._cachedLocalSyncedCount = undefined;
	}

	/**
	 * Load cloud session IDs from disk (no network).
	 * The disk file provides instant ID lookups and status bar count.
	 * Fire-and-forget — errors are silently swallowed.
	 */
	private async _loadFromDisk(): Promise<void> {
		await this._cloudSessions.load();
		if (this._cloudSessions.size > 0 && this._syncState.kind === 'on') {
			this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });
		}
	}

	/**
	 * Reconcile the local disk cache with the cloud sessions API.
	 * Called lazily on first delete or reindex — not at startup.
	 * Idempotent within a window lifetime.
	 */
	private async _reconcileWithCloud(): Promise<void> {
		if (this._cloudReconciled) {
			return;
		}
		this._cloudReconciled = true;
		await this._cloudSessions.load();
		try {
			const cloudSessions = await this._cloudClient.listSessions();
			this._cloudSessions.mergeFromCloud(cloudSessions);
			this._invalidateLocalSyncedCount();
			this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });
		} catch {
			// Non-fatal — disk cache is good enough for ID lookups
		}
	}

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
		@ISessionStore private readonly _sessionStore: ISessionStore,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IChatDebugFileLoggerService private readonly _debugLogService: IChatDebugFileLoggerService,
	) {
		super();

		this._cloudSessions = new CloudSessionIdStore(this._extensionContext.globalStorageUri.fsPath);
		this._indexingPreference = new SessionIndexingPreference(this._configService);
		this._cloudClient = new CloudSessionApiClient(this._tokenManager, this._authService, this._fetcherService);
		this._cloudClient.onRateLimited = (callSite, retryAfterSec) => {
			this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
				operation: 'rateLimited',
				error: callSite,
			}, {
				retryAfterSec,
			});
		};
		this._circuitBreaker = new CircuitBreaker({
			failureThreshold: 5,
			resetTimeoutMs: 1_000,
			maxResetTimeoutMs: 30_000,
		});

		// Register delete cloud sessions command
		this._register(vscode.commands.registerCommand('github.copilot.sessionSync.deleteSessions', () => this._deleteCloudSessions()));

		// Register cloud-only delete for sessions window hook (fire-and-forget, no UI)
		this._register(vscode.commands.registerCommand('github.copilot.sessionSync.deleteSessionFromCloud', (sessionIds: string[]) => this._deleteSessionsFromCloud(sessionIds)));

		// Register suggest session sync command (called from chronicleIntent when user runs /chronicle)
		this._register(vscode.commands.registerCommand('github.copilot.sessionSync.suggest', () => this._suggestSessionSync()));

		// Register cloud reindex command (called from chronicleIntent after local reindex)
		this._register(vscode.commands.registerCommand('github.copilot.sessionSync.reindex', (reportProgress: (msg: string) => void, token: vscode.CancellationToken) => this._reindexCloud(reportProgress, token)));

		// Register user-facing reindex command (Command Palette)
		this._register(vscode.commands.registerCommand('github.copilot.chronicle.reindex', () => this._reindexFromCommandPalette()));

		// Register known auth tokens as dynamic secrets for filtering
		this._registerAuthSecrets();

		// Only set up span listener when both local index and cloud sync are enabled.
		// Uses autorun to react if settings change at runtime.
		const localEnabled = this._configService.getExperimentBasedConfigObservable(ConfigKey.LocalIndexEnabled, this._expService);
		const cloudEnabled = observableFromEventOpts(
			{ debugName: 'chat.sessionSync.enabled' },
			handler => this._register(vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('chat.sessionSync.enabled')) {
					handler(e);
				}
			})),
			() => this._configService.getNonExtensionConfig<boolean>('chat.sessionSync.enabled') ?? false,
		);
		const spanListenerStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			spanListenerStore.clear();
			const isLocalEnabled = localEnabled.read(reader);
			const isCloudEnabled = cloudEnabled.read(reader);

			if (!isLocalEnabled || !isCloudEnabled) {
				// Distinguish "disabled by policy" from "not enabled by user"
				if (isLocalEnabled && !isCloudEnabled) {
					const inspection = vscode.workspace.getConfiguration().inspect<boolean>('chat.sessionSync.enabled');
					if ((inspection as { policyValue?: boolean } | undefined)?.policyValue === false) {
						this._setSyncState({ kind: 'disabled-by-policy' });
						return;
					}
				}
				this._setSyncState({ kind: 'not-enabled' });
				return;
			}

			// Cloud sync is active — set initial state
			this._setSyncState({ kind: 'on' });

			// Load synced count from disk (no network call at startup)
			this._loadFromDisk();

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

		this._translationStates.clear();
		this._disabledSessions.clear();
		this._initializingSessions.clear();

		super.dispose();
	}

	// ── Session sync suggestion ──────────────────────────────────────────────────

	private _suggestSessionSync(): void {
		if (this._syncSuggestionShown) {
			return;
		}
		// Only suggest when local index is on but session sync is off
		const localEnabled = this._configService.getExperimentBasedConfig(ConfigKey.LocalIndexEnabled, this._expService);
		if (!localEnabled || this._configService.getNonExtensionConfig<boolean>('chat.sessionSync.enabled')) {
			return;
		}
		this._syncSuggestionShown = true;

		vscode.window.showInformationMessage(
			vscode.l10n.t('Enable session sync for richer cross-device chat session history.'),
			vscode.l10n.t('Enable'),
			vscode.l10n.t('Don\'t Show Again'),
		).then(choice => {
			if (choice === vscode.l10n.t('Enable')) {
				vscode.commands.executeCommand('workbench.action.openSettings', 'chat.sessionSync.enabled');
			}
		});
	}

	// ── Reindex (Command Palette) ───────────────────────────────────────────────

	/**
	 * User-facing reindex command. Runs local reindex with a progress notification,
	 * then optionally runs cloud reindex if session sync is enabled.
	 */
	private async _reindexFromCommandPalette(): Promise<void> {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: vscode.l10n.t('Reindexing sessions...'),
				cancellable: true,
			},
			async (progress, token) => {
				// Local reindex
				const localResult = await reindexSessions(
					this._sessionStore,
					this._debugLogService,
					msg => progress.report({ message: msg }),
					token,
				);

				if (token.isCancellationRequested) {
					return;
				}

				progress.report({ message: vscode.l10n.t('{0} session(s) processed, {1} skipped', localResult.processed, localResult.skipped) });

				// Cloud reindex (if enabled)
				const cloudResult = await this._reindexCloud(
					msg => progress.report({ message: msg }),
					token,
				);

				// Show summary
				if (localResult.processed === 0 && (!cloudResult || cloudResult.created === 0)) {
					vscode.window.showInformationMessage(
						vscode.l10n.t('Session index is up to date. {0} session(s) checked.', localResult.skipped)
					);
				} else if (cloudResult && cloudResult.created > 0) {
					vscode.window.showInformationMessage(
						vscode.l10n.t('{0} session(s) indexed locally, {1} synced to cloud.', localResult.processed, cloudResult.created)
					);
				} else {
					vscode.window.showInformationMessage(
						vscode.l10n.t('{0} session(s) indexed locally.', localResult.processed)
					);
				}
			},
		);
	}

	// ── Delete sessions (Command Palette) ───────────────────────────────────────

	private async _deleteCloudSessions(): Promise<void> {
		type SessionQuickPickItem = vscode.QuickPickItem & { sessionId: string };
		const selectAllId = '__all__';

		// Show quick pick immediately with loading spinner
		const quickPick = vscode.window.createQuickPick<SessionQuickPickItem>();
		quickPick.title = vscode.l10n.t('Delete Cloud Session Data');
		quickPick.placeholder = vscode.l10n.t('Loading sessions...');
		quickPick.canSelectMany = true;
		quickPick.busy = true;
		quickPick.show();

		// Reconcile with cloud (lazy, once per window)
		await this._reconcileWithCloud();

		if (this._cloudSessions.size === 0) {
			quickPick.dispose();
			vscode.window.showInformationMessage(vscode.l10n.t('No cloud-synced sessions found.'));
			return;
		}

		// Query local SQLite store for session labels, filtered to cloud-synced sessions only
		let rows: Array<{ id: string; repository?: string; created_at?: string; first_message?: string }> = [];
		try {
			const allRows = this._sessionStore.executeReadOnlyFallback(
				`SELECT s.id, s.repository, s.created_at,
					(SELECT user_message FROM turns WHERE session_id = s.id ORDER BY turn_index LIMIT 1) as first_message
				FROM sessions s ORDER BY s.updated_at DESC LIMIT 500`
			) as Array<{ id: string; repository?: string; created_at?: string; first_message?: string }>;
			rows = allRows.filter(row => this._cloudSessions.has(row.id));
		} catch {
			// SQLite may be disabled
		}

		if (rows.length === 0) {
			quickPick.dispose();
			vscode.window.showInformationMessage(vscode.l10n.t('No cloud-synced sessions found locally.'));
			return;
		}

		// Populate quick pick with items
		quickPick.busy = false;
		quickPick.placeholder = vscode.l10n.t('Select sessions to delete');
		quickPick.items = [
			{ label: '$(checklist) ' + vscode.l10n.t('Select All ({0} sessions)', rows.length), sessionId: selectAllId },
			...rows.map(row => {
				const label = row.first_message
					? row.first_message.length > 60 ? row.first_message.substring(0, 60) + '...' : row.first_message
					: row.id.substring(0, 8);
				const description = [
					row.repository,
					row.created_at ? new Date(row.created_at).toLocaleString() : undefined,
				].filter(Boolean).join(' · ');
				return { label, description, sessionId: row.id };
			}),
		];

		// Wait for user selection
		const picked = await new Promise<readonly SessionQuickPickItem[] | undefined>(resolve => {
			quickPick.onDidAccept(() => {
				resolve([...quickPick.selectedItems]);
				quickPick.dispose();
			});
			quickPick.onDidHide(() => {
				resolve(undefined);
				quickPick.dispose();
			});
		});

		if (!picked || picked.length === 0) {
			return;
		}

		// If "Select All" is checked, delete all sessions
		const sessionsToDelete = picked.some(p => p.sessionId === selectAllId)
			? rows
			: picked.map(p => rows.find(r => r.id === p.sessionId)!).filter(Boolean);

		// Ask where to delete from
		type ScopeQuickPickItem = vscode.QuickPickItem & { deleteLocal: boolean };
		const scopeItems: ScopeQuickPickItem[] = [
			{ label: vscode.l10n.t('Delete from local and cloud'), description: vscode.l10n.t('Remove from local storage and the cloud'), deleteLocal: true },
			{ label: vscode.l10n.t('Delete from Cloud Only'), description: vscode.l10n.t('Keep local data, remove from the cloud'), deleteLocal: false },
		];
		const scopePick = await vscode.window.showQuickPick(scopeItems, {
			title: vscode.l10n.t('Where to Delete From?'),
			placeHolder: vscode.l10n.t('Choose deletion scope'),
		});

		if (!scopePick) {
			return;
		}

		const deleteLocal = scopePick.deleteLocal;

		// Confirmation
		const confirmMessage = sessionsToDelete.length === 1
			? vscode.l10n.t('Are you sure you want to delete this session?')
			: vscode.l10n.t('Are you sure you want to delete {0} sessions?', sessionsToDelete.length);
		const confirmDetail = deleteLocal
			? vscode.l10n.t('This will delete session data locally and from the cloud. This action cannot be undone.')
			: vscode.l10n.t('This will delete session data from the cloud only. Local data will be kept. This action cannot be undone.');

		const confirm = await vscode.window.showWarningMessage(
			confirmMessage,
			{ modal: true, detail: confirmDetail },
			vscode.l10n.t('Delete'),
		);

		if (confirm !== vscode.l10n.t('Delete')) {
			return;
		}

		// Execute deletions
		let localDeleted = 0;
		let cloudDeleted = 0;
		let cloudErrors = 0;

		this._setSyncState({ kind: 'deleting', sessionCount: sessionsToDelete.length });

		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Deleting sessions...') },
			async () => {
				for (const session of sessionsToDelete) {
					// Delete locally when scope is "everywhere"
					if (deleteLocal) {
						try {
							this._sessionStore.deleteSession(session.id);
							localDeleted++;
						} catch {
							// Best effort — SQLite may be disabled
						}
					}

					// Delete from cloud using the stored cloud session ID
					const cached = this._cloudSessions.get(session.id);
					if (cached) {
						const result = await this._cloudClient.deleteSession(cached.cloudSessionId);
						switch (result) {
							case 'deleted': cloudDeleted++; break;
							case 'not_found': cloudDeleted++; break; // Already gone — count as success
							case 'error': cloudErrors++; break;
						}
					}

					// Remove from caches and persisted store
					this._cloudSessions.delete(session.id);
					this._translationStates.delete(session.id);
					this._disabledSessions.delete(session.id);
				}
			},
		);

		this._invalidateLocalSyncedCount();

		// Build result message
		const parts: string[] = [];
		if (deleteLocal) {
			parts.push(vscode.l10n.t('{0} deleted locally', localDeleted));
		}
		if (cloudDeleted > 0) {
			parts.push(vscode.l10n.t('{0} deleted from cloud', cloudDeleted));
		}

		if (cloudErrors > 0) {
			vscode.window.showWarningMessage(parts.join(', ') + '. ' + vscode.l10n.t('{0} cloud deletion(s) failed.', cloudErrors));
			this._setSyncState({ kind: 'error' });
		} else {
			vscode.window.showInformationMessage(parts.join(', ') + '.');
			this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });
		}

		this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
			operation: 'deleteSessions',
			source: 'commandPalette',
		}, {
			totalRequested: sessionsToDelete.length,
			localDeleted,
			cloudDeleted,
			cloudErrors,
		});
	}

	// ── Delete from cloud + local SQLite (called by sessions window delete action) ─

	/**
	 * Best-effort cloud and local SQLite deletion for the given session IDs.
	 * Called from the sessions window right-click delete action — no UI shown.
	 */
	private async _deleteSessionsFromCloud(sessionIds: string[]): Promise<void> {
		if (!sessionIds || sessionIds.length === 0) {
			return;
		}

		// Ensure cloud session ID store is loaded from disk
		await this._cloudSessions.load();

		const cloudEnabled = this._configService.getNonExtensionConfig<boolean>('chat.sessionSync.enabled') ?? false;

		for (const sessionId of sessionIds) {
			// Delete from local SQLite store
			try {
				this._sessionStore.deleteSession(sessionId);
			} catch {
				// Best effort
			}

			// Delete from cloud only when session sync is enabled
			const wasCloudSynced = this._cloudSessions.has(sessionId);
			if (cloudEnabled && wasCloudSynced) {
				const cached = this._cloudSessions.get(sessionId)!;
				try {
					await this._cloudClient.deleteSession(cached.cloudSessionId);
				} catch {
					// Best effort — don't block the caller
				}
			}

			// Remove from in-memory caches
			this._cloudSessions.delete(sessionId);
			this._translationStates.delete(sessionId);
			this._disabledSessions.delete(sessionId);
		}
		this._invalidateLocalSyncedCount();
		this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });
	}

	// ── Cloud reindex (called from /chronicle:reindex) ──────────────────────────

	/**
	 * Reindex all local sessions to the cloud. Creates cloud sessions for
	 * any local sessions not yet synced, uploads their events, and triggers
	 * a bulk analytics backfill.
	 *
	 * Returns undefined when cloud reindex is not applicable (cloud disabled,
	 * no consent, no repo).
	 */
	private async _reindexCloud(
		reportProgress: (msg: string) => void,
		token: vscode.CancellationToken,
	): Promise<CloudReindexResult | undefined> {
		const cloudEnabled = this._configService.getNonExtensionConfig<boolean>('chat.sessionSync.enabled') ?? false;
		if (!cloudEnabled) {
			return undefined;
		}

		// Reconcile with cloud to know which sessions already exist (lazy, once per window)
		await this._reconcileWithCloud();

		const repo = await this._resolveRepository();
		if (!repo) {
			return undefined;
		}

		const repoNwo = `${repo.owner}/${repo.repo}`;
		if (!this._indexingPreference.hasCloudConsent(repoNwo)) {
			return undefined;
		}

		const indexingLevel = this._indexingPreference.getStorageLevel(repoNwo);
		if (indexingLevel === 'local') {
			return undefined;
		}

		const cloudIndexingLevel = indexingLevel === 'repo_and_user' ? 'repo_and_user' as const : 'user' as const;

		const result = await reindexCloudSessions(
			this._cloudClient,
			this._cloudSessions,
			this._debugLogService,
			repo.repoIds.ownerId,
			repo.repoIds.repoId,
			cloudIndexingLevel,
			reportProgress,
			token,
			nwo => !this._indexingPreference.hasCloudConsent(nwo),
		);

		// Update sync state with new count
		this._invalidateLocalSyncedCount();
		this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });

		this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
			operation: 'reindex',
		}, {
			created: result.created,
			failed: result.failed,
			eventsUploaded: result.eventsUploaded,
			backfillQueued: result.backfillQueued,
		});

		return result;
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
				/* __GDPR__
					"chronicle.cloudSync" : {
						"owner": "vijayu",
						"comment": "Tracks cloud sync operations (session init, creation, flush, errors, volume metrics)",
						"operation": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The operation performed." },
						"sessionSource": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The agent name/source for the session, or unknown if unavailable." },
						"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the operation succeeded." },
						"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Truncated error message if failed." },
						"indexingLevel": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The indexing level for the session." },
						"droppedEvents": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of events in a failed batch." },
						"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason session was disabled (no_consent, no_repo, init_error, create_error)." },
						"transition": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Circuit breaker state transition (open, closed)." },
						"eventsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of actually submitted events (sum of eventsBySession sizes)." },
						"orphanedCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of orphaned events not submitted (re-queued or dropped)." },
						"batchDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time to submit batch in ms." },
						"bufferSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Buffer size at time of event." },
						"failureCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Consecutive failure count." },
						"droppedCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Events dropped due to buffer overflow." }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
					operation: 'sessionDisabled',
					sessionSource,
					reason: 'no_repo',
				});
				return;
			}

			// Only export remotely if the user has cloud consent for this repo
			const repoNwo = `${repo.owner}/${repo.repo}`;

			if (!this._indexingPreference.hasCloudConsent(repoNwo)) {
				this._disabledSessions.add(sessionId);
				this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
					operation: 'sessionDisabled',
					sessionSource,
					reason: 'no_consent',
				});
				return;
			}
			await this._createCloudSession(sessionId, repo, this._indexingPreference.getStorageLevel(repoNwo));
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
		this._invalidateLocalSyncedCount();

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

		// Keep _cloudSessions entry — the cloud session ID mapping is needed
		// for future delete operations (e.g. sidebar delete fires after dispose).
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
			this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
				operation: 'bufferDrop',
			}, {
				droppedCount: dropped,
				bufferSize: MAX_BUFFER_SIZE,
			});
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
		const batchStart = Date.now();
		const uniqueSessionsInBatch = new Set(batch.map(e => e.chatSessionId)).size;
		this._setSyncState({ kind: 'syncing', sessionCount: uniqueSessionsInBatch });

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
			let submittedCount = 0;
			for (const [cloudSessionId, events] of eventsBySession) {
				submittedCount += events.length;
				const filteredEvents = events.map(e => filterSecretsFromObj(e));
				const success = await this._cloudClient.submitSessionEvents(cloudSessionId, filteredEvents);
				if (!success) {
					allSuccess = false;
				}
			}

			if (allSuccess && eventsBySession.size > 0) {
				this._circuitBreaker.recordSuccess();

				this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
					operation: 'batchSuccess',
				}, {
					eventsCount: submittedCount,
					orphanedCount: orphanedEntries.length,
					batchDurationMs: Date.now() - batchStart,
					bufferSize: this._eventBuffer.length,
				});

				if (!this._firstCloudWriteLogged) {
					this._firstCloudWriteLogged = true;

					this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
						operation: 'firstWrite',
						sessionSource: this._firstCloudWriteSessionSource ?? 'unknown',
					}, {});
				}
			} else if (!allSuccess) {
				this._circuitBreaker.recordFailure();
				this._setSyncState({ kind: 'error' });

				this._telemetryService.sendMSFTTelemetryEvent('chronicle.cloudSync', {
					operation: 'circuitBreaker',
					transition: 'open',
				}, {
					failureCount: this._circuitBreaker.getFailureCount(),
					eventsCount: submittedCount,
					orphanedCount: orphanedEntries.length,
					bufferSize: this._eventBuffer.length,
				});
			}

			if (allSuccess) {
				this._setSyncState({ kind: 'up-to-date', syncedCount: this._getLocalSyncedCount() });
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
			this._setSyncState({ kind: 'error' });
		} finally {
			this._isFlushing = false;
		}

		if (this._eventBuffer.length > SOFT_BUFFER_CAP && this._flushTimer !== undefined) {
			this._stopFlushTimer();
			this._ensureFlushTimer();
		}
	}

}
