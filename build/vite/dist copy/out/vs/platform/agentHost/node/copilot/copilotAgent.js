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
var CopilotAgent_1;
import { CopilotClient } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import { SequencerByKey } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { parsePlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentPluginManager } from '../../common/agentPluginManager.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { CopilotAgentSession } from './copilotAgentSession.js';
import { parsedPluginsEqual, toSdkCustomAgents, toSdkHooks, toSdkMcpServers, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { forkCopilotSessionOnDisk, getCopilotDataDir, truncateCopilotSessionOnDisk } from './copilotAgentForking.js';
/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
let CopilotAgent = class CopilotAgent extends Disposable {
    static { CopilotAgent_1 = this; }
    constructor(_logService, _instantiationService, _fileService, _sessionDataService) {
        super();
        this._logService = _logService;
        this._instantiationService = _instantiationService;
        this._fileService = _fileService;
        this._sessionDataService = _sessionDataService;
        this.id = 'copilot';
        this._onDidSessionProgress = this._register(new Emitter());
        this.onDidSessionProgress = this._onDidSessionProgress.event;
        this._sessions = this._register(new DisposableMap());
        this._sessionSequencer = new SequencerByKey();
        this._plugins = this._instantiationService.createInstance(PluginController);
    }
    // ---- auth ---------------------------------------------------------------
    getDescriptor() {
        return {
            provider: 'copilot',
            displayName: 'Agent Host - Copilot',
            description: 'Copilot SDK agent running in a dedicated process',
            requiresAuth: true,
        };
    }
    getProtectedResources() {
        return [{
                resource: 'https://api.github.com',
                resource_name: 'GitHub Copilot',
                authorization_servers: ['https://github.com/login/oauth'],
                scopes_supported: ['read:user', 'user:email'],
            }];
    }
    async authenticate(resource, token) {
        if (resource !== 'https://api.github.com') {
            return false;
        }
        const tokenChanged = this._githubToken !== token;
        this._githubToken = token;
        this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
        if (tokenChanged && this._client && this._sessions.size === 0) {
            this._logService.info('[Copilot] Restarting CopilotClient with new token');
            const client = this._client;
            this._client = undefined;
            this._clientStarting = undefined;
            await client.stop();
        }
        return true;
    }
    // ---- client lifecycle ---------------------------------------------------
    async _ensureClient() {
        if (this._client) {
            return this._client;
        }
        if (this._clientStarting) {
            return this._clientStarting;
        }
        this._clientStarting = (async () => {
            this._logService.info(`[Copilot] Starting CopilotClient... ${this._githubToken ? '(with token)' : '(no token)'}`);
            // Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
            // that can interfere with the Node.js process the SDK spawns.
            const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
            delete env['NODE_OPTIONS'];
            delete env['VSCODE_INSPECTOR_OPTIONS'];
            delete env['VSCODE_ESM_ENTRYPOINT'];
            delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
            for (const key of Object.keys(env)) {
                if (key === 'ELECTRON_RUN_AS_NODE') {
                    continue;
                }
                if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
                    delete env[key];
                }
            }
            env['COPILOT_CLI_RUN_AS_NODE'] = '1';
            env['USE_BUILTIN_RIPGREP'] = 'false';
            // Resolve the CLI entry point from node_modules. We can't use require.resolve()
            // because @github/copilot's exports map blocks direct subpath access.
            // FileAccess.asFileUri('') points to the `out/` directory; node_modules is one level up.
            const cliPath = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@github', 'copilot', 'index.js').fsPath;
            // Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
            // If @vscode/ripgrep is in an .asar file, the binary is unpacked.
            const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
            const rgDir = dirname(rgDiskPath);
            // On Windows the env key is typically "Path" (not "PATH"). Since we copied
            // process.env into a plain (case-sensitive) object, we must find the actual key.
            const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
            const currentPath = env[pathKey];
            env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
            this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);
            const client = new CopilotClient({
                githubToken: this._githubToken,
                useLoggedInUser: !this._githubToken,
                useStdio: true,
                autoStart: true,
                env,
                cliPath,
            });
            await client.start();
            this._logService.info('[Copilot] CopilotClient started successfully');
            this._client = client;
            this._clientStarting = undefined;
            return client;
        })();
        return this._clientStarting;
    }
    // ---- session management -------------------------------------------------
    async listSessions() {
        this._logService.info('[Copilot] Listing sessions...');
        const client = await this._ensureClient();
        const sessions = await client.listSessions();
        const result = sessions.map(s => ({
            session: AgentSession.uri(this.id, s.sessionId),
            startTime: s.startTime.getTime(),
            modifiedTime: s.modifiedTime.getTime(),
            summary: s.summary,
            workingDirectory: typeof s.context?.cwd === 'string' ? URI.file(s.context.cwd) : undefined,
        }));
        this._logService.info(`[Copilot] Found ${result.length} sessions`);
        return result;
    }
    async listModels() {
        this._logService.info('[Copilot] Listing models...');
        const client = await this._ensureClient();
        const models = await client.listModels();
        const result = models.map(m => ({
            provider: this.id,
            id: m.id,
            name: m.name,
            maxContextWindow: m.capabilities.limits.max_context_window_tokens,
            supportsVision: m.capabilities.supports.vision,
            supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
            supportedReasoningEfforts: m.supportedReasoningEfforts,
            defaultReasoningEffort: m.defaultReasoningEffort,
            policyState: m.policy?.state,
            billingMultiplier: m.billing?.multiplier,
        }));
        this._logService.info(`[Copilot] Found ${result.length} models`);
        return result;
    }
    async createSession(config) {
        this._logService.info(`[Copilot] Creating session... ${config?.model ? `model=${config.model}` : ''}`);
        const client = await this._ensureClient();
        const parsedPlugins = await this._plugins.getAppliedPlugins();
        // When forking, we manipulate the CLI's on-disk data and then resume
        // instead of creating a fresh session via the SDK.
        if (config?.fork) {
            const sourceSessionId = AgentSession.id(config.fork.session);
            const newSessionId = config.session ? AgentSession.id(config.session) : generateUuid();
            // Serialize against the source session to prevent concurrent
            // modifications while we read its on-disk data.
            return this._sessionSequencer.queue(sourceSessionId, async () => {
                this._logService.info(`[Copilot] Forking session ${sourceSessionId} at index ${config.fork.turnIndex} → ${newSessionId}`);
                // Ensure the source session is loaded so on-disk data is available
                if (!this._sessions.has(sourceSessionId)) {
                    await this._resumeSession(sourceSessionId);
                }
                const copilotDataDir = getCopilotDataDir();
                await forkCopilotSessionOnDisk(copilotDataDir, sourceSessionId, newSessionId, config.fork.turnIndex);
                // Resume the forked session so the SDK loads the forked history
                const agentSession = await this._resumeSession(newSessionId);
                const session = agentSession.sessionUri;
                this._logService.info(`[Copilot] Forked session created: ${session.toString()}`);
                return session;
            });
        }
        const sessionId = config?.session ? AgentSession.id(config.session) : generateUuid();
        const factory = async (callbacks) => {
            const customAgents = await toSdkCustomAgents(parsedPlugins.flatMap(p => p.agents), this._fileService);
            const raw = await client.createSession({
                model: config?.model,
                sessionId,
                streaming: true,
                workingDirectory: config?.workingDirectory?.fsPath,
                onPermissionRequest: callbacks.onPermissionRequest,
                hooks: toSdkHooks(parsedPlugins.flatMap(p => p.hooks), callbacks.hooks),
                mcpServers: toSdkMcpServers(parsedPlugins.flatMap(p => p.mcpServers)),
                customAgents,
                skillDirectories: toSdkSkillDirectories(parsedPlugins.flatMap(p => p.skills)),
            });
            return new CopilotSessionWrapper(raw);
        };
        const agentSession = this._createAgentSession(factory, config?.workingDirectory, sessionId);
        this._plugins.setAppliedPlugins(agentSession, parsedPlugins);
        await agentSession.initializeSession();
        // Persist model & working directory so we can recreate the session
        // if the SDK loses it (e.g. sessions without messages).
        this._storeSessionMetadata(agentSession.sessionUri, config?.model, config?.workingDirectory);
        const session = agentSession.sessionUri;
        this._logService.info(`[Copilot] Session created: ${session.toString()}`);
        return session;
    }
    async setClientCustomizations(clientId, customizations, progress) {
        return this._plugins.sync(clientId, customizations, progress);
    }
    setCustomizationEnabled(uri, enabled) {
        this._plugins.setEnabled(uri, enabled);
    }
    async sendMessage(session, prompt, attachments) {
        const sessionId = AgentSession.id(session);
        await this._sessionSequencer.queue(sessionId, async () => {
            // If plugin config changed, dispose this session so it gets resumed
            // with the updated plugin primitives.
            let entry = this._sessions.get(sessionId);
            if (entry && await this._plugins.needsSessionRefresh(entry)) {
                this._logService.info(`[Copilot:${sessionId}] Plugin config changed, refreshing session`);
                this._sessions.deleteAndDispose(sessionId);
                entry = undefined;
            }
            entry ??= await this._resumeSession(sessionId);
            await entry.send(prompt, attachments);
        });
    }
    setPendingMessages(session, steeringMessage, _queuedMessages) {
        const sessionId = AgentSession.id(session);
        const entry = this._sessions.get(sessionId);
        if (!entry) {
            this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
            return;
        }
        // Steering: send with mode 'immediate' so the SDK injects it mid-turn
        if (steeringMessage) {
            entry.sendSteering(steeringMessage);
        }
        // Queued messages are consumed by the server (AgentSideEffects)
        // which dispatches SessionTurnStarted and calls sendMessage directly.
        // No SDK-level enqueue is needed.
    }
    async getSessionMessages(session) {
        const sessionId = AgentSession.id(session);
        const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
        if (!entry) {
            return [];
        }
        return entry.getMessages();
    }
    async disposeSession(session) {
        const sessionId = AgentSession.id(session);
        await this._sessionSequencer.queue(sessionId, async () => {
            this._sessions.deleteAndDispose(sessionId);
        });
    }
    async abortSession(session) {
        const sessionId = AgentSession.id(session);
        await this._sessionSequencer.queue(sessionId, async () => {
            const entry = this._sessions.get(sessionId);
            if (entry) {
                await entry.abort();
            }
        });
    }
    async truncateSession(session, turnIndex) {
        const sessionId = AgentSession.id(session);
        await this._sessionSequencer.queue(sessionId, async () => {
            this._logService.info(`[Copilot:${sessionId}] Truncating session${turnIndex !== undefined ? ` at index ${turnIndex}` : ' (all turns)'}`);
            const keepUpToTurnIndex = turnIndex ?? -1;
            // Destroy the SDK session first and wait for cleanup to complete,
            // ensuring on-disk data (events.jsonl, locks) is released before
            // we modify it. Then dispose the wrapper.
            const entry = this._sessions.get(sessionId);
            if (entry) {
                await entry.destroySession();
            }
            this._sessions.deleteAndDispose(sessionId);
            const copilotDataDir = getCopilotDataDir();
            await truncateCopilotSessionOnDisk(copilotDataDir, sessionId, keepUpToTurnIndex);
            // Resume the session from the modified on-disk data
            await this._resumeSession(sessionId);
            this._logService.info(`[Copilot:${sessionId}] Session truncated and resumed`);
        });
    }
    async forkSession(sourceSession, newSessionId, turnIndex) {
        const sourceSessionId = AgentSession.id(sourceSession);
        await this._sessionSequencer.queue(sourceSessionId, async () => {
            this._logService.info(`[Copilot] Forking session ${sourceSessionId} at index ${turnIndex} → ${newSessionId}`);
            const copilotDataDir = getCopilotDataDir();
            await forkCopilotSessionOnDisk(copilotDataDir, sourceSessionId, newSessionId, turnIndex);
            this._logService.info(`[Copilot] Forked session ${newSessionId} created on disk`);
        });
    }
    async changeModel(session, model) {
        const sessionId = AgentSession.id(session);
        const entry = this._sessions.get(sessionId);
        if (entry) {
            await entry.setModel(model);
        }
        this._storeSessionMetadata(session, model, undefined);
    }
    async shutdown() {
        this._logService.info('[Copilot] Shutting down...');
        this._sessions.clearAndDisposeAll();
        await this._client?.stop();
        this._client = undefined;
    }
    respondToPermissionRequest(requestId, approved) {
        for (const [, session] of this._sessions) {
            if (session.respondToPermissionRequest(requestId, approved)) {
                return;
            }
        }
    }
    /**
     * Returns true if this provider owns the given session ID.
     */
    hasSession(session) {
        return this._sessions.has(AgentSession.id(session));
    }
    // ---- helpers ------------------------------------------------------------
    /**
     * Creates a {@link CopilotAgentSession}, registers it in the sessions map,
     * and returns it. The caller must call {@link CopilotAgentSession.initializeSession}
     * to wire up the SDK session.
     */
    _createAgentSession(wrapperFactory, workingDirectory, sessionId) {
        const sessionUri = AgentSession.uri(this.id, sessionId);
        const agentSession = this._instantiationService.createInstance(CopilotAgentSession, sessionUri, sessionId, workingDirectory, this._onDidSessionProgress, wrapperFactory);
        this._sessions.set(sessionId, agentSession);
        return agentSession;
    }
    async _resumeSession(sessionId) {
        this._logService.info(`[Copilot:${sessionId}] Session not in memory, resuming...`);
        const client = await this._ensureClient();
        const parsedPlugins = await this._plugins.getAppliedPlugins();
        const buildPluginConfig = async (callbacks) => {
            const customAgents = await toSdkCustomAgents(parsedPlugins.flatMap(p => p.agents), this._fileService);
            return {
                onPermissionRequest: callbacks.onPermissionRequest,
                hooks: toSdkHooks(parsedPlugins.flatMap(p => p.hooks), callbacks.hooks),
                mcpServers: toSdkMcpServers(parsedPlugins.flatMap(p => p.mcpServers)),
                customAgents,
                skillDirectories: toSdkSkillDirectories(parsedPlugins.flatMap(p => p.skills)),
            };
        };
        const factory = async (callbacks) => {
            const pluginConfig = await buildPluginConfig(callbacks);
            try {
                const raw = await client.resumeSession(sessionId, {
                    ...pluginConfig,
                });
                return new CopilotSessionWrapper(raw);
            }
            catch (err) {
                // The SDK fails to resume sessions that have no messages.
                // Fall back to creating a new session with the same ID,
                // seeding model & working directory from stored metadata.
                if (!err || err.code !== -32603) {
                    throw err;
                }
                this._logService.warn(`[Copilot:${sessionId}] Resume failed (session not found in SDK), recreating`);
                const metadata = await this._readSessionMetadata(AgentSession.uri(this.id, sessionId));
                const raw = await client.createSession({
                    ...pluginConfig,
                    sessionId,
                    streaming: true,
                    model: metadata.model,
                    workingDirectory: metadata.workingDirectory?.fsPath,
                });
                return new CopilotSessionWrapper(raw);
            }
        };
        const agentSession = this._createAgentSession(factory, undefined, sessionId);
        this._plugins.setAppliedPlugins(agentSession, parsedPlugins);
        await agentSession.initializeSession();
        return agentSession;
    }
    // ---- session metadata persistence --------------------------------------
    static { this._META_MODEL = 'copilot.model'; }
    static { this._META_CWD = 'copilot.workingDirectory'; }
    _storeSessionMetadata(session, model, workingDirectory) {
        const dbRef = this._sessionDataService.tryOpenDatabase(session);
        dbRef?.then(ref => {
            if (!ref) {
                return;
            }
            const db = ref.object;
            const work = [];
            if (model) {
                work.push(db.setMetadata(CopilotAgent_1._META_MODEL, model));
            }
            if (workingDirectory) {
                work.push(db.setMetadata(CopilotAgent_1._META_CWD, workingDirectory.toString()));
            }
            Promise.all(work).finally(() => ref.dispose());
        });
    }
    async _readSessionMetadata(session) {
        const ref = await this._sessionDataService.tryOpenDatabase(session);
        if (!ref) {
            return {};
        }
        try {
            const [model, cwd] = await Promise.all([
                ref.object.getMetadata(CopilotAgent_1._META_MODEL),
                ref.object.getMetadata(CopilotAgent_1._META_CWD),
            ]);
            return {
                model,
                workingDirectory: cwd ? URI.parse(cwd) : undefined,
            };
        }
        finally {
            ref.dispose();
        }
    }
    dispose() {
        this._client?.stop().catch(() => { });
        super.dispose();
    }
};
CopilotAgent = CopilotAgent_1 = __decorate([
    __param(0, ILogService),
    __param(1, IInstantiationService),
    __param(2, IFileService),
    __param(3, ISessionDataService)
], CopilotAgent);
export { CopilotAgent };
let PluginController = class PluginController {
    constructor(_pluginManager, _logService, _fileService) {
        this._pluginManager = _pluginManager;
        this._logService = _logService;
        this._fileService = _fileService;
        this._enablement = new Map();
        this._lastSynced = Promise.resolve({ synced: [], parsed: [] });
        /** Parsed plugin contents from the most recently applied sync. */
        this._appliedParsed = new WeakMap();
    }
    /**
     * Returns true if the plugin configuration has changed since the last
     * time sessions were created/resumed. Used by {@link CopilotAgent.sendMessage}
     * to decide whether a session needs to be refreshed.
     */
    async needsSessionRefresh(session) {
        const { parsed } = await this._lastSynced;
        return !parsedPluginsEqual(this._appliedParsed.get(session) || [], parsed);
    }
    /**
     * Returns the current parsed plugins filtered by enablement,
     * then marks them as applied so {@link needsSessionRefresh} returns
     * false until the next change.
     */
    async getAppliedPlugins() {
        const { parsed } = await this._lastSynced;
        return parsed;
    }
    setAppliedPlugins(session, plugins) {
        this._appliedParsed.set(session, plugins);
    }
    setEnabled(pluginProtocolUri, enabled) {
        this._enablement.set(pluginProtocolUri, enabled);
    }
    sync(clientId, customizations, progress) {
        const prev = this._lastSynced;
        const promise = this._lastSynced = prev.catch(() => []).then(async () => {
            const result = await this._pluginManager.syncCustomizations(clientId, customizations, status => {
                progress?.(status.map(c => ({ customization: c })));
            });
            const parsed = [];
            const synced = [];
            for (const dir of result) {
                if (dir.pluginDir) {
                    try {
                        parsed.push(await parsePlugin(dir.pluginDir, this._fileService, undefined, this._getUserHome()));
                        synced.push(dir);
                    }
                    catch (e) {
                        this._logService.warn(`[Copilot:PluginController] Error parsing plugin: ${e}`);
                        synced.push({ customization: { ...dir.customization, status: "error" /* CustomizationStatus.Error */, statusMessage: `Error parsing plugin: ${e}` } });
                    }
                }
                else {
                    synced.push(dir);
                }
            }
            return { synced, parsed };
        });
        return promise.then(p => p.synced);
    }
    _getUserHome() {
        return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
    }
};
PluginController = __decorate([
    __param(0, IAgentPluginManager),
    __param(1, ILogService),
    __param(2, IFileService)
], PluginController);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdEFnZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvY29waWxvdC9jb3BpbG90QWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDekMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFpQixXQUFXLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBd0IsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRixPQUFPLEVBQUUsWUFBWSxFQUF5TSxNQUFNLDhCQUE4QixDQUFDO0FBQ25RLE9BQU8sRUFBRSxtQkFBbUIs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