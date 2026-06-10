/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
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

	test('emits a per-turn summary when the root invoke_agent span ends', () => {
		const { consumer, events } = createConsumer();
		const traceId = 'aabbccddeeff00112233445566778899';
		const rootStart = 1_000;
		const rootEnd = 5_000;

		// Chat spans arrive in a different order than they started. The first
		// chat by startTime is c6 (start 1_100), but it ends late (2_500).
		// A short later-started call (c1) ends early. The consumer must pick
		// c6 as "first chat" by startTime, not c1 by arrival order.
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c1', parentSpanId: 'root', name: 'chat gpt-4o',
			startTime: 2_000, endTime: 2_100, // late start, short
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.usage.input_tokens': 200,
				'gen_ai.usage.output_tokens': 75,
				'gen_ai.usage.cache_read.input_tokens': 150,
				'gen_ai.response.time_to_first_chunk': 0.007, // misleadingly tiny — must NOT be picked
				'gen_ai.response.finish_reasons': ['stop'],
			},
		}));
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c2', parentSpanId: 'root', name: 'execute_tool readFile',
			startTime: 1_600, endTime: 1_700,
			attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'readFile' },
		}));
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c3', parentSpanId: 'root', name: 'execute_tool runCommand',
			startTime: 1_700, endTime: 1_900,
			attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'runCommand' },
			status: SpanStatusCode.ERROR,
		}));
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c4', parentSpanId: 'c3', name: 'permission',
			startTime: 1_750, endTime: 1_760,
			attributes: { 'gen_ai.operation.name': 'permission' },
		}));
		// Subagent (non-root invoke_agent).
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c5', parentSpanId: 'c2', name: 'invoke_agent task',
			startTime: 1_800, endTime: 1_850,
			attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': 'task' },
		}));
		// True first chat by startTime, late arrival, late end.
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c6', parentSpanId: 'root', name: 'chat gpt-4o',
			startTime: 1_100, endTime: 2_500,
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.usage.input_tokens': 120,
				'gen_ai.usage.output_tokens': 60,
				'gen_ai.usage.cache_read.input_tokens': 80,
				'gen_ai.usage.cache_creation.input_tokens': 30,
				'gen_ai.usage.reasoning_tokens': 10,
				'gen_ai.response.model': 'gpt-4o',
				'gen_ai.response.time_to_first_chunk': 0.412, // realistic TTFT — must be picked
				'gen_ai.response.finish_reasons': ['tool_calls'],
			},
		}));
		// Root span ends — should trigger emission.
		strictEqual(events.length, 0, 'no emission before root ends');
		consumer.onSpan(makeSpan({
			traceId, spanId: 'root', name: 'invoke_agent copilotcli',
			startTime: rootStart, endTime: rootEnd,
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'gen_ai.provider.name': 'github.copilot',
				'gen_ai.agent.name': 'copilotcli',
				'gen_ai.request.model': 'gpt-4o',
			},
		}));

		strictEqual(events.length, 1);
		strictEqual(events[0].eventName, 'agentHost.invokeAgent');
		deepStrictEqual(events[0].data, {
			provider: 'github.copilot',
			agent: 'copilotcli',
			model: 'gpt-4o',
			totalDurationMs: rootEnd - rootStart,
			finishReason: 'tool_calls',           // finish reason from latest-ending chat (c6 ends at 2_500)
			spanCount: 7,
			llmCallCount: 2,
			toolCallCount: 2,
			subagentCallCount: 1,
			permissionCount: 1,
			errorCount: 1,
			inputTokensTotal: 320,
			outputTokensTotal: 135,
			cacheReadTokensTotal: 230,
			cacheCreationTokensTotal: 30,
			reasoningTokensTotal: 10,
			distinctToolCount: 2,
		});
	});

	test('does not emit until the root span actually ends', () => {
		const { consumer, events } = createConsumer();
		const traceId = '11111111111111112222222222222222';
		consumer.onSpan(makeSpan({
			traceId, spanId: 'c1', parentSpanId: 'root', name: 'chat gpt-4o',
			startTime: 100, endTime: 200,
			attributes: { 'gen_ai.operation.name': 'chat' },
		}));
		strictEqual(events.length, 0, 'no emission for an orphan child');
	});

	test('multiple traces are tracked independently', () => {
		const { consumer, events } = createConsumer();
		const traceA = 'a'.repeat(32);
		const traceB = 'b'.repeat(32);

		consumer.onSpan(makeSpan({
			traceId: traceA, spanId: 'rootA', name: 'invoke_agent copilotcli',
			startTime: 0, endTime: 1_000,
			attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': 'a' },
		}));
		consumer.onSpan(makeSpan({
			traceId: traceB, spanId: 'rootB', name: 'invoke_agent copilotcli',
			startTime: 0, endTime: 2_000,
			attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': 'b' },
		}));

		strictEqual(events.length, 2);
		strictEqual(events[0].data?.agent, 'a');
		strictEqual(events[0].data?.totalDurationMs, 1_000);
		strictEqual(events[1].data?.agent, 'b');
		strictEqual(events[1].data?.totalDurationMs, 2_000);
	});
});
