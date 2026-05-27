/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { SpanStatusCode } from '../otelService';
import { CapturingOTelService } from './capturingOTelService';

/**
 * Tests service robustness: buffer cap behavior, runWithTraceContext propagation,
 * and capturing service correctness.
 */
describe('OTel Service Robustness', () => {

	describe('CapturingOTelService basics', () => {
		it('reset clears all captured data', () => {
			const otel = new CapturingOTelService();

			otel.startSpan('test', { attributes: {} });
			otel.recordMetric('m', 1);
			otel.incrementCounter('c');
			otel.emitLogRecord('log');

			otel.reset();

			expect(otel.spans).toHaveLength(0);
			expect(otel.metrics).toHaveLength(0);
			expect(otel.counters).toHaveLength(0);
			expect(otel.logRecords).toHaveLength(0);
		});

		it('findSpans filters by name prefix', () => {
			const otel = new CapturingOTelService();

			otel.startSpan('chat gpt-4o', { attributes: {} });
			otel.startSpan('chat claude', { attributes: {} });
			otel.startSpan('execute_tool read', { attributes: {} });

			expect(otel.findSpans('chat')).toHaveLength(2);
			expect(otel.findSpans('execute_tool')).toHaveLength(1);
			expect(otel.findSpans('invoke_agent')).toHaveLength(0);
		});
	});

	describe('runWithTraceContext', () => {
		it('executes the function and returns its result', async () => {
			const otel = new CapturingOTelService();
			const ctx = { traceId: 'aaaa0000bbbb1111cccc2222dddd3333', spanId: 'eeee4444ffff5555' };

			const result = await otel.runWithTraceContext(ctx, async () => {
				return 42;
			});

			expect(result).toBe(42);
		});

		it('propagates errors from the wrapped function', async () => {
			const otel = new CapturingOTelService();
			const ctx = { traceId: '00000000000000000000000000000000', spanId: '0000000000000000' };

			await expect(otel.runWithTraceContext(ctx, async () => {
				throw new Error('test error');
			})).rejects.toThrow('test error');
		});
	});

	describe('startActiveSpan lifecycle', () => {
		it('ends span even when fn throws', async () => {
			const otel = new CapturingOTelService();

			await expect(otel.startActiveSpan('test', { attributes: {} }, async () => {
				throw new Error('boom');
			})).rejects.toThrow('boom');

			expect(otel.spans[0].ended).toBe(true);
		});

		it('returns fn result on success', async () => {
			const otel = new CapturingOTelService();

			const result = await otel.startActiveSpan('test', { attributes: {} }, async (span) => {
				span.setStatus(SpanStatusCode.OK);
				return 'hello';
			});

			expect(result).toBe('hello');
			expect(otel.spans[0].statusCode).toBe(SpanStatusCode.OK);
		});
	});

	describe('storeTraceContext edge cases', () => {
		it('overwriting a key replaces the context', () => {
			const otel = new CapturingOTelService();
			const ctx1 = { traceId: 'aaaa', spanId: 'bbbb' };
			const ctx2 = { traceId: 'cccc', spanId: 'dddd' };

			otel.storeTraceContext('key', ctx1);
			otel.storeTraceContext('key', ctx2);

			expect(otel.getStoredTraceContext('key')).toEqual(ctx2);
		});
	});
});
