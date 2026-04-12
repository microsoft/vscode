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
import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { CopilotCLISessionType } from '../../sessions/browser/sessionTypes.js';
/**
 * Adapts agent host session metadata into the {@link IChatData} facade.
 */
class RemoteSessionAdapter {
    constructor(metadata, providerId, resourceScheme, logicalSessionType, providerLabel, connectionAuthority) {
        this.icon = Codicon.remote;
        this.status = observableValue('status', 3 /* SessionStatus.Completed */);
        this.changes = observableValue('changes', []);
        this.modelId = observableValue('modelId', undefined);
        this.mode = observableValue('mode', undefined);
        this.loading = observableValue('loading', false);
        this.isArchived = observableValue('isArchived', false);
        this.isRead = observableValue('isRead', true);
        this.gitHubInfo = observableValue('gitHubInfo', undefined);
        const rawId = AgentSession.id(metadata.session);
        this.agentProvider = AgentSession.provider(metadata.session) ?? 'copilot';
        this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
        this.id = `${providerId}:${this.resource.toString()}`;
        this.providerId = providerId;
        this.sessionType = logicalSessionType;
        this.createdAt = new Date(metadata.startTime);
        this.title = observableValue('title', metadata.summary ?? `Session ${rawId.substring(0, 8)}`);
        this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
        this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
        this.description = observableValue('description', new MarkdownString().appendText(providerLabel));
        this.workspace = observableValue('workspace', metadata.workingDirectory
            ? RemoteAgentHostSessionsProvider.buildWorkspace(metadata.workingDirectory, providerLabel, connectionAuthority)
            : undefined);
    }
    update(metadata) {
        this.title.set(metadata.summary ?? this.title.get(), undefined);
        this.updatedAt.set(new Date(metadata.modifiedTime), undefined);
        this.lastTurnEnd.set(metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined, undefined);
    }
}
/**
 * Sessions provider for a remote agent host connection.
 * One instance is created per connection and handles all agents on it.
 *
 * Fully implements {@link ISessionsProvider}:
 * - Session listing via {@link IAgentConnection.listSessions} with incremental updates
 * - Session creation and initial request sending via {@link IChatService}
 * - Session actions (delete, rename, etc.) where supported by the protocol
 *
 * **URI/ID scheme:**
 * - **rawId** - unique session identifier (e.g. `abc123`), used as the cache key.
 * - **resource** - `{sessionType}:///{rawId}` (e.g. `remote-host__4321-copilot:///abc123`).
 *   The scheme routes the chat service to the correct {@link AgentHostSessionHandler}.
 * - **sessionId** - `{providerId}:{resource}` - the provider-scoped ID used by
 *   {@link ISessionsProvider} methods. The rawId can be extracted from the resource path.
 * - Protocol operations (e.g. `disposeSession`) use the canonical agent session URI
 *   (`copilot:///abc123`), reconstructed via {@link AgentSession.uri}.
 */
