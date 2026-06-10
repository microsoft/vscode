/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatWidgetHistoryService } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionArchivedContext, ActiveSessionWorkspaceIsVirtualContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ActiveSessionSupportsMultiChatContext, IActiveSession, ICreateNewSessionOptions, IProviderSessionType, ISendRequestOptions, ISendRequestSentEvent, ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;
	private readonly _onDidStartSession = this._register(new Emitter<ISession>());
	readonly onDidStartSession: Event<ISession> = this._onDidStartSession.event;

	private readonly _onWillSendRequest = this._register(new Emitter<ISession>());
	readonly onWillSendRequest: Event<ISession> = this._onWillSendRequest.event;
	private readonly _onDidSendRequest = this._register(new Emitter<ISendRequestSentEvent>());
	readonly onDidSendRequest: Event<ISendRequestSentEvent> = this._onDidSendRequest.event;

	private readonly _onDidArchiveSession = this._register(new Emitter<ISession>());
	readonly onDidArchiveSession: Event<ISession> = this._onDidArchiveSession.event;
	private readonly _onDidUnarchiveSession = this._register(new Emitter<ISession>());
	readonly onDidUnarchiveSession: Event<ISession> = this._onDidUnarchiveSession.event;
	private readonly _onDidDeleteSession = this._register(new Emitter<ISession>());
	readonly onDidDeleteSession: Event<ISession> = this._onDidDeleteSession.event;
	private readonly _onDidDeleteChat = this._register(new Emitter<ISession>());
	readonly onDidDeleteChat: Event<ISession> = this._onDidDeleteChat.event;
	private readonly _onDidRenameChat = this._register(new Emitter<ISession>());
	readonly onDidRenameChat: Event<ISession> = this._onDidRenameChat.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	private _sessionTypes: readonly ISessionType[] = [];

	/** The canonical active session, mirrored from the visible active slot by the view service. */
	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;

	/** Tracks the in-progress new session (composed but not yet sent). */
	private readonly _newSession = observableValue<ISession | undefined>(this, undefined);
	readonly newSession: IObservable<ISession | undefined> = this._newSession;

	private readonly _isNewChatSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _activeSessionWorkspaceIsVirtual: IContextKey<boolean>;
	private readonly _isActiveSessionArchived: IContextKey<boolean>;
	private readonly _supportsMultiChat: IContextKey<boolean>;
	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());

	/**
	 * Chat resources for which this service has just kicked off a
	 * `provider.sendRequest` and will emit `_onDidSendRequest` manually after
	 * the provider call resolves. Used to suppress the duplicate event that
	 * would otherwise arrive via {@link IChatService.onDidSubmitRequest},
	 * which fires synchronously inside the same provider call.
	 */
	private readonly _pendingSendChatResources = new Set<string>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetHistoryService private readonly chatWidgetHistoryService: IChatWidgetHistoryService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this._isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._activeSessionWorkspaceIsVirtual = ActiveSessionWorkspaceIsVirtualContext.bindTo(contextKeyService);
		this._isActiveSessionArchived = IsActiveSessionArchivedContext.bindTo(contextKeyService);
		this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);

		// Subscribe to provider changes for session type updates
		this._register(this.sessionsProvidersService.onDidChangeProviders(e => {
			this._onProvidersChanged(e);
			this._updateSessionTypes();
		}));
		this._subscribeToProviders(this.sessionsProvidersService.getProviders());
		this._sessionTypes = this._collectSessionTypes();

		this._register(autorun(reader => {
			const activeSession = this._activeSession.read(reader);
			const newSession = this._newSession.read(reader);
			this._handleActiveSessionContextKeys(activeSession, newSession);
			if (activeSession) {
				reader.store.add(this._activeSessionListeners(activeSession));
			}
		}));

		// Mirror follow-up chat requests (sent from within an existing chat
		// widget, not through our own send paths) onto `_onDidSendRequest` so
		// downstream listeners (e.g., telemetry) can observe every user
		// request for a session, not just those initiated from the sessions
		// UI. Sends originating from {@link sendRequest} and
		// {@link sendNewChatRequest} are deduplicated via
		// {@link _pendingSendChatResources}.
		this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource, message }) => {
			if (this._pendingSendChatResources.has(chatSessionResource.toString())) {
				return;
			}
			const ownedChat = this.getSessionForChatResource(chatSessionResource);
			if (ownedChat) {
				this._onDidSendRequest.fire({
					session: ownedChat.session,
					chat: ownedChat.chat,
					isNewSession: false,
					isNewChat: false,
					options: { query: message?.text ?? '' },
				});
			}
		}));
	}

	private _handleActiveSessionContextKeys(session: IActiveSession | undefined, newSession: ISession | undefined): void {
		// Update context keys from session data
		// IsNewChatSessionContext is true when no active session exists, OR when the
		// active session is still the in-progress new session (created but not yet
		// sent for the first time). Scoping to the active session avoids flipping
		// into "new chat" mode while viewing a different established session.
		this._isNewChatSessionContext.set(session === undefined || session.sessionId === newSession?.sessionId);
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._activeSessionWorkspaceIsVirtual.set(session?.workspace.get()?.isVirtualWorkspace ?? true);
		this._isActiveSessionArchived.set(session?.isArchived.get() ?? false);
		this._supportsMultiChat.set(session?.capabilities.supportsMultipleChats ?? false);
	}

	private _activeSessionListeners(activeSession: IActiveSession): IDisposable {
		const disposables = new DisposableStore();

		// Track archived state changes for the active session
		disposables.add(autorun(reader => {
			this._isActiveSessionArchived.set(activeSession.isArchived.read(reader));
		}));

		// Track workspace changes so the virtual-workspace context key stays in sync
		disposables.add(autorun(reader => {
			const workspace = activeSession.workspace.read(reader);
			this._activeSessionWorkspaceIsVirtual.set(workspace?.isVirtualWorkspace ?? true);
		}));

		return disposables;
	}

	private _onProvidersChanged(e: ISessionsProvidersChangeEvent): void {
		for (const provider of e.removed) {
			this._providerListeners.deleteAndDispose(provider.id);
		}
		if (e.added.length) {
			this._subscribeToProviders(e.added);
		}
	}

	private _subscribeToProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			const disposables = new DisposableStore();
			disposables.add(provider.onDidChangeSessions(e => this.onDidChangeSessionsFromSessionsProviders(e)));
			if (provider.onDidReplaceSession) {
				disposables.add(provider.onDidReplaceSession(e => this._handleDidReplaceSession(e.from, e.to)));
			}
			if (provider.onDidChangeSessionTypes) {
				disposables.add(provider.onDidChangeSessionTypes(() => this._updateSessionTypes()));
			}
			this._providerListeners.set(provider.id, disposables);
		}
	}

	private _handleDidReplaceSession(from: ISession, to: ISession): void {
		this.chatWidgetHistoryService.moveHistory(ChatAgentLocation.Chat, from.sessionId, to.sessionId);
		// Notify the view service so it can update the visible grid slot.
		this._onDidReplaceSession.fire({ from, to });
		// Always fire the change event so the SessionsList refreshes even when
		// the user navigated to a different session while the new one was
		// being created (which is how duplicate rows appeared in the list).
		this._onDidChangeSessions.fire({
			added: [],
			removed: from.sessionId === to.sessionId ? [] : [from],
			changed: [to],
		});
	}

	private onDidChangeSessionsFromSessionsProviders(e: ISessionChangeEvent): void {
		// Clear stale new session if the provider removed it. The provider
		// already disposed it, so just drop the pointer (do not dispose again).
		if (e.removed.length) {
			const current = this._newSession.get();
			if (current && e.removed.some(r => r.sessionId === current.sessionId)) {
				this._newSession.set(undefined, undefined);
			}
		}

		// The view service reacts to this event to drop removed sessions from
		// the grid and pick a fallback active session.
		this._onDidChangeSessions.fire(e);
	}

	getSessions(): ISession[] {
		const sessions: ISession[] = [];
		for (const provider of this.sessionsProvidersService.getProviders()) {
			sessions.push(...provider.getSessions());
		}
		return sessions;
	}

	getSession(resource: URI): ISession | undefined {
		return this.getSessions().find(s =>
			this.uriIdentityService.extUri.isEqual(s.resource, resource)
		);
	}

	getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
		for (const session of this.getSessions()) {
			const chat = session.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, resource));
			if (chat) {
				return { session, chat };
			}

			const mainChat = session.mainChat.get();
			if (this.uriIdentityService.extUri.isEqual(mainChat.resource, resource)) {
				return { session, chat: mainChat };
			}
		}
		return undefined;
	}

	getAllSessionTypes(): ISessionType[] {
		return [...this._sessionTypes];
	}

	getSessionTypesForFolder(folderUri: URI): IProviderSessionType[] {
		const result: IProviderSessionType[] = [];
		for (const provider of this._getOrderedProviders()) {
			if (!provider.resolveWorkspace(folderUri)) {
				continue;
			}
			for (const sessionType of provider.getSessionTypes(folderUri)) {
				result.push({ providerId: provider.id, sessionType });
			}
		}
		return result;
	}

	resolveWorkspace(folderUri: URI): { providerId: string; workspace: ISessionWorkspace } | undefined {
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
	}

	private _collectSessionTypes(): ISessionType[] {
		const types: ISessionType[] = [];
		const seen = new Set<string>();
		for (const provider of this._getOrderedProviders()) {
			for (const type of provider.sessionTypes) {
				if (!seen.has(type.id)) {
					seen.add(type.id);
					types.push(type);
				}
			}
		}
		return types;
	}

	/**
	 * Returns the registered providers in the order their session types should
	 * be surfaced, sorted by each provider's {@link ISessionsProvider.order}
	 * (lower first). The sort is stable, so providers with equal order keep
	 * their registration order.
	 */
	private _getOrderedProviders(): ISessionsProvider[] {
		return [...this.sessionsProvidersService.getProviders()].sort((a, b) => a.order - b.order);
	}

	private _updateSessionTypes(): void {
		// Always fire — the deduplicated flat list (used by surfaces that
		// only need a set of type ids) may be unchanged, but the per-folder
		// result of {@link getSessionTypesForFolder} can change whenever any
		// provider's types or the set of providers changes, because each
		// entry is keyed by (providerId × sessionType) rather than by type
		// id alone.
		this._sessionTypes = this._collectSessionTypes();
		this._onDidChangeSessionTypes.fire();
	}

	setActiveSession(session: IActiveSession | undefined, force = false): void {
		const previousSession = this._activeSession.get();
		if (!force && previousSession?.sessionId === session?.sessionId) {
			return;
		}

		if (session) {
			this.logService.info(`[SessionsManagement] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[SessionsManagement] Active session cleared');
		}

		this._activeSession.set(session, undefined);
	}

	replaceActiveSession(from: IActiveSession, to: IActiveSession): void {
		if (this._activeSession.get()?.sessionId === from.sessionId) {
			this.setActiveSession(to, true);
		}
	}

	discardNewSession(session?: ISession): void {
		const current = this._newSession.get();
		if (!current) {
			return;
		}
		// When a specific session is given, only discard if it is the current
		// new session; closing an unrelated session must not drop the draft.
		if (session && session.sessionId !== current.sessionId) {
			return;
		}
		this._newSession.set(undefined, undefined);
		this._getProvider(current)?.deleteNewSession(current.sessionId);
	}

	/**
	 * Resolve the provider and session type to use for a new session in the
	 * given folder, applying the same selection rules as
	 * {@link createNewSession}. Throws when no provider/type can be resolved.
	 */
	private _resolveProviderForNewSession(folderUri: URI, options?: ICreateNewSessionOptions): { provider: ISessionsProvider; sessionTypeId: string } {
		const providers = this.sessionsProvidersService.getProviders();
		let provider: ISessionsProvider | undefined;

		if (options?.providerId) {
			provider = providers.find(p => p.id === options.providerId);
			if (!provider) {
				throw new Error(`Sessions provider '${options.providerId}' not found`);
			}
			if (!provider.resolveWorkspace(folderUri)) {
				throw new Error(`Sessions provider '${options.providerId}' cannot resolve folder '${folderUri.toString()}'`);
			}
		} else {
			// Iterate providers and pick the first one that can resolve the folder.
			// When a specific session type was requested, also require the provider to
			// advertise that type for the folder.
			for (const candidate of providers) {
				if (!candidate.resolveWorkspace(folderUri)) {
					continue;
				}
				if (options?.sessionTypeId && !candidate.getSessionTypes(folderUri).some(t => t.id === options.sessionTypeId)) {
					continue;
				}
				provider = candidate;
				break;
			}
			if (!provider) {
				throw new Error(`No sessions provider can resolve folder '${folderUri.toString()}'`);
			}
		}
		let sessionTypeId = options?.sessionTypeId;
		if (!sessionTypeId) {
			sessionTypeId = provider.getSessionTypes(folderUri)[0]?.id;
			if (!sessionTypeId) {
				throw new Error(`No session types available for provider '${provider.id}'`);
			}
		}
		return { provider, sessionTypeId };
	}

	createNewSession(folderUri: URI, options?: ICreateNewSessionOptions): ISession {
		const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, options);

		const previousNewSession = this._newSession.get();
		const session = provider.createNewSession(folderUri, sessionTypeId);
		this._newSession.set(session, undefined);

		// Providers no longer dispose the previous new session implicitly, so
		// dispose the one this composer just replaced. Use its own provider
		// because switching workspace can switch providers. Done after a
		// successful create so a throw above leaves the previous one intact.
		if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
			this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
		}
		return session;
	}

	async createNewChatInSession(session: ISession): Promise<IChat | undefined> {
		const provider = this._getProvider(session);
		if (!provider) {
			this.logService.warn(`[SessionsManagement] createNewChatInSession: provider '${session.providerId}' not found`);
			return undefined;
		}
		// Reuse an existing untitled chat if one exists, otherwise create a new one.
		const existingUntitled = session.chats.get().find(c => c.status.get() === SessionStatus.Untitled);
		return existingUntitled ?? await provider.createNewChat(session.sessionId);
	}

	async sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> {
		// The session is graduating into the list (being sent),
		// so the provider keeps owning it — just drop the pointer, do not delete.
		// Clearing the new session recomputes the isNewChatSession context key
		// via the active-session autorun.
		this._newSession.set(undefined, undefined);

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		if (options.background) {
			// Run the send fire-and-forget so the composer can reset and reseed
			// immediately while the request commits. If the commit fails, the
			// graduating draft is stranded (no longer the current new session),
			// so dispose it through its provider to release the eager backend
			// session. Safe no-op if the provider already graduated/removed it.
			this._sendNewChatRequestInBackground(provider, session, options).catch(e => {
				provider.deleteNewSession(session.sessionId);
				this.logService.error('[SessionsManagement] Failed to send background request:', e);
			});
			return;
		}

		// Foreground send: notify listeners that a send is starting. Listeners
		// (e.g., telemetry) can use this to prewarm caches whose result is
		// consumed when `onDidSendRequest` fires below. The background path
		// fires this from within `_sendNewChatRequestInBackground`. The view
		// service observes the will/did send pair to keep the newest chat
		// active in the visible slot while the send materialises.
		this._onWillSendRequest.fire(session);

		// Ask the provider to create the new chat, then send the request.
		const chat = await provider.createNewChat(session.sessionId, options.query);

		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (updatedSession.sessionId !== session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
		}
		this._onDidStartSession.fire(updatedSession);
		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
	}

	/**
	 * Create a new session for the given folder and send a chat request to it,
	 * without navigating into the started session. The started session appears
	 * in the sessions list once the provider commits it, while the user's
	 * current view is left untouched.
	 *
	 * Unlike {@link sendNewChatRequest} with `background`, this does not go
	 * through the new-session composer: it creates a fresh session purely for
	 * this request and never sets it as pending/active. Intended for callers
	 * outside the composer that want to kick off a session programmatically.
	 *
	 * If the send fails, the stranded draft is disposed through its provider and
	 * the error is rethrown so the caller can react.
	 */
	async createAndSendNewChatRequest(folderUri: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<void> {
		const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, createOptions);
		const session = provider.createNewSession(folderUri, sessionTypeId);

		try {
			await this._sendNewChatRequestInBackground(provider, session, options);
		} catch (e) {
			// The send never committed, so the draft is stranded. Dispose it
			// through its provider to release the eager backend session before
			// rethrowing. Safe no-op if the provider already removed it.
			provider.deleteNewSession(session.sessionId);
			throw e;
		}
	}

	/**
	 * Commit a new-session request: fire {@link _onWillSendRequest}, create the
	 * new chat via the provider, send the request, and—on success—fire
	 * {@link _onDidStartSession} and {@link _onDidSendRequest}. The started
	 * session is never swapped into the visible chat slot, so it simply appears
	 * in the sessions list once the provider commits it.
	 *
	 * Owns the full will/did send lifecycle so callers do not fire the paired
	 * events themselves. Errors are propagated to the caller; this method does
	 * not clean up the stranded draft, so callers own any view handling and the
	 * error handling (e.g. disposing the stranded draft via
	 * {@link ISessionsProvider.deleteNewSession}).
	 *
	 * Providers are multi-new-session aware, so the graduating session and a
	 * concurrently reseeded composer draft coexist without conflict.
	 */
	private async _sendNewChatRequestInBackground(provider: ISessionsProvider, session: ISession, options: ISendRequestOptions): Promise<void> {
		// Notify listeners (e.g., telemetry) that a send is starting so they can
		// prewarm caches whose result is consumed when `onDidSendRequest` fires.
		this._onWillSendRequest.fire(session);
		const chat = await provider.createNewChat(session.sessionId, options.query);

		// Suppress the `chatService.onDidSubmitRequest` mirror for this send so
		// `_onDidSendRequest` is not fired twice for providers that dispatch
		// through `chatService.sendRequest` (see the mirror in the constructor).
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (this._store.isDisposed) {
			return;
		}
		this._onDidStartSession.fire(updatedSession);
		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
	}

	async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		// Sending into an existing session abandons any in-progress new session,
		// so dispose it to release its eager backend session.
		this.discardNewSession();

		// Notify listeners that a send is starting. Listeners (e.g., telemetry)
		// can use this to prewarm caches whose result is consumed when
		// `onDidSendRequest` fires below. The view service observes the will/did
		// send pair to keep the sent chat active in the visible slot.
		this._onWillSendRequest.fire(session);

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (updatedSession.sessionId !== session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
		}

		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
	}

	// -- Session Actions --

	private _getProvider(session: ISession): ISessionsProvider | undefined {
		return this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
	}

	async archiveSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.archiveSession(session.sessionId);
		this._onDidArchiveSession.fire(session);
	}

	async unarchiveSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.unarchiveSession(session.sessionId);
		this._onDidUnarchiveSession.fire(session);
	}

	async deleteSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.deleteSession(session.sessionId);
		this._onDidDeleteSession.fire(session);
	}

	async deleteChat(session: ISession, chatUri: URI): Promise<void> {
		await this._getProvider(session)?.deleteChat(session.sessionId, chatUri);
		this._onDidDeleteChat.fire(session);
	}

	async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
		this._onDidRenameChat.fire(session);
	}
}

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
