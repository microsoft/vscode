/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, CloudSandboxRequestError, isRetryableCloudSandboxError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { ISession } from '../../../../services/sessions/common/session.js';
import type { AgentHostSessionAdapter } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { validateSessionConfigWrite } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';

/**
 * Sessions provider for a Copilot cloud sandbox.
 *
 * Adds the handling for sessions this client provisioned but the host has not materialized yet:
 * Mission Control mints the session id and returns it before the sandbox is even awake, so such a
 * session is real, addressable, and unknown to the host all at once.
 */
export class CloudSandboxSessionsProvider extends RemoteAgentHostSessionsProvider {
	private readonly _configurationUnavailable = derived(this, reader =>
		!RemoteAgentHostConnectionStatus.isConnected(this.connectionStatus.read(reader)) || this.authenticationPending.read(reader) || this.passiveRelay.read(reader));

	protected override get supportsOfflineDrafts(): boolean { return true; }

	override get environment() {
		return { id: 'cloud', label: localize('environment.cloud', "Cloud") };
	}

	readonly supportsWorkspaceSelection = false;

	/** Sandboxes are per-session environments, not persistent Automation hosts. */
	override get automations(): undefined { return undefined; }

	protected override _adoptCachedSessionMeta(meta: IAgentSessionMetadata): IAgentSessionMetadata {
		const adopted = super._adoptCachedSessionMeta(meta);
		return adopted.session.scheme === CLOUD_SANDBOX_AGENT_PROVIDER && adopted.provider === CLOUD_SANDBOX_AGENT_PROVIDER
			? { ...adopted, session: adopted.session.with({ scheme: CLOUD_SANDBOX_SESSION_SCHEME }) }
			: adopted;
	}

	private _taskRenameHandler: { readonly sessionKey: string; readonly rename: (title: string) => Promise<void> } | undefined;
	private _taskArchiveHandler: { readonly sessionKey: string; readonly setArchived: (archived: boolean) => Promise<void> } | undefined;
	private readonly _archiveSequencer = new Sequencer();

	/**
	 * Provisional sessions kept out of {@link getSessions} because the caller is still showing a
	 * placeholder row for them. They stay reachable by resource, so opening one still works.
	 */
	private readonly _withheldSessions = new Set<string>();

	/**
	 * Backend session key → deadline after which eviction resumes, or `undefined` while the clock has not
	 * started. It starts when a connected host first omits the session, not at seed time, because
	 * waking a sandbox can take minutes.
	 */
	private readonly _provisionalSessions = new Map<string, number | undefined>();
	private readonly _pendingSessionTitles = new Map<string, string>();

	/** How long a provisional session resists eviction after the host first omits it. */
	static readonly PROVISIONAL_GRACE_MS = 2 * 60_000;

