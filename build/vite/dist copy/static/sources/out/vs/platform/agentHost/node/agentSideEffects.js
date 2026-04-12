/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { AgentEventMapper } from './agentEventMapper.js';
import { CommandAutoApprover } from './commandAutoApprover.js';
/**
 * Shared implementation of agent side-effect handling.
 *
 * Routes client-dispatched actions to the correct agent backend,
 * restores sessions from previous lifetimes, handles filesystem
 * operations (browse/fetch/write), tracks pending permission requests,
 * and wires up agent progress events to the state manager.
 *
 * Session create/dispose/list and auth are handled by {@link AgentService}.
 */
export class AgentSideEffects extends Disposable {
    constructor(_stateManager, _options, _logService) {
        super();
        this._stateManager = _stateManager;
        this._options = _options;
        this._logService = _logService;
        /** Maps tool call IDs to the agent that owns them, for routing confirmations. */
        this._toolCallAgents = new Map();
        /** Per-agent event mapper instances (stateful for partId tracking). */
        this._eventMappers = new Map();
        this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
        // Whenever the agents observable changes, publish to root state.
        this._register(autorun(reader => {
            const agents = this._options.agents.read(reader);
            this._publishAgentInfos(agents);
        }));
    }
    /**
     * Fetches models from all agents and dispatches `root/agentsChanged`.
     */
    async _publishAgentInfos(agents) {
        const infos = await Promise.all(agents.map(async (a) => {
            const d = a.getDescriptor();
            let models;
            try {
                const rawModels = await a.listModels();
                models = rawModels.map(m => ({
                    id: m.id, provider: m.provider, name: m.name,
                    maxContextWindow: m.maxContextWindow, supportsVision: m.supportsVision,
                    policyState: m.policyState,
                }));
            }
            catch {
                models = [];
            }
            return { provider: d.provider, displayName: d.displayName, description: d.description, models };
        }));
        this._stateManager.dispatchServerAction({ type: "root/agentsChanged" /* ActionType.RootAgentsChanged */, agents: infos });
    }
    // ---- Edit auto-approve --------------------------------------------------
    /**
     * Default edit auto-approve patterns applied by the agent host.
     * Matches the VS Code `chat.tools.edits.autoApprove` setting defaults.
     */
    static { this._DEFAULT_EDIT_AUTO_APPROVE_PATTERNS = {
        '**/*': true,
        '**/.vscode/*.json': false,
        '**/.git/**': false,
        '**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
        '**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
        '**/*.lock': false,
        '**/*-lock.{yaml,json}': false,
    }; }
    /**
     * Returns whether a write to `filePath` should be auto-approved based on
     * the built-in default patterns.
     */
    _shouldAutoApproveEdit(filePath) {
        const patterns = AgentSideEffects._DEFAULT_EDIT_AUTO_APPROVE_PATTERNS;
        let approved = true;
        for (const [pattern, isApproved] of Object.entries(patterns)) {
            if (isApproved !== approved && globMatch(pattern, filePath)) {
                approved = isApproved;
            }
        }
        return approved;
    }
    /**
     * Initializes async resources (tree-sitter WASM) used for command
     * auto-approval. Await this before any session events can arrive to
     * guarantee that {@link _tryAutoApproveToolReady} is fully synchronous.
     */
    initialize() {
        return this._commandAutoApprover.initialize();
    }
    /**
     * Synchronously attempts to auto-approve a `tool_ready` event based on
     * permission kind. Returns `true` if auto-approved (event should not be
     * dispatched to the state manager), or `false` to proceed normally.
     */
    _tryAutoApproveToolReady(e, sessionKey, agent) {
        // Write auto-approval: only within the session's working directory,
        // then apply the default glob patterns for protected files.
        if (e.permissionKind === 'write' && e.permissionPath) {
            const sessionState = this._stateManager.getSessionState(sessionKey);
            const workDir = sessionState?.workingDirectory ?? sessionState?.summary.workingDirectory;
            const workingDirectory = workDir ? URI.parse(workDir) : undefined;
            if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(e.permissionPath)), workingDirectory)) {
                if (this._shouldAutoApproveEdit(e.permissionPath)) {
                    this._logService.trace(`[AgentSideEffects] Auto-approving write to ${e.permissionPath}`);
                    this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
                    agent.respondToPermissionRequest(e.toolCallId, true);
                    return true;
                }
            }
            return false;
        }
        // Shell auto-approval: parse the command via tree-sitter (synchronous
        // after initialize() has been awaited) and match against default rules.
        if (e.permissionKind === 'shell' && e.toolInput) {
            const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput);
            if (result === 'approved') {
                this._logService.trace(`[AgentSideEffects] Auto-approving shell command`);
                this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
                agent.respondToPermissionRequest(e.toolCallId, true);
                return true;
            }
            if (result === 'denied') {
                this._logService.trace(`[AgentSideEffects] Shell command denied by rule`);
            }
            return false;
        }
        return false;
    }
    // ---- Agent registration -------------------------------------------------
    /**
     * Registers a progress-event listener on the given agent so that
     * `IAgentProgressEvent`s are mapped to protocol actions and dispatched
     * through the state manager. Returns a disposable that removes the
     * listener.
     */
    registerProgressListener(agent) {
        const disposables = new DisposableStore();
        let mapper = this._eventMappers.get(agent.id);
        if (!mapper) {
            mapper = new AgentEventMapper();
            this._eventMappers.set(agent.id, mapper);
        }
        const agentMapper = mapper;
        disposables.add(agent.onDidSessionProgress(e => {
            // Track tool calls so handleAction can route confirmations
            if (e.type === 'tool_start') {
                this._toolCallAgents.set(`${e.session.toString()}:${e.toolCallId}`, agent.id);
            }
            const sessionKey = e.session.toString();
            const turnId = this._stateManager.getActiveTurnId(sessionKey);
            if (turnId) {
                // Auto-approve tool_ready events synchronously before dispatching.
                // Tree-sitter is pre-warmed via initialize(), so this is fully sync.
                if (e.type === 'tool_ready') {
                    if (this._tryAutoApproveToolReady(e, sessionKey, agent)) {
                        return;
                    }
                }
                this._dispatchProgressActions(agentMapper, e, sessionKey, turnId);
            }
            // After a turn completes (idle event), try to consume the next queued message
            if (e.type === 'idle') {
                this._tryConsumeNextQueuedMessage(sessionKey);
            }
            // Steering message was consumed by the agent — remove from protocol state
            if (e.type === 'steering_consumed') {
                this._stateManager.dispatchServerAction({
                    type: "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */,
                    session: sessionKey,
                    kind: "steering" /* PendingMessageKind.Steering */,
                    id: e.id,
                });
            }
        }));
        return disposables;
    }
    // ---- Side-effect handlers --------------------------------------------------
    _dispatchProgressActions(mapper, e, sessionKey, turnId) {
        const actions = mapper.mapProgressEventToActions(e, sessionKey, turnId);
        if (actions) {
            if (Array.isArray(actions)) {
                for (const action of actions) {
                    this._stateManager.dispatchServerAction(action);
                }
            }
            else {
                this._stateManager.dispatchServerAction(actions);
            }
        }
    }
    handleAction(action) {
        switch (action.type) {
            case "session/turnStarted" /* ActionType.SessionTurnStarted */: {
                // Reset the event mapper's part tracking for the new turn
                for (const mapper of this._eventMappers.values()) {
                    mapper.reset(action.session);
                }
                const agent = this._options.getAgent(action.session);
                if (!agent) {
                    this._stateManager.dispatchServerAction({
                        type: "session/error" /* ActionType.SessionError */,
                        session: action.session,
                        turnId: action.turnId,
                        error: { errorType: 'noAgent', message: 'No agent found for session' },
                    });
                    return;
                }
                const attachments = action.userMessage.attachments?.map((a) => ({
                    type: a.type,
                    path: a.path,
                    displayName: a.displayName,
                }));
                agent.sendMessage(URI.parse(action.session), action.userMessage.text, attachments).catch(err => {
                    this._logService.error('[AgentSideEffects] sendMessage failed', err);
                    this._stateManager.dispatchServerAction({
                        type: "session/error" /* ActionType.SessionError */,
                        session: action.session,
                        turnId: action.turnId,
                        error: { errorType: 'sendFailed', message: String(err) },
                    });
                });
                break;
            }
            case "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */: {
                const toolCallKey = `${action.session}:${action.toolCallId}`;
                const agentId = this._toolCallAgents.get(toolCallKey);
                if (agentId) {
                    this._toolCallAgents.delete(toolCallKey);
                    const agent = this._options.agents.get().find(a => a.id === agentId);
                    agent?.respondToPermissionRequest(action.toolCallId, action.approved);
                }
                else {
                    this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
                }
                break;
            }
            case "session/turnCancelled" /* ActionType.SessionTurnCancelled */: {
                const agent = this._options.getAgent(action.session);
                agent?.abortSession(URI.parse(action.session)).catch(err => {
                    this._logService.error('[AgentSideEffects] abortSession failed', err);
                });
                break;
            }
            case "session/modelChanged" /* ActionType.SessionModelChanged */: {
                const agent = this._options.getAgent(action.session);
                agent?.changeModel?.(URI.parse(action.session), action.model).catch(err => {
                    this._logService.error('[AgentSideEffects] changeModel failed', err);
                });
                break;
            }
            case "session/titleChanged" /* ActionType.SessionTitleChanged */: {
                this._persistTitle(action.session, action.title);
                break;
            }
            case "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */:
            case "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */:
            case "session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */: {
                this._syncPendingMessages(action.session);
                break;
            }
            case "session/truncated" /* ActionType.SessionTruncated */: {
                const agent = this._options.getAgent(action.session);
                let turnIndex;
                if (action.turnId !== undefined) {
                    const state = this._stateManager.getSessionState(action.session);
                    if (state) {
                        const idx = state.turns.findIndex(t => t.id === action.turnId);
                        if (idx >= 0) {
                            turnIndex = idx;
                        }
                    }
                }
                agent?.truncateSession?.(URI.parse(action.session), turnIndex).catch(err => {
                    this._logService.error('[AgentSideEffects] truncateSession failed', err);
                });
                break;
            }
            case "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */: {
                const agent = this._options.getAgent(action.session);
                const refs = action.activeClient?.customizations;
                if (!agent?.setClientCustomizations || !refs?.length) {
                    break;
                }
                // Publish initial "loading" status for all customizations
                const loading = refs.map(r => ({
                    customization: r,
                    enabled: true,
                    status: "loading" /* CustomizationStatus.Loading */,
                }));
                this._stateManager.dispatchServerAction({
                    type: "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */,
                    session: action.session,
                    customizations: loading,
                });
                agent.setClientCustomizations(action.activeClient.clientId, refs, (synced) => {
                    // Incremental progress: publish updated statuses
                    const statuses = synced.map(s => s.customization);
                    this._stateManager.dispatchServerAction({
                        type: "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */,
                        session: action.session,
                        customizations: statuses,
                    });
                }).then(synced => {
                    // Final status
                    const statuses = synced.map(s => s.customization);
                    this._stateManager.dispatchServerAction({
                        type: "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */,
                        session: action.session,
                        customizations: statuses,
                    });
                }).catch(err => {
                    this._logService.error('[AgentSideEffects] setClientCustomizations failed', err);
                });
                break;
            }
            case "session/customizationToggled" /* ActionType.SessionCustomizationToggled */: {
                const agent = this._options.getAgent(action.session);
                agent?.setCustomizationEnabled?.(action.uri, action.enabled);
                break;
            }
        }
    }
    _persistTitle(session, title) {
        const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
        ref.object.setMetadata('customTitle', title).catch(err => {
            this._logService.warn('[AgentSideEffects] Failed to persist session title', err);
        }).finally(() => {
            ref.dispose();
        });
    }
    /**
     * Pushes the current pending message state from the session to the agent.
     * The server controls queued message consumption; only steering messages
     * are forwarded to the agent for mid-turn injection.
     */
    _syncPendingMessages(session) {
        const state = this._stateManager.getSessionState(session);
        if (!state) {
            return;
        }
        const agent = this._options.getAgent(session);
        agent?.setPendingMessages?.(URI.parse(session), state.steeringMessage, []);
        // Steering message removal is now dispatched by the agent
        // via the 'steering_consumed' progress event once the message
        // has actually been sent to the model.
        // If the session is idle, try to consume the next queued message
        this._tryConsumeNextQueuedMessage(session);
    }
    /**
     * Consumes the next queued message by dispatching a server-initiated
     * `SessionTurnStarted` action with `queuedMessageId` set. The reducer
     * atomically creates the active turn and removes the message from the
     * queue. Only consumes one message at a time; subsequent messages are
     * consumed when the next `idle` event fires.
     */
    _tryConsumeNextQueuedMessage(session) {
        // Bail if there's already an active turn
        if (this._stateManager.getActiveTurnId(session)) {
            return;
        }
        const state = this._stateManager.getSessionState(session);
        if (!state?.queuedMessages?.length) {
            return;
        }
        const msg = state.queuedMessages[0];
        const turnId = generateUuid();
        // Reset event mappers for the new turn (same as handleAction does for SessionTurnStarted)
        for (const mapper of this._eventMappers.values()) {
            mapper.reset(session);
        }
        // Dispatch server-initiated turn start; the reducer removes the queued message atomically
        this._stateManager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session,
            turnId,
            userMessage: msg.userMessage,
            queuedMessageId: msg.id,
        });
        // Send the message to the agent backend
        const agent = this._options.getAgent(session);
        if (!agent) {
            this._stateManager.dispatchServerAction({
                type: "session/error" /* ActionType.SessionError */,
                session,
                turnId,
                error: { errorType: 'noAgent', message: 'No agent found for session' },
            });
            return;
        }
        const attachments = msg.userMessage.attachments?.map((a) => ({
            type: a.type,
            path: a.path,
            displayName: a.displayName,
        }));
        agent.sendMessage(URI.parse(session), msg.userMessage.text, attachments).catch(err => {
            this._logService.error('[AgentSideEffects] sendMessage failed (queued)', err);
            this._stateManager.dispatchServerAction({
                type: "session/error" /* ActionType.SessionError */,
                session,
                turnId,
                error: { errorType: 'sendFailed', message: String(err) },
            });
        });
    }
    dispose() {
        this._toolCallAgents.clear();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTaWRlRWZmZWN0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50U2lkZUVmZmVjdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQWUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQVk1RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQWUvRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsVUFBVTtJQVMvQyxZQUNrQixhQUFrQyxFQUNsQyxRQUFrQyxFQUNsQyxXQUF3QjtRQUV6QyxLQUFLLEVBQUUsQ0FBQztRQUpTLGtCQUFhLEdBQWIsYUFBYSxDQUFxQjtRQUNsQyxhQUFRLEdBQVIsUUFBUSxDQUEwQjtRQUNsQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQVYxQyxpRkFBaUY7UUFDaEUsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUM3RCx1RUFBdUU7UUFDdEQsa0JBQWEsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQVVwRSxJQUFJLENBQUMsb0JBQW9CLEdBQUcs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