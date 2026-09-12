/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent, SessionEventPayload, SessionEventType } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import type { AgentTurnProviderSessionState } from '../../common/agent.js';

/** Live SDK notifications received before the owning chat has installed its handlers. */
export class CopilotSessionEventBuffer {
	private _events: SessionEvent[] = [];
	private _length = 0;
	private _overflow = false;
	private _claimed = false;

	capture(event: SessionEvent): void {
		if (!this._claimed) {
			this.append(event);
		}
	}

	claim(): void {
		this._claimed = true;
	}

	append(event: SessionEvent): void {
		if (this._overflow) {
			return;
		}
		this._length += JSON.stringify(event).length;
		if (this._events.length >= 1024 || this._length > 8 * 1024 * 1024) {
			this._events = [];
			this._overflow = true;
			return;
		}
		this._events.push(event);
	}

	take(): readonly SessionEvent[] {
		if (this._overflow) {
			throw new Error('Early SDK notifications exceeded the bounded buffer. The chat must be reconciled without replaying effects.');
		}
		const events = this._events;
		this._events = [];
		this._length = 0;
		return events;
	}
}

export type CopilotModelCallFinishedOutcome = 'success' | 'error' | 'cancelled' | 'rejected';

export interface ICopilotModelCallFinishedEvent {
	readonly id: string;
	readonly agentId?: string;
	readonly data: {
		readonly turnId: string;
		readonly interactionId?: string;
		readonly dispatchDurationMs: number;
		readonly outcome: CopilotModelCallFinishedOutcome;
		readonly containsBuiltInFileEditRequest?: boolean;
		readonly editClassifierVersion: number;
	};
}

/**
 * Thin wrapper around {@link CopilotSession} that exposes each SDK event as a
 * proper VS Code `Event<T>`. All subscriptions and the underlying SDK session
 * are cleaned up on dispose.
 */
export class CopilotSessionWrapper extends Disposable {

	private readonly _handledEventTypes = new Set<SessionEventType>();
	private readonly _onUnhandledEvent = this._register(new Emitter<SessionEvent>());
	readonly onUnhandledEvent = this._onUnhandledEvent.event;
	private readonly _onModelCallFinished = this._register(new Emitter<ICopilotModelCallFinishedEvent>());
	readonly onModelCallFinished = this._onModelCallFinished.event;
	private readonly _shutdown = new DeferredPromise<void>();
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;
	private _disconnectPromise: Promise<void> | undefined;
	private _disconnectCompleted = false;
	private readonly _eventDispatchers = new Map<SessionEventType, (event: SessionEvent) => void>();
	private readonly _ready = new DeferredPromise<CopilotSession | undefined>();
	readonly whenReady = this._ready.p;
	private readonly _sessionId: string;
	private _session: CopilotSession | undefined;
	private _earlyEvents: CopilotSessionEventBuffer | undefined;
	private _acknowledgements = 0;
	private _acknowledged: DeferredPromise<void> | undefined;
	private _observationError: unknown;
	private _observationFailed = false;
	readonly acceptsExternalMessages: boolean;

	constructor(session: CopilotSession | string, earlyEvents?: CopilotSessionEventBuffer) {
		super();
		this._sessionId = typeof session === 'string' ? session : session.sessionId;
		this._earlyEvents = earlyEvents;
		earlyEvents?.claim();
		this.acceptsExternalMessages = typeof session === 'string' || earlyEvents !== undefined;
		this._register(toDisposable(() => { this._earlyEvents = undefined; }));
		if (typeof session !== 'string') {
			this._attach(session);
		}
		this._register(toDisposable(() => {
			void this.disconnect().catch(() => { /* best-effort */ });
		}));
	}

	get isReady(): boolean { return this._session !== undefined; }
	get session(): CopilotSession {
		if (!this._session) {
			throw new Error('The SDK session is not ready.');
		}
		return this._session;
	}

	/** Attaches the public SDK object after create/resume; early events already have live host listeners. */
	async attachSession(session: CopilotSession): Promise<void> {
		if (this._store.isDisposed) {
			await session.disconnect();
			throw new CancellationError();
		}
		if (this._session || session.sessionId !== this._sessionId) {
			throw new Error('The SDK session does not match its pending event owner.');
		}
		this._attach(session);
	}

