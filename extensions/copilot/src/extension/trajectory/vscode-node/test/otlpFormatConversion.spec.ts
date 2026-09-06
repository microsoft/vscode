/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../../platform/otel/common/genAiAttributes';
import { SpanStatusCode, type ICompletedSpanData } from '../../../../platform/otel/common/otelService';
import {
	completedSpanToOtlpSpan,
	otlpSpanToCompletedSpan,
	parseResourceSpans,
	wrapInResourceSpans,
} from '../otlpFormatConversion';

function makeSpan(overrides: Partial<ICompletedSpanData> = {}): ICompletedSpanData {
	return {
		name: 'test-span',
		spanId: 'abcdef0123456789',
		traceId: '0123456789abcdef0123456789abcdef',
		startTime: 1709472000000,
		endTime: 1709472001000,
		status: { code: SpanStatusCode.OK },
		attributes: {},
		events: [],
		...overrides,
	};
}

describe('OTLP Format Conversion', () => {
	describe('completedSpanToOtlpSpan', () => {
		it('converts basic span', () => {
			const span = makeSpan({ name: 'chat gpt-4o', attributes: { 'gen_ai.request.model': 'gpt-4o' } });
			const otlp = completedSpanToOtlpSpan(span);

			expect(otlp.name).toBe('chat gpt-4o');
			expect(otlp.traceId).toBe('0123456789abcdef0123456789abcdef');
			expect(otlp.spanId).toBe('abcdef0123456789');
			expect(otlp.startTimeUnixNano).toBe(String(1709472000000 * 1_000_000));
			expect(otlp.endTimeUnixNano).toBe(String(1709472001000 * 1_000_000));
			expect(otlp.attributes).toEqual([
				{ key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
			]);
		});

		it('includes parentSpanId when present', () => {
			const span = makeSpan({ parentSpanId: 'parentid12345678' });
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.parentSpanId).toBe('parentid12345678');
		});

		it('omits parentSpanId when absent', () => {
			const span = makeSpan();
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.parentSpanId).toBeUndefined();
		});

		it('converts integer attributes to intValue strings', () => {
			const span = makeSpan({ attributes: { 'token_count': 42 } });
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.attributes![0]).toEqual({ key: 'token_count', value: { intValue: '42' } });
		});

		it('converts boolean attributes', () => {
			const span = makeSpan({ attributes: { 'canceled': true } });
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.attributes![0]).toEqual({ key: 'canceled', value: { boolValue: true } });
		});

		it('converts array attributes', () => {
			const span = makeSpan({ attributes: { 'reasons': ['stop', 'tool_calls'] } });
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.attributes![0]).toEqual({
				key: 'reasons',
				value: { arrayValue: { values: [{ stringValue: 'stop' }, { stringValue: 'tool_calls' }] } },
			});
		});

		it('converts span events', () => {
			const span = makeSpan({
				events: [{ name: 'user_message', timestamp: 1709472000500, attributes: { content: 'hello' } }],
			});
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.events!.length).toBe(1);
			expect(otlp.events![0].name).toBe('user_message');
			expect(otlp.events![0].timeUnixNano).toBe(String(1709472000500 * 1_000_000));
		});

		it('converts status', () => {
			const span = makeSpan({ status: { code: SpanStatusCode.ERROR, message: 'timeout' } });
			const otlp = completedSpanToOtlpSpan(span);
			expect(otlp.status).toEqual({ code: 2, message: 'timeout' });
		});
	});

	describe('otlpSpanToCompletedSpan', () => {
		it('round-trips a span through OTLP conversion', () => {
			const original = makeSpan({
				name: 'execute_tool readFile',
				parentSpanId: 'parentid12345678',
				attributes: {
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
					[GenAiAttr.TOOL_NAME]: 'readFile',
					'token_count': 100,
					'canceled': false,
				},
				events: [{ name: 'started', timestamp: 1709472000100 }],
				status: { code: SpanStatusCode.OK },
			});

			const otlp = completedSpanToOtlpSpan(original);
			const roundTripped = otlpSpanToCompletedSpan(otlp);

			expect(roundTripped.name).toBe(original.name);
			expect(roundTripped.spanId).toBe(original.spanId);
			expect(roundTripped.traceId).toBe(original.traceId);
			expect(roundTripped.parentSpanId).toBe(original.parentSpanId);
			expect(roundTripped.startTime).toBe(original.startTime);
			expect(roundTripped.endTime).toBe(original.endTime);
			expect(roundTripped.status.code).toBe(original.status.code);
			expect(roundTripped.attributes[GenAiAttr.OPERATION_NAME]).toBe(GenAiOperationName.EXECUTE_TOOL);
			expect(roundTripped.attributes[GenAiAttr.TOOL_NAME]).toBe('readFile');
			expect(roundTripped.events.length).toBe(1);
			expect(roundTripped.events[0].name).toBe('started');
		});
	});

	describe('wrapInResourceSpans + parseResourceSpans', () => {
		it('round-trips spans through OTLP envelope', () => {
			const spans = [
				makeSpan({ name: 'invoke_agent copilot', attributes: { [CopilotChatAttr.SESSION_ID]: 'sess-1' } }),
				makeSpan({ name: 'chat gpt-4o', spanId: 'span2id234567890', parentSpanId: 'abcdef0123456789' }),
			];

			const exported = wrapInResourceSpans(spans, { 'service.name': 'copilot-chat', 'service.version': '1.0.0' });
			const json = JSON.stringify(exported);
			const imported = parseResourceSpans(json);

			expect(imported.length).toBe(2);
			expect(imported[0].name).toBe('invoke_agent copilot');
			expect(imported[1].name).toBe('chat gpt-4o');
			expect(imported[1].parentSpanId).toBe('abcdef0123456789');
		});

		it('parses JSON lines format', () => {
			const span1 = makeSpan({ name: 'span1' });
			const span2 = makeSpan({ name: 'span2', spanId: '1234567890abcdef' });

			const line1 = JSON.stringify(wrapInResourceSpans([span1], {}));
			const line2 = JSON.stringify(wrapInResourceSpans([span2], {}));
			const jsonl = `${line1}\n${line2}`;

			const imported = parseResourceSpans(jsonl);
			expect(imported.length).toBe(2);
			expect(imported[0].name).toBe('span1');
			expect(imported[1].name).toBe('span2');
		});

		it('returns empty array for invalid JSON', () => {
			const result = parseResourceSpans('not valid json');
			expect(result).toEqual([]);
		});
	});
});
