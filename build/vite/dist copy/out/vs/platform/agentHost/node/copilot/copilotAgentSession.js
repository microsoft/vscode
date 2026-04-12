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
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { localize } from '../../../../nls.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { getEditFilePath, getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool } from './copilotToolDisplay.js';
import { FileEditTracker } from './fileEditTracker.js';
import { mapSessionEvents } from './mapSessionEvents.js';
function tryStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return undefined;
    }
}
/**
 * Derives display fields from a permission request for the tool confirmation UI.
 */
function getPermissionDisplay(request) {
    const path = typeof request.path === 'string' ? request.path : (typeof request.fileName === 'string' ? request.fileName : undefined);
    const fullCommandText = typeof request.fullCommandText === 'string' ? request.fullCommandText : undefined;
    const intention = typeof request.intention === 'string' ? request.intention : undefined;
    const serverName = typeof request.serverName === 'string' ? request.serverName : undefined;
    const toolName = typeof request.toolName === 'string' ? request.toolName : undefined;
    switch (request.kind) {
        case 'shell':
            return {
                confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal"),
                invocationMessage: intention ?? localize('copilot.permission.shell.message', "Run command"),
                toolInput: fullCommandText,
            };
        case 'write':
            return {
                confirmationTitle: localize('copilot.permission.write.title', "Write file"),
                invocationMessage: path ? localize('copilot.permission.write.message', "Edit {0}", path) : localize('copilot.permission.write.messageGeneric', "Edit file"),
                toolInput: tryStringify(path ? { path } : request) ?? undefined,
            };
        case 'mcp': {
            const title = toolName ?? localize('copilot.permission.mcp.defaultTool', "MCP Tool");
            return {
                confirmationTitle: serverName ? `${serverName}: ${title}` : title,
                invocationMessage: serverName ? `${serverName}: ${title}` : title,
                toolInput: tryStringify({ serverName, toolName }) ?? undefined,
            };
        }
        case 'read':
            return {
                confirmationTitle: localize('copilot.permission.read.title', "Read file"),
                invocationMessage: intention ?? localize('copilot.permission.read.message', "Read file"),
                toolInput: tryStringify(path ? { path, intention } : request) ?? undefined,
            };
        default:
            return {
                confirmationTitle: localize('copilot.permission.default.title', "Permission request"),
                invocationMessage: localize('copilot.permission.default.message', "Permission request"),
                toolInput: tryStringify(request) ?? undefined,
            };
    }
}
/**
 * Encapsulates a single Copilot SDK session and all its associated bookkeeping.
 *
 * Created by {@link CopilotAgent}, one instance per active session. Disposing
 * this class tears down all per-session resources (SDK wrapper, edit tracker,
 * database reference, pending permissions).
 */
