/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { transaction } from '../../../../../base/common/observable.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IPreparedNewSession, ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionModelsSnapshot, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { getNativeCliDefinition, getNativeCliEnablementSetting, isNativeCliKindEnabled, isStoredNativeCliSession, IStoredNativeCliSession, nativeCliDefinitions, NativeCliKind, NATIVE_CLI_ENABLED_SETTING, NATIVE_CLI_PROVIDER_ID, NATIVE_CLI_STORAGE_KEY, resolveNativeCliWorkspace } from '../common/nativeCli.js';
import { NativeCliSession } from './nativeCliSession.js';
import { NativeCliSessionRuntime } from './nativeCliSessionRuntime.js';
import { INativeCliLifecycleEvent } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

export class NativeCliSessionsProvider extends Disposable implements ISessionsProvider {
	readonly id = NATIVE_CLI_PROVIDER_ID;
	readonly label = localize('nativeCliProvider', "CLI Terminals");
	readonly icon = Codicon.terminal;
	readonly order = 100;
	readonly supportsLocalWorkspaces = true;
	readonly supportsQuickChats = false;
	readonly browseActions = [];
	readonly onDidChangeModels = Event.None;
	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _sessions = this._register(new DisposableMap<string, NativeCliSession>());
	private readonly _publishedSessions = new Set<string>();
	private readonly _runtimes = this._register(new DisposableMap<string, NativeCliSessionRuntime>());
	private _storageReadable = true;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITerminalService terminalService: ITerminalService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();
		this._restore();
		this._register(_storageService.onWillSaveState(() => this._save()));
		this._register(_chatEntitlementService.onDidChangeSentiment(() => this._onDidChangeSessionTypes.fire()));
		this._register(_configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(NATIVE_CLI_ENABLED_SETTING) || nativeCliDefinitions.some(definition => {
				const setting = getNativeCliEnablementSetting(definition.kind);
				return setting && event.affectsConfiguration(setting);
			})) {
				this._onDidChangeSessionTypes.fire();
			}
		}));
		void terminalService.whenConnected.then(() => {
			if (!this._store.isDisposed) {
				for (const session of this._sessions.values()) {
					if (session.hasStarted) {
						void session.reconnect().then(reconnected => {
							// A shared process that is gone leaves every conversation to resume on its own.
							if (!reconnected && !this._store.isDisposed && session.isBackground) {
								session.detachRuntime(undefined);
								session.changed();
							}
						}).catch(error => {
							this._logService.error('Could not reconnect native CLI session', error);
							this._notificationService.error(error);
						});
					}
				}
			}
		}).catch(error => {
			this._logService.error('[NativeCliSessionsProvider] Could not reconnect terminal sessions', error);
			this._notificationService.error(error);
		});
	}

	/** Honors the `Claude3PIntegration` / `Codex3PIntegration` administrator policies. */
	private _isKindEnabled(kind: NativeCliKind): boolean {
		return isNativeCliKindEnabled(kind, this._configurationService);
	}

	private _createRuntime(session: NativeCliSession): NativeCliSessionRuntime {
		let resource = session.restoreRuntimeResource ? URI.parse(session.restoreRuntimeResource) : session.resource;
		const existing = this._runtimes.get(resource.toString());
		if (existing && session.restoreRuntimeResource && (existing.isRunning.get() || existing.isReconnecting)) {
			// The conversation was open in a process another restored session already reconnected to.
			return existing;
		}
		const shared = this._findSharedRuntime(session);
		if (shared) {
			return shared;
		}
		if (existing) {
			resource = resource.with({ fragment: generateUuid() });
		}
		const runtime = this._instantiationService.createInstance(NativeCliSessionRuntime, session, resource,
			(runtime, event) => this._acceptNativeEvent(runtime, event),
			runtime => this._detachBackgroundSessions(runtime));
		this._runtimes.set(resource.toString(), runtime);
		return runtime;
	}

	/** Copilot conversations of one folder share its CLI process; the terminal is that process, whatever it shows. */
	private _findSharedRuntime(session: NativeCliSession): NativeCliSessionRuntime | undefined {
		if (session.kind !== 'copilot') {
			return undefined;
		}
		return [...this._runtimes.values()].find(runtime => runtime.session.kind === 'copilot'
			&& isEqual(runtime.session.folder, session.folder)
			&& (runtime.isRunning.get() || runtime.isStarting.get() || runtime.isReconnecting));
	}

	private _attachedSessions(runtime: NativeCliSessionRuntime): NativeCliSession[] {
		return [...this._sessions.values()].filter(session => session.runtime === runtime);
	}

	/** Drops a session's process ownership, disposing the process only once no conversation uses it. */
	private _releaseRuntime(session: NativeCliSession): void {
		const runtime = session.runtime;
		session.stop();
		if (!runtime) {
			return;
		}
		if (session.runtime === runtime) {
			session.detachRuntime(undefined);
		}
		if (this._attachedSessions(runtime).length === 0) {
			this._runtimes.deleteAndDispose(runtime.resource.toString());
		}
	}

	/** Once the process is gone, conversations it had kept open must resume in processes of their own. */
	private _detachBackgroundSessions(runtime: NativeCliSessionRuntime): void {
		for (const session of this._attachedSessions(runtime)) {
			if (session !== runtime.session) {
				session.detachRuntime(undefined);
				session.changed();
			}
		}
	}

	private _nativeIdOf(session: NativeCliSession): string | undefined {
		return session.nativeSessionId.get() ?? (session.kind === 'codex' ? undefined : session.id);
	}

	private async _acceptNativeEvent(runtime: NativeCliSessionRuntime, event: INativeCliLifecycleEvent): Promise<void> {
		if (this._store.isDisposed || runtime.instance.get()?.isDisposed) {
			return;
		}
		const current = runtime.session;
		const attached = this._attachedSessions(runtime);
		let record = attached.find(session => this._nativeIdOf(session) === event.sessionId);
		if (!record && current.kind === 'codex' && (!current.nativeSessionId.get()
			|| !current.hasInteraction.get() && event.source === 'startup' && (event.event === 'start' || event.event === 'prompt'))) {
			current.nativeSessionId.set(event.sessionId, undefined);
			record = current;
		}
		// The foreground log is authoritative for Copilot; hooks for other conversations only carry activity.
		const foregroundSource = current.kind === 'copilot' && runtime.hasForegroundTracking ? event.source === 'switch' : event.event === 'start' || event.event === 'prompt';
		if (!record) {
			if (!foregroundSource) {
				return;
			}
			record = await this._adoptConversation(runtime, event);
			if (!record) {
				return;
			}
		} else if (event.event === 'end' && record !== current) {
			record.detachRuntime(undefined);
			record.setActivity('idle');
			record.changed();
			return;
		} else if (record !== current && foregroundSource) {
			await this._showConversation(runtime, record);
		}
		record.nativeSessionId.set(event.sessionId, undefined);
		if (event.source !== 'switch') {
			record.lifecycleTimestamp = event.timestamp;
		}
		runtime.applyEvent(event, record);
	}

	/** Attaches the conversation the CLI switched to, creating its record when it is unknown. */
	private async _adoptConversation(runtime: NativeCliSessionRuntime, event: INativeCliLifecycleEvent): Promise<NativeCliSession | undefined> {
		const current = runtime.session;
		let target = [...this._sessions.values()].find(candidate => candidate.kind === current.kind && this._nativeIdOf(candidate) === event.sessionId);
		const pending = runtime.pendingConversation.get();
		if (!target && pending && !pending.hasStarted && !pending.nativeSessionId.get()) {
			// The CLI created the conversation this draft asked for with `/new`.
			target = pending;
			target.nativeSessionId.set(event.sessionId, undefined);
		}
		if (!target) {
			if (event.cwdConfirmed === false) {
				this._logService.warn('Waiting for the resumed native CLI workspace before switching session details');
				return undefined;
			}
			target = this._createSession({
				...current.serialize(),
				id: generateUuid(), nativeSessionId: event.sessionId,
				folder: URI.file(event.cwd).toString(),
				title: event.title ?? localize('nativeCliResumedTitle', "{0} Session", getNativeCliDefinition(current.kind).sessionType.label),
				titleIsUserDefined: false, hasPromptTitle: !!event.title,
				hasInteraction: event.event === 'prompt' || !!event.title,
				createdAt: event.timestamp, updatedAt: event.timestamp,
				hasStarted: true, isArchived: false, isRead: true,
				baseRef: undefined, changesSummary: undefined, runtimeResource: undefined, lifecycleTimestamp: event.timestamp,
			});
			this._onDidChangeSessions.fire({ added: [target], changed: [], removed: [] });
		}
		const other = target.runtime;
		if (other && other !== runtime) {
			if (other.isRunning.get() && !other.isStarting.get() && !other.isInitializing.get()) {
				// Two live processes claim one conversation; the CLI's own lock decides, so neither is killed here.
				this._logService.warn(`Native ${current.kind} CLI opened conversation ${event.sessionId}, which another terminal session is still running`);
				runtime.warning.set(localize('nativeCliConversationElsewhere', "The CLI opened “{0}”, which is already running in another terminal session.", target.title.get()), undefined);
				return undefined;
			}
			// A launch that has not shown its screen yet is redundant once the CLI switched to the conversation itself.
			other.stop();
			this._runtimes.deleteAndDispose(other.resource.toString());
		}
		transaction(tx => {
			target!.isArchived.set(false, tx);
			target!.attachRuntime(runtime, tx);
		});
		await this._showConversation(runtime, target);
		void target.initializeChanges().catch(error => this._logService.error('Could not initialize resumed CLI changes', error));
		return target;
	}

	/** Makes `target` the conversation the process shows; the previous one stays open in the background. */
	private async _showConversation(runtime: NativeCliSessionRuntime, target: NativeCliSession): Promise<void> {
		const previous = runtime.session;
		if (previous === target) {
			return;
		}
		const active = this._sessionsService.activeSession.get()?.sessionId === previous.sessionId;
		const preserveFocus = !runtime.instance.get()?.hasFocus;
		runtime.session = target;
		runtime.warning.set(undefined, undefined);
		previous.changed();
		target.changed();
		if (active) {
			await this._sessionsService.openSession(target.resource, { preserveFocus });
		}
	}

	get sessionTypes(): readonly ISessionType[] {
		if (this._chatEntitlementService.sentiment.hidden) {
			return [];
		}
		return nativeCliDefinitions.filter(definition => this._isKindEnabled(definition.kind)).map(definition => definition.sessionType);
	}

	getSessions(): ISession[] {
		return [...this._sessions.values()].filter(session => session.hasStarted);
	}

	resolveWorkspace(folder: URI): ISessionWorkspace | undefined {
		return resolveNativeCliWorkspace(folder);
	}

	getSessionTypes(folder: URI): ISessionType[] {
		return this.resolveWorkspace(folder) ? [...this.sessionTypes] : [];
	}

	async prepareSessionForOpen(session: ISession): Promise<void> {
		const nativeSession = this._getSession(session.sessionId);
		const changesReady = nativeSession.initializeChanges().catch(error => {
			this._logService.warn('[NativeCliSessionsProvider] Could not load repository changes', error);
			this._notificationService.warn(localize('nativeCliChangesUnavailable', "The terminal session was restored, but its repository changes could not be loaded. See the window log for details."));
		});
		// Opening a conversation of a shared Copilot process asks that CLI to show it, so the
		// terminal follows the list without waiting for the switch here.
		const runtime = nativeSession.runtime;
		if (runtime && nativeSession.isBackground) {
			runtime.requestConversation(nativeSession);
		} else if (!runtime && nativeSession.hasStarted) {
			const shared = this._findSharedRuntime(nativeSession);
			if (shared) {
				nativeSession.attachRuntime(shared, undefined);
				shared.requestConversation(nativeSession);
			}
		}
		if (!nativeSession.isRunning.get()) {
			await changesReady;
		}
	}

	createNewSession(folder: URI, sessionTypeId: string): ISession {
		if (!this._storageReadable) {
			throw new Error(localize('nativeCliStorageUnavailable', "Terminal session history could not be read. Check the window log before creating another terminal session."));
		}
		const definition = nativeCliDefinitions.find(definition => definition.sessionType.id === sessionTypeId);
		if (!definition || !this.resolveWorkspace(folder) || this._chatEntitlementService.sentiment.hidden || !this._isKindEnabled(definition.kind)) {
			throw new Error(localize('nativeCliUnavailable', "This CLI session type is not available for the selected folder."));
		}
		const now = Date.now();
		return this._createSession({
			id: generateUuid(),
			kind: definition.kind,
			folder: folder.toString(),
			title: localize('nativeCliSessionTitle', "{0} Terminal", definition.sessionType.label),
			createdAt: now,
			updatedAt: now,
			isArchived: false,
			isRead: true,
			hasStarted: false,
			titleIsUserDefined: false,
			authentication: definition.kind === 'copilot' ? undefined : 'copilot',
		});
	}

	private _createSession(data: IStoredNativeCliSession): NativeCliSession {
		const session = this._instantiationService.createInstance(NativeCliSession, data, () => {
			if (!this._sessions.has(session.sessionId)) {
				return;
			}
			if (session.hasStarted) {
				const published = this._publishedSessions.has(session.sessionId);
				this._publishedSessions.add(session.sessionId);
				this._save();
				this._onDidChangeSessions.fire({ added: published ? [] : [session], changed: published ? [session] : [], removed: [] });
			}
		}, session => this._createRuntime(session));
		this._sessions.set(session.sessionId, session);
		if (session.hasStarted) {
			this._publishedSessions.add(session.sessionId);
		}
		return session;
	}

	deleteNewSession(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (session && !session.hasStarted) {
			this._releaseRuntime(session);
			this._sessions.deleteAndDispose(sessionId);
		}
	}

	createQuickChat(): never {
		throw new Error('Native CLI sessions require a repository folder');
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		if (!title.trim()) {
			throw new Error(localize('nativeCliEmptyTitle', "Enter a title for this terminal session."));
		}
		this._getSession(sessionId).rename(title.trim());
	}

	async renameChat(sessionId: string, chatResource: URI, title: string): Promise<void> {
		this._getChat(sessionId, chatResource);
		await this.renameSession(sessionId, title);
	}

	getModelsSnapshot(_sessionId: string, desiredModelId?: string): ISessionModelsSnapshot {
		return {
			models: [],
			desiredModelResolution: desiredModelId ? { kind: 'unavailable', identifier: desiredModelId } : { kind: 'notRequested' },
			modelTarget: undefined,
		};
	}

	getModelPickerOptions(): ISessionModelPickerOptions {
		return { useGroupedModelPicker: false, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false, showAutoModel: false };
	}

	setModel(): never {
		throw new Error(localize('nativeCliModelSelection', "Select the model in the CLI terminal."));
	}

	async archiveSession(sessionId: string): Promise<void> {
		this._getSession(sessionId).setArchived(true);
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		this._getSession(sessionId).setArchived(false);
	}

	async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const session = this._getSession(sessionId);
		session.isRead.set(isRead, undefined);
		this._save();
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = this._getSession(sessionId);
		this._releaseRuntime(session);
		this._sessions.deleteAndDispose(sessionId);
		this._publishedSessions.delete(sessionId);
		this._save();
		this._onDidChangeSessions.fire({ added: [], changed: [], removed: [session] });
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
	}

	async deleteChat(): Promise<boolean> {
		throw new Error(localize('nativeCliDeleteChat', "Delete the terminal session to remove its main conversation."));
	}

	async createNewChat(sessionId: string): Promise<IChat> {
		const session = this._getSession(sessionId);
		if (session.hasStarted) {
			throw new Error(localize('nativeCliMultipleChats', "Create another terminal session to start a new CLI conversation."));
		}
		return session.mainChat.get();
	}

	async prepareNewSession(sessionId: string, token: CancellationToken): Promise<IPreparedNewSession> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const session = this._getSession(sessionId);
		const cancellation = token.onCancellationRequested(() => session.stop());
		try {
			await session.prepareStart();
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return { session };
		} finally {
			cancellation.dispose();
		}
	}

	async forkChat(): Promise<IChat> {
		throw new Error(localize('nativeCliFork', "Use the CLI's native conversation commands to fork a conversation."));
	}

	async createSideChat(): Promise<IChat> {
		throw new Error(localize('nativeCliSideChat', "Create another terminal session to start a side conversation."));
	}

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const session = this._getChat(sessionId, chatResource);
		if (options.attachedContext?.length) {
			throw new Error(localize('nativeCliAttachments', "Attach context directly in the CLI terminal."));
		}
		if (session.isArchived.get()) {
			throw new Error(localize('nativeCliArchivedSend', "Restore this session before sending input to its CLI."));
		}
		if (options.title) {
			session.rename(options.title);
		}
		const wasRunning = session.isRunning.get();
		await session.start(wasRunning ? undefined : options.query);
		if (wasRunning && options.query) {
			if (this._chatEntitlementService.sentiment.hidden) {
				throw new Error(localize('nativeCliSendDisabled', "AI features are disabled."));
			}
			const terminal = session.instance.get();
			if (!terminal || !session.isRunning.get()) {
				throw new Error(localize('nativeCliNotRunning', "The CLI terminal is not running."));
			}
			await terminal.sendText(options.query, true, true);
		}
		return session;
	}

	private _getChat(sessionId: string, chatResource: URI): NativeCliSession {
		const session = this._getSession(sessionId);
		if (!isEqual(session.resource, chatResource)) {
			throw new Error('The chat does not belong to this terminal session');
		}
		return session;
	}

	private _getSession(sessionId: string): NativeCliSession {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Unknown terminal session '${sessionId}'`);
		}
		return session;
	}

	private _restore(): void {
		const raw = this._storageService.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		let stored: unknown;
		try {
			stored = JSON.parse(raw);
		} catch (error) {
			this._onStorageUnreadable(error);
			return;
		}
		if (!Array.isArray(stored)) {
			this._onStorageUnreadable(new Error('Native CLI session history is not an array'));
			return;
		}
		// Per entry: one record this build does not recognize (a profile rollback, or a
		// kind added by a newer build) must not discard the rest and disable the feature.
		let skipped = 0;
		for (const data of stored) {
			try {
				if (!isStoredNativeCliSession(data)) {
					throw new Error('Unrecognized native CLI session record');
				}
				getNativeCliDefinition(data.kind);
				this._createSession(data);
			} catch (error) {
				skipped++;
				this._logService.warn('[NativeCliSessionsProvider] Skipped an unreadable terminal session record', error);
			}
		}
		if (skipped) {
			this._notificationService.warn(localize('nativeCliRestoreSkipped', "{0} terminal session(s) could not be restored and were left out of the list. See the window log for details.", skipped));
		}
	}

	private _onStorageUnreadable(error: unknown): void {
		this._storageReadable = false;
		this._logService.error('[NativeCliSessionsProvider] Could not restore terminal sessions', error);
		this._notificationService.error(localize('nativeCliRestoreFailed', "Terminal session history could not be restored. The saved history has not been overwritten. See the window log for details."));
	}

	private _save(): void {
		if (this._storageReadable) {
			const sessions = [...this._sessions.values()].filter(session => session.hasStarted).map(session => session.serialize());
			this._storageService.store(NATIVE_CLI_STORAGE_KEY, JSON.stringify(sessions), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}
}
