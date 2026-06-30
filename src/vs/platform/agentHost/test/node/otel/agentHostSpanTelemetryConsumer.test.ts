/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, LogLevel, NullLogService } from '../../../../log/common/log.js';
import { ICompletedSpanData, SpanStatusCode } from '../../../../otel/common/spanData.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { AgentHostSpanTelemetryConsumer } from '../../../node/otel/agentHostSpanTelemetryConsumer.js';

interface IRecordedTelemetryEvent {
	readonly eventName: string;
	readonly data: Record<string, unknown> | undefined;
}

function makeRecordingTelemetryService(): { service: ITelemetryService; events: IRecordedTelemetryEvent[] } {
	const events: IRecordedTelemetryEvent[] = [];
	const service = {
		publicLog2: (eventName: string, data?: Record<string, unknown>) => {
			events.push({ eventName, data });
		},
	} as unknown as ITelemetryService;
	return { service, events };
}

interface ISpanInit {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	startTime: number;
	endTime: number;
	status?: SpanStatusCode;
	attributes?: Record<string, string | number | boolean | string[]>;
}

function makeSpan(init: ISpanInit): ICompletedSpanData {
	return {
		traceId: init.traceId,
		spanId: init.spanId,
		parentSpanId: init.parentSpanId,
		name: init.name,
		startTime: init.startTime,
		endTime: init.endTime,
		status: { code: init.status ?? SpanStatusCode.OK },
		attributes: init.attributes ?? {},
		events: [],
	};
}

