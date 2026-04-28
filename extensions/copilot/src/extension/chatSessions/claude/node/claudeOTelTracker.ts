/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { CopilotChatAttr, emitSessionStartEvent, GenAiAttr, GenAiMetrics, GenAiOperationName, GenAiProviderName, IOTelService, type ISpanHandle, SpanKind, SpanStatusCode, type TraceContext, truncateForOTel } from '../../../../platform/otel/common/index';
import { IClaudeSessionStateService } from '../common/claudeSessionStateService';

/**
 * Manages OTel span lifecycle for a Claude agent session.
 *
 * Extracted from ClaudeCodeSession to keep tracing concerns separate from
 * session orchestration. Tracks the invoke_agent root span, accumulates
 * parent-only token usage, and manages trace context for subagent nesting.
 */
export class ClaudeOTelTracker {
	private _currentSpan: ISpanHandle | undefined;
	private _currentTraceContext: TraceContext | undefined;
	private _startTime: number | undefined;
	private _isFirstRequest = true;
	private _turnCount = 0;
	private _parentInputTokens = 0;
	private _parentOutputTokens = 0;
	private _parentCacheReadTokens = 0;
	private _parentCacheCreationTokens = 0;

	constructor(
		private readonly _sessionId: string,
		private readonly _otelService: IOTelService,
		private readonly _sessionStateService: IClaudeSessionStateService,
	) { }

	/** The trace context of the current invoke_agent span, used to parent child spans. */
	get traceContext(): TraceContext | undefined {
		return this._currentTraceContext;
	}

