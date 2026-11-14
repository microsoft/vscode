/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, waitForState } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { requestSessionWorkspaceTrust } from '../../../../services/sessions/browser/worktreeTrust.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { ICreateNewSessionOptions, IRecentlyOpenedSessions, ISessionsManagementService, IToggleSessionStickinessEvent } from '../../common/sessionsManagement.js';
import { ISessionOpenTelemetryService, SESSION_OPEN_TIMEOUT_MS } from '../sessionOpenTelemetryService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { ICloseChatOptions, IOpenChatOptions, IOpenNewChatInSessionOptions, IOpenNewSessionOptions, IOpenNewSessionResult, IOpenSessionOptions, IOpenSessionsOptions, ISessionNavigationRequest, ISessionsService, SessionGridDirection } from '../sessionsService.js';
import { getEditorWindowComposerTarget, IEditorWindowSessionsPresenterService } from '../editorWindow/editorWindowSessionsPresenter.js';
import { IAgentsViewProvidersService, waitForAgentsViewSession } from './agentsViewProviders.js';

/**
 * The sessions of an editor window, for the UI the Agents window shares with it, such as the chat view and its pills: the
 * window has no grid of sessions. Its presenter shows sessions and chats (see `IEditorWindowSessionsPresenterService`),
 * such as the chat part, each in a tab, whose active tab is the active session. What only a grid does, such as moving or
 * resizing panes, does nothing here.
 */
export class EditorWindowSessionsService extends Disposable implements ISessionsService {

	declare readonly _serviceBrand: undefined;

	readonly panes: IObservable<readonly ISessionGridPane[]> = constObservable([]);
	readonly slotPanes: IObservable<readonly ISessionGridPane[]> = constObservable([]);
	readonly activePane: IObservable<ISessionGridPane | undefined> = constObservable(undefined);
	readonly initialRestoreComplete: IObservable<boolean> = constObservable(true);
	readonly navigationRequest: IObservable<ISessionNavigationRequest | undefined> = constObservable(undefined);
	readonly onDidToggleSessionStickiness: Event<IToggleSessionStickinessEvent> = Event.None;

	constructor(
		@IEditorWindowSessionsPresenterService private readonly _presenterService: IEditorWindowSessionsPresenterService,
		@ISessionHost private readonly _mainWindowHost: ISessionHost,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
		@ISessionOpenTelemetryService private readonly _sessionOpenTelemetryService: ISessionOpenTelemetryService,
		@IAgentsViewProvidersService private readonly _providers: IAgentsViewProvidersService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
	}

	/** What shows the chats of sessions: the chat part, while a feature shows them there, or the Chat view. */
	private get _presenter() {
		return this._presenterService.presenter.get();
	}

	get gridHost(): ISessionHost {
		return this._mainWindowHost;
	}

	//#region Panes: the window has none

	getPaneOfHost(): ISessionGridPane | undefined {
		return undefined;
	}

	/** The host of the presenter's active chat stands for the active pane. */
	isActivePane(host: ISessionHost): boolean {
		const active = this._presenter.activeChat.get();
		return host === this.gridHost || (!!active && isEqual(host.chatResource.get(), active.chat.resource));
	}

	isDetachedPane(): boolean {
		return false;
	}

	activatePane(): void { }
	closePane(): void { }
	collapseToPane(): void { }
	focusPaneInDirection(): void { }
	movePaneInDirection(): void { }
	resizePaneInDirection(): void { }
	arrangeSessions(): void { }
	toggleSessionStickiness(): void { }
	closeAllSessions(): void { }
	attachChat(): void { }
	async detachChat(): Promise<void> { }
	async reopenLastClosedItem(): Promise<void> { }
	async restoreVisibleSessions(): Promise<void> { }
	async openPreviousSession(): Promise<void> { }
	async openNextSession(): Promise<void> { }
	/** It keeps no navigation history, so it restores no saved draft from it. */
	registerSavedDraftOpener(_opener: (draftId: string, token: CancellationToken) => Promise<boolean>): IDisposable {
		return Disposable.None;
	}
	setCurrentDraftId(_draftId: string | undefined, _preserveCurrentEntry?: boolean): void { }

	async submitNewSessionInput(): Promise<boolean> {
		return false;
	}

