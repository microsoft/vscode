/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IPcmCapturePort, IPcmCaptureTimers, PCM_FLUSH_ACK, PCM_FLUSH_REQUEST, wirePcmCapturePort } from '../../browser/pcmCaptureWorklet.js';

suite('PcmCaptureWorklet', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** A fake worklet port plus manually-fired timers, driven by the test. */
	function createHarness(onChunk: (samples: Float32Array) => void) {
		const posted: unknown[] = [];
		const port = {
			postMessage(message: unknown) { posted.push(message); },
			onmessage: null,
		} as IPcmCapturePort;

		let scheduled: (() => void) | undefined;
		const timers = {
			setTimeout(handler: TimerHandler) { scheduled = handler as () => void; return 1; },
			clearTimeout() { scheduled = undefined; },
		} as unknown as IPcmCaptureTimers;

		const { flush } = wirePcmCapturePort(port, timers, onChunk);
		return {
			flush,
			posted,
			deliver: (data: unknown) => (port.onmessage as ((ev: MessageEvent) => void) | null)?.({ data } as MessageEvent),
			fireTimeout: () => scheduled?.(),
			hasPendingTimeout: () => scheduled !== undefined,
		};
	}

	test('routes audio chunks to onChunk and resolves flush on ack', async () => {
		const chunks: Float32Array[] = [];
		const h = createHarness(samples => chunks.push(samples));

		const audio = new Float32Array([0.1, 0.2]);
		h.deliver(audio);

		const flushed = h.flush();
		// The tail chunk is delivered before the acknowledgment arrives.
		const tail = new Float32Array([0.3]);
		h.deliver(tail);
		h.deliver({ type: PCM_FLUSH_ACK });
		await flushed;

		assert.deepStrictEqual(
			{ posted: h.posted, chunks, timeoutCleared: !h.hasPendingTimeout() },
			{ posted: [{ type: PCM_FLUSH_REQUEST }], chunks: [audio, tail], timeoutCleared: true }
		);
	});

	test('resolves flush on timeout when no ack arrives', async () => {
		const chunks: Float32Array[] = [];
		const h = createHarness(samples => chunks.push(samples));

		const flushed = h.flush();
		h.fireTimeout();
		await flushed;

		assert.deepStrictEqual(chunks, []);
	});
});