let RemoteAgentHostSessionsProvider = class RemoteAgentHostSessionsProvider extends Disposable {
    get outputChannelId() { return this._outputChannelId; }
    constructor(config, _fileDialogService, _chatSessionsService, _chatService, _chatWidgetService, _languageModelsService, _notificationService) {
        super();
        this._fileDialogService = _fileDialogService;
        this._chatSessionsService = _chatSessionsService;
        this._chatService = _chatService;
        this._chatWidgetService = _chatWidgetService;
        this._languageModelsService = _languageModelsService;
        this._notificationService = _notificationService;
        this.icon = Codicon.remote;
        this.capabilities = { multipleChatsPerSession: false };
        this._connectionStatus = observableValue('connectionStatus', "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */);
        this.connectionStatus = this._connectionStatus;
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidReplaceSession = this._register(new Emitter());
        this.onDidReplaceSession = this._onDidReplaceSession.event;
        /** Cache of adapted sessions, keyed by raw session ID. */
        this._sessionCache = new Map();
        this._connectionListeners = this._register(new DisposableStore());
        this._onDidDisconnect = this._register(new Emitter());
        // -- Private: Session Cache --
        this._cacheInitialized = false;
        this._connectionAuthority = agentHostAuthority(config.address);
        const displayName = config.name || config.address;
        this.id = `agenthost-${this._connectionAuthority}`;
        this.label = displayName;
        this.remoteAddress = config.address;
        this.sessionTypes = [CopilotCLISessionType];
        this.browseActions = [{
                label: localize('folders', "Folders"),
                // label: localize('browseRemote', "Browse Folders ({0})...", displayName),
                icon: Codicon.remote,
                providerId: this.id,
                execute: () => this._browseForFolder(),
            }];
    }
    /**
     * Update the connection status for this provider.
     * Called by the contribution when connection state changes.
     */
    setConnectionStatus(status) {
        this._connectionStatus.set(status, undefined);
    }
    /**
     * Set the output channel ID for this provider's IPC log.
     */
    setOutputChannelId(id) {
        this._outputChannelId = id;
    }
    // -- Connection Management --
    /**
     * Wire a live connection to this provider, enabling session operations and folder browsing.
     */
    setConnection(connection, defaultDirectory) {
        if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
            return;
        }
        this._connectionListeners.clear();
        this._connection = connection;
        this._defaultDirectory = defaultDirectory;
        this._connectionListeners.add(connection.onDidNotification(n => {
            if (n.type === 'notify/sessionAdded') {
                this._handleSessionAdded(n.summary);
            }
            else if (n.type === 'notify/sessionRemoved') {
                this._handleSessionRemoved(n.session);
            }
        }));
        // Handle session state changes from the server
        this._connectionListeners.add(this._connection.onDidAction(e => {
            if (e.action.type === "session/turnComplete" /* ActionType.SessionTurnComplete */ && isSessionAction(e.action)) {
                const cts = new CancellationTokenSource();
                this._refreshSessions(cts.token).finally(() => cts.dispose());
            }
            else if (e.action.type === "session/titleChanged" /* ActionType.SessionTitleChanged */ && isSessionAction(e.action)) {
                this._handleTitleChanged(e.action.session, e.action.title);
            }
        }));
        // Always refresh sessions when a connection is (re)established
        const cts = new CancellationTokenSource();
        this._cacheInitialized = true;
        this._refreshSessions(cts.token).finally(() => cts.dispose());
    }
    /**
     * Clear the connection, e.g. when the remote host disconnects.
     * Retains the provider registration so it remains visible in the UI.
     */
    clearConnection() {
        this._connectionListeners.clear();
        this._onDidDisconnect.fire();
        this._connection = undefined;
        this._defaultDirectory = undefined;
        const removed = Array.from(this._sessionCache.values()).map(cached => this._chatToSession(cached));
        if (this._pendingSession) {
            removed.push(this._pendingSession);
            this._pendingSession = undefined;
        }
        this._sessionCache.clear();
        this._cacheInitialized = false;
        if (removed.length > 0) {
            this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
        }
    }
    // -- Workspaces --
    /**
     * Builds workspace metadata from a working directory path on the remote host.
     */
    static buildWorkspace(workingDirectory, providerLabel, _connectionAuthority) {
        const folderName = basename(workingDirectory) || workingDirectory.path;
        return {
            label: `${folderName} [${providerLabel}]`,
            icon: Codicon.remote,
            repositories: [{ uri: workingDirectory, workingDirectory: undefined, detail: providerLabel, baseBranchName: undefined, baseBranchProtected: undefined }],
            requiresWorkspaceTrust: false,
        };
    }
    _buildWorkspaceFromUri(uri) {
        const folderName = basename(uri) || uri.path;
        return {
            label: `${folderName} [${this.label}]`,
            icon: Codicon.remote,
            repositories: [{ uri, workingDirectory: undefined, detail: this.label, baseBranchName: undefined, baseBranchProtected: undefined }],
            requiresWorkspaceTrust: true,
        };
    }
    resolveWorkspace(repositoryUri) {
        return this._buildWorkspaceFromUri(repositoryUri);
    }
    // -- Sessions --
    getSessionTypes(_sessionId) {
        return [...this.sessionTypes];
    }
    getSessions() {
        this._ensureSessionCache();
        const sessions = Array.from(this._sessionCache.values()).map(cached => this._chatToSession(cached));
        if (this._pendingSession) {
            sessions.push(this._pendingSession);
        }
        return sessions;
    }
    createNewSession(workspace) {
        if (!this._connection) {
            throw new Error(localize('notConnectedSession', "Cannot create session: not connected to remote agent host '{0}'.", this.label));
        }
        const workspaceUri = workspace.repositories[0]?.uri;
        if (!workspaceUri) {
            throw new Error('Workspace has no repository URI');
        }
        // Reset draft state from any prior unsent session
        this._currentNewSession = undefined;
        this._selectedModelId = undefined;
        const resource = URI.from({ scheme: this._sessionTypeForProvider('copilot'), path: `/untitled-${generateUuid()}` });
        const status = observableValue(this, 0 /* SessionStatus.Untitled */);
        const session = {
            id: `${this.id}:${resource.toString()}`,
            resource,
            providerId: this.id,
            sessionType: this.sessionTypes[0].id,
            icon: Codicon.remote,
            createdAt: new Date(),
            workspace: observableValue(this, workspace),
            title: observableValue(this, ''),
            updatedAt: observableValue(this, new Date()),
            status,
            changes: observableValue(this, []),
            modelId: observableValue(this, undefined),
            mode: observableValue(this, undefined),
            loading: observableValue(this, false),
            isArchived: observableValue(this, false),
            isRead: observableValue(this, true),
            description: observableValue(this, undefined),
            lastTurnEnd: observableValue(this, undefined),
            gitHubInfo: observableValue(this, undefined),
        };
        this._currentNewSession = session;
        this._currentNewSessionStatus = status;
        return this._chatToSession(session);
    }
    setSessionType(_sessionId, _type) {
        throw new Error('Remote agent host sessions do not support changing session type');
    }
    setModel(sessionId, modelId) {
        if (this._currentNewSession?.id === sessionId) {
            this._selectedModelId = modelId;
        }
    }
    // -- Session Actions --
    async archiveSession(_sessionId) {
        // Agent host sessions don't support archiving
    }
    async unarchiveSession(_sessionId) {
        // Agent host sessions don't support unarchiving
    }
    async deleteSession(sessionId) {
        const rawId = this._rawIdFromChatId(sessionId);
        const cached = rawId ? this._sessionCache.get(rawId) : undefined;
        if (cached && rawId && this._connection) {
            await this._connection.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
            this._sessionCache.delete(rawId);
            this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(cached)], changed: [] });
        }
    }
    async renameChat(sessionId, _chatUri, _title) {
        const rawId = this._rawIdFromChatId(sessionId);
        const cached = rawId ? this._sessionCache.get(rawId) : undefined;
        if (cached && rawId && this._connection) {
            cached.title.set(_title, undefined);
            this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
            const action = { type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: AgentSession.uri(cached.agentProvider, rawId).toString(), title: _title };
            this._connection.dispatchAction(action, this._connection.clientId, this._connection.nextClientSeq());
        }
    }
    async deleteChat(_sessionId, _chatUri) {
        // Agent host sessions don't support deleting individual chats
    }
    setRead(sessionId, read) {
        const rawId = this._rawIdFromChatId(sessionId);
        const cached = rawId ? this._sessionCache.get(rawId) : undefined;
        if (cached) {
            cached.isRead.set(read, undefined);
        }
    }
    async sendAndCreateChat(chatId, options) {
        if (!this._connection) {
            throw new Error(localize('notConnectedSend', "Cannot send request: not connected to remote agent host '{0}'.", this.label));
        }
        const session = this._currentNewSession;
        if (!session || session.id !== chatId) {
            throw new Error(`Session '${chatId}' not found or not a new session`);
        }
        const { query, attachedContext } = options;
        const contribution = this._chatSessionsService.getChatSessionContribution(this._sessionTypeForProvider('copilot'));
        const sendOptions = {
            location: ChatAgentLocation.Chat,
            userSelectedModelId: this._selectedModelId,
            modeInfo: {
                kind: ChatModeKind.Agent,
                isBuiltin: true,
                modeInstructions: undefined,
                modeId: 'agent',
                applyCodeBlockSuggestionId: undefined,
                permissionLevel: undefined,
            },
            agentIdSilent: contribution?.type,
            attachedContext,
        };
        // Open chat widget
        await this._chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
        const chatWidget = await this._chatWidgetService.openSession(session.resource, ChatViewPaneTarget);
        if (!chatWidget) {
            throw new Error('[RemoteAgentHost] Failed to open chat widget');
        }
        // Load session model and apply selected model
        const modelRef = await this._chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, CancellationToken.None);
        if (modelRef) {
            if (this._selectedModelId) {
                const languageModel = this._languageModelsService.lookupLanguageModel(this._selectedModelId);
                if (languageModel) {
                    modelRef.object.inputModel.setState({ selectedModel: { identifier: this._selectedModelId, metadata: languageModel } });
                }
            }
            modelRef.dispose();
        }
        // Capture existing session keys before sending so we can detect the new
        // backend session. Must be captured before sendRequest because the
        // backend session may be created during the send and arrive via
        // notification before sendRequest resolves.
        const existingKeys = new Set(this._sessionCache.keys());
        // Send request through the chat service, which delegates to the
        // AgentHostSessionHandler content provider for turn handling
        const result = await this._chatService.sendRequest(session.resource, query, sendOptions);
        if (result.kind === 'rejected') {
            throw new Error(`[RemoteAgentHost] sendRequest rejected: ${result.reason}`);
        }
        // Add the untitled session to the pending set so it stays visible in the
        // session list while the turn is in progress. It will be replaced
        // by the committed session once the backend session appears.
        this._currentNewSessionStatus?.set(1 /* SessionStatus.InProgress */, undefined);
        const newSession = this._chatToSession(session);
        this._pendingSession = newSession;
        this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });
        this._selectedModelId = undefined;
        this._currentNewSessionStatus = undefined;
        // Wait for the real backend session to appear (via server notification
        // after the handler creates it), then replace the temporary entry.
        try {
            const committedSession = await this._waitForNewSession(existingKeys);
            if (committedSession) {
                this._currentNewSession = undefined;
                this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
                return committedSession;
            }
        }
        catch {
            // Connection lost or timeout — clean up
        }
        finally {
            this._pendingSession = undefined;
        }
        // Fallback: keep the temp session visible
        this._currentNewSession = undefined;
        return newSession;
    }
    _ensureSessionCache() {
        if (this._cacheInitialized) {
            return;
        }
        this._cacheInitialized = true;
        const cts = new CancellationTokenSource();
        this._refreshSessions(cts.token).finally(() => cts.dispose());
    }
    async _refreshSessions(_token) {
        if (!this._connection) {
            return;
        }
        try {
            const sessions = await this._connection.listSessions();
            const currentKeys = new Set();
            const added = [];
            const changed = [];
            for (const meta of sessions) {
                const rawId = AgentSession.id(meta.session);
                const provider = AgentSession.provider(meta.session) ?? 'copilot';
                currentKeys.add(rawId);
                const existing = this._sessionCache.get(rawId);
                if (existing) {
                    existing.update(meta);
                    changed.push(this._chatToSession(existing));
                }
                else {
                    const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
                    this._sessionCache.set(rawId, cached);
                    added.push(this._chatToSession(cached));
                }
            }
            const removed = [];
            for (const [key, cached] of this._sessionCache) {
                if (!currentKeys.has(key)) {
                    this._sessionCache.delete(key);
                    removed.push(this._chatToSession(cached));
                }
            }
            if (added.length > 0 || removed.length > 0 || changed.length > 0) {
                this._onDidChangeSessions.fire({ added, removed, changed });
            }
        }
        catch {
            // Connection may not be ready yet
        }
    }
    /**
     * Wait for a new session to appear in the cache that wasn't present before.
     * Tries an immediate refresh, then listens for the session-added notification.
     * Returns `undefined` if the connection is lost or a timeout expires.
     */
    async _waitForNewSession(existingKeys) {
        // First, try an immediate refresh
        await this._refreshSessions(CancellationToken.None);
        for (const [key, cached] of this._sessionCache) {
            if (!existingKeys.has(key)) {
                return this._chatToSession(cached);
            }
        }
        // If not found yet, wait for the next onDidChangeSessions event,
        // bounded by a timeout and aborted on disconnect.
        const waitDisposables = new DisposableStore();
        try {
            const sessionPromise = new Promise((resolve) => {
                waitDisposables.add(this._onDidChangeSessions.event(e => {
                    const newSession = e.added.find(s => {
                        const rawId = s.resource.path.substring(1);
                        return !existingKeys.has(rawId);
                    });
                    if (newSession) {
                        resolve(newSession);
                    }
                }));
                waitDisposables.add(this._onDidDisconnect.event(() => resolve(undefined)));
            });
            return await raceTimeout(sessionPromise, 30_000);
        }
        finally {
            waitDisposables.dispose();
        }
    }
    _handleSessionAdded(summary) {
        const sessionUri = URI.parse(summary.resource);
        const rawId = AgentSession.id(sessionUri);
        if (this._sessionCache.has(rawId)) {
            return;
        }
        const provider = AgentSession.provider(sessionUri) ?? 'copilot';
        const workingDir = typeof summary.workingDirectory === 'string'
            ? toAgentHostUri(URI.parse(summary.workingDirectory), this._connectionAuthority)
            : undefined;
        const meta = {
            session: sessionUri,
            startTime: summary.createdAt,
            modifiedTime: summary.modifiedAt,
            summary: summary.title,
            workingDirectory: workingDir,
        };
        const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
        this._sessionCache.set(rawId, cached);
        this._onDidChangeSessions.fire({ added: [this._chatToSession(cached)], removed: [], changed: [] });
    }
    _handleSessionRemoved(session) {
        const rawId = AgentSession.id(session);
        const cached = this._sessionCache.get(rawId);
        if (cached) {
            this._sessionCache.delete(rawId);
            this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(cached)], changed: [] });
        }
    }
    _handleTitleChanged(session, title) {
        const rawId = AgentSession.id(session);
        const cached = this._sessionCache.get(rawId);
        if (cached) {
            cached.title.set(title, undefined);
            this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
        }
    }
    _rawIdFromChatId(chatId) {
        const prefix = `${this.id}:`;
        const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
        try {
            return URI.parse(resourceStr).path.substring(1) || undefined;
        }
        catch {
            return undefined;
        }
    }
    _sessionTypeForProvider(provider) {
        return `remote-${this._connectionAuthority}-${provider}`;
    }
    // -- Private: Browse --
    async _browseForFolder() {
        if (!this._connection) {
            this._notificationService.error(localize('notConnected', "Unable to connect to remote agent host '{0}'.", this.label));
            return undefined;
        }
        const defaultUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? '/');
        try {
            const selected = await this._fileDialogService.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: localize('selectRemoteFolder', "Select Folder on {0}", this.label),
                availableFileSystems: [AGENT_HOST_SCHEME],
                defaultUri,
            });
            if (selected?.[0]) {
                return this._buildWorkspaceFromUri(selected[0]);
            }
        }
        catch {
            // dialog was cancelled or failed
        }
        return undefined;
    }
    _chatToSession(chat) {
        const mainChat = {
            resource: chat.resource,
            createdAt: chat.createdAt,
            title: chat.title,
            updatedAt: chat.updatedAt,
            status: chat.status,
            changes: chat.changes,
            modelId: chat.modelId,
            mode: chat.mode,
            isArchived: chat.isArchived,
            isRead: chat.isRead,
            description: chat.description,
            lastTurnEnd: chat.lastTurnEnd,
        };
        const session = {
            sessionId: chat.id,
            resource: chat.resource,
            providerId: chat.providerId,
            sessionType: chat.sessionType,
            icon: chat.icon,
            createdAt: chat.createdAt,
            workspace: chat.workspace,
            title: chat.title,
            updatedAt: chat.updatedAt,
            status: chat.status,
            changes: chat.changes,
            modelId: chat.modelId,
            mode: chat.mode,
            loading: chat.loading,
            isArchived: chat.isArchived,
            isRead: chat.isRead,
            description: chat.description,
            lastTurnEnd: chat.lastTurnEnd,
            gitHubInfo: chat.gitHubInfo,
            chats: constObservable([mainChat]),
            mainChat,
        };
        return session;
    }
};
RemoteAgentHostSessionsProvider = __decorate([
    __param(1, IFileDialogService),
    __param(2, IChatSessionsService),
    __param(3, IChatService),
    __param(4, IChatWidgetService),
    __param(5, ILanguageModelsService),
    __param(6, INotificationService)
], RemoteAgentHostSessionsProvider);
export { RemoteAgentHostSessionsProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvcmVtb3RlQWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxlQUFlLEVBQW9DLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTNILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUgsT0FBTyxFQUFFLFlBQVksRUFBcUQsTUFB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