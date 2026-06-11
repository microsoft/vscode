/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { GenAiAttr, GenAiOperationName } from '../../../otel/common/genAiAttributes.js';
import { ICompletedSpanData, SpanStatusCode } from '../../../otel/common/spanData.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IAgentHostOTelSpanConsumer } from '../../common/otel/agentHostOTelSpanConsumer.js';

function getString(span: ICompletedSpanData, key: string): string | undefined {
	const v = span.attributes[key];
	return typeof v === 'string' ? v : undefined;
}

function getNumber(span: ICompletedSpanData, key: string): number | undefined {
	const v = span.attributes[key];
	return typeof v === 'number' ? v : undefined;
}

/** `gen_ai.response.finish_reasons` is an array per semconv but some emitters serialize as a string. */
function getFinishReason(span: ICompletedSpanData): string | undefined {
	const v = span.attributes[GenAiAttr.RESPONSE_FINISH_REASONS];
	if (Array.isArray(v)) {
		const first = v[0];
		return typeof first === 'string' ? first : undefined;
	}
	return typeof v === 'string' ? v : undefined;
}

/** `gen_ai.response.time_to_first_chunk` is in seconds; convert to ms. */
function getTtftMs(span: ICompletedSpanData): number | undefined {
	const seconds = getNumber(span, GenAiAttr.RESPONSE_TIME_TO_FIRST_CHUNK);
	return seconds === undefined ? undefined : Math.round(seconds * 1000);
}

/**
 * Per-invocation event sent when any `invoke_agent` span ends. Fires once for
 * the root invocation (the user-initiated turn) and once for each subagent
 * invocation inside it.
 */
export interface IAgentHostInvokeAgentCompletedEvent {
	traceId: string;
	spanId: string;
	parentSpanId: string;
	isRoot: boolean;
	provider: string | undefined;
	agentId: string | undefined;
	agentName: string | undefined;
	agentType: string | undefined;
	model: string | undefined;
	totalDurationMs: number;
	finishReason: string | undefined;
	inputTokensTotal: number | undefined;
	outputTokensTotal: number | undefined;
	cacheReadTokensTotal: number | undefined;
	cacheCreationTokensTotal: number | undefined;
	reasoningTokensTotal: number | undefined;
	cost: number | undefined;
	aiu: number | undefined;
	turnCount: number | undefined;
	hasError: boolean;
}

export type IAgentHostInvokeAgentCompletedClassification = {
	traceId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel trace id; high-cardinality but non-PII. Joins with other agentHost.* events from the same turn.' };
	spanId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel span id for this invoke_agent.' };
	parentSpanId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel parent span id. Empty string for the root invocation; for subagents this is the execute_tool span that invoked it.' };
	isRoot: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'True iff this is the user-initiated root invocation (no parent span).' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.provider.name attribute (e.g. github, anthropic).' };
	agentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.agent.id attribute (e.g. builtin:explore, github.copilot.default).' };
	agentName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.agent.name attribute (e.g. explore, general-purpose). Undefined on the root in current SDKs.' };
	agentType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Copilot github.copilot.agent.type attribute (e.g. builtin).' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.request.model attribute — the model the SDK asked for. May differ from what actually ran (see agentHost.chatCompleted.responseModel).' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock duration of this invoke_agent span in milliseconds.' };
	finishReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'First entry of gen_ai.response.finish_reasons on this invoke_agent span (e.g. stop, tool_calls, length).' };
	inputTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.input_tokens on this invoke_agent span — SDK-rolled-up sum across its direct chat children only.' };
	outputTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.output_tokens on this invoke_agent span.' };
	cacheReadTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.cache_read.input_tokens on this invoke_agent span.' };
	cacheCreationTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.cache_creation.input_tokens on this invoke_agent span.' };
	reasoningTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.reasoning.output_tokens on this invoke_agent span.' };
	cost: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'github.copilot.cost — SDK-reported integer billing units for this invocation. Opaque denomination.' };
	aiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'github.copilot.aiu — SDK-reported AI Usage Units for this invocation. Opaque denomination.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'github.copilot.turn_count — number of LLM round-trips inside this invocation. Typically only present on the root.' };
	hasError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the invoke_agent span ended with ERROR status. 1 = error, 0 = ok.' };
	owner: 'roblourens';
	comment: 'Per-invocation summary emitted whenever an @github/copilot-sdk invoke_agent span ends in the agent host. Fires once for the user-initiated root turn (isRoot=true) and once for each subagent invocation (isRoot=false) within the same trace.';
};

