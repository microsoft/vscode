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

/**
 * Cap on how many in-flight trace aggregators we keep in memory. Orphan traces
 * (roots that never produce a terminating `invoke_agent` span) would otherwise
 * leak indefinitely. When the cap is exceeded we evict the oldest entry without
 * emitting telemetry — sacrificing summary fidelity to keep memory bounded.
 */
const MAX_INFLIGHT_TRACES = 256;

/**
 * Minimal record kept per chat span so we can pick the causally-first one at
 * flush time. Chat spans arrive at the receiver in **export order** (typically
 * end-time order) which is not necessarily start-time order — so we cannot
 * lock in the "first chat" decision while spans are still streaming in.
 */
interface IChatSpanRecord {
	startTimeMs: number;
	endTimeMs: number;
	/**
	 * Value of `gen_ai.response.time_to_first_chunk` (seconds → ms). Kept on
	 * the per-span record so the trace-level diagnostic log can show what the
	 * SDK reported, even though we don't currently surface it in telemetry —
	 * see the `_flush` comment below for why.
	 */
	ttftMs: number | undefined;
	finishReason: string | undefined;
}

/**
 * Per-trace aggregator. Built lazily on the first span we see for a trace and
 * flushed when the root `invoke_agent` span ends (or evicted by the LRU cap).
 */
interface ITraceAggregate {
	rootSpanId: string | undefined;
	rootStartTimeMs: number | undefined;
	rootEndTimeMs: number | undefined;
	provider: string | undefined;
	agent: string | undefined;
	model: string | undefined;
	spanCount: number;
	llmCallCount: number;
	toolCallCount: number;
	subagentCallCount: number;
	permissionCount: number;
	errorCount: number;
	inputTokensTotal: number;
	outputTokensTotal: number;
	cacheReadTokensTotal: number;
	cacheCreationTokensTotal: number;
	reasoningTokensTotal: number;
	/** All chat spans observed for this trace. Reduced at flush time to pick the causal first/last. */
	chatSpans: IChatSpanRecord[];
	toolNamesSeen: Set<string>;
}

function makeAggregate(): ITraceAggregate {
	return {
		rootSpanId: undefined,
		rootStartTimeMs: undefined,
		rootEndTimeMs: undefined,
		provider: undefined,
		agent: undefined,
		model: undefined,
		spanCount: 0,
		llmCallCount: 0,
		toolCallCount: 0,
		subagentCallCount: 0,
		permissionCount: 0,
		errorCount: 0,
		inputTokensTotal: 0,
		outputTokensTotal: 0,
		cacheReadTokensTotal: 0,
		cacheCreationTokensTotal: 0,
		reasoningTokensTotal: 0,
		chatSpans: [],
		toolNamesSeen: new Set<string>(),
	};
}

function getString(span: ICompletedSpanData, key: string): string | undefined {
	const v = span.attributes[key];
	return typeof v === 'string' ? v : undefined;
}

function getNumber(span: ICompletedSpanData, key: string): number | undefined {
	const v = span.attributes[key];
	return typeof v === 'number' ? v : undefined;
}

/**
 * Reads the first finish reason from `gen_ai.response.finish_reasons` (an array
 * per OTel semconv, but some emitters serialize as a single string).
 */
function getFinishReason(span: ICompletedSpanData): string | undefined {
	const v = span.attributes[GenAiAttr.RESPONSE_FINISH_REASONS];
	if (Array.isArray(v)) {
		const first = v[0];
		return typeof first === 'string' ? first : undefined;
	}
	return typeof v === 'string' ? v : undefined;
}

/**
 * Reads `gen_ai.response.time_to_first_chunk` (seconds per GenAI semconv) and
 * converts to milliseconds. Returns `undefined` if absent.
 */
function getTtftMs(span: ICompletedSpanData): number | undefined {
	const seconds = getNumber(span, GenAiAttr.RESPONSE_TIME_TO_FIRST_CHUNK);
	return seconds === undefined ? undefined : Math.round(seconds * 1000);
}