suite('platform/agentHost - AgentHostSpanTelemetryConsumer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createConsumer() {
		const { service, events } = makeRecordingTelemetryService();
		const di = store.add(new TestInstantiationService());
		di.set(ITelemetryService, service);
		di.set(ILogService, new NullLogService());
		const consumer = store.add(di.createInstance(AgentHostSpanTelemetryConsumer));
		return { consumer, events };
	}

	test('emits agentHost.invokeAgentCompleted for a root invoke_agent span using SDK-rolled-up attributes', () => {
		// Attribute values lifted from a real trace dump (see plan.md): the SDK
		// pre-aggregates token totals onto the invoke_agent span itself, so the
		// consumer is a direct passthrough — no client-side summing.
		const { consumer, events } = createConsumer();
		consumer.onSpan(makeSpan({
			traceId: '7efbc0476aada2359175bd3db6f11b21',
			spanId: 'd4193c4d2dc0d54d',
			// no parentSpanId — this is the root
			name: 'invoke_agent',
			startTime: 1_000,
			endTime: 68_064,
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'gen_ai.provider.name': 'github',
				'gen_ai.agent.id': 'github.copilot.default',
				'gen_ai.request.model': 'claude-sonnet-4.5',
				'gen_ai.response.finish_reasons': ['stop'],
				'gen_ai.usage.input_tokens': 141_746,
				'gen_ai.usage.output_tokens': 1_121,
				'gen_ai.usage.cache_read.input_tokens': 119_637,
				'gen_ai.usage.cache_creation.input_tokens': 22_055,
				'gen_ai.usage.reasoning.output_tokens': 428,
				'github.copilot.agent.type': 'builtin',
				'github.copilot.aiu': 13_557_435_000,
				'github.copilot.cost': 7,
				'github.copilot.turn_count': 7,
			},
		}));

		strictEqual(events.length, 1);
		deepStrictEqual(events[0], {
			eventName: 'agentHost.invokeAgentCompleted',
			data: {
				traceId: '7efbc0476aada2359175bd3db6f11b21',
				spanId: 'd4193c4d2dc0d54d',
				parentSpanId: '',
				isRoot: true,
				provider: 'github',
				agentId: 'github.copilot.default',
				agentName: undefined,
				agentType: 'builtin',
				model: 'claude-sonnet-4.5',
				totalDurationMs: 67_064,
				finishReason: 'stop',
				inputTokensTotal: 141_746,
				outputTokensTotal: 1_121,
				cacheReadTokensTotal: 119_637,
				cacheCreationTokensTotal: 22_055,
				reasoningTokensTotal: 428,
				cost: 7,
				aiu: 13_557_435_000,
				turnCount: 7,
				hasError: false,
			},
		});
	});

	test('emits agentHost.invokeAgentCompleted for a subagent with isRoot=false, parentSpanId set, and its own scoped totals', () => {
		const { consumer, events } = createConsumer();
		consumer.onSpan(makeSpan({
			traceId: '7efbc0476aada2359175bd3db6f11b21',
			spanId: '748ca10e1387477a',
			parentSpanId: 'b995d63ca4cdbd87', // execute_tool task span that invoked this subagent
			name: 'invoke_agent explore',
			startTime: 2_000,
			endTime: 15_039,
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'gen_ai.provider.name': 'github',
				'gen_ai.agent.id': 'builtin:explore',
				'gen_ai.agent.name': 'explore',
				'gen_ai.request.model': 'claude-sonnet-4.5',
				'gen_ai.response.finish_reasons': ['stop'],
				'gen_ai.usage.input_tokens': 35_624,
				'gen_ai.usage.output_tokens': 793,
				'gen_ai.usage.cache_read.input_tokens': 28_457,
				'gen_ai.usage.cache_creation.input_tokens': 6_651,
				'gen_ai.usage.reasoning.output_tokens': 671,
				'github.copilot.agent.type': 'builtin',
			},
			status: SpanStatusCode.OK,
		}));

		strictEqual(events.length, 1);
		strictEqual(events[0].eventName, 'agentHost.invokeAgentCompleted');
		const data = events[0].data!;
		strictEqual(data.isRoot, false);
		strictEqual(data.parentSpanId, 'b995d63ca4cdbd87');
		strictEqual(data.agentName, 'explore');
		strictEqual(data.agentId, 'builtin:explore');
		strictEqual(data.inputTokensTotal, 35_624);
		strictEqual(data.cost, undefined); // subagent spans don't carry cost/aiu/turnCount in observed traces
		strictEqual(data.turnCount, undefined);
	});

	test('emits agentHost.chatCompleted for a chat span with ttft, response model differing from request model, and per-call tokens', () => {
		// The "explore" subagent in the captured trace requested claude-sonnet-4.5
		// but the chat actually returned claude-haiku-4.5 — exercise that here so
		// we surface fallback routing.
		const { consumer, events } = createConsumer();
		consumer.onSpan(makeSpan({
			traceId: '7efbc0476aada2359175bd3db6f11b21',
			spanId: '0beb8ae83c001b57',
			parentSpanId: '748ca10e1387477a',
			name: 'chat claude-sonnet-4.5',
			startTime: 5_000,
			endTime: 18_039,
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.provider.name': 'github',
				'gen_ai.request.model': 'claude-sonnet-4.5',
				'gen_ai.response.model': 'claude-haiku-4.5',
				'gen_ai.response.time_to_first_chunk': 0.412,
				'gen_ai.response.finish_reasons': ['stop'],
				'gen_ai.usage.input_tokens': 35_624,
				'gen_ai.usage.output_tokens': 793,
				'gen_ai.usage.cache_read.input_tokens': 28_457,
				'gen_ai.usage.cache_creation.input_tokens': 6_651,
				'gen_ai.usage.reasoning.output_tokens': 671,
				'github.copilot.server_duration': 13_000,
				'github.copilot.aiu': 8_101_125_000,
				'github.copilot.cost': 1,
				'github.copilot.initiator': 'agent',
				'github.copilot.interaction_id': 'd571e841-2f5c-4bd9-b625-2f02c936b609',
			},
		}));

		strictEqual(events.length, 1);
		deepStrictEqual(events[0], {
			eventName: 'agentHost.chatCompleted',
			data: {
				traceId: '7efbc0476aada2359175bd3db6f11b21',
				spanId: '0beb8ae83c001b57',
				parentSpanId: '748ca10e1387477a',
				provider: 'github',
				requestModel: 'claude-sonnet-4.5',
				responseModel: 'claude-haiku-4.5',
				totalDurationMs: 13_039,
				serverDurationMs: 13_000,
				ttftMs: 412,
				finishReason: 'stop',
				inputTokens: 35_624,
				outputTokens: 793,
				cacheReadTokens: 28_457,
				cacheCreationTokens: 6_651,
				reasoningTokens: 671,
				cost: 1,
				aiu: 8_101_125_000,
				initiator: 'agent',
				interactionId: 'd571e841-2f5c-4bd9-b625-2f02c936b609',
				hasError: false,
			},
		});
	});

	test('ignores execute_tool and permission spans (no events emitted)', () => {
		const { consumer, events } = createConsumer();
		const traceId = 'a'.repeat(32);
		consumer.onSpan(makeSpan({
			traceId, spanId: 't1', parentSpanId: 'root', name: 'execute_tool grep',
			startTime: 0, endTime: 50,
			attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'grep' },
		}));
		consumer.onSpan(makeSpan({
			traceId, spanId: 'p1', parentSpanId: 't1', name: 'permission',
			startTime: 10, endTime: 12,
			attributes: { 'github.copilot.permission.kind': 'read' },
		}));
		strictEqual(events.length, 0);
	});

	test('flags hasError when span status is ERROR', () => {
		const { consumer, events } = createConsumer();
		consumer.onSpan(makeSpan({
			traceId: 'b'.repeat(32),
			spanId: 'errchat',
			parentSpanId: 'root',
			name: 'chat gpt-4o',
			startTime: 0, endTime: 100,
			status: SpanStatusCode.ERROR,
			attributes: { 'gen_ai.operation.name': 'chat' },
		}));
		strictEqual(events.length, 1);
		strictEqual(events[0].data?.hasError, true);
	});

	test('span log only includes allow-listed non-content attributes', () => {
		const traceLines: string[] = [];
		const log = new class extends NullLogService {
			override getLevel(): LogLevel { return LogLevel.Trace; }
			override trace(msg: string): void { traceLines.push(msg); }
		};
		const { service } = makeRecordingTelemetryService();
		const di = store.add(new TestInstantiationService());
		di.set(ITelemetryService, service);
		di.set(ILogService, log);
		const consumer = store.add(di.createInstance(AgentHostSpanTelemetryConsumer));

		const leakyValue = 'super secret user prompt that must never be logged';
		consumer.onSpan(makeSpan({
			traceId: 'c'.repeat(32),
			spanId: 'leaky',
			name: 'chat gpt-4o',
			startTime: 0, endTime: 1,
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.request.model': 'gpt-4o',
				'gen_ai.usage.input_tokens': 42,
				'gen_ai.input.messages': leakyValue,
				'gen_ai.output.messages': leakyValue,
				'gen_ai.tool.call.arguments': leakyValue,
				'copilot_chat.hook_input': leakyValue,
			},
		}));

		strictEqual(traceLines.length, 1);
		const dump = traceLines[0];
		strictEqual(dump.includes('gen_ai.request.model=gpt-4o'), true);
		strictEqual(dump.includes('gen_ai.usage.input_tokens=42'), true);
		strictEqual(dump.includes(leakyValue), false, 'content value leaked into log');
		strictEqual(dump.includes('gen_ai.input.messages'), false);
		strictEqual(dump.includes('gen_ai.tool.call.arguments'), false);
		strictEqual(dump.includes('copilot_chat.hook_input'), false);
	});
});