/**
 * Per-LLM-call event sent when any `chat` span ends. One event per HTTP round-trip
 * to a model — analogous to the chat extension's `response.success`.
 */
export interface IAgentHostChatCompletedEvent {
	traceId: string;
	spanId: string;
	parentSpanId: string;
	provider: string | undefined;
	requestModel: string | undefined;
	responseModel: string | undefined;
	totalDurationMs: number;
	serverDurationMs: number | undefined;
	ttftMs: number | undefined;
	finishReason: string | undefined;
	inputTokens: number | undefined;
	outputTokens: number | undefined;
	cacheReadTokens: number | undefined;
	cacheCreationTokens: number | undefined;
	reasoningTokens: number | undefined;
	cost: number | undefined;
	aiu: number | undefined;
	initiator: string | undefined;
	interactionId: string | undefined;
	hasError: boolean;
}

export type IAgentHostChatCompletedClassification = {
	traceId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel trace id; joins with the owning agentHost.invokeAgentCompleted event.' };
	spanId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel span id for this chat call.' };
	parentSpanId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'OTel parent span id — the invoke_agent that owns this call. Join key.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.provider.name (e.g. github, anthropic).' };
	requestModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'gen_ai.request.model — what the SDK asked for.' };
	responseModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'gen_ai.response.model — what actually ran. Can differ from requestModel when fallback routing applies.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock span duration in milliseconds.' };
	serverDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'github.copilot.server_duration — SDK-reported server-side duration in milliseconds.' };
	ttftMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'gen_ai.response.time_to_first_chunk (seconds, converted to ms) — server-measured TTFT for this call.' };
	finishReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'First entry of gen_ai.response.finish_reasons (e.g. stop, tool_calls, length).' };
	inputTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.input_tokens for this call.' };
	outputTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.output_tokens for this call.' };
	cacheReadTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.cache_read.input_tokens for this call.' };
	cacheCreationTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.cache_creation.input_tokens for this call.' };
	reasoningTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'gen_ai.usage.reasoning.output_tokens for this call.' };
	cost: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'github.copilot.cost — SDK-reported integer billing units for this call. Opaque denomination.' };
	aiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'github.copilot.aiu — SDK-reported AI Usage Units for this call. Opaque denomination.' };
	initiator: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'github.copilot.initiator — user for the first call of a turn, agent for follow-ups.' };
	interactionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'github.copilot.interaction_id — joins this call with its retries.' };
	hasError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the chat span ended with ERROR status. 1 = error, 0 = ok.' };
	owner: 'roblourens';
	comment: 'Per-LLM-call event emitted whenever an @github/copilot-sdk chat span ends in the agent host. Mirrors the chat extension\'s response.success — one event per HTTP round-trip to a model.';
};

/**
 * Routes OTel spans the agent-host SDK emits to standard VS Code telemetry.
 * See [OTEL.md](../../OTEL.md) for event shapes and the relationship to
 * `agentHost.turnCompleted`.
 */
export class AgentHostSpanTelemetryConsumer extends Disposable implements IAgentHostOTelSpanConsumer {

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onSpan(span: ICompletedSpanData): void {
		try {
			this._logSpan(span);

			const op = getString(span, GenAiAttr.OPERATION_NAME) ?? this._operationFromSpanName(span.name);
			switch (op) {
				case GenAiOperationName.INVOKE_AGENT:
					this._emitInvokeAgentEvent(span);
					break;
				case GenAiOperationName.CHAT:
					this._emitChatEvent(span);
					break;
			}
		} catch (err) {
			// Never throw from a span callback — the receiver pipeline must stay up.
			this._logService.warn('[agentHost.otel] span telemetry consumer threw', err);
		}
	}