/**
 * The shape of the per-turn summary event sent to standard VS Code telemetry.
 * Aggregated from all spans observed for a single trace (one `invoke_agent`
 * root + its descendants), so cardinality stays at one event per agent turn
 * rather than one event per span.
 */
export interface IAgentHostInvokeAgentEvent {
	provider: string | undefined;
	agent: string | undefined;
	model: string | undefined;
	totalDurationMs: number;
	finishReason: string | undefined;
	spanCount: number;
	llmCallCount: number;
	toolCallCount: number;
	subagentCallCount: number;
	permissionCount: number;
	errorCount: number;
	inputTokensTotal: number;
	outputTokensTotal: number;
	cacheReadTokensTotal: number;
	cacheCreationTokensTotal: number;
	reasoningTokensTotal: number;
	distinctToolCount: number;
}

export type IAgentHostInvokeAgentClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.provider.name attribute from the root invoke_agent span (e.g. github.copilot, anthropic).' };
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.agent.name attribute from the root invoke_agent span (e.g. copilotcli, claude).' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'OTel gen_ai.request.model attribute from the root invoke_agent span, or the response model from a chat child span as fallback.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock duration of the root invoke_agent span in milliseconds.' };
	finishReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Finish reason of the final chat span in the turn (e.g. stop, tool_calls, length).' };
	spanCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of spans observed for this trace.' };
	llmCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chat child spans observed (LLM round-trips).' };
	toolCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of execute_tool child spans observed.' };
	subagentCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of non-root invoke_agent spans observed (subagent invocations).' };
	permissionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of permission spans observed.' };
	errorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of spans whose status was ERROR.' };
	inputTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of gen_ai.usage.input_tokens across all chat spans in the trace.' };
	outputTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of gen_ai.usage.output_tokens across all chat spans in the trace.' };
	cacheReadTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of gen_ai.usage.cache_read.input_tokens across all chat spans in the trace.' };
	cacheCreationTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of gen_ai.usage.cache_creation.input_tokens across all chat spans in the trace.' };
	reasoningTokensTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of gen_ai.usage.reasoning_tokens across all chat spans in the trace.' };
	distinctToolCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Count of distinct gen_ai.tool.name values observed across execute_tool spans.' };
	owner: 'roblourens';
	comment: 'Per-turn summary derived from the OTel invoke_agent span the @github/copilot-sdk emits during an agent host session. One event per root invoke_agent span. Runs in parallel with agentHost.turnCompleted (which is measured from the VS Code side); this event is the SDK\'s server-measured source of truth for token counts and per-turn structure. Routed via AgentHostSpanTelemetryConsumer.';
};

/**
 * Aggregates OTel spans the agent-host SDK emits into per-turn summaries and
 * sends a single `agentHost.invokeAgent` event to the standard VS Code
 * telemetry pipeline when each root `invoke_agent` span ends.
 *
 * Why aggregate?
 * - Spans fire at high frequency (every chat call, every tool invocation,
 *   every permission check). Emitting one telemetry event per span would
 *   explode cardinality and cost.
 * - Standard VS Code telemetry classifications require static schemas; a
 *   per-turn rollup gives us comparable, low-cardinality counters and timings
 *   across users without leaking content.
 *
 * Relationship to `agentHost.turnCompleted`:
 * - `agentHost.turnCompleted` is emitted by `AgentHostTelemetryReporter` using
 *   stopwatches in the workbench. `timeToFirstProgress` there counts from turn
 *   dispatch to the first visible stream event.
 * - `agentHost.invokeAgent` (this file) uses the SDK's own server-side timing:
 *   `totalDurationMs` is the root span's true duration; token counts come from
 *   the model. We deliberately do NOT emit the SDK's per-chat
 *   `gen_ai.response.time_to_first_chunk` value — see `_flush` for context.
 * - Both events run in parallel so we can compare workbench-perceived vs
 *   SDK-measured timings before deciding which to retire.
 *
 * The aggregator never reads content attributes (prompts, responses, raw tool
 * arguments) so it is safe to run regardless of `captureContent` settings.
 */
