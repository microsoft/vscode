/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { AgentSession } from '../common/agentService.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../common/state/sessionProtocol.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { parseSessionDbUri } from './copilot/fileEditTracker.js';
import { SessionStateManager } from './sessionStateManager.js';
/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable {
    /** Exposes the state manager for co-hosting a WebSocket protocol server. */
    get stateManager() { return this._stateManager; }
    constructor(_logService, _fileService, _sessionDataService) {
        super();
        this._logService = _logService;
        this._fileService = _fileService;
        this._sessionDataService = _sessionDataService;
        /** Protocol: fires when state is mutated by an action. */
        this._onDidAction = this._register(new Emitter());
        this.onDidAction = this._onDidAction.event;
        /** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
        this._onDidNotification = this._register(new Emitter());
        this.onDidNotification = this._onDidNotification.event;
        /** Registered providers keyed by their {@link AgentProvider} id. */
        this._providers = new Map();
        /** Maps each active session URI (toString) to its owning provider. */
        this._sessionToProvider = new Map();
        /** Subscriptions to provider progress events; cleared when providers change. */
        this._providerSubscriptions = this._register(new DisposableStore());
        /** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
        this._agents = observableValue('agents', []);
        this._logService.info('AgentService initialized');
        this._stateManager = this._register(new SessionStateManager(_logService));
        this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
        this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
        this._sideEffects = this._register(new AgentSideEffects(this._stateManager, {
            getAgent: session => this._findProviderForSession(session),
            sessionDataService: this._sessionDataService,
            agents: this._agents,
        }, this._logService));
    }
    // ---- provider registration ----------------------------------------------
    registerProvider(provider) {
        if (this._providers.has(provider.id)) {
            throw new Error(`Agent provider already registered: ${provider.id}`);
        }
        this._logService.info(`Registering agent provider: ${provider.id}`);
        this._providers.set(provider.id, provider);
        this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
        if (!this._defaultProvider) {
            this._defaultProvider = provider.id;
        }
        // Update root state with current agents list
        this._updateAgents();
    }
    // ---- auth ---------------------------------------------------------------
    async listAgents() {
        return [...this._providers.values()].map(p => p.getDescriptor());
    }
    async getResourceMetadata() {
        const resources = [...this._providers.values()].flatMap(p => p.getProtectedResources());
        return { resources };
    }
    getResourceMetadataSync() {
        const resources = [...this._providers.values()].flatMap(p => p.getProtectedResources());
        return { resources };
    }
    async authenticate(params) {
        this._logService.trace(`[AgentService] authenticate called: resource=${params.resource}`);
        for (const provider of this._providers.values()) {
            const resources = provider.getProtectedResources();
            if (resources.some(r => r.resource === params.resource)) {
                const accepted = await provider.authenticate(params.resource, params.token);
                if (accepted) {
                    return { authenticated: true };
                }
            }
        }
        return { authenticated: false };
    }
    // ---- session management -------------------------------------------------
    async listSessions() {
        this._logService.trace('[AgentService] listSessions called');
        const results = await Promise.all([...this._providers.values()].map(p => p.listSessions()));
        const flat = results.flat();
        // Overlay persisted custom titles from per-session databases.
        const result = await Promise.all(flat.map(async (s) => {
            try {
                const ref = await this._sessionDataService.tryOpenDatabase(s.session);
                if (!ref) {
                    return s;
                }
                try {
                    const customTitle = await ref.object.getMetadata('customTitle');
                    if (customTitle) {
                        return { ...s, summary: customTitle };
                    }
                }
                finally {
                    ref.dispose();
                }
            }
            catch {
                // ignore — title overlay is best-effort
            }
            return s;
        }));
        this._logService.trace(`[AgentService] listSessions returned ${result.length} sessions`);
        return result;
    }
    /**
     * Refreshes the model list from all providers and publishes the updated
     * agents (with their models) to root state via `root/agentsChanged`.
     */
    async refreshModels() {
        this._logService.trace('[AgentService] refreshModels called');
        this._updateAgents();
    }
    async createSession(config) {
        const providerId = config?.provider ?? this._defaultProvider;
        const provider = providerId ? this._providers.get(providerId) : undefined;
        if (!provider) {
            throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
        }
        // Ensure the command auto-approver is ready before any session events
        // can arrive. This makes shell command auto-approval fully synchronous.
        // Safe to run in parallel with createSession since no events flow until
        // sendMessage() is called.
        this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
        const [, session] = await Promise.all([
            this._sideEffects.initialize(),
            provider.createSession(config),
        ]);
        this._logService.trace(`[AgentService] createSession: initialization complete`);
        this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model ?? '(default)'}`);
        this._sessionToProvider.set(session.toString(), provider.id);
        this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);
        // When forking, populate the new session's protocol state with
        // the source session's turns so the client sees the forked history.
        if (config?.fork) {
            const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
            let sourceTurns = [];
            if (sourceState) {
                sourceTurns = sourceState.turns.slice(0, config.fork.turnIndex + 1)
                    .map(t => ({ ...t, id: generateUuid() }));
            }
            const summary = {
                resource: session.toString(),
                provider: provider.id,
                title: sourceState?.summary.title ?? 'Forked Session',
                status: "idle" /* SessionStatus.Idle */,
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                workingDirectory: config.workingDirectory?.toString(),
            };
            const state = this._stateManager.createSession(summary);
            state.turns = sourceTurns;
        }
        else {
            // Create empty state for new sessions
            const summary = {
                resource: session.toString(),
                provider: provider.id,
                title: 'New Session',
                status: "idle" /* SessionStatus.Idle */,
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                workingDirectory: config?.workingDirectory?.toString(),
            };
            this._stateManager.createSession(summary);
        }
        this._stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: session.toString() });
        return session;
    }
    async disposeSession(session) {
        this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
        const provider = this._findProviderForSession(session);
        if (provider) {
            await provider.disposeSession(session);
            this._sessionToProvider.delete(session.toString());
        }
        this._stateManager.deleteSession(session.toString());
    }
    // ---- Protocol methods ---------------------------------------------------
    async subscribe(resource) {
        this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
        let snapshot = this._stateManager.getSnapshot(resource.toString());
        if (!snapshot) {
            await this.restoreSession(resource);
            snapshot = this._stateManager.getSnapshot(resource.toString());
        }
        if (!snapshot) {
            throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
        }
        return snapshot;
    }
    unsubscribe(resource) {
        this._logService.trace(`[AgentService] unsubscribe: ${resource.toString()}`);
        // Server-side tracking of per-client subscriptions will be added
        // in Phase 4 (multi-client). For now this is a no-op.
    }
    dispatchAction(action, clientId, clientSeq) {
        this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);
        const origin = { clientId, clientSeq };
        const state = this._stateManager.dispatchClientAction(action, origin);
        this._logService.trace(`[AgentService] resulting state:`, state);
        this._sideEffects.handleAction(action);
    }
    async resourceList(uri) {
        let stat;
        try {
            stat = await this._fileService.resolve(uri);
        }
        catch {
            throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
        }
        if (!stat.isDirectory) {
            throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
        }
        const entries = (stat.children ?? []).map(child => ({
            name: child.name,
            type: child.isDirectory ? 'directory' : 'file',
        }));
        return { entries };
    }
    async restoreSession(session) {
        const sessionStr = session.toString();
        // Already in state manager - nothing to do.
        if (this._stateManager.getSessionState(sessionStr)) {
            return;
        }
        const agent = this._findProviderForSession(session);
        if (!agent) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
        }
        // Verify the session actually exists on the backend to avoid
        // creating phantom sessions for made-up URIs.
        let allSessions;
        try {
            allSessions = await agent.listSessions();
        }
        catch (err) {
            if (err instanceof ProtocolError) {
                throw err;
            }
            const message = err instanceof Error ? err.message : String(err);
            throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
        }
        const meta = allSessions.find(s => s.session.toString() === sessionStr);
        if (!meta) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
        }
        let messages;
        try {
            messages = await agent.getSessionMessages(session);
        }
        catch (err) {
            if (err instanceof ProtocolError) {
                throw err;
            }
            const message = err instanceof Error ? err.message : String(err);
            throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
        }
        const turns = this._buildTurnsFromMessages(messages);
        // Check for a persisted custom title in the session database
        let title = meta.summary ?? 'Session';
        const ref = this._sessionDataService.tryOpenDatabase?.(session);
        if (ref) {
            try {
                const db = await ref;
                if (db) {
                    try {
                        const customTitle = await db.object.getMetadata('customTitle');
                        if (customTitle) {
                            title = customTitle;
                        }
                    }
                    finally {
                        db.dispose();
                    }
                }
            }
            catch {
                // Best-effort: fall back to agent-provided title
            }
        }
        const summary = {
            resource: sessionStr,
            provider: agent.id,
            title,
            status: "idle" /* SessionStatus.Idle */,
            createdAt: meta.startTime,
            modifiedAt: meta.modifiedTime,
            workingDirectory: meta.workingDirectory?.toString(),
        };
        this._stateManager.restoreSession(summary, turns);
        this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);
    }
    async resourceRead(uri) {
        // Handle session-db: URIs that reference file-edit content stored
        // in a per-session SQLite database.
        const dbFields = parseSessionDbUri(uri.toString());
        if (dbFields) {
            return this._fetchSessionDbContent(dbFields);
        }
        try {
            const content = await this._fileService.readFile(uri);
            return {
                data: content.value.toString(),
                encoding: "utf-8" /* ContentEncoding.Utf8 */,
                contentType: 'text/plain',
            };
        }
        catch (_e) {
            throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
        }
    }
    async resourceWrite(params) {
        const fileUri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
        let content;
        if (params.encoding === "base64" /* ContentEncoding.Base64 */) {
            content = decodeBase64(params.data);
        }
        else {
            content = VSBuffer.fromString(params.data);
        }
        try {
            if (params.createOnly) {
                await this._fileService.createFile(fileUri, content, { overwrite: false });
            }
            else {
                await this._fileService.writeFile(fileUri, content);
            }
            return {};
        }
        catch (e) {
            const code = toFileSystemProviderErrorCode(e);
            if (code === FileSystemProviderErrorCode.FileExists) {
                throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
            }
            if (code === FileSystemProviderErrorCode.NoPermissions) {
                throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
            }
            throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
        }
    }
    async resourceCopy(params) {
        const source = URI.parse(params.source);
        const destination = URI.parse(params.destination);
        try {
            await this._fileService.copy(source, destination, !params.failIfExists);
            return {};
        }
        catch (e) {
            const code = toFileSystemProviderErrorCode(e);
            if (code === FileSystemProviderErrorCode.FileExists) {
                throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
            }
            if (code === FileSystemProviderErrorCode.NoPermissions) {
                throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
            }
            throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
        }
    }
    async resourceDelete(params) {
        const fileUri = URI.parse(params.uri);
        try {
            await this._fileService.del(fileUri, { recursive: params.recursive });
            return {};
        }
        catch (e) {
            const code = toFileSystemProviderErrorCode(e);
            if (code === FileSystemProviderErrorCode.NoPermissions) {
                throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
            }
            throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
        }
    }
    async resourceMove(params) {
        const source = URI.parse(params.source);
        const destination = URI.parse(params.destination);
        try {
            await this._fileService.move(source, destination, !params.failIfExists);
            return {};
        }
        catch (e) {
            const code = toFileSystemProviderErrorCode(e);
            if (code === FileSystemProviderErrorCode.FileExists) {
                throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
            }
            if (code === FileSystemProviderErrorCode.NoPermissions) {
                throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
            }
            throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
        }
    }
    async shutdown() {
        this._logService.info('AgentService: shutting down all providers...');
        const promises = [];
        for (const provider of this._providers.values()) {
            promises.push(provider.shutdown());
        }
        await Promise.all(promises);
        this._sessionToProvider.clear();
    }
    // ---- helpers ------------------------------------------------------------
    /**
     * Reconstructs completed `ITurn[]` from a sequence of agent session
     * messages. Each user-message starts a new turn; the assistant message
     * closes it.
     */
    _buildTurnsFromMessages(messages) {
        const turns = [];
        let currentTurn;
        const finalizeTurn = (turn, state) => {
            turns.push({
                id: turn.id,
                userMessage: turn.userMessage,
                responseParts: turn.responseParts,
                usage: undefined,
                state,
            });
        };
        const startTurn = (id, text) => ({
            id,
            userMessage: { text },
            responseParts: [],
            pendingTools: new Map(),
        });
        for (const msg of messages) {
            if (msg.type === 'message' && msg.role === 'user') {
                if (currentTurn) {
                    finalizeTurn(currentTurn, "cancelled" /* TurnState.Cancelled */);
                }
                currentTurn = startTurn(msg.messageId, msg.content);
            }
            else if (msg.type === 'message' && msg.role === 'assistant') {
                if (!currentTurn) {
                    currentTurn = startTurn(msg.messageId, '');
                }
                if (msg.content) {
                    currentTurn.responseParts.push({
                        kind: "markdown" /* ResponsePartKind.Markdown */,
                        id: generateUuid(),
                        content: msg.content,
                    });
                }
                if (!msg.toolRequests || msg.toolRequests.length === 0) {
                    finalizeTurn(currentTurn, "complete" /* TurnState.Complete */);
                    currentTurn = undefined;
                }
            }
            else if (msg.type === 'tool_start') {
                currentTurn?.pendingTools.set(msg.toolCallId, msg);
            }
            else if (msg.type === 'tool_complete') {
                if (currentTurn) {
                    const start = currentTurn.pendingTools.get(msg.toolCallId);
                    currentTurn.pendingTools.delete(msg.toolCallId);
                    const tc = {
                        status: "completed" /* ToolCallStatus.Completed */,
                        toolCallId: msg.toolCallId,
                        toolName: start?.toolName ?? 'unknown',
                        displayName: start?.displayName ?? 'Unknown Tool',
                        invocationMessage: start?.invocationMessage ?? '',
                        toolInput: start?.toolInput,
                        success: msg.result.success,
                        pastTenseMessage: msg.result.pastTenseMessage,
                        content: msg.result.content,
                        error: msg.result.error,
                        confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                        _meta: start ? {
                            toolKind: start.toolKind,
                            language: start.language,
                        } : undefined,
                    };
                    currentTurn.responseParts.push({
                        kind: "toolCall" /* ResponsePartKind.ToolCall */,
                        toolCall: tc,
                    });
                }
            }
        }
        if (currentTurn) {
            finalizeTurn(currentTurn, "cancelled" /* TurnState.Cancelled */);
        }
        return turns;
    }
    async _fetchSessionDbContent(fields) {
        const sessionUri = URI.parse(fields.sessionUri);
        const ref = this._sessionDataService.openDatabase(sessionUri);
        try {
            const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
            if (!content) {
                throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
            }
            const bytes = fields.part === 'before' ? content.beforeContent : content.afterContent;
            if (!bytes) {
                throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
            }
            return {
                data: new TextDecoder().decode(bytes),
                encoding: "utf-8" /* ContentEncoding.Utf8 */,
                contentType: 'text/plain',
            };
        }
        finally {
            ref.dispose();
        }
    }
    _findProviderForSession(session) {
        const key = typeof session === 'string' ? session : session.toString();
        const providerId = this._sessionToProvider.get(key);
        if (providerId) {
            return this._providers.get(providerId);
        }
        const schemeProvider = AgentSession.provider(session);
        if (schemeProvider) {
            return this._providers.get(schemeProvider);
        }
        // Fallback: try the default provider (handles resumed sessions not yet tracked)
        if (this._defaultProvider) {
            return this._providers.get(this._defaultProvider);
        }
        return undefined;
    }
    /**
     * Sets the agents observable to trigger model re-fetch and
     * `root/agentsChanged` via the autorun in {@link AgentSideEffects}.
     */
    _updateAgents() {
        this._agents.set([...this._providers.values()], undefined);
    }
    dispose() {
        for (const provider of this._providers.values()) {
            provider.dispose();
        }
        this._providers.clear();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvYWdlbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUQsT0FBTyxFQUFFLDJCQUEyQixFQUFnQiw2QkFBNkIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXZILE9BQU8sRUFBaUIsWUFBWSxFQUE2TixNQUFNLDJCQUEyQixDQUFDO0FBR25TLE9BQU8sRUFBRSxhQUFhLEVBQUUscUJBQXFCLEVBQW1CLHVCQUF1QixFQUFFLGFBQWEsRUFBdVQsTUFBTSxvQ0FBb0MsQ0FBQztBQUV4YyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQXVCLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFL0Q7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyxZQUFhLFNBQVEsVUFBVTtJQWMzQyw0RUFBNEU7SUFDNUUsSUFBSSxZQUFZLEtBQTBCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFldEUsWUFDa0IsV0FBd0IsRUFDeEIsWUFBMEIsRUFDMUIsbUJBQXdDO1FBRXpELEtBQUssRUFBRSxDQUFDO1FBSlMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFDeEIsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDMUIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQTlCMUQsMERBQTBEO1FBQ3pDLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBbUIsQ0FBQyxDQUFDO1FBQ3RFLGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFFL0MsMEVBQTBFO1FBQ3pELHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWlCLENBQUMsQ0FBQztRQUMxRSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBUTNELG9FQUFvRTtRQUNuRCxlQUFVLEdBQUcsSUFBSSxHQUFHLEVBQXlCLENBQUM7UUFDL0Qsc0VBQXNFO1FBQ3JELHVCQUFrQixHQUFHLElBQUksR0FBRyxFQUF5QixDQUFDO1FBQ3ZFLGdGQUFnRjtRQUMvRCwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUdoRiw4RkFBOEY7UUFDN0UsWUFBTyxHQUFHLGVBQWUsQ0FBb0IsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBVTNFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUMzRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDO1lBQzFELGtCQUFrQixFQUFFLElBQUksQ0FBQyxtQkFBbUI7WUFDNUMsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPO1NBQ3BCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVELDRFQUE0RTtJQUU1RSxnQkFBZ0IsQ0FBQyxRQUFnQjtRQUNoQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywrQkFBK0IsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDckMsQ0FBQztRQUVELDZDQUE2QztRQUM3QyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVELDRFQUE0RTtJQUU1RSxLQUFLLENBQUMsVUFBVTtRQUNmLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQjtRQUN4QixNQUFNLFNBQVMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDeEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRCx1QkFBdUI7UUFDdEIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBQ3hGLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUEyQjtRQUM3QyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDMUYsS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDakQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDbkQsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDekQsTUFBTSxRQUFRLEdBQUcsTUFBTSxRQUFRLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1RSxJQUFJLFFBQVEsRUFBRSxDQUFDO29CQUNkLE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQ2hDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVELDRFQUE0RTtJQUU1RSxLQUFLLENBQUMsWUFBWTtRQUNqQixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQzdELE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDaEMsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FDeEQsQ0FBQztRQUNGLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU1Qiw4REFBOEQ7UUFDOUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLENBQUMsRUFBQyxFQUFFO1lBQ25ELElBQUksQ0FBQztnQkFDSixNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN0RSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQ1YsT0FBTyxDQUFDLENBQUM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLENBQUM7b0JBQ0osTUFBTSxXQUFXLEdBQUcsTUFBTSxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxXQUFXLEVBQUUsQ0FBQzt3QkFDakIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsQ0FBQztvQkFDdkMsQ0FBQztnQkFDRixDQUFDO3dCQUFTLENBQUM7b0JBQ1YsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNmLENBQUM7WUFDRixDQUFDO1lBQUMsTUFBTSxDQUFDO2dCQUNSLHdDQUF3QztZQUN6QyxDQUFDO1lBQ0QsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsd0NBQXdDLE1BQU0sQ0FBQyxNQUFNLFdBQVcsQ0FBQyxDQUFDO1FBQ3pGLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxhQUFhO1FBQ2xCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQWtDO1FBQ3JELE1BQU0sVUFBVSxHQUFHLE1BQU0sRUFBRSxRQUFRLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBQzdELE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUMxRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxVQUFVLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNoRixDQUFDO1FBRUQsc0VBQXNFO1FBQ3RFLHdFQUF3RTtRQUN4RSx3RUFBd0U7UUFDeEUsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGtGQUFrRixDQUFDLENBQUM7UUFDM0csTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFO1lBQzlCLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO1NBQzlCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7UUFFaEYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsMENBQTBDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsTUFBTSxFQUFFLEtBQUssSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3RILElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV2RiwrREFBK0Q7UUFDL0Qsb0VBQW9FO1FBQ3BFLElBQUksTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdkYsSUFBSSxXQUFXLEdBQVksRUFBRSxDQUFDO1lBQzlCLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLFdBQVcsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO3FCQUNqRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVDLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBb0I7Z0JBQ2hDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFO2dCQUM1QixRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUU7Z0JBQ3JCLEtBQUssRUFBRSxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssSUFBSSxnQkFBZ0I7Z0JBQ3JELE1BQU0saUNBQW9CO2dCQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDckIsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RCLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEVBQUU7YUFDckQsQ0FBQztZQUNGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hELEtBQUssQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ1Asc0NBQXNDO1lBQ3RDLE1BQU0sT0FBTyxHQUFvQjtnQkFDaEMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUU7Z0JBQzVCLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRTtnQkFDckIsS0FBSyxFQUFFLGFBQWE7Z0JBQ3BCLE1BQU0saUNBQW9CO2dCQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDckIsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RCLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUU7YUFDdEQsQ0FBQztZQUNGLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsSUFBSSwrQ0FBeUIsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV4RyxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFZO1FBQ2hDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxRQUFRLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCw0RUFBNEU7SUFFNUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFhO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDZCQUE2QixRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNwQyxRQUFRLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxXQUFXLENBQUMsUUFBYTtRQUN4QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM3RSxpRUFBaUU7UUFDakUsc0RBQXNEO0lBQ3ZELENBQUM7SUFFRCxjQUFjLENBQUMsTUFBc0IsRUFBRSxRQUFnQixFQUFFLFNBQWlCO1FBQ3pFLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxNQUFNLENBQUMsSUFBSSxjQUFjLFFBQVEsZUFBZSxTQUFTLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVuSSxNQUFNLE1BQU0sR0FBRyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxHQUFRO1FBQzFCLElBQUksSUFBSSxDQUFDO1FBQ1QsSUFBSSxDQUFDO1lBQ0osSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSx3QkFBd0IsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN2QixNQUFNLElBQUksYUFBYSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkYsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFzQixDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0RSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDaEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsTUFBTTtTQUM5QyxDQUFDLENBQUMsQ0FBQztRQUNKLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFZO1FBQ2hDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUV0Qyw0Q0FBNEM7UUFDNUMsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ3BELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxhQUFhLENBQUMscUJBQXFCLEVBQUUseUJBQXlCLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDdkYsQ0FBQztRQUVELDZEQUE2RDtRQUM3RCw4Q0FBOEM7UUFDOUMsSUFBSSxXQUFXLENBQUM7UUFDaEIsSUFBSSxDQUFDO1lBQ0osV0FBVyxHQUFHLE1BQU0sS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxHQUFHLFlBQVksYUFBYSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sR0FBRyxDQUFDO1lBQ1gsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLEdBQUcsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqRSxNQUFNLElBQUksYUFBYSxDQUFDLHVCQUF1QixFQUFFLCtCQUErQixVQUFVLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQztRQUMzRyxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxpQ0FBaUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMvRixDQUFDO1FBRUQsSUFBSSxRQUFRLENBQUM7UUFDYixJQUFJLENBQUM7WUFDSixRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxJQUFJLEdBQUcsWUFBWSxhQUFhLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxHQUFHLENBQUM7WUFDWCxDQUFDO1lBQ0QsTUFBTSxPQUFPLEdBQUcsR0FBRyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sSUFBSSxhQUFhLENBQUMsdUJBQXVCLEVBQUUsNkJBQTZCLFVBQVUsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFckQsNkRBQTZEO1FBQzdELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksU0FBUyxDQUFDO1FBQ3RDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRSxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ1QsSUFBSSxDQUFDO2dCQUNKLE1BQU0sRUFBRSxHQUFHLE1BQU0sR0FBRyxDQUFDO2dCQUNyQixJQUFJLEVBQUUsRUFBRSxDQUFDO29CQUNSLElBQUksQ0FBQzt3QkFDSixNQUFNLFdBQVcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO3dCQUMvRCxJQUFJLFdBQVcsRUFBRSxDQUFDOzRCQUNqQixLQUFLLEdBQUcsV0FBVyxDQUFDO3dCQUNyQixDQUFDO29CQUNGLENBQUM7NEJBQVMsQ0FBQzt3QkFDVixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2QsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixpREFBaUQ7WUFDbEQsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBb0I7WUFDaEMsUUFBUSxFQUFFLFVBQVU7WUFDcEIsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ2xCLEtBQUs7WUFDTCxNQUFNLGlDQUFvQjtZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDekIsVUFBVSxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQzdCLGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEVBQUU7U0FDbkQsQ0FBQztRQUVGLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsVUFBVSxTQUFTLEtBQUssQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQVE7UUFDMUIsa0VBQWtFO1FBQ2xFLG9DQUFvQztRQUNwQyxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNuRCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEQsT0FBTztnQkFDTixJQUFJLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUU7Z0JBQzlCLFFBQVEsb0NBQXNCO2dCQUM5QixXQUFXLEVBQUUsWUFBWTthQUN6QixDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksYUFBYSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsc0JBQXNCLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekYsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQTRCO1FBQy9DLE1BQU0sT0FBTyxHQUFHLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoRyxJQUFJLE9BQWlCLENBQUM7UUFDdEIsSUFBSSxNQUFNLENBQUMsUUFBUSwwQ0FBMkIsRUFBRSxDQUFDO1lBQ2hELE9BQU8sR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxJQUFJLENBQUM7WUFDSixJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDNUUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3JELENBQUM7WUFDRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLEdBQUcsNkJBQTZCLENBQUMsQ0FBVSxDQUFDLENBQUM7WUFDdkQsSUFBSSxJQUFJLEtBQUssMkJBQTJCLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3JELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSx3QkFBd0IsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNwRyxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssMkJBQTJCLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3hELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLHNCQUFzQixPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3JHLENBQUM7WUFDRCxNQUFNLElBQUksYUFBYSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUseUJBQXlCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEcsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFDLE1BQTJCO1FBQzdDLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN4RSxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLEdBQUcsNkJBQTZCLENBQUMsQ0FBVSxDQUFDLENBQUM7WUFDdkQsSUFBSSxJQUFJLEtBQUssMkJBQTJCLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3JELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSwrQkFBK0IsV0FBVyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMvRyxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssMkJBQTJCLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3hELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLHNCQUFzQixNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BHLENBQUM7WUFDRCxNQUFNLElBQUksYUFBYSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUscUJBQXFCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQTZCO1FBQ2pELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksR0FBRyw2QkFBNkIsQ0FBQyxDQUFVLENBQUMsQ0FBQztZQUN2RCxJQUFJLElBQUksS0FBSywyQkFBMkIsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEQsTUFBTSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsc0JBQXNCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDckcsQ0FBQztZQUNELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSx1QkFBdUIsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5RixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBMkI7UUFDN0MsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEMsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDO1lBQ0osTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3hFLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksR0FBRyw2QkFBNkIsQ0FBQyxDQUFVLENBQUMsQ0FBQztZQUN2RCxJQUFJLElBQUksS0FBSywyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDckQsTUFBTSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLCtCQUErQixXQUFXLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQy9HLENBQUM7WUFDRCxJQUFJLElBQUksS0FBSywyQkFBMkIsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEQsTUFBTSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsc0JBQXNCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDcEcsQ0FBQztZQUNELE1BQU0sSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxxQkFBcUIsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRO1FBQ2IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsOENBQThDLENBQUMsQ0FBQztRQUN0RSxNQUFNLFFBQVEsR0FBb0IsRUFBRSxDQUFDO1FBQ3JDLEtBQUssTUFBTSxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ2pELFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUNELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVELDRFQUE0RTtJQUU1RTs7OztPQUlHO0lBQ0ssdUJBQXVCLENBQzlCLFFBQTBGO1FBRTFGLE1BQU0sS0FBSyxHQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLFdBS1MsQ0FBQztRQUVkLE1BQU0sWUFBWSxHQUFHLENBQUMsSUFBcUMsRUFBRSxLQUFnQixFQUFRLEVBQUU7WUFDdEYsS0FBSyxDQUFDLElBQUksQ0FBQztnQkFDVixFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO2dCQUM3QixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7Z0JBQ2pDLEtBQUssRUFBRSxTQUFTO2dCQUNoQixLQUFLO2FBQ0wsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBRUYsTUFBTSxTQUFTLEdBQUcsQ0FBQyxFQUFVLEVBQUUsSUFBWSxFQUFtQyxFQUFFLENBQUMsQ0FBQztZQUNqRixFQUFFO1lBQ0YsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFO1lBQ3JCLGFBQWEsRUFBRSxFQUFFO1lBQ2pCLFlBQVksRUFBRSxJQUFJLEdBQUcsRUFBRTtTQUN2QixDQUFDLENBQUM7UUFFSCxLQUFLLE1BQU0sR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQzVCLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDbkQsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsWUFBWSxDQUFDLFdBQVcsd0NBQXNCLENBQUM7Z0JBQ2hELENBQUM7Z0JBQ0QsV0FBVyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyRCxDQUFDO2lCQUFNLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQztnQkFDL0QsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUNsQixXQUFXLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLENBQUM7Z0JBRUQsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2pCLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO3dCQUM5QixJQUFJLDRDQUEyQjt3QkFDL0IsRUFBRSxFQUFFLFlBQVksRUFBRTt3QkFDbEIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxPQUFPO3FCQUNwQixDQUFDLENBQUM7Z0JBQ0osQ0FBQztnQkFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDeEQsWUFBWSxDQUFDLFdBQVcsc0NBQXFCLENBQUM7b0JBQzlDLFdBQVcsR0FBRyxTQUFTLENBQUM7Z0JBQ3pCLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDdEMsV0FBVyxFQUFFLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUMzRCxXQUFXLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBRWhELE1BQU0sRUFBRSxHQUE0Qjt3QkFDbkMsTUFBTSw0Q0FBMEI7d0JBQ2hDLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVTt3QkFDMUIsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLElBQUksU0FBUzt3QkFDdEMsV0FBVyxFQUFFLEtBQUssRUFBRSxXQUFXLElBQUksY0FBYzt3QkFDakQsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixJQUFJLEVBQUU7d0JBQ2pELFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUzt3QkFDM0IsT0FBTyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTzt3QkFDM0IsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0I7d0JBQzdDLE9BQU8sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU87d0JBQzNCLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7d0JBQ3ZCLFNBQVMseURBQXNDO3dCQUMvQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDZCxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7NEJBQ3hCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTt5QkFDeEIsQ0FBQyxDQUFDLENBQUMsU0FBUztxQkFDYixDQUFDO29CQUNGLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO3dCQUM5QixJQUFJLDRDQUEyQjt3QkFDL0IsUUFBUSxFQUFFLEVBQUU7cUJBQ1osQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksV0FBVyxFQUFFLENBQUM7WUFDakIsWUFBWSxDQUFDLFdBQVcsd0NBQXNCLENBQUM7UUFDaEQsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxNQUEyQjtRQUMvRCxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNoRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQztZQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sR0FBRyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLG1DQUFtQyxNQUFNLENBQUMsVUFBVSxjQUFjLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3RJLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztZQUN0RixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1osTUFBTSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLE1BQU0sTUFBTSxDQUFDLElBQUksNEJBQTRCLE1BQU0sQ0FBQyxVQUFVLGNBQWMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDaEosQ0FBQztZQUNELE9BQU87Z0JBQ04sSUFBSSxFQUFFLElBQUksV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztnQkFDckMsUUFBUSxvQ0FBc0I7Z0JBQzlCLFdBQVcsRUFBRSxZQUFZO2FBQ3pCLENBQUM7UUFDSCxDQUFDO2dCQUFTLENBQUM7WUFDVixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZixDQUFDO0lBQ0YsQ0FBQztJQUVPLHVCQUF1QixDQUFDLE9BQXFCO1FBQ3BELE1BQU0sR0FBRyxHQUFHLE9BQU8sT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdkUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwRCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUNELE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEQsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxnRkFBZ0Y7UUFDaEYsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMzQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssYUFBYTtRQUNwQixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFUSxPQUFPO1FBQ2YsS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDakQsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLENBQUM7UUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3hCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBQ0QifQ==