	private _emitInvokeAgentEvent(span: ICompletedSpanData): void {
		const totalDurationMs = Math.max(0, span.endTime - span.startTime);
		this._telemetryService.publicLog2<IAgentHostInvokeAgentCompletedEvent, IAgentHostInvokeAgentCompletedClassification>(
			'agentHost.invokeAgentCompleted',
			{
				traceId: span.traceId,
				spanId: span.spanId,
				parentSpanId: span.parentSpanId ?? '',
				isRoot: !span.parentSpanId,
				provider: getString(span, GenAiAttr.PROVIDER_NAME),
				agentId: getString(span, 'gen_ai.agent.id'),
				agentName: getString(span, GenAiAttr.AGENT_NAME),
				agentType: getString(span, 'github.copilot.agent.type'),
				model: getString(span, GenAiAttr.REQUEST_MODEL),
				totalDurationMs,
				finishReason: getFinishReason(span),
				inputTokensTotal: getNumber(span, GenAiAttr.USAGE_INPUT_TOKENS),
				outputTokensTotal: getNumber(span, GenAiAttr.USAGE_OUTPUT_TOKENS),
				cacheReadTokensTotal: getNumber(span, GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS),
				cacheCreationTokensTotal: getNumber(span, GenAiAttr.USAGE_CACHE_CREATION_INPUT_TOKENS),
				// SDK emits reasoning tokens under `gen_ai.usage.reasoning.output_tokens` (dot, not the underscore used elsewhere).
				reasoningTokensTotal: getNumber(span, 'gen_ai.usage.reasoning.output_tokens') ?? getNumber(span, GenAiAttr.USAGE_REASONING_TOKENS),
				cost: getNumber(span, 'github.copilot.cost'),
				aiu: getNumber(span, 'github.copilot.aiu'),
				turnCount: getNumber(span, 'github.copilot.turn_count'),
				hasError: span.status.code === SpanStatusCode.ERROR,
			}
		);
	}

	private _emitChatEvent(span: ICompletedSpanData): void {
		const totalDurationMs = Math.max(0, span.endTime - span.startTime);
		this._telemetryService.publicLog2<IAgentHostChatCompletedEvent, IAgentHostChatCompletedClassification>(
			'agentHost.chatCompleted',
			{
				traceId: span.traceId,
				spanId: span.spanId,
				parentSpanId: span.parentSpanId ?? '',
				provider: getString(span, GenAiAttr.PROVIDER_NAME),
				requestModel: getString(span, GenAiAttr.REQUEST_MODEL),
				responseModel: getString(span, GenAiAttr.RESPONSE_MODEL),
				totalDurationMs,
				serverDurationMs: getNumber(span, 'github.copilot.server_duration'),
				ttftMs: getTtftMs(span),
				finishReason: getFinishReason(span),
				inputTokens: getNumber(span, GenAiAttr.USAGE_INPUT_TOKENS),
				outputTokens: getNumber(span, GenAiAttr.USAGE_OUTPUT_TOKENS),
				cacheReadTokens: getNumber(span, GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS),
				cacheCreationTokens: getNumber(span, GenAiAttr.USAGE_CACHE_CREATION_INPUT_TOKENS),
				reasoningTokens: getNumber(span, 'gen_ai.usage.reasoning.output_tokens') ?? getNumber(span, GenAiAttr.USAGE_REASONING_TOKENS),
				cost: getNumber(span, 'github.copilot.cost'),
				aiu: getNumber(span, 'github.copilot.aiu'),
				initiator: getString(span, 'github.copilot.initiator'),
				interactionId: getString(span, 'github.copilot.interaction_id'),
				hasError: span.status.code === SpanStatusCode.ERROR,
			}
		);
	}

	/** Span names look like `invoke_agent copilotcli`; split on whitespace. */
	private _operationFromSpanName(name: string): string {
		const space = name.indexOf(' ');
		return space < 0 ? name : name.slice(0, space);
	}

	private _logSpan(span: ICompletedSpanData): void {
		if (this._logService.getLevel() > LogLevel.Trace) {
			return;
		}
		const op = this._operationFromSpanName(span.name);
		const dur = Math.max(0, span.endTime - span.startTime);
		const parts: string[] = [];
		for (const key of LOGGED_SPAN_ATTRIBUTES) {
			const v = span.attributes[key];
			if (v !== undefined) {
				parts.push(`${key}=${Array.isArray(v) ? v.join(',') : v}`);
			}
		}
		this._logService.trace(
			`[agentHost.otel] span op=${op} span=${span.spanId} parent=${span.parentSpanId ?? '<root>'} trace=${span.traceId} dur=${dur}ms status=${span.status.code}${parts.length ? ' ' + parts.join(' ') : ''}`
		);
	}
}

/** Non-content attributes safe to include in trace-level span logs. */
const LOGGED_SPAN_ATTRIBUTES: readonly string[] = [
	'gen_ai.provider.name',
	'gen_ai.agent.id',
	'gen_ai.agent.name',
	'github.copilot.agent.type',
	'gen_ai.request.model',
	'gen_ai.response.model',
	'gen_ai.response.finish_reasons',
	'gen_ai.response.time_to_first_chunk',
	'gen_ai.usage.input_tokens',
	'gen_ai.usage.output_tokens',
	'gen_ai.usage.cache_read.input_tokens',
	'gen_ai.usage.cache_creation.input_tokens',
	'github.copilot.cost',
	'github.copilot.aiu',
	'github.copilot.turn_count',
	'github.copilot.initiator',
];