export class AgentHostSpanTelemetryConsumer extends Disposable implements IAgentHostOTelSpanConsumer {

	private readonly _inflight = new Map<string, ITraceAggregate>();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onSpan(span: ICompletedSpanData): void {
		try {
			this._observe(span);
		} catch (err) {
			// Never throw from a span callback — the receiver pipeline must stay up.
			this._logService.warn('[agentHost.otel] span telemetry consumer threw', err);
		}
	}

	private _observe(span: ICompletedSpanData): void {
		const traceId = span.traceId;
		if (!traceId) {
			return;
		}

		let agg = this._inflight.get(traceId);
		if (!agg) {
			if (this._inflight.size >= MAX_INFLIGHT_TRACES) {
				// Evict the oldest entry (insertion order). The aggregator we drop
				// never produced a root-end event — most likely an orphan from a
				// crash or a trace whose root span is still pending. Telemetry for
				// that trace is sacrificed to keep memory bounded.
				const oldest = this._inflight.keys().next().value;
				if (oldest !== undefined) {
					this._inflight.delete(oldest);
				}
			}
			agg = makeAggregate();
			this._inflight.set(traceId, agg);
		}

		agg.spanCount++;

		if (span.status.code === SpanStatusCode.ERROR) {
			agg.errorCount++;
		}

		const op = getString(span, GenAiAttr.OPERATION_NAME) ?? this._operationFromSpanName(span.name);
		switch (op) {
			case GenAiOperationName.INVOKE_AGENT:
				this._observeInvokeAgent(agg, span);
				break;
			case GenAiOperationName.CHAT:
				this._observeChat(agg, span);
				break;
			case GenAiOperationName.EXECUTE_TOOL:
				this._observeExecuteTool(agg, span);
				break;
			case 'permission':
				agg.permissionCount++;
				break;
		}
	}

	/** Span names look like `invoke_agent copilotcli`; fall back to splitting on whitespace. */
	private _operationFromSpanName(name: string): string {
		const space = name.indexOf(' ');
		return space < 0 ? name : name.slice(0, space);
	}

	private _observeInvokeAgent(agg: ITraceAggregate, span: ICompletedSpanData): void {
		const isRoot = !span.parentSpanId;
		if (isRoot) {
			agg.rootSpanId = span.spanId;
			agg.rootStartTimeMs = span.startTime;
			agg.rootEndTimeMs = span.endTime;
			agg.provider = agg.provider ?? getString(span, GenAiAttr.PROVIDER_NAME);
			agg.agent = agg.agent ?? getString(span, GenAiAttr.AGENT_NAME);
			agg.model = agg.model ?? getString(span, GenAiAttr.REQUEST_MODEL);
			this._flush(span.traceId);
		} else {
			agg.subagentCallCount++;
		}
	}

	private _observeChat(agg: ITraceAggregate, span: ICompletedSpanData): void {
		agg.llmCallCount++;

		// Record every chat span; we pick the causally-first one at flush time
		// because spans typically arrive in end-time (export) order, not start-time order.
		agg.chatSpans.push({
			startTimeMs: span.startTime,
			endTimeMs: span.endTime,
			ttftMs: getTtftMs(span),
			finishReason: getFinishReason(span),
		});

		const input = getNumber(span, GenAiAttr.USAGE_INPUT_TOKENS);
		if (input !== undefined) {
			agg.inputTokensTotal += input;
		}
		const output = getNumber(span, GenAiAttr.USAGE_OUTPUT_TOKENS);
		if (output !== undefined) {
			agg.outputTokensTotal += output;
		}
		const cacheRead = getNumber(span, GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS);
		if (cacheRead !== undefined) {
			agg.cacheReadTokensTotal += cacheRead;
		}
		const cacheCreation = getNumber(span, GenAiAttr.USAGE_CACHE_CREATION_INPUT_TOKENS);
		if (cacheCreation !== undefined) {
			agg.cacheCreationTokensTotal += cacheCreation;
		}
		const reasoning = getNumber(span, GenAiAttr.USAGE_REASONING_TOKENS);
		if (reasoning !== undefined) {
			agg.reasoningTokensTotal += reasoning;
		}
		// Use the response model as a fallback when the root span didn't carry one.
		if (!agg.model) {
			agg.model = getString(span, GenAiAttr.RESPONSE_MODEL) ?? getString(span, GenAiAttr.REQUEST_MODEL);
		}
	}

