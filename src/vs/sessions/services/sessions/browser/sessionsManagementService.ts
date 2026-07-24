/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatWidgetHistoryService } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { buildHostLocalEventsPath, getCopilotCliSessionRawId } from '../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { getSessionReferenceResource } from './sessionReference.js';
import { ICreateNewChatInSessionOptions, ICreateNewSessionOptions, IProviderSessionType, ISendRequestOptions, ISendRequestSentEvent, ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { IDeleteChatOptions, ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, ISideChatSelection, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** Storage key for the last session type used to create a quick chat. */
const LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY = 'sessions.quickChat.lastUsedSessionType';

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
	private readonly _onDidRenameSession = this._register(new Emitter<ISession>());
	readonly onDidRenameSession: Event<ISession> = this._onDidRenameSession.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	private readonly _onDidDiscardNewSession = this._register(new Emitter<ISession>());
	readonly onDidDiscardNewSession: Event<ISession> = this._onDidDiscardNewSession.event;
	private readonly _onDidReplaceNewDraftSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceNewDraftSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceNewDraftSession.event;

	private _sessionTypes: readonly ISessionType[] = [];

	/** Tracks the in-progress new session (composed but not yet sent). */
	private readonly _newSession = observableValue<ISession | undefined>(this, undefined);
	readonly newSession: IObservable<ISession | undefined> = this._newSession;

	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());
	private readonly _disposeCts = this._register(new CancellationTokenSource());

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
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetHistoryService private readonly chatWidgetHistoryService: IChatWidgetHistoryService,
		@IStorageService private readonly storageService: IStorageService,
		@IPathService private readonly pathService: IPathService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();

		// Subscribe to provider changes for session type updates
		this._register(this.sessionsProvidersService.onDidChangeProviders(e => {
			this._onProvidersChanged(e);
			this._updateSessionTypes();
		}));
		this._subscribeToProviders(this.sessionsProvidersService.getProviders());
		this._sessionTypes = this._collectSessionTypes();

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
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (!provider.resolveWorkspace(folderUri)) {
				continue;
			}
			for (const sessionType of provider.getSessionTypes(folderUri)) {
				result.push({ providerId: provider.id, sessionType });
			}
		}
		return result;
	}

	getQuickChatSessionTypes(): IProviderSessionType[] {
		const result: IProviderSessionType[] = [];
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (!provider.supportsQuickChats) {
				continue;
			}
			for (const sessionType of provider.sessionTypes) {
				result.push({ providerId: provider.id, sessionType });
			}
		}
		return result;
	}

	isNewSessionTargetAvailable(folderUri: URI, options?: ICreateNewSessionOptions): boolean {
		return this._isTargetAvailable(this.getSessionTypesForFolder(folderUri), options);
	}

	isQuickChatTargetAvailable(options?: ICreateNewSessionOptions): boolean {
		return this._isTargetAvailable(this.getQuickChatSessionTypes(), options);
	}

	private _isTargetAvailable(sessionTypes: readonly IProviderSessionType[], options?: ICreateNewSessionOptions): boolean {
		return sessionTypes.some(candidate =>
			(!options?.providerId || candidate.providerId === options.providerId)
			&& (!options?.sessionTypeId || candidate.sessionType.id === options.sessionTypeId)
		);
	}

	resolveWorkspace(folderUri: URI, preferredProviderId?: string): { providerId: string; workspace: ISessionWorkspace } | undefined {
		if (preferredProviderId) {
			const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
			const workspace = preferred?.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: preferredProviderId, workspace };
			}
		}
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
		for (const provider of this.sessionsProvidersService.getProviders()) {
			for (const type of provider.sessionTypes) {
				if (!seen.has(type.id)) {
					seen.add(type.id);
					types.push(type);
				}
			}
		}
		return types;
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
		this._onDidDiscardNewSession.fire(current);
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
			if (options.sessionTypeId && !provider.getSessionTypes(folderUri).some(type => type.id === options.sessionTypeId)) {
				throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
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

		// Providers no longer dispose the previous new session implicitly, so
		// dispose the one this composer just replaced. Use its own provider
		// because switching workspace can switch providers. Done after a
		// successful create so a throw above leaves the previous one intact.
		if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
			this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
			// Terminal ownership must move before the replacement is published:
			// publishing eagerly ensures a terminal for the new draft.
			this._onDidReplaceNewDraftSession.fire({ from: previousNewSession, to: session });
		}
		this._newSession.set(session, undefined);
		return session;
	}

	/**
	 * Resolve the provider and session type to use for a quick chat, keyed on
	 * {@link ISessionsProvider.supportsQuickChats} instead of `resolveWorkspace`.
	 * Honors an explicit `options.sessionTypeId` (validated against the chosen
	 * provider) and otherwise defaults to the last-used type, then the first
	 * advertised one. Throws when no capable provider/type can be resolved.
	 */
	private _resolveProviderForQuickChat(options?: ICreateNewSessionOptions): { provider: ISessionsProvider; sessionTypeId: string } {
		const providers = this.sessionsProvidersService.getProviders();
		let provider: ISessionsProvider | undefined;

		if (options?.providerId) {
			provider = providers.find(p => p.id === options.providerId);
			if (!provider) {
				throw new Error(`Sessions provider '${options.providerId}' not found`);
			}
			if (!provider.supportsQuickChats) {
				throw new Error(`Sessions provider '${options.providerId}' does not support quick chats`);
			}
			if (options.sessionTypeId && !provider.sessionTypes.some(t => t.id === options.sessionTypeId)) {
				throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
			}
		} else {
			// Iterate providers (in `order`) and pick the first that supports
			// quick chats. When a specific session type was requested, also
			// require the provider to advertise it.
			for (const candidate of providers) {
				if (!candidate.supportsQuickChats) {
					continue;
				}
				if (options?.sessionTypeId && !candidate.sessionTypes.some(t => t.id === options.sessionTypeId)) {
					continue;
				}
				provider = candidate;
				break;
			}
			if (!provider) {
				throw new Error('No sessions provider supports quick chats');
			}
		}
		const sessionTypeId = options?.sessionTypeId ?? this._defaultQuickChatSessionType(provider);
		if (!sessionTypeId) {
			throw new Error(`No session types available for provider '${provider.id}'`);
		}
		return { provider, sessionTypeId };
	}

	/** Default quick-chat session type: the last-used one if still advertised, else the first. */
	private _defaultQuickChatSessionType(provider: ISessionsProvider): string | undefined {
		const lastUsed = this.storageService.get(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, StorageScope.PROFILE);
		if (lastUsed && provider.sessionTypes.some(t => t.id === lastUsed)) {
			return lastUsed;
		}
		return provider.sessionTypes[0]?.id;
	}

	createQuickChat(options?: ICreateNewSessionOptions): ISession {
		const { provider, sessionTypeId } = this._resolveProviderForQuickChat(options);

		const previousNewSession = this._newSession.get();
		const session = provider.createQuickChat(sessionTypeId);
		this._newSession.set(session, undefined);
		this.storageService.store(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, sessionTypeId, StorageScope.PROFILE, StorageTarget.USER);

		// Mirror `createNewSession`: dispose the previous new session this
		// composer just replaced, using its own provider, after a successful
		// create so a throw above leaves the previous one intact.
		if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
			this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
		}
		return session;
	}

	async createNewChatInSession(session: ISession, options?: ICreateNewChatInSessionOptions): Promise<IChat | undefined> {
		const provider = this._getProvider(session);
		if (!provider) {
			this.logService.warn(`[SessionsManagement] createNewChatInSession: provider '${session.providerId}' not found`);
			return undefined;
		}
		// `forceNew` skips reuse so callers can reset the composer right after
		// sending a chat (which may still transiently report `Untitled`).
		if (!options?.forceNew) {
			const existingUntitled = session.chats.get().find(c => c.status.get() === SessionStatus.Untitled);
			if (existingUntitled) {
				return existingUntitled;
			}
		}
		const created = await provider.createNewChat(session.sessionId);
		return created;
	}

	async forkChatInSession(session: ISession, sourceChat: URI, turnId: string): Promise<IChat> {
		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
		}
		if (!session.capabilities.get().supportsMultipleChats) {
			throw new Error(`Session '${session.sessionId}' does not support forking into a chat`);
		}
		return provider.forkChat(session.sessionId, sourceChat, turnId);
	}

	async createSideChatInSession(session: ISession, sourceChat: URI, turnId: string, selection?: ISideChatSelection): Promise<IChat> {
		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
		}
		if (!session.capabilities.get().supportsSideChat) {
			throw new Error(`Session '${session.sessionId}' does not support side chats`);
		}
		return provider.createSideChat(session.sessionId, sourceChat, turnId, selection);
	}

	/**
	 * For a `/troubleshoot` request, strip any `#session` marker attachments and
	 * append a `Session log:` line with the resolved host-local `events.jsonl`
	 * path(s) — the referenced sessions if present, otherwise the current one.
	 * Returns `options` unchanged when there is nothing to do.
	 */
	private _augmentOptionsForTroubleshoot(session: ISession, options: ISendRequestOptions): ISendRequestOptions {
		// Separate any `#session` reference attachments from the real context.
		const referencedResources: URI[] = [];
		let remainingAttachments: IChatRequestVariableEntry[] | undefined;
		if (options.attachedContext?.length) {
			const remaining: IChatRequestVariableEntry[] = [];
			for (const entry of options.attachedContext) {
				const referenced = getSessionReferenceResource(entry);
				if (referenced) {
					referencedResources.push(referenced);
				} else {
					remaining.push(entry);
				}
			}
			if (referencedResources.length) {
				remainingAttachments = remaining;
			}
		}

		const isTroubleshoot = /^\s*\/troubleshoot\b/.test(options.query);
		if (!isTroubleshoot && referencedResources.length === 0) {
			return options;
		}

		// Drop the reference attachments (only meaningful to us, not the model).
		let result = options;
		if (remainingAttachments) {
			result = { ...result, attachedContext: remainingAttachments.length ? remainingAttachments : undefined };
		}
		if (!isTroubleshoot) {
			return result;
		}

		// Resolve the target session(s): referenced ones if present, else the
		// current session.
		const targets = referencedResources.length
			? referencedResources
			: (getCopilotCliSessionRawId(session.resource) ? [session.resource] : []);
		const userHome = this.pathService.userHome({ preferLocal: true });
		const getConnection = (authority: string) => this.remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority);
		const eventPaths = Array.from(new Set(
			targets
				.map(resource => buildHostLocalEventsPath(resource, userHome, getConnection))
				.filter((path): path is string => !!path)
		));
		if (eventPaths.length === 0) {
			return result;
		}
		return { ...result, query: `${result.query}\n\nSession log: ${eventPaths.join(', ')}` };
	}

	async sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> {
		// The session is graduating into the list (being sent),
		// so the provider keeps owning it — just drop the pointer, do not delete.
		// Clearing the new session recomputes the isNewChatSession context key
		// via the view service's active-session autorun.
		this._newSession.set(undefined, undefined);

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		if (options.background) {
			// Fire-and-forget so the composer can reset immediately. On commit
			// failure the graduating draft is stranded, so dispose it through
			// its provider (no-op if already graduated/removed).
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

		const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
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
	 * current view is left untouched. Returns the committed session,
	 * or `undefined` if the service was disposed during the send.
	 *
	 * Unlike {@link sendNewChatRequest} with `background`, this does not go
	 * through the new-session composer: it creates a fresh session purely for
	 * this request and never sets it as pending/active. Intended for callers
	 * outside the composer that want to kick off a session programmatically.
	 *
	 * If the send or any configuration setter fails, the stranded draft is
	 * disposed through its provider and the error is rethrown.
	 */
	async createAndSendNewChatRequest(folderUri: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions, token: CancellationToken = CancellationToken.None): Promise<ISession | undefined> {
		const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, createOptions);
		const session = provider.createNewSession(folderUri, sessionTypeId);
		const supportsWorktreeConfiguration = provider.getSessionTypes(folderUri)
			.find(sessionType => sessionType.id === sessionTypeId)?.supportsWorktreeConfiguration === true;
		return this._configureAndSendNewSession(provider, session, options, createOptions, supportsWorktreeConfiguration, token, folderUri);
	}

	async createAndSendQuickChatRequest(options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions, token: CancellationToken = CancellationToken.None): Promise<ISession | undefined> {
		const { provider, sessionTypeId } = this._resolveProviderForQuickChat(createOptions);
		const session = provider.createQuickChat(sessionTypeId);
		return this._configureAndSendNewSession(provider, session, options, createOptions, false, token);
	}

	private async _configureAndSendNewSession(
		provider: ISessionsProvider,
		session: ISession,
		options: ISendRequestOptions,
		createOptions: ICreateNewSessionOptions | undefined,
		supportsWorktreeConfiguration: boolean,
		token: CancellationToken,
		folderUri?: URI,
	): Promise<ISession | undefined> {
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (createOptions?.modelId) {
				const resolvedModelId = await this._waitForRequestedModel(provider, session, createOptions.modelId, token, folderUri);
				provider.setModel(session.sessionId, resolvedModelId);
			}
			if (createOptions?.modeId) {
				provider.setMode?.(session.sessionId, createOptions.modeId);
			}
			if (createOptions?.permissionLevel) {
				provider.setPermissionLevel?.(session.sessionId, createOptions.permissionLevel);
			}
			if (supportsWorktreeConfiguration && (createOptions?.isolationMode || createOptions?.branch)) {
				if (createOptions.isolationMode && provider.setIsolationMode) {
					await raceCancellationError(provider.setIsolationMode(session.sessionId, createOptions.isolationMode), token);
				}
				if (createOptions.branch && provider.setBranch) {
					await raceCancellationError(provider.setBranch(session.sessionId, createOptions.branch), token);
				}
			}

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return await raceCancellationError(this._sendNewChatRequestInBackground(provider, session, options, token), token);
		} catch (e) {
			// The send never committed, so the draft is stranded. Dispose it
			// through its provider to release the eager backend session before
			// rethrowing. Safe no-op if the provider already removed it.
			provider.deleteNewSession(session.sessionId);
			throw e;
		}
	}

	private async _waitForRequestedModel(provider: ISessionsProvider, session: ISession, modelId: string, token: CancellationToken, folderUri?: URI): Promise<string> {
		const resolveCurrent = () => provider.getModelsSnapshot(session.sessionId, modelId).desiredModelResolution;
		const initial = resolveCurrent();
		if (initial.kind === 'available') {
			return initial.model.identifier;
		}
		if (initial.kind === 'notRequested') {
			return modelId;
		}
		if (initial.kind === 'unavailable') {
			throw new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		return new Promise<string>((resolve, reject) => {
			const disposables = new DisposableStore();
			let settled = false;
			const finish = (result: string | Error) => {
				if (settled) {
					return;
				}
				settled = true;
				disposables.dispose();
				if (result instanceof Error) {
					reject(result);
				} else {
					resolve(result);
				}
			};
			const check = () => {
				const resolution = resolveCurrent();
				if (resolution.kind === 'available') {
					finish(resolution.model.identifier);
				} else if (resolution.kind === 'notRequested') {
					finish(modelId);
				} else if (resolution.kind === 'unavailable') {
					finish(new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`));
				}
			};
			disposables.add(provider.onDidChangeModels(check));
			disposables.add(provider.onDidChangeSessionTypes(() => {
				const sessionTypes = folderUri ? provider.getSessionTypes(folderUri) : provider.sessionTypes;
				if (!sessionTypes.some(type => type.id === session.sessionType)) {
					finish(new Error(`Session type '${session.sessionType}' is no longer available for sessions provider '${provider.id}'`));
				}
			}));
			disposables.add(this.sessionsProvidersService.onDidChangeProviders(event => {
				if (event.removed.includes(provider)) {
					finish(new Error(`Sessions provider '${provider.id}' is no longer available`));
				}
			}));
			disposables.add(token.onCancellationRequested(() => finish(new CancellationError())));
			disposables.add(this._disposeCts.token.onCancellationRequested(() => finish(new CancellationError())));
			check();
		});
	}

	override dispose(): void {
		this._disposeCts.cancel();
		super.dispose();
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
	private async _sendNewChatRequestInBackground(provider: ISessionsProvider, session: ISession, options: ISendRequestOptions, token: CancellationToken = CancellationToken.None): Promise<ISession | undefined> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		// Notify listeners (e.g., telemetry) that a send is starting so they can
		// prewarm caches whose result is consumed when `onDidSendRequest` fires.
		this._onWillSendRequest.fire(session);
		const chatPromise = provider.createNewChat(session.sessionId, options.query);
		const chat = token === CancellationToken.None ? await chatPromise : await raceCancellationError(chatPromise, token);

		// Suppress the `chatService.onDidSubmitRequest` mirror for this send so
		// `_onDidSendRequest` is not fired twice for providers that dispatch
		// through `chatService.sendRequest` (see the mirror in the constructor).
		const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		const cancellationListener = token.onCancellationRequested(() => {
			void this.chatService.cancelCurrentRequestForSession(chat.resource, 'sessionsManagement').catch(error => {
				this.logService.warn('[SessionsManagement] Failed to cancel headless request:', error);
			});
		});
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
		} finally {
			cancellationListener.dispose();
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._store.isDisposed) {
			return undefined;
		}
		this._onDidStartSession.fire(updatedSession);
		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
		return updatedSession;
	}

	async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		// Sending into an existing session abandons any in-progress new session,
		// so dispose it to release its eager backend session.
		this.discardNewSession();

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		if (options.background) {
			// Fire-and-forget so the composer can reset immediately. Unlike the
			// foreground path this skips `_onWillSendRequest` so the view's
			// send-follow does not navigate the visible slot into the sent chat.
			this._sendRequestInBackground(provider, session, chat, options).catch(e => {
				this.logService.error('[SessionsManagement] Failed to send background request:', e);
			});
			return;
		}

		// Notify listeners that a send is starting. Listeners (e.g., telemetry)
		// can use this to prewarm caches whose result is consumed when
		// `onDidSendRequest` fires below. The view service observes the will/did
		// send pair to keep the sent chat active in the visible slot.
		this._onWillSendRequest.fire(session);

		const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (updatedSession.sessionId !== session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
		}

		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
	}

	/**
	 * Send a request for an existing chat in the background: commit the send via
	 * the provider and—on success—fire {@link _onDidSendRequest}. Unlike the
	 * foreground {@link sendRequest} path this does not fire
	 * {@link _onWillSendRequest}, so the view's send-follow never navigates the
	 * visible slot into the sent chat. Errors are propagated to the caller.
	 */
	private async _sendRequestInBackground(provider: ISessionsProvider, session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (this._store.isDisposed) {
			return;
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

	async setSessionReadState(session: ISession, isRead: boolean): Promise<void> {
		await this._getProvider(session)?.setSessionReadState(session.sessionId, isRead);
	}

	markRead(session: ISession): Promise<void> {
		return this.setSessionReadState(session, true);
	}

	markUnread(session: ISession): Promise<void> {
		return this.setSessionReadState(session, false);
	}

	async markAllRead(sessions: readonly ISession[]): Promise<void> {
		await Promise.all(sessions.map(session => this.setSessionReadState(session, true)));
	}

	async deleteSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.deleteSession(session.sessionId);
		this._onDidDeleteSession.fire(session);
	}

	async deleteSessions(sessions: readonly ISession[]): Promise<void> {
		const byProvider = new Map<ISessionsProvider, ISession[]>();
		for (const session of sessions) {
			const provider = this._getProvider(session);
			if (!provider) {
				continue;
			}
			const group = byProvider.get(provider);
			if (group) {
				group.push(session);
			} else {
				byProvider.set(provider, [session]);
			}
		}

		let firstError: unknown;
		for (const [provider, providerSessions] of byProvider) {
			try {
				await provider.deleteSessions(providerSessions.map(session => session.sessionId));
				for (const session of providerSessions) {
					this._onDidDeleteSession.fire(session);
				}
			} catch (error) {
				firstError ??= error;
			}
		}

		if (firstError !== undefined) {
			throw firstError;
		}
	}

	async deleteChat(session: ISession, chatUri: URI, options?: IDeleteChatOptions): Promise<void> {
		const deleted = await this._getProvider(session)?.deleteChat(session.sessionId, chatUri, options);
		if (deleted) {
			this._onDidDeleteChat.fire(session);
		}
	}

	async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
		this._onDidRenameChat.fire(session);
	}

	async renameSession(session: ISession, title: string): Promise<void> {
		await this._getProvider(session)?.renameSession(session.sessionId, title);
		this._onDidRenameSession.fire(session);
	}
}

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
