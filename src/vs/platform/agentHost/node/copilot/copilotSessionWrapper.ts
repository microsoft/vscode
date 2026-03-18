/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotSession, SessionEventPayload, SessionEventType } from '@github/copilot-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';

/**
 * Thin wrapper around {@link CopilotSession} that exposes each SDK event as a
 * proper VS Code `Event<T>`. All subscriptions and the underlying SDK session
 * are cleaned up on dispose.
 */
export class CopilotSessionWrapper extends Disposable {

	constructor(readonly session: CopilotSession) {
		super();
		this._register(toDisposable(() => {
			session.destroy().catch(() => { /* best-effort */ });
		}));
	}

	get sessionId(): string { return this.session.sessionId; }

	private _onMessageDelta: Event<SessionEventPayload<'assistant.message_delta'>> | undefined;
	get onMessageDelta(): Event<SessionEventPayload<'assistant.message_delta'>> {
		return this._onMessageDelta ??= this._sdkEvent('assistant.message_delta');
	}

	private _onMessage: Event<SessionEventPayload<'assistant.message'>> | undefined;
	get onMessage(): Event<SessionEventPayload<'assistant.message'>> {
		return this._onMessage ??= this._sdkEvent('assistant.message');
	}

	private _onToolStart: Event<SessionEventPayload<'tool.execution_start'>> | undefined;
	get onToolStart(): Event<SessionEventPayload<'tool.execution_start'>> {
		return this._onToolStart ??= this._sdkEvent('tool.execution_start');
	}

	private _onToolComplete: Event<SessionEventPayload<'tool.execution_complete'>> | undefined;
	get onToolComplete(): Event<SessionEventPayload<'tool.execution_complete'>> {
		return this._onToolComplete ??= this._sdkEvent('tool.execution_complete');
	}

	private _onIdle: Event<SessionEventPayload<'session.idle'>> | undefined;
	get onIdle(): Event<SessionEventPayload<'session.idle'>> {
		return this._onIdle ??= this._sdkEvent('session.idle');
	}

	private _onSessionStart: Event<SessionEventPayload<'session.start'>> | undefined;
	get onSessionStart(): Event<SessionEventPayload<'session.start'>> {
		return this._onSessionStart ??= this._sdkEvent('session.start');
	}

	private _onSessionResume: Event<SessionEventPayload<'session.resume'>> | undefined;
	get onSessionResume(): Event<SessionEventPayload<'session.resume'>> {
		return this._onSessionResume ??= this._sdkEvent('session.resume');
	}

	private _onSessionError: Event<SessionEventPayload<'session.error'>> | undefined;
	get onSessionError(): Event<SessionEventPayload<'session.error'>> {
		return this._onSessionError ??= this._sdkEvent('session.error');
	}

	private _onSessionInfo: Event<SessionEventPayload<'session.info'>> | undefined;
	get onSessionInfo(): Event<SessionEventPayload<'session.info'>> {
		return this._onSessionInfo ??= this._sdkEvent('session.info');
	}

	private _onSessionModelChange: Event<SessionEventPayload<'session.model_change'>> | undefined;
	get onSessionModelChange(): Event<SessionEventPayload<'session.model_change'>> {
		return this._onSessionModelChange ??= this._sdkEvent('session.model_change');
	}

	private _onSessionHandoff: Event<SessionEventPayload<'session.handoff'>> | undefined;
	get onSessionHandoff(): Event<SessionEventPayload<'session.handoff'>> {
		return this._onSessionHandoff ??= this._sdkEvent('session.handoff');
	}

	private _onSessionTruncation: Event<SessionEventPayload<'session.truncation'>> | undefined;
	get onSessionTruncation(): Event<SessionEventPayload<'session.truncation'>> {
		return this._onSessionTruncation ??= this._sdkEvent('session.truncation');
	}

	private _onSessionSnapshotRewind: Event<SessionEventPayload<'session.snapshot_rewind'>> | undefined;
	get onSessionSnapshotRewind(): Event<SessionEventPayload<'session.snapshot_rewind'>> {
		return this._onSessionSnapshotRewind ??= this._sdkEvent('session.snapshot_rewind');
	}

	private _onSessionShutdown: Event<SessionEventPayload<'session.shutdown'>> | undefined;
	get onSessionShutdown(): Event<SessionEventPayload<'session.shutdown'>> {
		return this._onSessionShutdown ??= this._sdkEvent('session.shutdown');
	}

	private _onSessionUsageInfo: Event<SessionEventPayload<'session.usage_info'>> | undefined;
	get onSessionUsageInfo(): Event<SessionEventPayload<'session.usage_info'>> {
		return this._onSessionUsageInfo ??= this._sdkEvent('session.usage_info');
	}

	private _onSessionCompactionStart: Event<SessionEventPayload<'session.compaction_start'>> | undefined;
	get onSessionCompactionStart(): Event<SessionEventPayload<'session.compaction_start'>> {
		return this._onSessionCompactionStart ??= this._sdkEvent('session.compaction_start');
	}

	private _onSessionCompactionComplete: Event<SessionEventPayload<'session.compaction_complete'>> | undefined;
	get onSessionCompactionComplete(): Event<SessionEventPayload<'session.compaction_complete'>> {
		return this._onSessionCompactionComplete ??= this._sdkEvent('session.compaction_complete');
	}

	private _onUserMessage: Event<SessionEventPayload<'user.message'>> | undefined;
	get onUserMessage(): Event<SessionEventPayload<'user.message'>> {
		return this._onUserMessage ??= this._sdkEvent('user.message');
	}