	private _observeExecuteTool(agg: ITraceAggregate, span: ICompletedSpanData): void {
		agg.toolCallCount++;
		const toolName = getString(span, GenAiAttr.TOOL_NAME);
		if (toolName) {
			agg.toolNamesSeen.add(toolName);
		}
	}

	private _flush(traceId: string): void {
		const agg = this._inflight.get(traceId);
		if (!agg || agg.rootStartTimeMs === undefined || agg.rootEndTimeMs === undefined) {
			return;
		}
		this._inflight.delete(traceId);

		const totalDurationMs = Math.max(0, agg.rootEndTimeMs - agg.rootStartTimeMs);

		// We deliberately do NOT surface a TTFT field on the emitted event. The SDK's
		// `gen_ai.response.time_to_first_chunk` attribute has been observed to report
		// implausible sub-10ms values on real multi-second LLM calls (see the trace
		// log below for evidence). Shipping that as a telemetry metric would be
		// actively misleading. When the SDK fix lands we can re-introduce it here.
		// We still pick a `lastChat` for the finish-reason field.
		const lastChat = agg.chatSpans.reduce<IChatSpanRecord | undefined>(
			(max, c) => (max === undefined || c.endTimeMs > max.endTimeMs ? c : max),
			undefined,
		);

		// Trace-level diagnostic: dump every chat span in start-time order. Lets us
		// audit per-call TTFTs and durations without surfacing potentially-wrong
		// values in telemetry. Only emitted at trace level so it's silent unless
		// someone is explicitly investigating.
		if (this._logService.getLevel() <= LogLevel.Trace && agg.chatSpans.length > 0) {
			const sorted = agg.chatSpans.slice().sort((a, b) => a.startTimeMs - b.startTimeMs);
			const lines = sorted.map((c, i) => {
				const startOffset = c.startTimeMs - (agg.rootStartTimeMs ?? c.startTimeMs);
				const duration = c.endTimeMs - c.startTimeMs;
				return `  [${i}] start+${startOffset}ms dur=${duration}ms ttft=${c.ttftMs ?? '?'}ms finish=${c.finishReason ?? '?'}`;
			}).join('\n');
			this._logService.trace(`[agentHost.otel] trace=${traceId} root=${totalDurationMs}ms chats=${agg.chatSpans.length}\n${lines}`);
		}

		this._telemetryService.publicLog2<IAgentHostInvokeAgentEvent, IAgentHostInvokeAgentClassification>(
			'agentHost.invokeAgent',
			{
				provider: agg.provider,
				agent: agg.agent,
				model: agg.model,
				totalDurationMs,
				finishReason: lastChat?.finishReason,
				spanCount: agg.spanCount,
				llmCallCount: agg.llmCallCount,
				toolCallCount: agg.toolCallCount,
				subagentCallCount: agg.subagentCallCount,
				permissionCount: agg.permissionCount,
				errorCount: agg.errorCount,
				inputTokensTotal: agg.inputTokensTotal,
				outputTokensTotal: agg.outputTokensTotal,
				cacheReadTokensTotal: agg.cacheReadTokensTotal,
				cacheCreationTokensTotal: agg.cacheCreationTokensTotal,
				reasoningTokensTotal: agg.reasoningTokensTotal,
				distinctToolCount: agg.toolNamesSeen.size,
			}
		);
	}
}
