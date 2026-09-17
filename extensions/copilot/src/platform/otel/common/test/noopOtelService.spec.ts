/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { NoopOTelService } from '../noopOtelService';
import { resolveOTelConfig } from '../otelConfig';
import { SpanStatusCode } from '../otelService';

describe('NoopOTelService', () => {
	const config = resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' });
	const service = new NoopOTelService(config);

	it('has disabled config', () => {
		expect(service.config.enabled).toBe(false);
	});

	it('startSpan returns a noop handle', () => {
		const span = service.startSpan('test-span', { attributes: { foo: 'bar' } });
		// All methods should be callable without error
		span.setAttribute('key', 'value');
		span.setAttributes({ a: 1, b: 'c' });
		span.setStatus(SpanStatusCode.OK);
		span.setStatus(SpanStatusCode.ERROR, 'msg');
		span.recordException(new Error('test'));
		span.end();
	});

	it('startActiveSpan runs the function and returns its result', async () => {
		const result = await service.startActiveSpan('test', { attributes: {} }, async (span) => {
			span.setAttribute('key', 'val');
			return 42;
		});
		expect(result).toBe(42);
	});

	it('recordMetric is a noop', () => {
		service.recordMetric('test.metric', 42, { dim: 'val' });
	});

	it('incrementCounter is a noop', () => {
		service.incrementCounter('test.counter', 1, { dim: 'val' });
	});

	it('emitLogRecord is a noop', () => {
		service.emitLogRecord('test body', { key: 'val' });
	});

	it('flush resolves immediately', async () => {
		await service.flush();
	});

	it('shutdown resolves immediately', async () => {
		await service.shutdown();
	});
});