	private _attach(session: CopilotSession): void {
		this._session = session;
		this._register(toDisposable(session.on(event => this.acceptSessionEvent(event))));
		void this._ready.complete(session);
	}

	acceptSessionEvent(event: SessionEvent): void {
		if (this._store.isDisposed) {
			return;
		}
		if (event.type === 'session.shutdown') {
			void this._shutdown.complete();
		}
		if (this._earlyEvents) {
			this._earlyEvents.append(event);
		} else {
			this._dispatch(event);
		}
	}

	/** Defers observations until a send acknowledgement supplies its real SDK message IDs. */
	bufferEventsUntilAcknowledged(): IDisposable {
		if (this._earlyEvents && !this._acknowledged) {
			throw new Error('The SDK observation buffer already has an owner.');
		}
		this._acknowledged ??= new DeferredPromise<void>();
		this._earlyEvents ??= new CopilotSessionEventBuffer();
		this._earlyEvents.claim();
		this._acknowledgements++;
		return toDisposable(() => {
			if (--this._acknowledgements === 0) {
				const acknowledged = this._acknowledged;
				this._acknowledged = undefined;
				try {
					this.releaseBufferedEvents();
				} catch (error) {
					this._observationError = error;
					this._observationFailed = true;
					throw error;
				} finally {
					void acknowledged?.complete();
				}
			}
		});
	}