	hideChatFromGrid(): IDisposable {
		return Disposable.None;
	}

	getRecentlyOpenedSessions(): IRecentlyOpenedSessions {
		return { recent: [], other: [] };
	}

	//#endregion

	//#region Sessions and chats: shown by the presenter

	showSession(sessionResource: URI, options?: { preserveFocus?: boolean }): void {
		void this.openSession(sessionResource, options);
	}

	async openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void> {
		// Its session is known only while the providers are held: until it shows, such as in the chat part, which holds them then
		const hold = this._providers.acquire();
		try {
			// Providers redirect superseded resources, such as of a session they adopted, and leave unfamiliar ones unchanged
			const resolved = await this._sessionsManagementService.resolveSessionResource(sessionResource, 'open');
			const session = await waitForAgentsViewSession(this._sessionsManagementService, resolved, () => this._sessionsManagementService.getSession(resolved));
			if (session) {
				await this._openSession(session, options);
			}
		} finally {
			hold.dispose();
		}
	}

	private async _openSession(session: ISession, options: IOpenSessionOptions | undefined): Promise<void> {
		// As the Agents window reports opening a session: until its chat shows and the session loaded. The wait for the session
		// to load ends just after the attempt timed out, which the telemetry service reports.
		const cts = new CancellationTokenSource();
		const timeout = setTimeout(() => cts.cancel(), SESSION_OPEN_TIMEOUT_MS + 1000);
		try {
			await this._sessionOpenTelemetryService.withOpenRequest(options?.source ?? 'unknown', cts.token, async attempt => {
				const chatResource = session.mainChat.get().resource;
				this._sessionOpenTelemetryService.sessionResolved(attempt, session.resource, session.providerId, this._presenter.isShowing(chatResource), session.loading.get());
				await this._presenter.openChat(session, undefined, { preserveFocus: options?.preserveFocus });
				this._sessionOpenTelemetryService.sessionActivated(attempt, chatResource);
				await waitForState(session.loading, loading => !loading, undefined, cts.token);
				this._sessionOpenTelemetryService.sessionLoaded(attempt);
			});
		} catch (error) {
			if (!cts.token.isCancellationRequested) {
				throw error;
			}
		} finally {
			clearTimeout(timeout);
			cts.dispose();
		}
	}