	/** Resolves creation options without requiring the host to know the preallocated session yet. */
	async resolveInitialSessionConfig(sessionId: string, values: Record<string, unknown>, token: CancellationToken): Promise<Record<string, unknown>> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const connection = this.connection;
		if (!connection || !rawId || !this._sessionCache.has(rawId)) {
			throw new Error(localize('cloudSandbox.configUnavailable', "The sandbox connection is unavailable. Your prompt was not sent."));
		}
		const config = await raceCancellationError(connection.resolveSessionConfig({ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: values }), token);
		for (const [key, value] of Object.entries(values)) {
			validateSessionConfigWrite(config.schema, config.values, key, value, true);
			if (config.values[key] !== value) {
				throw new Error(localize('cloudSandbox.configNotApplied', "The sandbox could not apply the selected {0}. Your prompt was not sent.", key));
			}
		}
		return { ...values };
	}

	protected override _adapterOptions() {
		return {
			...super._adapterOptions(),
			preserveStatusWhenDisconnected: true,
			useSessionTitleForDefaultChat: true,
			externalSessionState: (resource: URI, store: DisposableStore) => {
				const key = this._localSessionStorageKey(AgentSession.id(resource));
				store.add(this._chatService.onDidAcceptRequest(({ chatSessionResource }) => {
					if (isEqual(resource, chatSessionResource.with({ fragment: '' }))) {
						this._storageService.store(key, true, StorageScope.PROFILE, StorageTarget.MACHINE);
					}
				}));
				// Preserve profile-local provenance without exposing sandbox sessions as external.
				return constObservable(false);
			},
		};
	}

	private _localSessionStorageKey(rawId: string): string {
		return `sessions.cloudSandbox.localSession.${this.id}.${rawId}`;
	}

	protected override updateAdapter(adapter: AgentHostSessionAdapter, meta: IAgentSessionMetadata): boolean {
		const changed = super.updateAdapter(adapter, meta);
		const sessionKey = meta.session.toString();
		// Unlike discovery seeds, this metadata comes from the host's listing or session-added notification.
		this._provisionalSessions.delete(sessionKey);
		const title = this._pendingSessionTitles.get(sessionKey);
		if (title !== undefined && this.connection) {
			this._pendingSessionTitles.delete(sessionKey);
			void super.renameSession(adapter.sessionId, title).catch(error => {
				this._logService.error(`[CloudSandboxSessionsProvider] Failed to apply initial title for ${sessionKey}`, error);
			});
			return true;
		}
		return changed;
	}

	protected override _onBackendSessionRemoved(rawId: string): void {
		super._onBackendSessionRemoved(rawId);
		this._pendingSessionTitles.delete(rawId);
	}

	/**
	 * Opening a sandbox session never dials the sandbox. Connecting resumes cloud compute and can
	 * take as long as the environment needs to wake, so the chat content activation decides from
	 * the environment's state whether to connect or to serve persisted history, and the connection
	 * banner leaves waking a dormant environment to the user.
	 */
	override async prepareSessionForOpen(): Promise<void> { }

	override isSessionConfigResolving(sessionId: string): IObservable<boolean> {
		const resolving = super.isSessionConfigResolving(sessionId);
		return derived(this, reader => this._configurationUnavailable.read(reader) || resolving.read(reader));
	}

	override async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		this._assertConfigurationAvailable();
		await super.setSessionConfigValue(sessionId, property, value);
	}

	override async replaceSessionConfig(sessionId: string, values: Record<string, unknown>): Promise<void> {
		this._assertConfigurationAvailable();
		await super.replaceSessionConfig(sessionId, values);
	}

	private _assertConfigurationAvailable(): void {
		if (this.passiveRelay.get()) {
			throw new Error(localize('cloudSandbox.settingsReadOnly', "This connection is read-only. Session settings cannot be changed."));
		}
		if (this._configurationUnavailable.get()) {
			throw new Error(localize('cloudSandbox.settingsUnavailable', "Connect to the environment before changing session settings."));
		}
	}

	protected override _resolveArchivedState(sessionKey: string, isArchived: boolean): boolean {
		return this._taskArchiveHandler?.sessionKey === sessionKey
			? this._sessionCache.get(sessionKey)?.isArchived.get() ?? isArchived
			: super._resolveArchivedState(sessionKey, isArchived);
	}

	/** Bind the discovered session's Mission Control archive operation. */
	setTaskArchiveHandler(rawId: string, setArchived: (archived: boolean) => Promise<void>): void {
		this._taskArchiveHandler = { sessionKey: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString(), setArchived };
	}

	/** Bind the discovered session's Mission Control rename operation. */
	setTaskRenameHandler(rawId: string, rename: (title: string) => Promise<void>): void {
		this._taskRenameHandler = { sessionKey: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString(), rename };
	}

	/** Preserve the initial title without letting a transient task metadata failure block the first turn. */
	setInitialSessionTitle(sessionId: string, title: string): Promise<void> {
		return this._renameSession(sessionId, title, true);
	}

	override renameSession(sessionId: string, title: string): Promise<void> {
		return this._renameSession(sessionId, title, false);
	}

	private async _renameSession(sessionId: string, title: string, initial: boolean): Promise<void> {
		const sessionKey = this._sessionKeyFromChatId(sessionId);
		const session = sessionKey ? this._sessionCache.get(sessionKey) : undefined;
		if (!session || !sessionKey) {
			throw new Error(localize('cloudSandbox.sessionNotFound', "Sandbox session not found."));
		}
		const handler = this._taskRenameHandler;
		if (handler?.sessionKey !== sessionKey) {
			if (!this.connection && !this._provisionalSessions.has(sessionKey)) {
				throw new Error(localize('cloudSandbox.renameUnavailable', "Connect to the environment to rename this session."));
			}
		} else {
			try {
				await handler.rename(title);
			} catch (error) {
				if (!initial || !(error instanceof CloudSandboxRequestError) || !isRetryableCloudSandboxError(error)) {
					throw error;
				}
				this._logService.warn(`[CloudSandboxSessionsProvider] Failed to synchronize initial task title for ${sessionKey}; continuing with the first turn`, error);
			}
			if (this._store.isDisposed || this._sessionCache.get(sessionKey) !== session) {
				throw new CancellationError();
			}
		}
		if (this._provisionalSessions.has(sessionKey)) {
			this._pendingSessionTitles.set(sessionKey, title);
		} else if (this.connection) {
			return super.renameSession(sessionId, title);
		}
		session.title.set(title, undefined);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
	}

	override async archiveSession(sessionId: string): Promise<void> {
		await this._archiveSequencer.queue(() => this._setArchived(sessionId, true));
	}

	override async unarchiveSession(sessionId: string): Promise<void> {
		await this._archiveSequencer.queue(() => this._setArchived(sessionId, false));
	}

	private async _setArchived(sessionId: string, isArchived: boolean): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const sessionKey = this._sessionKeyFromChatId(sessionId);
		const session = sessionKey ? this._sessionCache.get(sessionKey) : undefined;
		if (!session || !sessionKey) {
			throw new Error(localize('cloudSandbox.sessionNotFound', "Sandbox session not found."));
		}
		const handler = this._taskArchiveHandler;
		if (handler?.sessionKey !== sessionKey) {
			if (!this.connection) {
				throw new Error(localize('cloudSandbox.archiveUnavailable', "Connect to the environment to change this session's archive state."));
			}
			return isArchived ? super.archiveSession(sessionId) : super.unarchiveSession(sessionId);
		}
		await handler.setArchived(isArchived);
		if (this._store.isDisposed || this._sessionCache.get(sessionKey) !== session) {
			throw new CancellationError();
		}
		this.setSessionArchived(AgentSession.id(session.backendUri), isArchived);
	}

	setSessionArchived(rawId: string, archived: boolean): void {
		const session = this._sessionCache.get(AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString());
		if (!session) {
			throw new Error(localize('cloudSandbox.sessionNotFound', "Sandbox session not found."));
		}
		if (session.isArchived.get() === archived) {
			return;
		}
		session.isArchived.set(archived, undefined);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
	}

	/**
	 * Seed a session this client just provisioned. It is cached so a later discovery pass
	 * reconciles against it rather than adding a second entry, but stays out of the sessions list
	 * until {@link publishWithheldSession} and resists eviction until the host lists it.
	 */
	seedProvisionalSession(rawMeta: IAgentSessionMetadata): void {
		const meta = this._adoptSessionMeta(rawMeta);
		const rawId = AgentSession.id(meta.session);
		this._storageService.store(this._localSessionStorageKey(rawId), true, StorageScope.PROFILE, StorageTarget.MACHINE);
		if (this._sessionCache.has(meta.session.toString())) {
			return;
		}
		const adapter = this.createAdapter(meta);
		adapter.updateDiscoveryMetadata(meta);
		this._sessionCache.set(meta.session.toString(), adapter);
		this._withheldSessions.add(meta.session.toString());
		// No deadline yet: the clock starts when the host first omits it.
		this._provisionalSessions.set(meta.session.toString(), undefined);
	}

	/**
	 * Reveal a session seeded by {@link seedProvisionalSession}, so {@link getSessions} returns it.
	 *
	 * Pass `announce: false` when the caller immediately fires its own change event covering this
	 * session: the list re-reads {@link getSessions} on any change, so a single event can both drop
	 * a placeholder row and reveal this one.
	 */
	publishWithheldSession(rawId: string, options?: { announce?: boolean }): void {
		if (!this._withheldSessions.delete(AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString())) {
			return;
		}
		const session = this.getCachedSession(rawId);
		if (session && options?.announce !== false) {
			this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
		}
	}

	/**
	 * Look up a cached session by raw id, **including** ones withheld from {@link getSessions},
	 * which callers that seeded a session need before it is listed.
	 */
	getCachedSession(rawId: string): ISession | undefined {
		return this._sessionCache.get(AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString());
	}

	getSessionModifiedTime(rawId: string): number | undefined {
		return this.getCachedSession(rawId)?.updatedAt.get().getTime();
	}

	removeDeletedSession(rawId: string): void {
		const cached = this.getCachedSession(rawId);
		const key = cached ? this._sessionKeyFromChatId(cached.sessionId) : undefined;
		const session = key ? this._removeCachedSession(key) : undefined;
		const taskKey = AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId).toString();
		this._withheldSessions.delete(taskKey);
		this._provisionalSessions.delete(taskKey);
		this._pendingSessionTitles.delete(taskKey);
		if (session) {
			this._onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
			session.dispose();
		}
	}

	override getSessions(): ISession[] {
		const sessions = super.getSessions();
		return this._withheldSessions.size === 0
			? sessions
			: sessions.filter(session => !this._withheldSessions.has(this._sessionKeyFromChatId(session.sessionId) ?? ''));
	}

	protected override _isSessionEvictable(rawId: string): boolean {
		if (!this._provisionalSessions.has(rawId)) {
			return true;
		}
		const deadline = this._provisionalSessions.get(rawId);
		if (deadline === undefined || Date.now() < deadline) {
			return false;
		}
		this._provisionalSessions.delete(rawId);
		this._pendingSessionTitles.delete(rawId);
		return true;
	}

	protected override _onHostListedSessions(rawIds: ReadonlySet<string>): void {
		if (this._provisionalSessions.size === 0) {
			return;
		}
		for (const [rawId, deadline] of [...this._provisionalSessions]) {
			if (rawIds.has(rawId)) {
				// The host knows it, so it reconciles like any other session from here on.
				this._provisionalSessions.delete(rawId);
			} else if (deadline === undefined) {
				// Start the grace period now, so a slow wake does not consume it beforehand.
				this._provisionalSessions.set(rawId, Date.now() + CloudSandboxSessionsProvider.PROVISIONAL_GRACE_MS);
			}
		}
	}
}