	private _onPendingMessagesModified: Event<SessionEventPayload<'pending_messages.modified'>> | undefined;
	get onPendingMessagesModified(): Event<SessionEventPayload<'pending_messages.modified'>> {
		return this._onPendingMessagesModified ??= this._sdkEvent('pending_messages.modified');
	}

	private _onTurnStart: Event<SessionEventPayload<'assistant.turn_start'>> | undefined;
	get onTurnStart(): Event<SessionEventPayload<'assistant.turn_start'>> {
		return this._onTurnStart ??= this._sdkEvent('assistant.turn_start');
	}

	private _onIntent: Event<SessionEventPayload<'assistant.intent'>> | undefined;
	get onIntent(): Event<SessionEventPayload<'assistant.intent'>> {
		return this._onIntent ??= this._sdkEvent('assistant.intent');
	}

	private _onReasoning: Event<SessionEventPayload<'assistant.reasoning'>> | undefined;
	get onReasoning(): Event<SessionEventPayload<'assistant.reasoning'>> {
		return this._onReasoning ??= this._sdkEvent('assistant.reasoning');
	}

	private _onReasoningDelta: Event<SessionEventPayload<'assistant.reasoning_delta'>> | undefined;
	get onReasoningDelta(): Event<SessionEventPayload<'assistant.reasoning_delta'>> {
		return this._onReasoningDelta ??= this._sdkEvent('assistant.reasoning_delta');
	}

	private _onTurnEnd: Event<SessionEventPayload<'assistant.turn_end'>> | undefined;
	get onTurnEnd(): Event<SessionEventPayload<'assistant.turn_end'>> {
		return this._onTurnEnd ??= this._sdkEvent('assistant.turn_end');
	}

	private _onUsage: Event<SessionEventPayload<'assistant.usage'>> | undefined;
	get onUsage(): Event<SessionEventPayload<'assistant.usage'>> {
		return this._onUsage ??= this._sdkEvent('assistant.usage');
	}

	private _onAbort: Event<SessionEventPayload<'abort'>> | undefined;
	get onAbort(): Event<SessionEventPayload<'abort'>> {
		return this._onAbort ??= this._sdkEvent('abort');
	}

	private _onToolUserRequested: Event<SessionEventPayload<'tool.user_requested'>> | undefined;
	get onToolUserRequested(): Event<SessionEventPayload<'tool.user_requested'>> {
		return this._onToolUserRequested ??= this._sdkEvent('tool.user_requested');
	}

	private _onToolPartialResult: Event<SessionEventPayload<'tool.execution_partial_result'>> | undefined;
	get onToolPartialResult(): Event<SessionEventPayload<'tool.execution_partial_result'>> {
		return this._onToolPartialResult ??= this._sdkEvent('tool.execution_partial_result');
	}

	private _onToolProgress: Event<SessionEventPayload<'tool.execution_progress'>> | undefined;
	get onToolProgress(): Event<SessionEventPayload<'tool.execution_progress'>> {
		return this._onToolProgress ??= this._sdkEvent('tool.execution_progress');
	}

	private _onSkillInvoked: Event<SessionEventPayload<'skill.invoked'>> | undefined;
	get onSkillInvoked(): Event<SessionEventPayload<'skill.invoked'>> {
		return this._onSkillInvoked ??= this._sdkEvent('skill.invoked');
	}

	private _onSubagentStarted: Event<SessionEventPayload<'subagent.started'>> | undefined;
	get onSubagentStarted(): Event<SessionEventPayload<'subagent.started'>> {
		return this._onSubagentStarted ??= this._sdkEvent('subagent.started');
	}

	private _onSubagentCompleted: Event<SessionEventPayload<'subagent.completed'>> | undefined;
	get onSubagentCompleted(): Event<SessionEventPayload<'subagent.completed'>> {
		return this._onSubagentCompleted ??= this._sdkEvent('subagent.completed');
	}

	private _onSubagentFailed: Event<SessionEventPayload<'subagent.failed'>> | undefined;
	get onSubagentFailed(): Event<SessionEventPayload<'subagent.failed'>> {
		return this._onSubagentFailed ??= this._sdkEvent('subagent.failed');
	}

	private _onSubagentSelected: Event<SessionEventPayload<'subagent.selected'>> | undefined;
	get onSubagentSelected(): Event<SessionEventPayload<'subagent.selected'>> {
		return this._onSubagentSelected ??= this._sdkEvent('subagent.selected');
	}

	private _onHookStart: Event<SessionEventPayload<'hook.start'>> | undefined;
	get onHookStart(): Event<SessionEventPayload<'hook.start'>> {
		return this._onHookStart ??= this._sdkEvent('hook.start');
	}

	private _onHookEnd: Event<SessionEventPayload<'hook.end'>> | undefined;
	get onHookEnd(): Event<SessionEventPayload<'hook.end'>> {
		return this._onHookEnd ??= this._sdkEvent('hook.end');
	}

	private _onSystemMessage: Event<SessionEventPayload<'system.message'>> | undefined;
	get onSystemMessage(): Event<SessionEventPayload<'system.message'>> {
		return this._onSystemMessage ??= this._sdkEvent('system.message');
	}

	private _sdkEvent<K extends SessionEventType>(eventType: K): Event<SessionEventPayload<K>> {
		const emitter = this._register(new Emitter<SessionEventPayload<K>>());
		const unsubscribe = this.session.on(eventType, (data: SessionEventPayload<K>) => emitter.fire(data));
		this._register(toDisposable(unsubscribe));
		return emitter.event;
	}
}