	async whenMessagesAcknowledged(): Promise<void> {
		await this._acknowledged?.p;
		if (this._observationFailed) {
			throw this._observationError;
		}
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	/** Replays observations only, after all chat handlers exist; never reissues an SDK operation. */
	releaseBufferedEvents(): void {
		if (!this._earlyEvents || this._acknowledgements > 0) {
			return;
		}
		const buffer = this._earlyEvents;
		this._earlyEvents = undefined;
		const events = buffer.take();
		for (const event of events) {
			this._dispatch(event);
		}
	}

	private _dispatch(event: SessionEvent): void {
		const modelCallFinished = parseModelCallFinishedEvent(event);
		if (modelCallFinished) {
			this._onModelCallFinished.fire(modelCallFinished);
		} else if (!this._handledEventTypes.has(event.type)) {
			this._onUnhandledEvent.fire(event);
		}
		this._eventDispatchers.get(event.type)?.(event);
	}

	get sessionId(): string { return this._sessionId; }
	override dispose(): void {
		if (!this._store.isDisposed) {
			void this._acknowledged?.complete();
			if (!this._ready.isSettled) {
				void this._ready.complete(undefined);
			}
			this._onDidDispose.fire();
		}
		super.dispose();
	}
	get lifecycleState(): AgentTurnProviderSessionState {
		return this._shutdown.isSettled
			? 'shutdown'
			: this._disconnectCompleted
				? 'disconnected'
				: this._disconnectPromise
					? 'disconnecting'
					: 'active';
	}

	/** Disconnects once the request completes or the SDK reports session shutdown. */
	disconnect(): Promise<void> {
		if (!this._session) {
			this._disconnectCompleted = true;
			return Promise.resolve();
		}
		if (this._shutdown.isSettled) {
			return this._shutdown.p;
		}
		if (!this._disconnectPromise) {
			const disconnectPromise = this.session.disconnect()
				.then(() => { this._disconnectCompleted = true; })
				.catch(error => {
					if (!this._shutdown.isSettled) {
						if (this._disconnectPromise === disconnectPromise) {
							this._disconnectPromise = undefined;
						}
						throw error;
					}
				});
			this._disconnectPromise = disconnectPromise;
		}
		return Promise.race([this._disconnectPromise, this._shutdown.p]);
	}

	private _onMessageDelta: Event<SessionEventPayload<'assistant.message_delta'>> | undefined;
	get onMessageDelta(): Event<SessionEventPayload<'assistant.message_delta'>> {
		return this._onMessageDelta ??= this._sdkEvent('assistant.message_delta');
	}

	private _onMessage: Event<SessionEventPayload<'assistant.message'>> | undefined;
	get onMessage(): Event<SessionEventPayload<'assistant.message'>> {
		return this._onMessage ??= this._sdkEvent('assistant.message');
	}

	private _onToolCallDelta: Event<SessionEventPayload<'assistant.tool_call_delta'>> | undefined;
	get onToolCallDelta(): Event<SessionEventPayload<'assistant.tool_call_delta'>> {
		return this._onToolCallDelta ??= this._sdkEvent('assistant.tool_call_delta');
	}

	private _onToolStart: Event<SessionEventPayload<'tool.execution_start'>> | undefined;
	get onToolStart(): Event<SessionEventPayload<'tool.execution_start'>> {
		return this._onToolStart ??= this._sdkEvent('tool.execution_start');
	}

	private _onToolComplete: Event<SessionEventPayload<'tool.execution_complete'>> | undefined;
	get onToolComplete(): Event<SessionEventPayload<'tool.execution_complete'>> {
		return this._onToolComplete ??= this._sdkEvent('tool.execution_complete');
	}

	private _onPermissionRequested: Event<SessionEventPayload<'permission.requested'>> | undefined;
	get onPermissionRequested(): Event<SessionEventPayload<'permission.requested'>> {
		return this._onPermissionRequested ??= this._sdkEvent('permission.requested');
	}

	private _onPermissionCompleted: Event<SessionEventPayload<'permission.completed'>> | undefined;
	get onPermissionCompleted(): Event<SessionEventPayload<'permission.completed'>> {
		return this._onPermissionCompleted ??= this._sdkEvent('permission.completed');
	}

	private _onSamplingRequested: Event<SessionEventPayload<'sampling.requested'>> | undefined;
	get onSamplingRequested(): Event<SessionEventPayload<'sampling.requested'>> {
		return this._onSamplingRequested ??= this._sdkEvent('sampling.requested');
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

	private _onSessionWarning: Event<SessionEventPayload<'session.warning'>> | undefined;
	get onSessionWarning(): Event<SessionEventPayload<'session.warning'>> {
		return this._onSessionWarning ??= this._sdkEvent('session.warning');
	}

	private _onSessionModelChange: Event<SessionEventPayload<'session.model_change'>> | undefined;
	get onSessionModelChange(): Event<SessionEventPayload<'session.model_change'>> {
		return this._onSessionModelChange ??= this._sdkEvent('session.model_change');
	}

	private _onAutoModeResolved: Event<SessionEventPayload<'session.auto_mode_resolved'>> | undefined;
	get onAutoModeResolved(): Event<SessionEventPayload<'session.auto_mode_resolved'>> {
		return this._onAutoModeResolved ??= this._sdkEvent('session.auto_mode_resolved');
	}

	private _onManagedSettingsResolved: Event<SessionEventPayload<'session.managed_settings_resolved'>> | undefined;
	get onManagedSettingsResolved(): Event<SessionEventPayload<'session.managed_settings_resolved'>> {
		return this._onManagedSettingsResolved ??= this._sdkEvent('session.managed_settings_resolved');
	}

	private _onManagedSettingsEnforced: Event<SessionEventPayload<'session.managed_settings_enforced'>> | undefined;
	get onManagedSettingsEnforced(): Event<SessionEventPayload<'session.managed_settings_enforced'>> {
		return this._onManagedSettingsEnforced ??= this._sdkEvent('session.managed_settings_enforced');
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

	private _onModelCallFailure: Event<SessionEventPayload<'model.call_failure'>> | undefined;
	get onModelCallFailure(): Event<SessionEventPayload<'model.call_failure'>> {
		return this._onModelCallFailure ??= this._sdkEvent('model.call_failure');
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

	private _onSystemNotification: Event<SessionEventPayload<'system.notification'>> | undefined;
	get onSystemNotification(): Event<SessionEventPayload<'system.notification'>> {
		return this._onSystemNotification ??= this._sdkEvent('system.notification');
	}

	private _onSessionModeChanged: Event<SessionEventPayload<'session.mode_changed'>> | undefined;
	get onSessionModeChanged(): Event<SessionEventPayload<'session.mode_changed'>> {
		return this._onSessionModeChanged ??= this._sdkEvent('session.mode_changed');
	}

	private _onMcpServersLoaded: Event<SessionEventPayload<'session.mcp_servers_loaded'>> | undefined;
	get onMcpServersLoaded(): Event<SessionEventPayload<'session.mcp_servers_loaded'>> {
		return this._onMcpServersLoaded ??= this._sdkEvent('session.mcp_servers_loaded');
	}

	private _onMcpServerStatusChanged: Event<SessionEventPayload<'session.mcp_server_status_changed'>> | undefined;
	get onMcpServerStatusChanged(): Event<SessionEventPayload<'session.mcp_server_status_changed'>> {
		return this._onMcpServerStatusChanged ??= this._sdkEvent('session.mcp_server_status_changed');
	}

	private _onToolsUpdated: Event<SessionEventPayload<'session.tools_updated'>> | undefined;
	get onToolsUpdated(): Event<SessionEventPayload<'session.tools_updated'>> {
		return this._onToolsUpdated ??= this._sdkEvent('session.tools_updated');
	}

	private _onBackgroundTasksChanged: Event<SessionEventPayload<'session.background_tasks_changed'>> | undefined;
	get onBackgroundTasksChanged(): Event<SessionEventPayload<'session.background_tasks_changed'>> {
		return this._onBackgroundTasksChanged ??= this._sdkEvent('session.background_tasks_changed');
	}

	private _onCommandsChanged: Event<SessionEventPayload<'commands.changed'>> | undefined;
	get onCommandsChanged(): Event<SessionEventPayload<'commands.changed'>> {
		return this._onCommandsChanged ??= this._sdkEvent('commands.changed');
	}

	private _sdkEvent<K extends SessionEventType>(eventType: K): Event<SessionEventPayload<K>> {
		const emitter = this._register(new Emitter<SessionEventPayload<K>>({
			onDidAddFirstListener: () => this._handledEventTypes.add(eventType),
			onDidRemoveLastListener: () => this._handledEventTypes.delete(eventType),
		}));
		const matches = (event: SessionEvent): event is SessionEventPayload<K> => event.type === eventType;
		this._eventDispatchers.set(eventType, event => {
			if (matches(event)) {
				emitter.fire(event);
			}
		});
		this._register(toDisposable(() => this._eventDispatchers.delete(eventType)));
		return emitter.event;
	}
}

function parseModelCallFinishedEvent(event: unknown): ICopilotModelCallFinishedEvent | undefined {
	if (!isRecord(event) || event.type !== 'model.call_finished' || event.ephemeral !== true || typeof event.id !== 'string' || !isRecord(event.data)) {
		return undefined;
	}
	const data = event.data;
	if (
		typeof data.turnId !== 'string'
		|| (data.interactionId !== undefined && typeof data.interactionId !== 'string')
		|| typeof data.dispatchDurationMs !== 'number'
		|| !Number.isFinite(data.dispatchDurationMs)
		|| data.dispatchDurationMs < 0
		|| !isModelCallFinishedOutcome(data.outcome)
		|| typeof data.editClassifierVersion !== 'number'
		|| !Number.isInteger(data.editClassifierVersion)
		|| data.editClassifierVersion < 1
		|| (data.containsBuiltInFileEditRequest !== undefined && typeof data.containsBuiltInFileEditRequest !== 'boolean')
		|| (event.agentId !== undefined && typeof event.agentId !== 'string')
	) {
		return undefined;
	}
	return {
		id: event.id,
		agentId: event.agentId,
		data: {
			turnId: data.turnId,
			interactionId: data.interactionId,
			dispatchDurationMs: data.dispatchDurationMs,
			outcome: data.outcome,
			containsBuiltInFileEditRequest: data.containsBuiltInFileEditRequest,
			editClassifierVersion: data.editClassifierVersion,
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isModelCallFinishedOutcome(value: unknown): value is CopilotModelCallFinishedOutcome {
	return value === 'success' || value === 'error' || value === 'cancelled' || value === 'rejected';
}
