/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOTelConfig } from '../../../../../platform/otel/common/otelConfig';
import type { ICompletedSpanData, IOTelService } from '../../../../../platform/otel/common/otelService';
import { Event } from '../../../../../util/vs/base/common/event';
import { CopilotCliBridgeSpanProcessor } from '../copilotCliBridgeSpanProcessor';

function createMockOTelService(): IOTelService & { injectedSpans: ICompletedSpanData[] } {
	const injectedSpans: ICompletedSpanData[] = [];
	return {
		_serviceBrand: undefined!,
		config: resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' }),
		startSpan: vi.fn() as never,
		startActiveSpan: vi.fn() as never,
		getActiveTraceContext: vi.fn(),
		storeTraceContext: vi.fn(),
		getStoredTraceContext: vi.fn(),
		runWithTraceContext: vi.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()) as never,
		recordMetric: vi.fn(),
		incrementCounter: vi.fn(),
		emitLogRecord: vi.fn(),
		flush: vi.fn(),
		shutdown: vi.fn(),
		injectCompletedSpan(span: ICompletedSpanData) { injectedSpans.push(span); },
		onDidCompleteSpan: Event.None,
		onDidEmitSpanEvent: Event.None,
		injectedSpans,
	};
}

function makeReadableSpan(overrides: {
	name?: string;
	traceId?: string;
	spanId?: string;
	parentSpanContext?: { traceId: string; spanId: string } | undefined;
	attributes?: Record<string, unknown>;
	events?: { name: string; time: [number, number]; attributes?: Record<string, unknown> }[];
	status?: { code: number; message?: string };
	startTime?: [number, number];
	endTime?: [number, number];
} = {}) {
	return {
		name: overrides.name ?? 'test-span',
		startTime: overrides.startTime ?? [1000, 0] as [number, number],
		endTime: overrides.endTime ?? [1001, 0] as [number, number],
		attributes: overrides.attributes ?? {},
		events: overrides.events ?? [],
		status: overrides.status ?? { code: 0 },
		parentSpanContext: overrides.parentSpanContext,
		spanContext: () => ({
			traceId: overrides.traceId ?? 'trace-abc',
			spanId: overrides.spanId ?? 'span-123',
		}),
	};
}

