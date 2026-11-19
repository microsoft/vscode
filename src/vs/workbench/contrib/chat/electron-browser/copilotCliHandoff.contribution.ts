/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Prototype only, behind `chat.copilotCli.handoffPrototype`: durable transcript transitions and input ownership.
 */

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { env } from '../../../../base/common/process.js';
import { dirname, getComparisonKey, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AgentSession } from '../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getAgentHostSessionResource } from '../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { AhpErrorCodes, ProtocolError } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ExternalTerminalNotStartedError, IExternalTerminalSettings } from '../../../../platform/externalTerminal/common/externalTerminal.js';
import { IExternalTerminalService } from '../../../../platform/externalTerminal/electron-browser/externalTerminalService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING, COPILOT_CLI_HANDOFF_PROTOTYPE_TARGET_SETTING, isValidCopilotCliSessionId } from '../../../../platform/window/common/window.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { CHAT_CATEGORY } from '../browser/actions/chatActions.js';
import { isAgentSession, isMarshalledAgentSessionContext } from '../browser/agentSessions/agentSessionsModel.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../browser/chat.js';
import { CopilotCliSessionLinkOpener } from '../browser/copilotCliSessionLink.js';
import { IChatInputNotificationService } from '../browser/widget/input/chatInputNotificationService.js';
import { isChatViewTitleActionContext } from '../common/actions/chatActions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IChatService } from '../common/chatService/chatService.js';
import { SessionType } from '../common/chatSessionsService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { COPILOT_CLI_BACK_TO_TERMINAL_COMMAND_ID as CONTINUE_IN_TERMINAL_ACTION_ID, COPILOT_CLI_TAKE_BACK_COMMAND_ID as TAKE_BACK_COMMAND_ID, COPILOT_CLI_HANDOFF_NONE, COPILOT_CLI_HANDOFF_REQUEST_TIMEOUT_MS, COPILOT_CLI_HANDOFF_TERMINAL_COMMAND_SETTING, COPILOT_CLI_HANDOFF_TERMINAL_LOCATION_SETTING, COPILOT_CLI_OWNER_APP, CopilotCliHandoffRejection, CopilotCliHandoffState, CopilotCliOwnerVia, CopilotCliOwnerWindow, getCopilotCliHandoffRequestUri, getCopilotCliOwnerRecordUri, getNextCopilotCliHandoffState, ICopilotCliHandoffHistoryEntry, ICopilotCliHandoffRequest, ICopilotCliHandoffService, ICopilotCliOwnerRecord, isCopilotCliHandoffHistoryEntry, parseCopilotCliTerminalCommand, readCopilotCliHandoffRequest, readCopilotCliOwnerRecord, requestCopilotCliHandoff, setCopilotCliHandoffHistory, setCopilotCliHandoffInputPaused, writeCopilotCliHandoffRequest, writeCopilotCliOwnerRecord } from '../common/copilotCliHandoff.js';

const SHOW_TERMINAL_COMMAND_ID = 'workbench.action.chat.copilotCli.showTerminal';
const VIEW_ONLY_COMMAND_ID = 'workbench.action.chat.copilotCli.viewOnly';

const DEFAULT_TERMINAL_COMMAND = 'copilot';

/** Lets the events of one atomic write of the owner record, a temporary file and a rename, settle into one read. */
const OWNER_RECORD_CHANGE_DELAY_MS = 150;

/** What this window knows about the handoff of one Copilot CLI session. */
interface ICopilotCliHandoffEntry {
	readonly sessionId: string;
	/** The chat session resource that the handoff history and paused input apply to. */
	resource: URI;
	state: CopilotCliHandoffState;
	takingBack: boolean;
	movingToTerminal: boolean;
	history: readonly ICopilotCliHandoffHistoryEntry[];
}

interface IResolvedCopilotCliSession {
	readonly connection: IAgentConnection;
	readonly backendSession: URI;
	readonly sessionId: string;
}

export class CopilotCliHandoffService extends Disposable implements ICopilotCliHandoffService {

	declare readonly _serviceBrand: undefined;

