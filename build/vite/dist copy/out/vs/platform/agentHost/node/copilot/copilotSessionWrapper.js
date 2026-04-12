/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
/**
 * Thin wrapper around {@link CopilotSession} that exposes each SDK event as a
 * proper VS Code `Event<T>`. All subscriptions and the underlying SDK session
 * are cleaned up on dispose.
 */
export class CopilotSessionWrapper extends Disposable {
    constructor(session) {
        super();
        this.session = session;
        this._register(toDisposable(() => {
            session.destroy().catch(() => { });
        }));
    }
    get sessionId() { return this.session.sessionId; }
    get onMessageDelta() {
        return this._onMessageDelta ??= this._sdkEvent('assistant.message_delta');
    }
    get onMessage() {
        return this._onMessage ??= this._sdkEvent('assistant.message');
    }
    get onToolStart() {
        return this._onToolStart ??= this._sdkEvent('tool.execution_start');
    }
    get onToolComplete() {
        return this._onToolComplete ??= this._sdkEvent('tool.execution_complete');
    }
    get onIdle() {
        return this._onIdle ??= this._sdkEvent('session.idle');
    }
    get onSessionStart() {
        return this._onSessionStart ??= this._sdkEvent('session.start');
    }
    get onSessionResume() {
        return this._onSessionResume ??= this._sdkEvent('session.resume');
    }
    get onSessionError() {
        return this._onSessionError ??= this._sdkEvent('session.error');
    }
    get onSessionInfo() {
        return this._onSessionInfo ??= this._sdkEvent('session.info');
    }
    get onSessionModelChange() {
        return this._onSessionModelChange ??= this._sdkEvent('session.model_change');
    }
    get onSessionHandoff() {
        return this._onSessionHandoff ??= this._sdkEvent('session.handoff');
    }
    get onSessionTruncation() {
        return this._onSessionTruncation ??= this._sdkEvent('session.truncation');
    }
    get onSessionSnapshotRewind() {
        return this._onSessionSnapshotRewind ??= this._sdkEvent('session.snapshot_rewind');
    }
    get onSessionShutdown() {
        return this._onSessionShutdown ??= this._sdkEvent('session.shutdown');
    }
    get onSessionUsageInfo() {
        return this._onSessionUsageInfo ??= this._sdkEvent('session.usage_info');
    }
    get onSessionCompactionStart() {
        return this._onSessionCompactionStart ??= this._sdkEvent('session.compaction_start');
    }
    get onSessionCompactionComplete() {
        return this._onSessionCompactionComplete ??= this._sdkEvent('session.compaction_complete');
    }
    get onUserMessage() {
        return this._onUserMessage ??= this._sdkEvent('user.message');
    }
    get onPendingMessagesModified() {
        return this._onPendingMessagesModified ??= this._sdkEvent('pending_messages.modified');
    }
    get onTurnStart() {
        return this._onTurnStart ??= this._sdkEvent('assistant.turn_start');
    }
    get onIntent() {
        return this._onIntent ??= this._sdkEvent('assistant.intent');
    }
    get onReasoning() {
        return this._onReasoning ??= this._sdkEvent('assistant.reasoning');
    }
    get onReasoningDelta() {
        return this._onReasoningDelta ??= this._sdkEvent('assistant.reasoning_delta');
    }
    get onTurnEnd() {
        return this._onTurnEnd ??= this._sdkEvent('assistant.turn_end');
    }
    get onUsage() {
        return this._onUsage ??= this._sdkEvent('assistant.usage');
    }
    get onAbort() {
        return this._onAbort ??= this._sdkEvent('abort');
    }
    get onToolUserRequested() {
        return this._onToolUserRequested ??= this._sdkEvent('tool.user_requested');
    }
    get onToolPartialResult() {
        return this._onToolPartialResult ??= this._sdkEvent('tool.execution_partial_result');
    }
    get onToolProgress() {
        return this._onToolProgress ??= this._sdkEvent('tool.execution_progress');
    }
    get onSkillInvoked() {
        return this._onSkillInvoked ??= this._sdkEvent('skill.invoked');
    }
    get onSubagentStarted() {
        return this._onSubagentStarted ??= this._sdkEvent('subagent.started');
    }
    get onSubagentCompleted() {
        return this._onSubagentCompleted ??= this._sdkEvent('subagent.completed');
    }
    get onSubagentFailed() {
        return this._onSubagentFailed ??= this._sdkEvent('subagent.failed');
    }
    get onSubagentSelected() {
        return this._onSubagentSelected ??= this._sdkEvent('subagent.selected');
    }
    get onHookStart() {
        return this._onHookStart ??= this._sdkEvent('hook.start');
    }
    get onHookEnd() {
        return this._onHookEnd ??= this._sdkEvent('hook.end');
    }
    get onSystemMessage() {
        return this._onSystemMessage ??= this._sdkEvent('system.message');
    }
    _sdkEvent(eventType) {
        const emitter = this._register(new Emitter());
        const unsubscribe = this.session.on(eventType, (data) => emitter.fire(data));
        this._register(toDisposable(unsubscribe));
        return emitter.event;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdFNlc3Npb25XcmFwcGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvY29waWxvdC9jb3BpbG90U2Vzc2lvbldyYXBwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxVQUFVO0lBRXBELFlBQXFCLE9BQXVCO1FBQzNDLEtBQUssRUFBRSxDQUFDO1FBRFksWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUFFM0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ2hDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsSUFBSSxTQUFTLEtBQWEsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFHMUQsSUFBSSxjQUFjO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLGVBQWUsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUdELElBQUksU0FBUztRQUNaLE9BQU8sSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUdELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLHNCQUFzQixD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