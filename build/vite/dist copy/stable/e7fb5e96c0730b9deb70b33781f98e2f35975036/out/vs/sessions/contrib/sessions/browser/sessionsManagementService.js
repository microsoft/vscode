/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { COPILOT_CLI_SESSION_TYPE } from './sessionTypes.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionBackgroundProviderContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
export const ActiveSessionSupportsMultiChatContext = new RawContextKey('activeSessionSupportsMultiChat', false, localize('activeSessionSupportsMultiChat', "Whether the active session's provider supports multiple chats per session"));
//#region Active Session Service
const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const ACTIVE_PROVIDER_KEY = 'sessions.activeProviderId';
export const ISessionsManagementService = createDecorator('sessionsManagementService');
let SessionsManagementService = class SessionsManagementService extends Disposable {
    constructor(storageService, logService, contextKeyService, sessionsProvidersService, uriIdentityService, chatWidgetService) {
        super();
        this.storageService = storageService;
        this.logService = logService;
        this.sessionsProvidersService = sessionsProvidersService;
        this.uriIdentityService = uriIdentityService;
        this.chatWidgetService = chatWidgetService;
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidChangeSessionTypes = this._register(new Emitter());
        this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
        this._sessionTypes = [];
        this._activeSession = observableValue(this, undefined);
        this.activeSession = this._activeSession;
        this._activeProviderId = observableValue(this, undefined);
        this.activeProviderId = this._activeProviderId;
        this._activeSessionDisposables = this._register(new DisposableStore());
        // Bind context key to active session state.
        // isNewSession is false when there are any established sessions in the model.
        this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
        this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
        this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
        this._isBackgroundProvider = IsActiveSessionBackgroundProviderContext.bindTo(contextKeyService);
        this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);
        // Load last selected session
        this.lastSelectedSession = this.loadLastSelectedSession();
        // Save on shutdown
        this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));
        // Forward session change events from providers and update active session
        this._register(this.sessionsProvidersService.onDidChangeSessions(e => this.onDidChangeSessionsFromSessionsProviders(e)));
        // When a provider replaces a temp session with a committed one, update the active session
        this._register(this.sessionsProvidersService.onDidReplaceSession(e => this.onDidReplaceSession(e.from, e.to)));
        // Restore or auto-select active provider
        this._initActiveProvider();
        this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
            this._initActiveProvider();
            this._updateSessionTypes();
        }));
    }
    _initActiveProvider() {
        const providers = this.sessionsProvidersService.getProviders();
        if (providers.length === 0) {
            return;
        }
        // If already set and still valid, keep it
        const current = this._activeProviderId.get();
        if (current && providers.some(p => p.id === current)) {
            return;
        }
        // Try to restore from storage
        const stored = this.storageService.get(ACTIVE_PROVIDER_KEY, 0 /* StorageScope.PROFILE */);
        if (stored && providers.some(p => p.id === stored)) {
            this._activeProviderId.set(stored, undefined);
            return;
        }
        // Auto-select the first (or only) provider
        this._activeProviderId.set(providers[0].id, undefined);
    }
    setActiveProvider(providerId) {
        this._activeProviderId.set(providerId, undefined);
        this.storageService.store(ACTIVE_PROVIDER_KEY, providerId, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    onDidReplaceSession(from, to) {
        if (this._activeSession.get()?.sessionId === from.sessionId) {
            this.setActiveSession(to);
            this._onDidChangeSessions.fire({
                added: [],
                removed: [from],
                changed: [to],
            });
        }
    }
    onDidChangeSessionsFromSessionsProviders(e) {
        this._onDidChangeSessions.fire(e);
        const currentActive = this._activeSession.get();
        if (!currentActive) {
            return;
        }
        if (e.removed.length) {
            if (e.removed.some(r => r.sessionId === currentActive.sessionId)) {
                this.openNewSessionView();
                return;
            }
        }
    }
    getSessions() {
        return this.sessionsProvidersService.getSessions();
    }
    getSession(resource) {
        return this.sessionsProvidersService.getSessions().find(s => this.uriIdentityService.extUri.isEqual(s.resource, resource));
    }
    getSessionTypes(session) {
        const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
        if (!provider) {
            return [];
        }
        return provider.getSessionTypes(session.sessionId);
    }
    getAllSessionTypes() {
        return [...this._sessionTypes];
    }
    _collectSessionTypes() {
        const types = [];
        const seen = new Set();
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
    _updateSessionTypes() {
        const newTypes = this._collectSessionTypes();
        const oldIds = new Set(this._sessionTypes.map(t => t.id));
        const newIds = new Set(newTypes.map(t => t.id));
        if (oldIds.size !== newIds.size || [...oldIds].some(id => !newIds.has(id))) {
            this._sessionTypes = newTypes;
            this._onDidChangeSessionTypes.fire();
        }
    }
    async openChat(session, chatUri) {
        this.logService.info(`[SessionsManagement] openChat: ${chatUri.toString()} provider=${session.providerId}`);
        this.isNewChatSessionContext.set(false);
        this.setActiveSession(session);
        // Update active chat
        if (this._activeChatObservable) {
            const activeSession = this._activeSession.get();
            if (activeSession) {
                const chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
                if (chat) {
                    this._activeChatObservable.set(chat, undefined);
                }
            }
        }
        await this.chatWidgetService.openSession(chatUri, ChatViewPaneTarget);
    }
    async openSession(sessionResource, options) {
        const sessionData = this.getSession(sessionResource);
        if (!sessionData) {
            this.logService.warn(`[SessionsManagement] openSession: session not found: ${sessionResource.toString()}`);
            throw new Error(`Session with resource ${sessionResource.toString()} not found`);
        }
        this.logService.info(`[SessionsManagement] openSession: ${sessionResource.toString()} provider=${sessionData.providerId}`);
        this.isNewChatSessionContext.set(false);
        this.setActiveSession(sessionData);
        this.setRead(sessionData, true); // mark as read when opened
        await this.chatWidgetService.openSession(sessionData.resource, ChatViewPaneTarget, { preserveFocus: options?.preserveFocus });
    }
    createNewSession(providerId, workspace) {
        if (!this.isNewChatSessionContext.get()) {
            this.isNewChatSessionContext.set(true);
        }
        const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
        if (!provider) {
            throw new Error(`Sessions provider '${providerId}' not found`);
        }
        const session = provider.createNewSession(workspace);
        this.setActiveSession(session);
        return session;
    }
    async setSessionType(session, type) {
        const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
        if (!provider) {
            throw new Error(`Sessions provider '${session.providerId}' not found`);
        }
        const updatedSession = provider.setSessionType(session.sessionId, type);
        const activeSession = this._activeSession.get();
        if (activeSession && activeSession.sessionId === updatedSession.sessionId) {
            this.setActiveSession(updatedSession);
        }
    }
    async sendAndCreateChat(session, options) {
        this.isNewChatSessionContext.set(false);
        const setActiveChatToLast = () => {
            const activeSession = this._activeSession.get();
            if (this._activeChatObservable && activeSession) {
                const chats = activeSession.chats.get();
                const lastChat = chats[chats.length - 1];
                if (lastChat) {
                    this._activeChatObservable.set(lastChat, undefined);
                }
            }
        };
        // Listen for chats changing during the send (subsequent chat appears in the group)
        const chatsListener = autorun(reader => {
            session.chats.read(reader);
            setActiveChatToLast();
        });
        try {
            const updatedSession = await this.sessionsProvidersService.sendAndCreateChat(session.sessionId, options);
            this.setActiveSession(updatedSession);
            setActiveChatToLast();
        }
        finally {
            chatsListener.dispose();
        }
    }
    openNewSessionView() {
        // No-op if the current session is already a new session
        if (this.isNewChatSessionContext.get()) {
            return;
        }
        this.setActiveSession(undefined);
        this.isNewChatSessionContext.set(true);
    }
    setActiveSession(session) {
        if (this._activeSession.get()?.sessionId === session?.sessionId) {
            return;
        }
        // Update context keys from session data
        this._activeSessionProviderId.set(session?.providerId ?? '');
        this._activeSessionType.set(session?.sessionType ?? '');
        this._isBackgroundProvider.set(session?.sessionType === COPILOT_CLI_SESSION_TYPE);
        const provider = session ? this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId) : undefined;
        this._supportsMultiChat.set(provider?.capabilities.multipleChatsPerSession ?? false);
        if (session && session.status.get() !== 0 /* SessionStatus.Untitled */) {
            this.lastSelectedSession = session.resource;
        }
        if (session) {
            this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
        }
        else {
            this.logService.trace('[ActiveSessionService] Active session cleared');
        }
        this._activeSessionDisposables.clear();
        if (session) {
            // Create the active chat observable, defaulting to the first chat
            const activeChatObs = observableValue(`activeChat-${session.sessionId}`, session.chats.get()[0]);
            this._activeChatObservable = activeChatObs;
            const activeSession = {
                ...session,
                activeChat: activeChatObs,
            };
            this._activeSession.set(activeSession, undefined);
            // Listen for the active session becoming archived
            if (!session.isArchived.get()) {
                this._activeSessionDisposables.add(autorun(reader => {
                    if (session.isArchived.read(reader)) {
                        this.openNewSessionView();
                    }
                }));
            }
        }
        else {
            this._activeChatObservable = undefined;
            this._activeSession.set(undefined, undefined);
        }
    }
    loadLastSelectedSession() {
        const cached = this.storageService.get(LAST_SELECTED_SESSION_KEY, 1 /* StorageScope.WORKSPACE */);
        if (!cached) {
            return undefined;
        }
        try {
            return URI.parse(cached);
        }
        catch {
            return undefined;
        }
    }
    saveLastSelectedSession() {
        if (this.lastSelectedSession) {
            this.storageService.store(LAST_SELECTED_SESSION_KEY, this.lastSelectedSession.toString(), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    // -- Session Actions --
    async archiveSession(session) {
        await this.sessionsProvidersService.archiveSession(session.sessionId);
    }
    async unarchiveSession(session) {
        await this.sessionsProvidersService.unarchiveSession(session.sessionId);
    }
    async deleteSession(session) {
        await this.sessionsProvidersService.deleteSession(session.sessionId);
    }
    async deleteChat(session, chatUri) {
        await this.sessionsProvidersService.deleteChat(session.sessionId, chatUri);
    }
    async renameChat(session, chatUri, title) {
        await this.sessionsProvidersService.renameChat(session.sessionId, chatUri, title);
    }
    setRead(session, read) {
        this.sessionsProvidersService.setRead(session.sessionId, read);
    }
};
SessionsManagementService = __decorate([
    __param(0, IStorageService),
    __param(1, ILogService),
    __param(2, IContextKeyService),
    __param(3, ISessionsProvidersService),
    __param(4, IUriIdentityService),
    __param(5, IChatWidgetService)
], SessionsManagementService);
export { SessionsManagementService };
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBb0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUcxRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsd0JBQXdCLEVBQUUsd0NBQXdDLEVBQUUsdUJB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