	private readonly _enabled: IObservable<boolean>;
	/** Keyed by the comparison key of the session resource. */
	private readonly _entries = new Map<string, ICopilotCliHandoffEntry>();
	private readonly _watchers = this._register(new DisposableMap<string>());
	/** The integrated terminal that each session continued in, by session id. */
	private readonly _terminals = new Map<string, number>();
	/** Opens the sessions that Take It Back imports where this window shows sessions, else the Chat view does. */
	private _importedSessionOpener: ((backendSession: URI) => Promise<URI | undefined>) | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IFileService private readonly _fileService: IFileService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatService private readonly _chatService: IChatService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IExternalTerminalService private readonly _externalTerminalService: IExternalTerminalService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		const switchedOn = observableConfigValue<boolean>(COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING, false, this._configurationService);
		this._enabled = derived(this, reader => switchedOn.read(reader) === true && !chatEntitlementService.sentimentObs.read(reader).hidden);
		this._register(autorun(reader => {
			if (this._enabled.read(reader)) {
				this._watchOpenChats(reader.store);
			} else {
				this._clear();
			}
		}));
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			for (const entry of this._entries.values()) {
				if (event.key.startsWith(this._getHistoryPrefix(entry.sessionId))) {
					this._updateHistory(entry);
				}
			}
		}));
		this._register(toDisposable(() => this._clear()));
	}

	async didContinueFromCli(sessionId: string, sessionResource: URI): Promise<void> {
		if (!this._enabled.get()) {
			return;
		}
		const key = this._getKey(sessionResource);
		const entry = this._getOrCreateEntry(key, sessionResource, sessionId);
		entry.resource = sessionResource;
		this._setState(key, entry, COPILOT_CLI_HANDOFF_NONE);
		const ownedHere = await this._createOwnedHereRecord(sessionId, 'code-command');
		try {
			await writeCopilotCliOwnerRecord(this._fileService, this._getCopilotHome(), sessionId, ownedHere);
		} catch (error) {
			this._logService.warn(`[CopilotCliHandoff] Couldn't record that session ${sessionId} continued here`, error);
		}
		this._appendHistory(entry, 'arrival', ownedHere.since);
		this._clearInputNotifications(key);
		status(localize('copilotCliHandoff.arrivalAnnounced', "Continued from Copilot CLI. Use Back to Terminal beside the handoff message to return."));
	}

	async prepareToOpenFromCli(sessionId: string): Promise<boolean> {
		if (!this._enabled.get()) {
			return true;
		}
		const entry = [...this._entries.values()].find(candidate => candidate.sessionId === sessionId);
		if (entry && this._hasActiveRequest(entry.resource)) {
			this._showHandoffRefusal('busy');
			return false;
		}
		try {
			const owner = await readCopilotCliOwnerRecord(this._fileService, this._getCopilotHome(), sessionId);
			if (owner?.surface === 'cli') {
				const rejection = await requestCopilotCliHandoff(this._fileService, this._getCopilotHome(), sessionId, await this._createOwnedHereRecord(sessionId, 'take-back'));
				if (rejection) {
					this._showHandoffRefusal(rejection);
					return false;
				}
			}
			return true;
		} catch (error) {
			this._logService.error(`[CopilotCliHandoff] Couldn't verify the owner of session ${sessionId}`, error);
			this._showHandoffRefusal('unknown');
			return false;
		}
	}

	async continueInTerminal(sessionResource: URI): Promise<void> {
		if (!this._enabled.get()) {
			return;
		}
		const session = this._resolveSession(sessionResource);
		if (!session) {
			this._notificationService.info(localize('copilotCliHandoff.notCopilotSession', "Only Copilot CLI sessions can continue in the terminal."));
			return;
		}
		const key = this._getKey(sessionResource);
		const entry = this._getOrCreateEntry(key, sessionResource, session.sessionId);
		if (entry.movingToTerminal || entry.takingBack) {
			this._notificationService.info(localize('copilotCliHandoff.pending', "A handoff is already in progress. Wait for it to finish."));
			return;
		}
		if (entry.state.kind !== 'none') {
			return this.showTerminal(sessionResource);
		}
		if (this._hasActiveRequest(sessionResource)) {
			this._showHandoffRefusal('busy');
			return;
		}

		const copilotHome = this._getCopilotHome();
		const since = new Date().toISOString();
		// Pause input first, so nothing is sent while the session moves.
		entry.resource = sessionResource;
		entry.movingToTerminal = true;
		this._setState(key, entry, { kind: 'continuedInTerminal', since });
		let workingDirectory: URI;
		try {
			workingDirectory = await this._getWorkingDirectory(copilotHome, session.sessionId);
			await this._progressService.withProgress({ location: ProgressLocation.Window, title: localize('copilotCliHandoff.moving', "Moving the session to the terminal…") }, async () => {
				if (!session.connection.releaseSession) {
					throw new Error(localize('copilotCliHandoff.releaseUnsupported', "The agent host can't release sessions."));
				}
				await session.connection.releaseSession(session.backendSession);
				await writeCopilotCliOwnerRecord(this._fileService, copilotHome, session.sessionId, {
					version: 1,
					surface: 'cli',
					app: COPILOT_CLI_OWNER_APP,
					folder: workingDirectory.fsPath,
					since,
					via: 'continue-in-terminal',
					window: this._getOwnerWindow(),
				});
			});
		} catch (error) {
			entry.movingToTerminal = false;
			this._logService.error(`[CopilotCliHandoff] Couldn't move session ${session.sessionId} to the terminal`, error);
			this._setState(key, entry, COPILOT_CLI_HANDOFF_NONE);
			this._notificationService.error(error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict
				? localize('copilotCliHandoff.releaseBusy', "Couldn't continue this session in the terminal while it's working. Wait for it to finish, then try again.")
				: localize('copilotCliHandoff.releaseFailed', "Couldn't continue this session in the terminal: {0}", toErrorMessage(error)));
			return;
		}
		try {
			await this._openTerminal(session.sessionId, workingDirectory);
			this._appendHistory(entry, 'departure', since);
		} catch (error) {
			this._logService.error(`[CopilotCliHandoff] Couldn't confirm the terminal opened for session ${session.sessionId}`, error);
			if (ExternalTerminalNotStartedError.is(error)) {
				const owner = await readCopilotCliOwnerRecord(this._fileService, copilotHome, session.sessionId);
				if (owner?.surface === 'cli' && owner.since === since && owner.pid === undefined) {
					try {
						await writeCopilotCliOwnerRecord(this._fileService, copilotHome, session.sessionId, await this._createOwnedHereRecord(session.sessionId, 'take-back'));
						this._setState(key, entry, COPILOT_CLI_HANDOFF_NONE);
						this._notificationService.error(localize('copilotCliHandoff.terminalNotStarted', "The terminal command did not start: {0}. The session remains here. Fix the terminal launch and try again.", toErrorMessage(error)));
						return;
					} catch (restoreError) {
						this._logService.error(`[CopilotCliHandoff] Couldn't restore ownership after the terminal failed for session ${session.sessionId}`, restoreError);
					}
				}
			}
			this._notificationService.error(localize('copilotCliHandoff.terminalLaunchFailed', "Couldn't confirm the terminal opened: {0}. Input is paused here. Check your Terminal window before retrying, or select Take It Back to continue here.", toErrorMessage(error)));
		} finally {
			entry.movingToTerminal = false;
		}
		this._clearInputNotifications(key);
	}

	async takeBack(sessionResource: URI): Promise<void> {
		if (!this._enabled.get()) {
			return;
		}
		const key = this._getKey(sessionResource);
		const session = this._resolveSession(sessionResource);
		const entry = this._entries.get(key) ?? (session ? this._getOrCreateEntry(key, sessionResource, session.sessionId) : undefined);
		if (!entry || entry.takingBack) {
			return;
		}
		if (entry.movingToTerminal) {
			this._notificationService.info(localize('copilotCliHandoff.movePending', "Wait for the move to Terminal to finish, then take the session back."));
			return;
		}
		if (this._hasActiveRequest(sessionResource)) {
			this._showHandoffRefusal('busy');
			return;
		}
		entry.takingBack = true;
		this._clearInputNotifications(key);
		let opened: URI | undefined;
		try {
			const rejection = await requestCopilotCliHandoff(this._fileService, this._getCopilotHome(), entry.sessionId, await this._createOwnedHereRecord(entry.sessionId, 'take-back'));
			if (rejection) {
				this._showHandoffRefusal(rejection);
				return;
			}
			opened = await this._instantiationService.createInstance(CopilotCliSessionLinkOpener).open(entry.sessionId, { takeBack: true, openImported: this._importedSessionOpener });
		} catch (error) {
			this._logService.error(`[CopilotCliHandoff] Couldn't take session ${entry.sessionId} back`, error);
			this._notificationService.error(localize('copilotCliHandoff.takeBackFailed', "Couldn't take the session back: {0}", toErrorMessage(error)));
		} finally {
			entry.takingBack = false;
		}
		if (opened) {
			entry.resource = opened;
			this._setState(key, entry, COPILOT_CLI_HANDOFF_NONE);
			this._appendHistory(entry, 'takeBack', new Date().toISOString());
			status(localize('copilotCliHandoff.tookBack', "You took the session back. You can continue it here."));
		} else {
			this._clearInputNotifications(key);
		}
	}

	async showTerminal(sessionResource: URI): Promise<void> {
		const entry = this._entries.get(this._getKey(sessionResource));
		if (!this._enabled.get() || !entry) {
			return;
		}
		const instanceId = this._terminals.get(entry.sessionId);
		const terminal = instanceId === undefined ? undefined : this._terminalService.getInstanceFromId(instanceId);
		if (terminal) {
			this._terminalService.setActiveInstance(terminal);
			await this._terminalService.revealTerminal(terminal);
			await this._terminalService.focusInstance(terminal);
			return;
		}
		if (instanceId === undefined) {
			this._notificationService.info(localize('copilotCliHandoff.inTerminalWindow', "This session continues in a separate terminal window. To continue it here, select Take It Back."));
			return;
		}
		// Closing the terminal ended the Copilot CLI in it, so continue the session in a new one.
		await this._openTerminal(entry.sessionId, await this._getWorkingDirectory(this._getCopilotHome(), entry.sessionId));
		this._clearInputNotifications(this._getKey(sessionResource));
	}

	viewOnly(sessionResource: URI): void {
		const key = this._getKey(sessionResource);
		const entry = this._entries.get(key);
		if (entry?.state.kind === 'takenByCli') {
			this._setState(key, entry, { kind: 'viewOnly', since: entry.state.since });
		}
	}

	setImportedSessionOpener(opener: (backendSession: URI) => Promise<URI | undefined>): IDisposable {
		this._importedSessionOpener = opener;
		return toDisposable(() => {
			if (this._importedSessionOpener === opener) {
				this._importedSessionOpener = undefined;
			}
		});
	}

	private _watchOpenChats(store: DisposableStore): void {
		const widgetListeners = store.add(new DisposableMap<IChatWidget>());
		const listen = (widget: IChatWidget) => widgetListeners.set(widget, widget.onDidChangeViewModel(() => this._updateWatchedChats()));
		this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).forEach(listen);
		store.add(this._chatWidgetService.onDidAddWidget(widget => {
			listen(widget);
			this._updateWatchedChats();
		}));
		store.add(this._chatWidgetService.onDidRemoveWidget(widget => {
			widgetListeners.deleteAndDispose(widget);
			this._updateWatchedChats();
		}));
		store.add(toDisposable(() => this._watchers.clearAndDisposeAll()));
		this._updateWatchedChats();
	}

	/** Watches the owner record of each Copilot CLI session that a chat shows. */
	private _updateWatchedChats(): void {
		const open = new Map<string, { readonly resource: URI; readonly sessionId: string }>();
		for (const widget of this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)) {
			const resource = widget.viewModel?.sessionResource;
			const session = resource && this._resolveSession(resource);
			if (resource && session) {
				open.set(this._getKey(resource), { resource, sessionId: session.sessionId });
			}
		}
		for (const key of [...this._watchers.keys()]) {
			if (!open.has(key)) {
				this._watchers.deleteAndDispose(key);
			}
		}
		for (const [key, { resource, sessionId }] of open) {
			this._getOrCreateEntry(key, resource, sessionId);
			if (!this._watchers.has(key)) {
				this._watchers.set(key, this._watchOwnerRecord(key, sessionId));
			}
		}
	}

	private _watchOwnerRecord(key: string, sessionId: string): IDisposable {
		const store = new DisposableStore();
		void this._doWatchOwnerRecord(key, sessionId, store).catch(error => {
			this._logService.error(`[CopilotCliHandoff] Couldn't watch session ${sessionId}`, error);
		});
		return store;
	}

	private async _doWatchOwnerRecord(key: string, sessionId: string, store: DisposableStore): Promise<void> {
		const ownerRecord = getCopilotCliOwnerRecordUri(this._getCopilotHome(), sessionId);
		const handoffRequest = getCopilotCliHandoffRequestUri(this._getCopilotHome(), sessionId);
		const sessionFolder = dirname(ownerRecord);
		// A session that the Copilot runtime hasn't written yet has no folder to watch.
		if (!await this._fileService.exists(sessionFolder) || store.isDisposed) {
			return;
		}
		const queue = new Sequencer();
		const refresh = store.add(new RunOnceScheduler(() => {
			void queue.queue(() => this._refreshFromOwnerRecord(key, sessionId, store)).catch(error => {
				this._logService.error(`[CopilotCliHandoff] Couldn't refresh session ${sessionId}`, error);
			});
		}, OWNER_RECORD_CHANGE_DELAY_MS));
		const watcher = store.add(this._fileService.createWatcher(sessionFolder, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(e => {
			if (e.contains(ownerRecord) || e.contains(handoffRequest)) {
				refresh.schedule();
			}
		}));
		await queue.queue(() => this._refreshFromOwnerRecord(key, sessionId, store));
	}

	private async _refreshFromOwnerRecord(key: string, sessionId: string, watch: DisposableStore): Promise<void> {
		if (watch.isDisposed || !this._enabled.get()) {
			return;
		}
		const record = await readCopilotCliOwnerRecord(this._fileService, this._getCopilotHome(), sessionId);
		const entry = this._entries.get(key);
		if (entry && !watch.isDisposed) {
			const pausedNow = entry.state.kind === 'none';
			this._setState(key, entry, getNextCopilotCliHandoffState(entry.state, record));
			if (record?.surface === 'cli' && !entry.movingToTerminal) {
				this._appendHistory(entry, record.via === 'take-back' ? 'takenByCli' : 'departure', record.since);
			}
			if (pausedNow && entry.state.kind !== 'none') {
				await this._releaseForOtherOwner(entry);
			}
		}
		if (!watch.isDisposed) {
			await this._handleHandoffRequest(key, sessionId, watch);
		}
	}

	private _hasActiveRequest(sessionResource: URI): boolean {
		return this._chatService.getSession(sessionResource)?.hasActiveRequest.get() === true;
	}

	private _showHandoffRefusal(reason: CopilotCliHandoffRejection): void {
		this._notificationService.warn(reason === 'busy'
			? localize('copilotCliHandoff.busy', "This session is still running. Wait for its current work to finish before moving it or taking it over.")
			: localize('copilotCliHandoff.unconfirmed', "The current app could not confirm that this session is idle. Keep working there, or wait for it to finish and try again. The session was not taken over."));
	}

	private async _replyToHandoff(sessionId: string, request: ICopilotCliHandoffRequest, reason?: CopilotCliHandoffRejection): Promise<void> {
		const current = await readCopilotCliHandoffRequest(this._fileService, this._getCopilotHome(), sessionId);
		if (current?.requestId === request.requestId && current.status === 'requested') {
			await writeCopilotCliHandoffRequest(this._fileService, this._getCopilotHome(), sessionId, {
				...request, status: reason ? 'rejected' : 'accepted', ...(reason ? { reason } : {}),
			});
		}
	}

	private async _handleHandoffRequest(key: string, sessionId: string, watch: DisposableStore): Promise<void> {
		const copilotHome = this._getCopilotHome();
		const request = await readCopilotCliHandoffRequest(this._fileService, copilotHome, sessionId);
		const entry = this._entries.get(key);
		if (!entry || !request || request.status !== 'requested' || request.target.surface !== 'cli' || watch.isDisposed) {
			return;
		}
		const owner = await readCopilotCliOwnerRecord(this._fileService, copilotHome, sessionId);
		if (owner?.surface !== 'vscode' || owner.since !== request.expectedOwnerSince) {
			await this._replyToHandoff(sessionId, request, 'owner-changed');
			return;
		}
		if (owner.pid !== undefined && owner.pid !== this._environmentService.mainPid) {
			return;
		}
		if (request.expiresAt <= Date.now() || request.expiresAt > Date.now() + COPILOT_CLI_HANDOFF_REQUEST_TIMEOUT_MS) {
			await this._replyToHandoff(sessionId, request, 'expired');
			return;
		}
		if (entry.movingToTerminal || entry.takingBack || this._hasActiveRequest(entry.resource)) {
			await this._replyToHandoff(sessionId, request, 'busy');
			return;
		}
		const session = this._resolveSession(entry.resource);
		if (!session?.connection.releaseSession) {
			await this._replyToHandoff(sessionId, request, 'unknown');
			return;
		}
		const previous = entry.state;
		let committed = false;
		entry.movingToTerminal = true;
		this._setState(key, entry, { kind: 'takenByCli', since: request.target.since });
		try {
			await session.connection.releaseSession(session.backendSession);
			const latestRequest = await readCopilotCliHandoffRequest(this._fileService, copilotHome, sessionId);
			const latestOwner = await readCopilotCliOwnerRecord(this._fileService, copilotHome, sessionId);
			if (watch.isDisposed || !this._enabled.get() || latestRequest?.requestId !== request.requestId || latestRequest.status !== 'requested'
				|| latestRequest.expiresAt !== request.expiresAt || !equals(latestRequest.target, request.target)) {
				return;
			}
			if (Date.now() >= request.expiresAt) {
				await this._replyToHandoff(sessionId, request, 'expired');
				return;
			}
			if (latestOwner?.surface !== owner.surface || latestOwner.since !== owner.since) {
				await this._replyToHandoff(sessionId, request, 'owner-changed');
				return;
			}
			if (this._hasActiveRequest(entry.resource)) {
				await this._replyToHandoff(sessionId, request, 'busy');
				return;
			}
			await writeCopilotCliOwnerRecord(this._fileService, copilotHome, sessionId, request.target);
			committed = true;
			this._appendHistory(entry, 'takenByCli', request.target.since);
			await this._replyToHandoff(sessionId, request);
		} catch (error) {
			this._logService.error(`[CopilotCliHandoff] Couldn't release session ${sessionId} for the CLI`, error);
			if (!committed) {
				await this._replyToHandoff(sessionId, request, error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict ? 'busy' : 'unknown');
			}
		} finally {
			entry.movingToTerminal = false;
			if (!committed && this._enabled.get() && this._entries.get(key) === entry) {
				const currentOwner = await readCopilotCliOwnerRecord(this._fileService, copilotHome, sessionId);
				if (this._enabled.get() && this._entries.get(key) === entry) {
					this._setState(key, entry, getNextCopilotCliHandoffState(previous, currentOwner));
				}
			}
		}
	}

	/**
	 * Lets go of the runtime of a session that Copilot CLI owns now, so that only it holds the session. A session that is
	 * busy keeps it: the agent host doesn't release a session while a turn or background work runs.
	 */
	private async _releaseForOtherOwner(entry: ICopilotCliHandoffEntry): Promise<void> {
		const session = this._resolveSession(entry.resource);
		if (!session?.connection.releaseSession || this._chatService.getSession(entry.resource)?.requestInProgress.get()) {
			return;
		}
		try {
			await session.connection.releaseSession(session.backendSession);
		} catch (error) {
			this._logService.info(`[CopilotCliHandoff] Kept the runtime of session ${entry.sessionId}, which Copilot CLI owns now`, error);
		}
	}

	private _setState(key: string, entry: ICopilotCliHandoffEntry, state: CopilotCliHandoffState): void {
		if (equals(entry.state, state)) {
			return;
		}
		entry.state = state;
		setCopilotCliHandoffInputPaused(entry.resource, state.kind !== 'none');
		this._clearInputNotifications(key);
	}

	private _clearInputNotifications(key: string): void {
		this._chatInputNotificationService.deleteNotification(this._getReceiptId(key));
		this._chatInputNotificationService.deleteNotification(this._getBannerId(key));
	}

	private _readHistory(sessionId: string): readonly ICopilotCliHandoffHistoryEntry[] {
		const prefix = this._getHistoryPrefix(sessionId);
		const entries: ICopilotCliHandoffHistoryEntry[] = [];
		for (const key of this._storageService.keys(StorageScope.PROFILE)) {
			if (!key.startsWith(prefix)) {
				continue;
			}
			try {
				const entry: unknown = JSON.parse(this._storageService.get(key, StorageScope.PROFILE, 'null'));
				if (isCopilotCliHandoffHistoryEntry(entry)) {
					entries.push(entry);
				} else {
					this._logService.warn('[CopilotCliHandoff] Ignoring invalid handoff history');
				}
			} catch (error) {
				this._logService.warn('[CopilotCliHandoff] Could not read handoff history', error);
			}
		}
		return entries.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
	}

	private _getHistoryPrefix(sessionId: string): string {
		return `copilotCliHandoff.history.${sessionId}.`;
	}

	private _updateHistory(entry: ICopilotCliHandoffEntry): void {
		const history = this._readHistory(entry.sessionId);
		if (!equals(entry.history, history)) {
			entry.history = history;
			setCopilotCliHandoffHistory(entry.resource, history);
		}
	}

	private _appendHistory(entry: ICopilotCliHandoffEntry, kind: ICopilotCliHandoffHistoryEntry['kind'], since: string): void {
		if (!this._enabled.get()) {
			return;
		}
		const id = `${kind}:${since}`;
		if (entry.history.some(item => item.id === id)) {
			return;
		}
		const request = this._chatService.getSession(entry.resource)?.getRequests().at(-1);
		const historyEntry: ICopilotCliHandoffHistoryEntry = {
			id, kind, timestamp: Date.parse(since),
			...(request ? { afterRequestId: request.id } : {}),
			returnCommand: this._productService.urlProtocol === 'vscode-insiders' ? '/code-insiders' : '/code',
		};
		// Independent event keys let two windows append without overwriting each other's history.
		this._storageService.store(`${this._getHistoryPrefix(entry.sessionId)}${id}`, JSON.stringify(historyEntry), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateHistory(entry);
	}

	private _clear(): void {
		this._watchers.clearAndDisposeAll();
		for (const [key, entry] of this._entries) {
			setCopilotCliHandoffInputPaused(entry.resource, false);
			setCopilotCliHandoffHistory(entry.resource, []);
			this._chatInputNotificationService.deleteNotification(this._getBannerId(key));
			this._chatInputNotificationService.deleteNotification(this._getReceiptId(key));
		}
		this._entries.clear();
	}

	private async _openTerminal(sessionId: string, workingDirectory: URI): Promise<void> {
		const configured = this._configurationService.getValue<unknown>(COPILOT_CLI_HANDOFF_TERMINAL_COMMAND_SETTING);
		const command = typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_TERMINAL_COMMAND;
		if (this._configurationService.getValue<unknown>(COPILOT_CLI_HANDOFF_TERMINAL_LOCATION_SETTING) !== 'integrated') {
			await this._openExternalTerminal(command, sessionId, workingDirectory);
			return;
		}
		const terminal = await this._terminalService.createTerminal({
			cwd: workingDirectory,
			config: { name: localize('copilotCliHandoff.terminalName', "Copilot CLI"), icon: Codicon.copilot },
		});
		this._terminals.set(sessionId, terminal.instanceId);
		this._terminalService.setActiveInstance(terminal);
		await this._terminalService.revealTerminal(terminal);
		await this._terminalService.focusInstance(terminal);
		await terminal.sendText(`${command} --resume=${sessionId}`, true);
	}

	/**
	 * Runs the command in a new window of the external terminal app. Its leading assignments go through `env` in the
	 * command rather than the service's environment, which Terminal.app would print in full in the command line. A
	 * command line that needs a shell, such as one with `$(gh auth token)`, runs through `/bin/sh -c`, as the terminal
	 * app passes every argument on quoted.
	 */
	private async _openExternalTerminal(commandLine: string, sessionId: string, workingDirectory: URI): Promise<void> {
		const { environment, command, needsShell } = parseCopilotCliTerminalCommand(commandLine, this._environmentService.userHome.fsPath);
		const args = needsShell ? ['/bin/sh', '-c', `${commandLine} --resume=${sessionId}`] : [
			...(environment.length ? ['env', ...environment] : []),
			...(command.length ? command : [DEFAULT_TERMINAL_COMMAND]),
			`--resume=${sessionId}`,
		];
		const settings = this._configurationService.getValue<IExternalTerminalSettings | undefined>('terminal.external') ?? {};
		await this._externalTerminalService.runInTerminal(localize('copilotCliHandoff.terminalName', "Copilot CLI"), workingDirectory.fsPath, args, undefined, settings);
		this._terminals.delete(sessionId);
	}

	/** The directory the Copilot runtime recorded for the session, else this window's folder. */
	private async _getWorkingDirectory(copilotHome: URI, sessionId: string): Promise<URI> {
		try {
			const content = await this._fileService.readFile(joinPath(copilotHome, 'session-state', sessionId, 'workspace.yaml'));
			const value = /^cwd:[ \t]*(?<value>.+?)[ \t]*$/m.exec(content.value.toString())?.groups?.value;
			const path = value && (/^(?<quote>['"])(?<path>.*)\k<quote>$/.exec(value)?.groups?.path ?? value);
			if (path && isAbsolute(path)) {
				return URI.file(path);
			}
		} catch (error) {
			this._logService.trace(`[CopilotCliHandoff] Couldn't read the working directory of session ${sessionId}`, error);
		}
		return this._getWindowFolder() ?? this._environmentService.userHome;
	}

	/**
	 * The folder of this window. The Agents window has none: its workspace is where it starts new sessions, which
	 * needn't be where the session runs.
	 */
	private _getWindowFolder(): URI | undefined {
		return this._environmentService.isSessionsWindow ? undefined : this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private _resolveSession(sessionResource: URI): IResolvedCopilotCliSession | undefined {
		if (sessionResource.scheme !== SessionType.AgentHostCopilot) {
			return undefined;
		}
		const resolution = this._agentHostConnectionsService.resolveSessionResource(getAgentHostSessionResource(sessionResource));
		const sessionId = resolution ? AgentSession.id(resolution.backendSession) : undefined;
		return resolution && sessionId && isValidCopilotCliSessionId(sessionId)
			? { connection: resolution.connection, backendSession: resolution.backendSession, sessionId }
			: undefined;
	}

	private _getOrCreateEntry(key: string, resource: URI, sessionId: string): ICopilotCliHandoffEntry {
		let entry = this._entries.get(key);
		if (!entry) {
			entry = { sessionId, resource, state: COPILOT_CLI_HANDOFF_NONE, takingBack: false, movingToTerminal: false, history: this._readHistory(sessionId) };
			this._entries.set(key, entry);
			setCopilotCliHandoffHistory(resource, entry.history);
		}
		return entry;
	}

	private async _createOwnedHereRecord(sessionId: string, via: CopilotCliOwnerVia): Promise<ICopilotCliOwnerRecord> {
		const folder = this._getWindowFolder() ?? await this._getWorkingDirectory(this._getCopilotHome(), sessionId);
		return {
			version: 1,
			surface: 'vscode',
			app: this._productService.nameLong,
			uriScheme: this._productService.urlProtocol,
			folder: folder.fsPath,
			pid: this._environmentService.mainPid,
			since: new Date().toISOString(),
			via,
			window: this._getOwnerWindow(),
		};
	}

	private _getOwnerWindow(): CopilotCliOwnerWindow {
		return this._environmentService.isSessionsWindow ? 'agents' : 'editor';
	}

	private _getCopilotHome(): URI {
		const configured = env.COPILOT_HOME;
		return configured ? URI.file(configured) : joinPath(this._environmentService.userHome, '.copilot');
	}

	private _getKey(sessionResource: URI): string {
		return getComparisonKey(getAgentHostSessionResource(sessionResource));
	}

	private _getBannerId(key: string): string {
		return `copilotCliHandoff.banner.${key}`;
	}

	private _getReceiptId(key: string): string {
		return `copilotCliHandoff.receipt.${key}`;
	}
}

registerSingleton(ICopilotCliHandoffService, CopilotCliHandoffService, InstantiationType.Delayed);

/** Creates the {@link ICopilotCliHandoffService} after startup, so it watches the chats that are open. */
class CopilotCliHandoffContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.copilotCliHandoff';

	constructor(@ICopilotCliHandoffService _copilotCliHandoffService: ICopilotCliHandoffService) { }
}

registerWorkbenchContribution2(CopilotCliHandoffContribution.ID, CopilotCliHandoffContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'prototype'],
			markdownDescription: localize('chat.copilotCli.handoffPrototype', "Prototype: move Copilot CLI sessions between Copilot CLI and VS Code with handoff receipts, **Continue in Terminal** and **Take It Back**, and show which app owns each session."),
		},
		[COPILOT_CLI_HANDOFF_PROTOTYPE_TARGET_SETTING]: {
			type: 'string',
			enum: ['editor', 'agents'],
			enumDescriptions: [
				localize('chat.copilotCli.handoffPrototypeTarget.editor', "The Chat view of the window of the session's folder."),
				localize('chat.copilotCli.handoffPrototypeTarget.agents', "The Agents window."),
			],
			default: 'editor',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'prototype'],
			markdownDescription: localize('chat.copilotCli.handoffPrototypeTarget', "Prototype: where `/code` in Copilot CLI continues a session when {0} is on.", `\`#${COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING}#\``),
		},
		[COPILOT_CLI_HANDOFF_TERMINAL_COMMAND_SETTING]: {
			type: 'string',
			default: DEFAULT_TERMINAL_COMMAND,
			tags: ['experimental', 'prototype'],
			markdownDescription: localize('chat.copilotCli.handoffPrototypeTerminalCommand', "Prototype: the command that **Continue in Terminal** runs as `<command> --resume=<session id>` when {0} is on. It can start with environment assignments, such as `COPILOT_HANDOFF_PROTOTYPE=1 ~/.local/bin/copilot-dev`, and use shell expansions, such as `COPILOT_GITHUB_TOKEN=\"$(gh auth token)\"`.", `\`#${COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING}#\``),
		},
		[COPILOT_CLI_HANDOFF_TERMINAL_LOCATION_SETTING]: {
			type: 'string',
			enum: ['external', 'integrated'],
			enumDescriptions: [
				localize('chat.copilotCli.handoffPrototypeTerminalLocation.external', "A new window of the external terminal app set in `#terminal.external.osxExec#`."),
				localize('chat.copilotCli.handoffPrototypeTerminalLocation.integrated', "The integrated terminal."),
			],
			default: 'external',
			tags: ['experimental', 'prototype'],
			markdownDescription: localize('chat.copilotCli.handoffPrototypeTerminalLocation', "Prototype: where **Continue in Terminal** continues a session when {0} is on.", `\`#${COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING}#\``),
		},
	},
});

const handoffPrototypeEnabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING}`, true));

/** The chat session that an action runs for: its argument, or else the last focused chat. */
function resolveHandoffSessionResource(context: unknown, chatWidgetService: IChatWidgetService): URI | undefined {
	if (URI.isUri(context)) {
		return context;
	}
	if (isChatViewTitleActionContext(context)) {
		return context.sessionResource;
	}
	if (isMarshalledAgentSessionContext(context)) {
		return context.session.resource;
	}
	if (isAgentSession(context)) {
		return context.resource;
	}
	return chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
}

registerAction2(class ContinueInTerminalAction extends Action2 {
	constructor() {
		super({
			id: CONTINUE_IN_TERMINAL_ACTION_ID,
			title: localize2('copilotCliHandoff.continueInTerminalAction', "Continue in Terminal"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(handoffPrototypeEnabled, ChatContextKeys.hasMultipleAgentSessionsSelected.negate()),
			menu: [{
				id: MenuId.ViewTitle,
				group: '1_open',
				order: 1,
				when: ContextKeyExpr.and(
					handoffPrototypeEnabled,
					ContextKeyExpr.equals('view', ChatViewId),
					ChatContextKeys.lockedCodingAgentId.isEqualTo(SessionType.AgentHostCopilot),
					ChatContextKeys.chatSessionIsEmpty.negate(),
				),
			}, {
				id: MenuId.AgentSessionsContext,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(
					handoffPrototypeEnabled,
					ChatContextKeys.agentSessionType.isEqualTo(SessionType.AgentHostCopilot),
					ChatContextKeys.isArchivedAgentSession.negate(),
				),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
		const sessionResource = resolveHandoffSessionResource(context, accessor.get(IChatWidgetService));
		if (sessionResource) {
			await accessor.get(ICopilotCliHandoffService).continueInTerminal(sessionResource);
		}
	}
});

CommandsRegistry.registerCommand(TAKE_BACK_COMMAND_ID, (accessor, resource: URI) => accessor.get(ICopilotCliHandoffService).takeBack(URI.revive(resource)));
CommandsRegistry.registerCommand(SHOW_TERMINAL_COMMAND_ID, (accessor, resource: URI) => accessor.get(ICopilotCliHandoffService).showTerminal(URI.revive(resource)));
CommandsRegistry.registerCommand(VIEW_ONLY_COMMAND_ID, (accessor, resource: URI) => accessor.get(ICopilotCliHandoffService).viewOnly(URI.revive(resource)));