let CopilotAgentSession = class CopilotAgentSession extends Disposable {
    constructor(sessionUri, rawSessionId, workingDirectory, _onDidSessionProgress, _wrapperFactory, _fileService, _logService, sessionDataService) {
        super();
        this._onDidSessionProgress = _onDidSessionProgress;
        this._wrapperFactory = _wrapperFactory;
        this._fileService = _fileService;
        this._logService = _logService;
        /** Tracks active tool invocations so we can produce past-tense messages on completion. */
        this._activeToolCalls = new Map();
        /** Pending permission requests awaiting a renderer-side decision. */
        this._pendingPermissions = new Map();
        /** Turn ID tracked across tool events. */
        this._turnId = '';
        this.sessionId = rawSessionId;
        this.sessionUri = sessionUri;
        this._workingDirectory = workingDirectory;
        this._databaseRef = sessionDataService.openDatabase(sessionUri);
        this._register(toDisposable(() => this._databaseRef.dispose()));
        this._editTracker = new FileEditTracker(sessionUri.toString(), this._databaseRef.object, this._fileService, this._logService);
        this._register(toDisposable(() => this._denyPendingPermissions()));
    }
    /**
     * Creates (or resumes) the SDK session via the injected factory and
     * wires up all event listeners. Must be called exactly once after
     * construction before using the session.
     */
    async initializeSession() {
        this._wrapper = this._register(await this._wrapperFactory({
            onPermissionRequest: request => this.handlePermissionRequest(request),
            hooks: {
                onPreToolUse: async (input) => {
                    if (isEditTool(input.toolName)) {
                        const filePath = getEditFilePath(input.toolArgs);
                        if (filePath) {
                            await this._editTracker.trackEditStart(filePath);
                        }
                    }
                },
                onPostToolUse: async (input) => {
                    if (isEditTool(input.toolName)) {
                        const filePath = getEditFilePath(input.toolArgs);
                        if (filePath) {
                            await this._editTracker.completeEdit(filePath);
                        }
                    }
                },
            },
        }));
        this._subscribeToEvents();
        this._subscribeForLogging();
    }
    // ---- session operations -------------------------------------------------
    async send(prompt, attachments) {
        this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);
        const sdkAttachments = attachments?.map(a => {
            if (a.type === 'selection') {
                return { type: 'selection', filePath: a.path, displayName: a.displayName ?? a.path, text: a.text, selection: a.selection };
            }
            return { type: a.type, path: a.path, displayName: a.displayName };
        });
        if (sdkAttachments?.length) {
            this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type, path: a.type === 'selection' ? a.filePath : a.path })))}`);
        }
        await this._wrapper.session.send({ prompt, attachments: sdkAttachments });
        this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
    }
    async sendSteering(steeringMessage) {
        this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.userMessage.text.substring(0, 100)}"`);
        try {
            await this._wrapper.session.send({
                prompt: steeringMessage.userMessage.text,
                mode: 'immediate',
            });
            this._onDidSessionProgress.fire({
                session: this.sessionUri,
                type: 'steering_consumed',
                id: steeringMessage.id,
            });
        }
        catch (err) {
            this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
        }
    }
    async getMessages() {
        const events = await this._wrapper.session.getMessages();
        let db;
        try {
            db = this._databaseRef.object;
        }
        catch {
            // Database may not exist yet — that's fine
        }
        return mapSessionEvents(this.sessionUri, db, events);
    }
    async abort() {
        this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
        this._denyPendingPermissions();
        await this._wrapper.session.abort();
    }
    /**
     * Explicitly destroys the underlying SDK session and waits for cleanup
     * to complete. Call this before {@link dispose} when you need to ensure
     * the session's on-disk data is no longer locked (e.g. before
     * truncation or fork operations that modify the session files).
     */
    async destroySession() {
        await this._wrapper.session.destroy();
    }
    async setModel(model) {
        this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
        await this._wrapper.session.setModel(model);
    }
    // ---- permission handling ------------------------------------------------
    /**
     * Handles a permission request from the SDK by firing a `tool_ready` event
     * (which transitions the tool to PendingConfirmation) and waiting for the
     * side-effects layer to respond via {@link respondToPermissionRequest}.
     */
    async handlePermissionRequest(request) {
        this._logService.info(`[Copilot:${this.sessionId}] Permission request: kind=${request.kind}`);
        // Auto-approve reads inside the working directory
        if (request.kind === 'read') {
            const requestPath = typeof request.path === 'string' ? request.path : undefined;
            if (requestPath && this._workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(requestPath)), this._workingDirectory)) {
                this._logService.trace(`[Copilot:${this.sessionId}] Auto-approving read inside working directory: ${requestPath}`);
                return { kind: 'approved' };
            }
        }
        const toolCallId = request.toolCallId;
        if (!toolCallId) {
            // TODO: handle permission requests without a toolCallId by creating a synthetic tool call
            this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
            return { kind: 'denied-interactively-by-user' };
        }
        this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);
        const deferred = new DeferredPromise();
        this._pendingPermissions.set(toolCallId, deferred);
        // Derive display information from the permission request kind
        const { confirmationTitle, invocationMessage, toolInput } = getPermissionDisplay(request);
        // Fire a tool_ready event to transition the tool to PendingConfirmation
        this._onDidSessionProgress.fire({
            session: this.sessionUri,
            type: 'tool_ready',
            toolCallId,
            invocationMessage,
            toolInput,
            confirmationTitle,
            permissionKind: request.kind,
            permissionPath: typeof request.path === 'string' ? request.path : (typeof request.fileName === 'string' ? request.fileName : undefined),
        });
        const approved = await deferred.p;
        this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, approved=${approved}`);
        return { kind: approved ? 'approved' : 'denied-interactively-by-user' };
    }
    respondToPermissionRequest(requestId, approved) {
        const deferred = this._pendingPermissions.get(requestId);
        if (deferred) {
            this._pendingPermissions.delete(requestId);
            deferred.complete(approved);
            return true;
        }
        return false;
    }
    // ---- event wiring -------------------------------------------------------
    _subscribeToEvents() {
        const wrapper = this._wrapper;
        const sessionId = this.sessionId;
        const session = this.sessionUri;
        this._register(wrapper.onMessageDelta(e => {
            this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
            this._onDidSessionProgress.fire({
                session,
                type: 'delta',
                messageId: e.data.messageId,
                content: e.data.deltaContent,
                parentToolCallId: e.data.parentToolCallId,
            });
        }));
        this._register(wrapper.onMessage(e => {
            this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
            this._onDidSessionProgress.fire({
                session,
                type: 'message',
                role: 'assistant',
                messageId: e.data.messageId,
                content: e.data.content,
                toolRequests: e.data.toolRequests?.map(tr => ({
                    toolCallId: tr.toolCallId,
                    name: tr.name,
                    arguments: tr.arguments !== undefined ? tryStringify(tr.arguments) : undefined,
                    type: tr.type,
                })),
                reasoningOpaque: e.data.reasoningOpaque,
                reasoningText: e.data.reasoningText,
                encryptedContent: e.data.encryptedContent,
                parentToolCallId: e.data.parentToolCallId,
            });
        }));
        this._register(wrapper.onToolStart(e => {
            if (isHiddenTool(e.data.toolName)) {
                this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
                return;
            }
            this._logService.info(`[Copilot:${sessionId}] Tool started: ${e.data.toolName}`);
            const toolArgs = e.data.arguments !== undefined ? tryStringify(e.data.arguments) : undefined;
            let parameters;
            if (toolArgs) {
                try {
                    parameters = JSON.parse(toolArgs);
                }
                catch { /* ignore */ }
            }
            const displayName = getToolDisplayName(e.data.toolName);
            this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters });
            const toolKind = getToolKind(e.data.toolName);
            this._onDidSessionProgress.fire({
                session,
                type: 'tool_start',
                toolCallId: e.data.toolCallId,
                toolName: e.data.toolName,
                displayName,
                invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
                toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
                toolKind,
                language: toolKind === 'terminal' ? getShellLanguage(e.data.toolName) : undefined,
                toolArguments: toolArgs,
                mcpServerName: e.data.mcpServerName,
                mcpToolName: e.data.mcpToolName,
                parentToolCallId: e.data.parentToolCallId,
            });
        }));
        this._register(wrapper.onTurnStart(e => {
            this._turnId = e.data.turnId;
        }));
        this._register(wrapper.onToolComplete(e => {
            const tracked = this._activeToolCalls.get(e.data.toolCallId);
            if (!tracked) {
                return;
            }
            this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
            this._activeToolCalls.delete(e.data.toolCallId);
            const displayName = tracked.displayName;
            const toolOutput = e.data.error?.message ?? e.data.result?.content;
            const content = [];
            if (toolOutput !== undefined) {
                content.push({ type: "text" /* ToolResultContentType.Text */, text: toolOutput });
            }
            // File edit data was already prepared by the onPostToolUse hook
            const filePath = isEditTool(tracked.toolName) ? getEditFilePath(tracked.parameters) : undefined;
            if (filePath) {
                const fileEdit = this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath);
                if (fileEdit) {
                    content.push(fileEdit);
                }
            }
            this._onDidSessionProgress.fire({
                session,
                type: 'tool_complete',
                toolCallId: e.data.toolCallId,
                result: {
                    success: e.data.success,
                    pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success),
                    content: content.length > 0 ? content : undefined,
                    error: e.data.error,
                },
                isUserRequested: e.data.isUserRequested,
                toolTelemetry: e.data.toolTelemetry !== undefined ? tryStringify(e.data.toolTelemetry) : undefined,
                parentToolCallId: e.data.parentToolCallId,
            });
        }));
        this._register(wrapper.onIdle(() => {
            this._logService.info(`[Copilot:${sessionId}] Session idle`);
            this._onDidSessionProgress.fire({ session, type: 'idle' });
        }));
        this._register(wrapper.onSessionError(e => {
            this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
            this._onDidSessionProgress.fire({
                session,
                type: 'error',
                errorType: e.data.errorType,
                message: e.data.message,
                stack: e.data.stack,
            });
        }));
        this._register(wrapper.onUsage(e => {
            this._logService.trace(`[Copilot:${sessionId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}`);
            this._onDidSessionProgress.fire({
                session,
                type: 'usage',
                inputTokens: e.data.inputTokens,
                outputTokens: e.data.outputTokens,
                model: e.data.model,
                cacheReadTokens: e.data.cacheReadTokens,
            });
        }));
        this._register(wrapper.onReasoningDelta(e => {
            this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
            this._onDidSessionProgress.fire({
                session,
                type: 'reasoning',
                content: e.data.deltaContent,
            });
        }));
    }
    _subscribeForLogging() {
        const wrapper = this._wrapper;
        const sessionId = this.sessionId;
        this._register(wrapper.onSessionStart(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? 'default'}, producer=${e.data.producer}`);
        }));
        this._register(wrapper.onSessionResume(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
        }));
        this._register(wrapper.onSessionInfo(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session info [${e.data.infoType}]: ${e.data.message}`);
        }));
        this._register(wrapper.onSessionModelChange(e => {
            this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? '(none)'} -> ${e.data.newModel}`);
        }));
        this._register(wrapper.onSessionHandoff(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? '(none)'}`);
        }));
        this._register(wrapper.onSessionTruncation(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
        }));
        this._register(wrapper.onSessionSnapshotRewind(e => {
            this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
        }));
        this._register(wrapper.onSessionShutdown(e => {
            this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, premiumRequests=${e.data.totalPremiumRequests}, apiDuration=${e.data.totalApiDurationMs}ms`);
        }));
        this._register(wrapper.onSessionUsageInfo(e => {
            this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
        }));
        this._register(wrapper.onSessionCompactionStart(() => {
            this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
        }));
        this._register(wrapper.onSessionCompactionComplete(e => {
            this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? '?'}`);
        }));
        this._register(wrapper.onUserMessage(e => {
            this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
        }));
        this._register(wrapper.onPendingMessagesModified(() => {
            this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
        }));
        this._register(wrapper.onTurnStart(e => {
            this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
        }));
        this._register(wrapper.onIntent(e => {
            this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
        }));
        this._register(wrapper.onReasoning(e => {
            this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
        }));
        this._register(wrapper.onTurnEnd(e => {
            this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
        }));
        this._register(wrapper.onAbort(e => {
            this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
        }));
        this._register(wrapper.onToolUserRequested(e => {
            this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
        }));
        this._register(wrapper.onToolPartialResult(e => {
            this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
        }));
        this._register(wrapper.onToolProgress(e => {
            this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
        }));
        this._register(wrapper.onSkillInvoked(e => {
            this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
        }));
        this._register(wrapper.onSubagentStarted(e => {
            this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
        }));
        this._register(wrapper.onSubagentCompleted(e => {
            this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
        }));
        this._register(wrapper.onSubagentFailed(e => {
            this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
        }));
        this._register(wrapper.onSubagentSelected(e => {
            this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
        }));
        this._register(wrapper.onHookStart(e => {
            this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
        }));
        this._register(wrapper.onHookEnd(e => {
            this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
        }));
        this._register(wrapper.onSystemMessage(e => {
            this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
        }));
    }
    // ---- cleanup ------------------------------------------------------------
    _denyPendingPermissions() {
        for (const [, deferred] of this._pendingPermissions) {
            deferred.complete(false);
        }
        this._pendingPermissions.clear();
    }
};
CopilotAgentSession = __decorate([
    __param(5, IFileService),
    __param(6, ILogService),
    __param(7, ISessionDataService)
], CopilotAgentSession);
export { CopilotAgentSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdEFnZW50U2Vzc2lvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdEFnZW50U2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbkUsT0FBTyxFQUFFLFVBQVUsRUFBYyxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBb0IsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUczRixPQUFPLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdE0sT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBbUJ6RCxTQUFTLFlBQVksQ0FBQyxLQUFjO0lBQ25DLElBQUksQ0FBQztRQUNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5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