describe('CopilotCliBridgeSpanProcessor', () => {
	let otelService: ReturnType<typeof createMockOTelService>;
	let bridge: CopilotCliBridgeSpanProcessor;

	beforeEach(() => {
		otelService = createMockOTelService();
		bridge = new CopilotCliBridgeSpanProcessor(otelService);
	});

	it('forwards spans with registered traceId', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({ name: 'chat model', traceId: 'trace-abc' }));

		expect(otelService.injectedSpans).toHaveLength(1);
		expect(otelService.injectedSpans[0].name).toBe('chat model');
		expect(otelService.injectedSpans[0].attributes['copilot_chat.chat_session_id']).toBe('session-1');
	});

	it('drops spans with unregistered traceId', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({ traceId: 'trace-other' }));

		expect(otelService.injectedSpans).toHaveLength(0);
	});

	it('drops all spans when no traces are registered', () => {
		bridge.onEnd(makeReadableSpan());

		expect(otelService.injectedSpans).toHaveLength(0);
	});

	it('converts parentSpanContext to parentSpanId', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			traceId: 'trace-abc',
			parentSpanContext: { traceId: 'trace-abc', spanId: 'parent-span-456' },
		}));

		expect(otelService.injectedSpans[0].parentSpanId).toBe('parent-span-456');
	});

	it('sets parentSpanId to undefined when no parent context', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({ traceId: 'trace-abc' }));

		expect(otelService.injectedSpans[0].parentSpanId).toBeUndefined();
	});

	it('does not overwrite existing CHAT_SESSION_ID', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			traceId: 'trace-abc',
			attributes: { 'copilot_chat.chat_session_id': 'existing-session' },
		}));

		expect(otelService.injectedSpans[0].attributes['copilot_chat.chat_session_id']).toBe('existing-session');
	});

	it('converts HrTime to milliseconds', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			traceId: 'trace-abc',
			startTime: [1700000000, 500000000],
			endTime: [1700000001, 250000000],
		}));

		expect(otelService.injectedSpans[0].startTime).toBe(1700000000500);
		expect(otelService.injectedSpans[0].endTime).toBe(1700000001250);
	});

	it('converts span events', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			traceId: 'trace-abc',
			events: [{
				name: 'user_message',
				time: [1700000000, 0],
				attributes: { content: 'hello' },
			}],
		}));

		expect(otelService.injectedSpans[0].events).toHaveLength(1);
		expect(otelService.injectedSpans[0].events[0].name).toBe('user_message');
		expect(otelService.injectedSpans[0].events[0].attributes?.content).toBe('hello');
	});

	it('flattens attribute values', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			traceId: 'trace-abc',
			attributes: {
				string_attr: 'hello',
				number_attr: 42,
				bool_attr: true,
				array_attr: ['a', 'b'],
				object_attr: { nested: true },
				null_attr: null,
			},
		}));

		const attrs = otelService.injectedSpans[0].attributes;
		expect(attrs['string_attr']).toBe('hello');
		expect(attrs['number_attr']).toBe(42);
		expect(attrs['bool_attr']).toBe(true);
		expect(attrs['array_attr']).toEqual(['a', 'b']);
		expect(attrs['object_attr']).toBe('[object Object]');
		// null should not be in the result
		expect('null_attr' in attrs).toBe(false);
	});

	it('stops forwarding after unregisterTrace', () => {
		bridge.registerTrace('trace-abc', 'session-1');
		bridge.onEnd(makeReadableSpan({ traceId: 'trace-abc', name: 'span-1' }));
		expect(otelService.injectedSpans).toHaveLength(1);

		bridge.unregisterTrace('trace-abc');
		bridge.onEnd(makeReadableSpan({ traceId: 'trace-abc', name: 'span-2' }));
		expect(otelService.injectedSpans).toHaveLength(1);
	});

	it('stops forwarding after shutdown', async () => {
		bridge.registerTrace('trace-abc', 'session-1');
		await bridge.shutdown();

		bridge.onEnd(makeReadableSpan({ traceId: 'trace-abc' }));
		expect(otelService.injectedSpans).toHaveLength(0);
	});

	it('onStart is a no-op', () => {
		// Should not throw
		bridge.onStart({}, {});
	});

	it('forceFlush resolves immediately', async () => {
		await expect(bridge.forceFlush()).resolves.toBeUndefined();
	});

	it('enriches SDK hook spans with stashed event data', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		// Stash hook.start data
		bridge.stashHookInput('inv-123', 'sessionEnd', '{"reason":"complete"}');

		// Stash hook.end data
		bridge.stashHookEnd('inv-123', 'sessionEnd', undefined, 'success', undefined);

		// SDK hook span arrives
		bridge.onEnd(makeReadableSpan({
			name: 'hook sessionEnd',
			traceId: 'trace-abc',
			attributes: {
				'github.copilot.hook.type': 'sessionEnd',
				'github.copilot.hook.invocation_id': 'inv-123',
			},
		}));

		expect(otelService.injectedSpans).toHaveLength(1);
		const span = otelService.injectedSpans[0];
		expect(span.name).toBe('execute_hook sessionEnd');
		expect(span.attributes['gen_ai.operation.name']).toBe('execute_hook');
		expect(span.attributes['copilot_chat.hook_type']).toBe('sessionEnd');
		expect(span.attributes['copilot_chat.hook_input']).toBe('{"reason":"complete"}');
		expect(span.attributes['copilot_chat.hook_result_kind']).toBe('success');
	});

	it('holds SDK hook span until hook.end data arrives', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		// Stash hook.start (input only)
		bridge.stashHookInput('inv-456', 'preToolUse', '{"tool":"bash"}');

		// SDK hook span arrives BEFORE hook.end
		bridge.onEnd(makeReadableSpan({
			name: 'hook preToolUse',
			traceId: 'trace-abc',
			attributes: {
				'github.copilot.hook.type': 'preToolUse',
				'github.copilot.hook.invocation_id': 'inv-456',
			},
		}));

		// Not injected yet — waiting for hook.end data
		expect(otelService.injectedSpans).toHaveLength(0);

		// hook.end data arrives → span is enriched and injected
		bridge.stashHookEnd('inv-456', 'preToolUse', '{"decision":"allow"}', 'success', undefined);

		expect(otelService.injectedSpans).toHaveLength(1);
		const span = otelService.injectedSpans[0];
		expect(span.attributes['copilot_chat.hook_input']).toBe('{"tool":"bash"}');
		expect(span.attributes['copilot_chat.hook_output']).toBe('{"decision":"allow"}');
		expect(span.attributes['copilot_chat.hook_result_kind']).toBe('success');
	});

	it('does not hold non-hook spans', () => {
		bridge.registerTrace('trace-abc', 'session-1');

		bridge.onEnd(makeReadableSpan({
			name: 'hook-like-but-not-a-hook',
			traceId: 'trace-abc',
		}));

		expect(otelService.injectedSpans).toHaveLength(1);
	});
});
