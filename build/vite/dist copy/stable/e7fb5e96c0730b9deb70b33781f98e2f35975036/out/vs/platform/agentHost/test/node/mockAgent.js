/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { AgentSession } from '../../common/agentService.js';
/** Well-known auto-generated title used by the 'with-title' prompt. */
export const MOCK_AUTO_TITLE = 'Automatically generated title';
/**
 * General-purpose mock agent for unit tests. Tracks all method calls
 * for assertion and exposes {@link fireProgress} to inject progress events.
 */
export class MockAgent {
    constructor(id = 'mock') {
        this.id = id;
        this._onDidSessionProgress = new Emitter();
        this.onDidSessionProgress = this._onDidSessionProgress.event;
        this._sessions = new Map();
        this._nextId = 1;
        this.sendMessageCalls = [];
        this.setPendingMessagesCalls = [];
        this.disposeSessionCalls = [];
        this.abortSessionCalls = [];
        this.respondToPermissionCalls = [];
        this.changeModelCalls = [];
        this.authenticateCalls = [];
        this.setClientCustomizationsCalls = [];
        this.setCustomizationEnabledCalls = [];
        /** Configurable return value for getCustomizations. */
        this.customizations = [];
        /** Configurable return value for getSessionMessages. */
        this.sessionMessages = [];
        /** Optional overrides applied to session metadata from listSessions. */
        this.sessionMetadataOverrides = {};
    }
    getDescriptor() {
        return { provider: this.id, displayName: `Agent ${this.id}`, description: `Test ${this.id} agent`, requiresAuth: this.id === 'copilot' };
    }
    getProtectedResources() {
        if (this.id === 'copilot') {
            return [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'] }];
        }
        return [];
    }
    async listModels() {
        return [{ provider: this.id, id: `${this.id}-model`, name: `${this.id} Model`, maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false }];
    }
    async listSessions() {
        return [...this._sessions.values()].map(s => ({ session: s, startTime: Date.now(), modifiedTime: Date.now(), ...this.sessionMetadataOverrides }));
    }
    async createSession(_config) {
        const rawId = `${this.id}-session-${this._nextId++}`;
        const session = AgentSession.uri(this.id, rawId);
        this._sessions.set(rawId, session);
        return session;
    }
    async sendMessage(session, prompt) {
        this.sendMessageCalls.push({ session, prompt });
    }
    setPendingMessages(session, steeringMessage, queuedMessages) {
        this.setPendingMessagesCalls.push({ session, steeringMessage, queuedMessages });
    }
    async getSessionMessages(_session) {
        return this.sessionMessages;
    }
    async disposeSession(session) {
        this.disposeSessionCalls.push(session);
        this._sessions.delete(AgentSession.id(session));
    }
    async abortSession(session) {
        this.abortSessionCalls.push(session);
    }
    respondToPermissionRequest(requestId, approved) {
        this.respondToPermissionCalls.push({ requestId, approved });
    }
    async changeModel(session, model) {
        this.changeModelCalls.push({ session, model });
    }
    async authenticate(resource, token) {
        this.authenticateCalls.push({ resource, token });
        return true;
    }
    getCustomizations() {
        return this.customizations;
    }
    async setClientCustomizations(clientId, customizations, progress) {
        this.setClientCustomizationsCalls.push({ clientId, customizations });
        const results = customizations.map(c => ({
            customization: {
                customization: c,
                enabled: true,
                status: "loaded" /* CustomizationStatus.Loaded */,
            },
        }));
        progress?.(results);
        return results;
    }
    setCustomizationEnabled(uri, enabled) {
        this.setCustomizationEnabledCalls.push({ uri, enabled });
    }
    async shutdown() { }
    fireProgress(event) {
        this._onDidSessionProgress.fire(event);
    }
    dispose() {
        this._onDidSessionProgress.dispose();
    }
}
/**
 * Well-known URI of a pre-existing session seeded in {@link ScriptedMockAgent}.
 * This session appears in `listSessions()` and has message history via
 * `getSessionMessages()`, but was never created through the server's
 * `handleCreateSession`. It simulates a session from a previous server
 * lifetime for testing the restore-on-subscribe path.
 */
export const PRE_EXISTING_SESSION_URI = AgentSession.uri('mock', 'pre-existing-session');
export class ScriptedMockAgent {
    constructor() {
        this.id = 'mock';
        this._onDidSessionProgress = new Emitter();
        this.onDidSessionProgress = this._onDidSessionProgress.event;
        this._sessions = new Map();
        this._nextId = 1;
        /**
         * Message history for the pre-existing session: a single user→assistant
         * turn with a tool call.
         */
        this._preExistingMessages = [
            { type: 'message', role: 'user', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-1', content: 'What files are here?' },
            { type: 'tool_start', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', toolName: 'list_files', displayName: 'List Files', invocationMessage: 'Listing files...' },
            { type: 'tool_complete', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', result: { pastTenseMessage: 'Listed files', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'file1.ts\nfile2.ts' }], success: true } },
            { type: 'message', role: 'assistant', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-2', content: 'Here are the files: file1.ts and file2.ts' },
        ];
        // Track pending permission requests
        this._pendingPermissions = new Map();
        // Track pending abort callbacks for slow responses
        this._pendingAborts = new Map();
        // Seed the pre-existing session so it appears in listSessions()
        this._sessions.set(AgentSession.id(PRE_EXISTING_SESSION_URI), PRE_EXISTING_SESSION_URI);
    }
    getDescriptor() {
        return { provider: 'mock', displayName: 'Mock Agent', description: 'Scripted test agent', requiresAuth: false };
    }
    getProtectedResources() {
        return [];
    }
    async listModels() {
        return [{ provider: 'mock', id: 'mock-model', name: 'Mock Model', maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false }];
    }
    async listSessions() {
        return [...this._sessions.values()].map(s => ({ session: s, startTime: Date.now(), modifiedTime: Date.now(), summary: s.toString() === PRE_EXISTING_SESSION_URI.toString() ? 'Pre-existing session' : undefined }));
    }
    async createSession(_config) {
        const rawId = `mock-session-${this._nextId++}`;
        const session = AgentSession.uri('mock', rawId);
        this._sessions.set(rawId, session);
        return session;
    }
    async sendMessage(session, prompt, _attachments) {
        switch (prompt) {
            case 'hello':
                this._fireSequence(session, [
                    { type: 'delta', session, messageId: 'msg-1', content: 'Hello, world!' },
                    { type: 'idle', session },
                ]);
                break;
            case 'use-tool':
                this._fireSequence(session, [
                    { type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'echo_tool', displayName: 'Echo Tool', invocationMessage: 'Running echo tool...' },
                    { type: 'tool_complete', session, toolCallId: 'tc-1', result: { pastTenseMessage: 'Ran echo tool', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'echoed' }], success: true } },
                    { type: 'delta', session, messageId: 'msg-1', content: 'Tool done.' },
                    { type: 'idle', session },
                ]);
                break;
            case 'error':
                this._fireSequence(session, [
                    { type: 'error', session, errorType: 'test_error', message: 'Something went wrong' },
                ]);
                break;
            case 'permission': {
                // Fire tool_start to create the tool, then tool_ready to request confirmation
                const toolStartEvent = {
                    type: 'tool_start',
                    session,
                    toolCallId: 'tc-perm-1',
                    toolName: 'shell',
                    displayName: 'Shell',
                    invocationMessage: 'Run a test command',
                };
                const toolReadyEvent = {
                    type: 'tool_ready',
                    session,
                    toolCallId: 'tc-perm-1',
                    invocationMessage: 'Run a test command',
                    toolInput: 'echo test',
                    confirmationTitle: 'Run a test command',
                };
                (async () => {
                    await timeout(10);
                    this._onDidSessionProgress.fire(toolStartEvent);
                    await timeout(5);
                    this._onDidSessionProgress.fire(toolReadyEvent);
                })();
                this._pendingPermissions.set('tc-perm-1', (approved) => {
                    if (approved) {
                        this._fireSequence(session, [
                            { type: 'delta', session, messageId: 'msg-1', content: 'Allowed.' },
                            { type: 'idle', session },
                        ]);
                    }
                });
                break;
            }
            case 'write-file': {
                // Fire tool_start + tool_ready with write permission for a regular file (should be auto-approved)
                (async () => {
                    await timeout(10);
                    this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-write-1', toolName: 'write', displayName: 'Write File', invocationMessage: 'Write file' });
                    await timeout(5);
                    this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-write-1', invocationMessage: 'Write src/app.ts', permissionKind: 'write', permissionPath: '/workspace/src/app.ts' });
                    // Auto-approved writes resolve immediately — complete the tool and turn
                    await timeout(10);
                    this._fireSequence(session, [
                        { type: 'tool_complete', session, toolCallId: 'tc-write-1', result: { pastTenseMessage: 'Wrote file', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'ok' }], success: true } },
                        { type: 'idle', session },
                    ]);
                })();
                break;
            }
            case 'write-env': {
                // Fire tool_start + tool_ready with write permission for .env (should be blocked)
                (async () => {
                    await timeout(10);
                    this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-write-env-1', toolName: 'write', displayName: 'Write File', invocationMessage: 'Write file' });
                    await timeout(5);
                    this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-write-env-1', invocationMessage: 'Write .env', permissionKind: 'write', permissionPath: '/workspace/.env', confirmationTitle: 'Write .env' });
                })();
                this._pendingPermissions.set('tc-write-env-1', (approved) => {
                    if (approved) {
                        this._fireSequence(session, [
                            { type: 'tool_complete', session, toolCallId: 'tc-write-env-1', result: { pastTenseMessage: 'Wrote .env', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'ok' }], success: true } },
                            { type: 'idle', session },
                        ]);
                    }
                });
                break;
            }
            case 'run-safe-command': {
                // Fire tool_start + tool_ready with shell permission for an allowed command (should be auto-approved)
                (async () => {
                    await timeout(10);
                    this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-shell-1', toolName: 'bash', displayName: 'Run Command', invocationMessage: 'Run command' });
                    await timeout(5);
                    this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-shell-1', invocationMessage: 'ls -la', permissionKind: 'shell', toolInput: 'ls -la' });
                    // Auto-approved shell commands resolve immediately
                    await timeout(10);
                    this._fireSequence(session, [
                        { type: 'tool_complete', session, toolCallId: 'tc-shell-1', result: { pastTenseMessage: 'Ran command', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'file1.ts\nfile2.ts' }], success: true } },
                        { type: 'idle', session },
                    ]);
                })();
                break;
            }
            case 'run-dangerous-command': {
                // Fire tool_start + tool_ready with shell permission for a denied command (should require confirmation)
                (async () => {
                    await timeout(10);
                    this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-shell-deny-1', toolName: 'bash', displayName: 'Run Command', invocationMessage: 'Run command' });
                    await timeout(5);
                    this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-shell-deny-1', invocationMessage: 'rm -rf /', permissionKind: 'shell', toolInput: 'rm -rf /', confirmationTitle: 'Run in terminal' });
                })();
                this._pendingPermissions.set('tc-shell-deny-1', (approved) => {
                    if (approved) {
                        this._fireSequence(session, [
                            { type: 'tool_complete', session, toolCallId: 'tc-shell-deny-1', result: { pastTenseMessage: 'Ran command', content: [{ type: "text" /* ToolResultContentType.Text */, text: '' }], success: true } },
                            { type: 'idle', session },
                        ]);
                    }
                });
                break;
            }
            case 'with-usage':
                this._fireSequence(session, [
                    { type: 'delta', session, messageId: 'msg-1', content: 'Usage response.' },
                    { type: 'usage', session, inputTokens: 100, outputTokens: 50, model: 'mock-model' },
                    { type: 'idle', session },
                ]);
                break;
            case 'with-reasoning':
                this._fireSequence(session, [
                    { type: 'reasoning', session, content: 'Let me think' },
                    { type: 'reasoning', session, content: ' about this...' },
                    { type: 'delta', session, messageId: 'msg-1', content: 'Reasoned response.' },
                    { type: 'idle', session },
                ]);
                break;
            case 'with-title':
                this._fireSequence(session, [
                    { type: 'delta', session, messageId: 'msg-1', content: 'Title response.' },
                    { type: 'title_changed', session, title: MOCK_AUTO_TITLE },
                    { type: 'idle', session },
                ]);
                break;
            case 'slow': {
                // Slow response for cancel testing — fires delta after a long delay
                const timer = setTimeout(() => {
                    this._fireSequence(session, [
                        { type: 'delta', session, messageId: 'msg-1', content: 'Slow response.' },
                        { type: 'idle', session },
                    ]);
                }, 5000);
                this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
                break;
            }
            default:
                this._fireSequence(session, [
                    { type: 'delta', session, messageId: 'msg-1', content: 'Unknown prompt: ' + prompt },
                    { type: 'idle', session },
                ]);
                break;
        }
    }
    setPendingMessages(session, steeringMessage, _queuedMessages) {
        // When steering is set, consume it on the next tick
        if (steeringMessage) {
            timeout(20).then(() => {
                this._onDidSessionProgress.fire({ type: 'steering_consumed', session, id: steeringMessage.id });
            });
        }
    }
    async setClientCustomizations() {
        return [];
    }
    setCustomizationEnabled() {
    }
    async getSessionMessages(session) {
        if (session.toString() === PRE_EXISTING_SESSION_URI.toString()) {
            return this._preExistingMessages;
        }
        return [];
    }
    async disposeSession(session) {
        this._sessions.delete(AgentSession.id(session));
    }
    async abortSession(session) {
        const callback = this._pendingAborts.get(session.toString());
        if (callback) {
            this._pendingAborts.delete(session.toString());
            callback();
        }
    }
    async changeModel(_session, _model) {
        // Mock agent doesn't track model state
    }
    async truncateSession(_session, _turnIndex) {
        // Mock agent accepts truncation without side effects
    }
    async forkSession(_sourceSession, newSessionId, _turnIndex) {
        // Create the forked session so it can be resumed
        const session = AgentSession.uri('mock', newSessionId);
        this._sessions.set(newSessionId, session);
    }
    respondToPermissionRequest(toolCallId, approved) {
        const callback = this._pendingPermissions.get(toolCallId);
        if (callback) {
            this._pendingPermissions.delete(toolCallId);
            callback(approved);
        }
    }
    async authenticate(_resource, _token) {
        return true;
    }
    async shutdown() { }
    dispose() {
        this._onDidSessionProgress.dispose();
    }
    _fireSequence(session, events) {
        let delay = 0;
        for (const event of events) {
            delay += 10;
            setTimeout(() => this._onDidSessionProgress.fire(event), delay);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0FnZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9tb2NrQWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUkzRCxPQUFPLEVBQUUsWUFBWSxFQUErUSxNQUFNLDhCQUE4QixDQUFDO0FBR3pVLHVFQUF1RTtBQUN2RSxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsK0JBQStCLENBQUM7QUFFL0Q7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLFNBQVM7SUEyQnJCLFlBQXFCLEtBQW9CLE1BQU07UUFBMUIsT0FBRSxHQUFGLEVBQUUsQ0FBd0I7UUExQjlCLDBCQUFxQixHQUFHLElBQUksT0FBTyxFQUF1QixDQUFDO1FBQ25FLHlCQUFvQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUM7UUFFaEQsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFlLENBQUM7UUFDNUMsWUFBTyxHQUFHLENBQUMsQ0FBQztRQUdYLHFCQUFnQixHQUF1QyxFQUFFLENBQUM7UUFDMUQsNEJBQXVCLEdBQWlILEVBQUUsQ0FBQztRQUMzSSx3QkFBbUIsR0FBVSxFQUFFLENBQUM7UUFDaEMsc0JBQWlCLEdBQVUsRUFBRSxDQUFDO1FBQzlCLDZCQUF3QixHQUErQyxFQUFFLENBQUM7UUFDMUUscUJBQWdCLEdBQXNDLEVBQUUsQ0FBQztRQUN6RCxzQkFBaUIsR0FBMEMsRUFBRSxDQUFDO1FBQzlELGlDQUE0QixHQUFnRSxFQUFFLENBQUM7UUFDL0YsaUNBQTRCLEdBQXdDLEVBQUUsQ0FBQztRQUVoRix1REFBdUQ7UUFDdkQsbUJBQWMsR0FBd0IsRUFB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