	/**
	 * Starts a new invoke_agent span for a user request.
	 * Ends any previous span and resets accumulators.
	 */
	startRequest(modelId: string): void {
		this.endRequest();

		this._currentSpan = this._otelService.startSpan('invoke_agent claude', {
			kind: SpanKind.INTERNAL,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.AGENT_NAME]: 'claude',
				[GenAiAttr.PROVIDER_NAME]: GenAiProviderName.GITHUB,
				[GenAiAttr.CONVERSATION_ID]: this._sessionId,
				[CopilotChatAttr.SESSION_ID]: this._sessionId,
				[CopilotChatAttr.CHAT_SESSION_ID]: this._sessionId,
				[GenAiAttr.REQUEST_MODEL]: modelId,
			},
		});
		this._currentTraceContext = this._currentSpan.getSpanContext();
		this._startTime = Date.now();
		this._turnCount = 0;
		this._parentInputTokens = 0;
		this._parentOutputTokens = 0;
		this._parentCacheReadTokens = 0;
		this._parentCacheCreationTokens = 0;

		// Store trace context so the language model server can parent chat spans
		this._sessionStateService.setTraceContextForSession(this._sessionId, this._currentTraceContext);

		// Emit session start event and metric for the first request
		if (this._isFirstRequest) {
			this._isFirstRequest = false;
			GenAiMetrics.incrementSessionCount(this._otelService);
			emitSessionStartEvent(this._otelService, this._sessionId, modelId, 'claude');
		}
	}

	/**
	 * Emits a user_message span event for the debug panel.
	 */
	emitUserMessage(promptLabel: string): void {
		const userMsgSpan = this._otelService.startSpan('user_message', {
			kind: SpanKind.INTERNAL,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: 'user_message',
				[CopilotChatAttr.CHAT_SESSION_ID]: this._sessionId,
			},
			parentTraceContext: this._currentTraceContext,
		});
		const userContent = truncateForOTel(promptLabel);
		userMsgSpan.setAttribute(CopilotChatAttr.USER_REQUEST, userContent);
		userMsgSpan.addEvent('user_message', { content: userContent, [CopilotChatAttr.CHAT_SESSION_ID]: this._sessionId });
		userMsgSpan.end();
	}

	/**
	 * Processes an SDK message for OTel tracking.
	 * Call this for every message in the processing loop.
	 */
	onMessage(message: SDKMessage, subagentTraceContexts: Map<string, TraceContext>): void {
		if (message.type === 'assistant') {
			this._turnCount++;
			this._accumulateParentTokenUsage(message);
		}

		if (message.type === 'result' && this._currentSpan) {
			this._setResultAttributes(message);
		}

		this._updateTraceContextForMessage(message, subagentTraceContexts);
	}

	/**
	 * Ends the current invoke_agent span with OK status and records metrics.
	 */
	endRequest(): void {
		this._endSpan();
	}

	/**
	 * Ends the current invoke_agent span with ERROR status.
	 */
	endRequestWithError(message: string): void {
		this._endSpan(SpanStatusCode.ERROR, message);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private _endSpan(statusCode?: SpanStatusCode, statusMessage?: string): void {
		if (!this._currentSpan) {
			return;
		}
		const span = this._currentSpan;
		span.setAttribute(CopilotChatAttr.TURN_COUNT, this._turnCount);

		// Set parent-only token usage (comparable with foreground agent).
		span.setAttributes({
			[GenAiAttr.USAGE_INPUT_TOKENS]: this._parentInputTokens,
			[GenAiAttr.USAGE_OUTPUT_TOKENS]: this._parentOutputTokens,
			...(this._parentCacheReadTokens ? { [GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS]: this._parentCacheReadTokens } : {}),
			...(this._parentCacheCreationTokens ? { [GenAiAttr.USAGE_CACHE_CREATION_INPUT_TOKENS]: this._parentCacheCreationTokens } : {}),
		});

		if (statusCode !== undefined) {
			span.setStatus(statusCode, statusMessage);
		} else {
			span.setStatus(SpanStatusCode.OK);
		}
		span.end();

		// Record agent-level metrics
		if (this._startTime) {
			const durationSec = (Date.now() - this._startTime) / 1000;
			GenAiMetrics.recordAgentDuration(this._otelService, 'claude', durationSec);
		}
		GenAiMetrics.recordAgentTurnCount(this._otelService, 'claude', this._turnCount);

		this._currentSpan = undefined;
		this._currentTraceContext = undefined;
		this._startTime = undefined;
		this._sessionStateService.setTraceContextForSession(this._sessionId, undefined);
	}

	/**
	 * Accumulates parent-only token usage from an assistant message.
	 * Excludes subagent turns so gen_ai.usage.* on the root span is comparable
	 * with the foreground agent.
	 */
	private _accumulateParentTokenUsage(message: SDKMessage & { type: 'assistant' }): void {
		if (message.parent_tool_use_id) {
			return;
		}
		const msgUsage = message.message?.usage;
		if (msgUsage) {
			this._parentInputTokens += (msgUsage.input_tokens ?? 0)
				+ (msgUsage.cache_creation_input_tokens ?? 0)
				+ (msgUsage.cache_read_input_tokens ?? 0);
			this._parentOutputTokens += (msgUsage.output_tokens ?? 0);
			this._parentCacheReadTokens += (msgUsage.cache_read_input_tokens ?? 0);
			this._parentCacheCreationTokens += (msgUsage.cache_creation_input_tokens ?? 0);
		}
	}

	/**
	 * Sets cost, turn count, and response model on the invoke_agent span from a result message.
	 */
	private _setResultAttributes(message: SDKMessage & { type: 'result' }): void {
		if (!this._currentSpan) {
			return;
		}
		if (message.num_turns !== undefined) {
			this._currentSpan.setAttribute(CopilotChatAttr.TURN_COUNT, message.num_turns);
		}
		if (message.total_cost_usd !== undefined) {
			this._currentSpan.setAttribute('copilot_chat.total_cost_usd', message.total_cost_usd);
		}
		const responseModel = message.modelUsage ? Object.keys(message.modelUsage)[0] : undefined;
		if (responseModel) {
			this._currentSpan.setAttribute(GenAiAttr.RESPONSE_MODEL, responseModel);
		}
	}

	/**
	 * Updates the session trace context based on whether a message is from a subagent.
	 * Ensures chat spans created by chatMLFetcher are parented under the correct
	 * Agent tool span during subagent execution.
	 */
	private _updateTraceContextForMessage(message: SDKMessage, subagentTraceContexts: Map<string, TraceContext>): void {
		if (!('parent_tool_use_id' in message)) {
			return;
		}
		if (message.parent_tool_use_id) {
			const subagentCtx = subagentTraceContexts.get(message.parent_tool_use_id);
			if (subagentCtx) {
				this._sessionStateService.setTraceContextForSession(this._sessionId, subagentCtx);
			}
		} else {
			this._sessionStateService.setTraceContextForSession(this._sessionId, this._currentTraceContext);
		}
	}
}