	async openSessionToSide(session: ISession, options?: IOpenSessionOptions & { chatResource?: URI }): Promise<void> {
		await this._presenter.openChat(session, options?.chatResource, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	async openChatToSide(session: ISession, chatResource: URI, options?: { preserveFocus?: boolean }): Promise<void> {
		await this._presenter.openChat(session, chatResource, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	/**
	 * Whether the user trusts every folder the session works in, as the Agents window asks before it opens a session. Asking
	 * is the caller's, as in the Agents window: {@link openSession}, {@link openSessionToSide}, {@link openChat} and
	 * {@link openChatToSide} open without asking, and the sessions list asks with this before it opens a session.
	 */
	async canOpenSession(session: ISession): Promise<boolean> {
		const workspace = session.workspace.get();
		return requestSessionWorkspaceTrust(workspace, () => workspace && this._sessionsManagementService.getRemoteHostLabel(workspace, session.providerId), this._workspaceTrustManagementService, this._workspaceTrustRequestService);
	}

	async openChat(session: ISession, chatUri: URI, options?: IOpenChatOptions): Promise<void> {
		await this._presenter.openChat(session, chatUri, { preserveFocus: options?.preserveFocus });
	}

	async moveChatToGrid(sessionId: string, chatResource: URI, _referenceSlotId: string, _direction: SessionGridDirection): Promise<void> {
		const owner = this._sessionsManagementService.getSessionForChatResource(chatResource);
		const session = owner?.session.sessionId === sessionId ? owner.session : this._sessionsManagementService.getSessions().find(candidate => candidate.sessionId === sessionId);
		if (session) {
			await this._presenter.openChat(session, chatResource);
		}
	}

	async closeChat(_session: ISession, chat: IChat, _options?: ICloseChatOptions): Promise<void> {
		await this._presenter.closeChat(chat.resource);
	}

	closeSession(session: ISession | undefined): void {
		for (const chat of session?.chats.get() ?? []) {
			void this._presenter.closeChat(chat.resource);
		}
	}

	insertAt(session: ISession | undefined): void {
		if (session) {
			void this._presenter.openChat(session, undefined);
		}
	}

	async openSessionsAt(sessions: readonly ISession[], _referenceSessionId: string | undefined, _direction: SessionGridDirection, options?: IOpenSessionsOptions): Promise<void> {
		await this.openSessionsInGrid(sessions, options);
	}

	async openSessionsInGrid(sessions: readonly ISession[], options?: IOpenSessionOptions): Promise<void> {
		for (const session of sessions) {
			await this._presenter.openChat(session, undefined, { preserveFocus: options?.preserveFocus });
		}
	}

	async openChatsInGrid(chats: readonly { readonly session: ISession; readonly chatResource: URI }[]): Promise<void> {
		for (const { session, chatResource } of chats) {
			await this._presenter.openChat(session, chatResource);
		}
	}

	async openMovedChats(chats: readonly { readonly session: ISession; readonly chatResource: URI }[]): Promise<void> {
		await this.openChatsInGrid(chats);
	}

	focusActiveSession(): void {
		this._presenter.focus();
	}

	//#endregion

	//#region New sessions and chats: composers of the presenter

	async openNewSession(options?: IOpenNewSessionOptions, token: CancellationToken = CancellationToken.None): Promise<IOpenNewSessionResult> {
		// A composer that holds its drafts in a slot of its own, such as one of the chat part, creates its draft there
		const draftSlot = options?.draftSlot && options.draftSlot !== this._sessionsManagementService.defaultNewSessionSlot ? options.draftSlot : undefined;
		if (!draftSlot) {
			const target = options?.folderUri
				? { folderUri: options.folderUri, providerId: options.providerId, sessionTypeId: options.sessionTypeId, modelId: options.modelId, modeId: options.modeId, requireDevContainer: options.requireDevContainer }
				: getEditorWindowComposerTarget(this._workspaceContextService, this._editorService);
			await this._presenter.openComposer(target, { sideBySide: options?.toSide });
			return { session: undefined, trustDeclined: false };
		}

		const folderUri = options?.folderUri;
		if (folderUri) {
			const resolved = this._sessionsManagementService.resolveWorkspace(folderUri, options?.providerId);
			if (resolved?.workspace.requiresWorkspaceTrust) {
				const trusted = await this._workspaceTrustRequestService.requestResourcesTrust({
					uri: folderUri,
					message: localize('editorWindowSessions.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
					remoteHostLabel: this._sessionsManagementService.getRemoteHostLabel(resolved.workspace, resolved.providerId),
				});
				if (token.isCancellationRequested || !trusted) {
					return { session: undefined, trustDeclined: !token.isCancellationRequested && !trusted };
				}
			}
			try {
				const session = draftSlot.createNewSession(folderUri, options);
				if (options?.requireDevContainer) {
					const provider = this._sessionsProvidersService.getProvider(session.providerId, session.sessionId);
					if (!provider || !isAgentHostProvider(provider) || !provider.preferDevContainer) {
						draftSlot.discardNewSession(session);
						throw new Error(`Session provider '${session.providerId}' does not support Dev Container drafts.`);
					}
					provider.preferDevContainer(session.sessionId, { required: true });
				}
				return { session, trustDeclined: false };
			} catch (error) {
				this._logService.trace(`[AgentsView] openNewSession: could not create a draft for ${folderUri.toString()}`, error);
			}
		}
		return { session: draftSlot.newSession.get(), trustDeclined: false };
	}

	openQuickChat(_options?: ICreateNewSessionOptions): ISession | undefined {
		void this._presenter.openComposer(undefined);
		return undefined;
	}

	async openNewChatInSession(session: ISession, options?: IOpenNewChatInSessionOptions): Promise<void> {
		const { from: _from, ...createOptions } = options ?? {};
		const chat = await this._sessionsManagementService.createNewChatInSession(session, Object.keys(createOptions).length ? createOptions : undefined);
		if (chat) {
			await this._presenter.openChat(session, chat.resource);
		}
	}

	unsetNewSession(): void {
		this._sessionsManagementService.discardNewSession();
	}

	//#endregion
}
