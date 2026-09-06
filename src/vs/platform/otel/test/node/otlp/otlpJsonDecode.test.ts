/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SpanStatusCode } from '../../../common/spanData.js';
import { decodeExportTraceRequest } from '../../../node/otlp/otlpJsonDecode.js';
import {
	IOtlpExportTraceServiceRequest,
	OtlpSpanKind,
	OtlpStatusCode,
} from '../../../node/otlp/otlpJsonTypes.js';

// 1700000000 seconds = 2023-11-14T22:13:20Z
// 1_700_000_000_000_000_000 ns = same instant
const startNs = '1700000000000000000';
const endNs = '1700000000050000000'; // +50ms

const traceId = 'aabbccddeeff00112233445566778899';
const spanId = '0011223344556677';
const parentSpanId = '8899aabbccddeeff';

function minimalRequest(spans: unknown[], resourceAttrs?: unknown[]): IOtlpExportTraceServiceRequest {
	return {
		resourceSpans: [{
			resource: resourceAttrs ? { attributes: resourceAttrs as never } : undefined,
			scopeSpans: [{
				scope: { name: '@github/copilot/sdk', version: '0.0.0' },
				spans: spans as never,
			}],
		}],
	};
}

suite('platform/otel - otlpJsonDecode', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('decodes a complete chat span with all attribute types and resource merge', () => {
		const request = minimalRequest(
			[{
				traceId,
				spanId,
				parentSpanId,
				name: 'chat gpt-4o',
				kind: OtlpSpanKind.CLIENT,
				startTimeUnixNano: startNs,
				endTimeUnixNano: endNs,
				attributes: [
					{ key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
					{ key: 'gen_ai.usage.input_tokens', value: { intValue: '1500' } },
					{ key: 'gen_ai.request.temperature', value: { doubleValue: 0.1 } },
					{ key: 'copilot_chat.streaming', value: { boolValue: true } },
					{ key: 'gen_ai.response.finish_reasons', value: { arrayValue: { values: [{ stringValue: 'stop' }] } } },
				],
				events: [{
					timeUnixNano: startNs,
					name: 'gen_ai.user.message',
					attributes: [{ key: 'content', value: { stringValue: 'hi' } }],
				}],
				status: { code: OtlpStatusCode.OK },
			}],
			[{ key: 'service.name', value: { stringValue: 'github-copilot' } }],
		);

		const { spans, rejected, errors } = decodeExportTraceRequest(request);

		strictEqual(rejected, 0);
		deepStrictEqual(errors, []);
		strictEqual(spans.length, 1);

		const [s] = spans;
		deepStrictEqual({
			name: s.name,
			traceId: s.traceId,
			spanId: s.spanId,
			parentSpanId: s.parentSpanId,
			startTime: s.startTime,
			endTime: s.endTime,
			status: s.status,
			attributes: s.attributes,
			events: s.events,
		}, {
			name: 'chat gpt-4o',
			traceId,
			spanId,
			parentSpanId,
			startTime: 1_700_000_000_000,
			endTime: 1_700_000_000_050,
			status: { code: SpanStatusCode.OK, message: undefined },
			attributes: {
				'service.name': 'github-copilot',
				'gen_ai.operation.name': 'chat',
				'gen_ai.usage.input_tokens': 1500,
				'gen_ai.request.temperature': 0.1,
				'copilot_chat.streaming': true,
				'gen_ai.response.finish_reasons': ['stop'],
			},
			events: [{
				name: 'gen_ai.user.message',
				timestamp: 1_700_000_000_000,
				attributes: { content: 'hi' },
			}],
		});
	});

	test('handles an empty request', () => {
		deepStrictEqual(decodeExportTraceRequest({ resourceSpans: [] }), { spans: [], rejected: 0, errors: [] });
		deepStrictEqual(decodeExportTraceRequest(undefined), { spans: [], rejected: 0, errors: [] });
	});

	test('rejects spans with invalid trace_id / span_id / missing times', () => {
		const valid = {
			traceId, spanId, name: 'ok', kind: OtlpSpanKind.INTERNAL,
			startTimeUnixNano: startNs, endTimeUnixNano: endNs,
		};
		const request: IOtlpExportTraceServiceRequest = {
			resourceSpans: [{
				scopeSpans: [{
					spans: [
						valid,
						{ ...valid, traceId: 'tooShort' }, // bad hex
						{ ...valid, traceId: '00000000000000000000000000000000' }, // all zero
						{ ...valid, spanId: '00ZZ00ZZ00ZZ00ZZ' }, // non-hex
						{ ...valid, startTimeUnixNano: undefined }, // missing time
					] as never,
				}],
			}],
		};

		const { spans, rejected } = decodeExportTraceRequest(request);
		strictEqual(spans.length, 1);
		strictEqual(rejected, 4);
		strictEqual(spans[0].name, 'ok');
	});

	test('span-level attribute overrides resource attribute on collision', () => {
		const request = minimalRequest(
			[{
				traceId, spanId, name: 'x', kind: OtlpSpanKind.INTERNAL,
				startTimeUnixNano: startNs, endTimeUnixNano: endNs,
				attributes: [{ key: 'service.name', value: { stringValue: 'span-wins' } }],
			}],
			[{ key: 'service.name', value: { stringValue: 'resource-loses' } }],
		);
		const { spans } = decodeExportTraceRequest(request);
		strictEqual(spans[0].attributes['service.name'], 'span-wins');
	});

	test('maps status codes: ERROR → ERROR, missing → UNSET', () => {
		const request = minimalRequest([
			{
				traceId, spanId: '1111111111111111', name: 'a', kind: OtlpSpanKind.INTERNAL,
				startTimeUnixNano: startNs, endTimeUnixNano: endNs,
				status: { code: OtlpStatusCode.ERROR, message: 'boom' },
			},
			{
				traceId, spanId: '2222222222222222', name: 'b', kind: OtlpSpanKind.INTERNAL,
				startTimeUnixNano: startNs, endTimeUnixNano: endNs,
			},
		]);
		const { spans } = decodeExportTraceRequest(request);
		strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
		strictEqual(spans[0].status.message, 'boom');
		strictEqual(spans[1].status.code, SpanStatusCode.UNSET);
	});

	test('falls back to JSON for mixed-type / nested attribute arrays and kvlistValue', () => {
		const request = minimalRequest([{
			traceId, spanId, name: 'a', kind: OtlpSpanKind.INTERNAL,
			startTimeUnixNano: startNs, endTimeUnixNano: endNs,
			attributes: [
				{ key: 'mixed', value: { arrayValue: { values: [{ stringValue: 'x' }, { intValue: '7' }] } } },
				{ key: 'nested', value: { kvlistValue: { values: [{ key: 'k', value: { stringValue: 'v' } }] } } },
			],
		}]);
		const { spans } = decodeExportTraceRequest(request);
		strictEqual(spans[0].attributes['mixed'], '["x",7]');
		strictEqual(spans[0].attributes['nested'], '{"k":"v"}');
	});

	test('treats time stringified as decimal nanos and floors to ms', () => {
		const request = minimalRequest([{
			traceId, spanId, name: 'a', kind: OtlpSpanKind.INTERNAL,
			startTimeUnixNano: '1700000000123456789', // .123456789 sec
			endTimeUnixNano: '1700000000123999999',
		}]);
		const { spans } = decodeExportTraceRequest(request);
		strictEqual(spans[0].startTime, 1_700_000_000_123);
		strictEqual(spans[0].endTime, 1_700_000_000_123);
	});

	test('returns errors[] when an exception is thrown for a span', () => {
		const request = minimalRequest([{
			traceId: 'nothex',
			spanId,
			name: 'x',
			kind: OtlpSpanKind.INTERNAL,
			startTimeUnixNano: startNs,
			endTimeUnixNano: endNs,
		}]);
		const { rejected, errors } = decodeExportTraceRequest(request);
		strictEqual(rejected, 1);
		strictEqual(errors.length, 1);
	});

	test('preserves parent span id; drops empty / all-zero parent', () => {
		const request = minimalRequest([
			{ traceId, spanId: '1111111111111111', parentSpanId: '0000000000000000', name: 'a', startTimeUnixNano: startNs, endTimeUnixNano: endNs },
			{ traceId, spanId: '2222222222222222', parentSpanId: '', name: 'b', startTimeUnixNano: startNs, endTimeUnixNano: endNs },
			{ traceId, spanId: '3333333333333333', parentSpanId: 'ddccbbaa11223344', name: 'c', startTimeUnixNano: startNs, endTimeUnixNano: endNs },
		]);
		const { spans } = decodeExportTraceRequest(request);
		strictEqual(spans[0].parentSpanId, undefined);
		strictEqual(spans[1].parentSpanId, undefined);
		strictEqual(spans[2].parentSpanId, 'ddccbbaa11223344');
	});
});
