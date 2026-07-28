/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { RemoteSessionExporter, SAFETY_INTERVAL_MS } from '../remoteSessionExporter';

/**
 * Focused tests for the early-return safety re-arm in `_flushBatch`.
 *
 * The full RemoteSessionExporter has ~13 service dependencies, so these tests
 * bypass the constructor with `Object.create` and only seed the private fields
 * that the early-return paths touch. We assert that `_scheduleFlush` is invoked
 * with `SAFETY_INTERVAL_MS` so buffered work is guaranteed to be retried once
 * the breaker / rate-limit window elapses, even if no further spans arrive.
 */

interface ExporterStubs {
	scheduleFlush: ReturnType<typeof vi.fn>;
	cancelProbe: ReturnType<typeof vi.fn>;
}

function makeStubExporter(opts: {
	breakerOpen?: boolean;
	rateLimited?: boolean;
	bufferLength?: number;
}): { exporter: RemoteSessionExporter; stubs: ExporterStubs } {
	const scheduleFlush = vi.fn();
	const cancelProbe = vi.fn();

	const exporter = Object.create(RemoteSessionExporter.prototype) as RemoteSessionExporter;
	const fields = exporter as unknown as {
		_isFlushing: boolean;
		_eventBuffer: { chatSessionId: string; event: { type: string } }[];
		_circuitBreaker: { canRequest: () => boolean; cancelProbe: () => void };
		_cloudClient: { isRateLimited: () => boolean };
		_scheduleFlush: (intervalMs: number, kind: 'fast' | 'safety') => void;
	};

	fields._isFlushing = false;
	fields._eventBuffer = Array.from({ length: opts.bufferLength ?? 1 }, (_, i) => ({
		chatSessionId: `s${i}`,
		event: { type: 'assistant.message' },
	}));
	fields._circuitBreaker = {
		canRequest: () => !opts.breakerOpen,
		cancelProbe,
	};
	fields._cloudClient = {
		isRateLimited: () => !!opts.rateLimited,
	};
	fields._scheduleFlush = scheduleFlush;

	return { exporter, stubs: { scheduleFlush, cancelProbe } };
}

async function invokeFlushBatch(exporter: RemoteSessionExporter): Promise<void> {
	await (exporter as unknown as { _flushBatch: () => Promise<void> })._flushBatch();
}

describe('RemoteSessionExporter._flushBatch early-return safety re-arm', () => {
	it('arms a safety-cadence flush when the circuit breaker is open', async () => {
		const { exporter, stubs } = makeStubExporter({ breakerOpen: true });

		await invokeFlushBatch(exporter);

		expect(stubs.scheduleFlush).toHaveBeenCalledTimes(1);
		expect(stubs.scheduleFlush).toHaveBeenCalledWith(SAFETY_INTERVAL_MS, 'safety');
	});

	it('arms a safety-cadence flush when the client is rate-limited', async () => {
		const { exporter, stubs } = makeStubExporter({ rateLimited: true });

		await invokeFlushBatch(exporter);

		expect(stubs.scheduleFlush).toHaveBeenCalledTimes(1);
		expect(stubs.scheduleFlush).toHaveBeenCalledWith(SAFETY_INTERVAL_MS, 'safety');
		// Probe slot consumed by canRequest() must be released.
		expect(stubs.cancelProbe).toHaveBeenCalledTimes(1);
	});

	it('does not arm a flush when the buffer is empty (benign no-op)', async () => {
		const { exporter, stubs } = makeStubExporter({ bufferLength: 0 });

		await invokeFlushBatch(exporter);

		expect(stubs.scheduleFlush).not.toHaveBeenCalled();
	});
});
