/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LocalTranscriptionService, selectCachedModelVariant } from '../../node/localTranscriptionService.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionResult } from '../../common/localTranscription.js';

type TranscriptionResponse = {
	is_final: boolean;
	content: { text?: string; transcript?: string }[];
	start_time?: number;
	end_time?: number;
};

type TranscriptionTestSession = {
	getStream(): AsyncGenerator<TranscriptionResponse>;
	stop(): Promise<void>;
	dispose(): Promise<void>;
};

type StreamingTestService = {
	_sessionActive: boolean;
	_session: TranscriptionTestSession | undefined;
	_consumePromise: Promise<void> | undefined;
	_openPromise: Promise<void> | undefined;
	_consume(session: { getStream(): AsyncGenerator<TranscriptionResponse> }, generation: number): Promise<void>;
};

suite('LocalTranscriptionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function transcribe(results: TranscriptionResponse[]): Promise<{ updates: ILocalTranscriptionResult[]; text: string }> {
		const service = store.add(new LocalTranscriptionService());
		const streamingService = service as unknown as StreamingTestService;
		const updates: ILocalTranscriptionResult[] = [];
		store.add(service.onDidTranscribe(result => updates.push(result)));
		streamingService._sessionActive = true;
		await streamingService._consume({
			async *getStream() {
				yield* results;
			},
		}, 0);
		return { updates, text: await service.stop() };
	}

	for (const outcome of ['stream', 'stop', 'success'] as const) {
		test(outcome === 'success' ? 'returns the native final transcript on stop' : `rejects a native ${outcome} failure during finalization`, async () => {
			const service = store.add(new LocalTranscriptionService());
			const streamingService = service as unknown as StreamingTestService;
			const finished = new DeferredPromise<TranscriptionResponse[]>();
			const error = new Error('native inference failed');
			const updates: ILocalTranscriptionResult[] = [];
			store.add(service.onDidTranscribe(result => updates.push(result)));
			const session: TranscriptionTestSession = {
				async *getStream() {
					yield* await finished.p;
				},
				async stop() {
					if (outcome === 'stream') {
						await finished.error(error);
					} else if (outcome === 'stop') {
						await finished.complete([]);
						throw error;
					} else {
						await finished.complete([{ is_final: true, content: [{ text: 'final transcript' }] }]);
					}
				},
				async dispose() {
					await finished.complete([]);
				},
			};
			streamingService._sessionActive = true;
			streamingService._session = session;
			streamingService._consumePromise = streamingService._consume(session, 0);

			if (outcome === 'success') {
				assert.deepStrictEqual({ text: await service.stop(), updates }, {
					text: 'final transcript',
					updates: [{ text: 'final transcript', isFinal: true, finalizedText: 'final transcript' }],
				});
			} else {
				await assert.rejects(service.stop(), error);
				assert.deepStrictEqual(updates, []);
			}
		});
	}

	test('ignores stream errors caused by cancellation', async () => {
		const service = store.add(new LocalTranscriptionService());
		const streamingService = service as unknown as StreamingTestService;
		const finished = new DeferredPromise<TranscriptionResponse[]>();
		const statuses: ILocalTranscriptionModelStatus[] = [];
		store.add(service.onDidChangeModelStatus(status => statuses.push(status)));
		const session: TranscriptionTestSession = {
			async *getStream() {
				yield* await finished.p;
			},
			async stop() { },
			async dispose() {
				await finished.error(new Error('cancelled'));
			},
		};
		streamingService._sessionActive = true;
		streamingService._session = session;
		streamingService._consumePromise = streamingService._consume(session, 0);

		await service.cancel();

		assert.deepStrictEqual({ statuses, text: await service.stop() }, { statuses: [], text: '' });
	});

	test('rejects a failed session open rather than returning an empty transcript', async () => {
		const service = store.add(new LocalTranscriptionService());
		const streamingService = service as unknown as StreamingTestService;
		const error = new Error('session failed to open');
		streamingService._openPromise = Promise.reject(error);

		await assert.rejects(service.stop(), error);
	});

	test('a cancelled stop does not dispose a newer session', async () => {
		const service = store.add(new LocalTranscriptionService());
		const streamingService = service as unknown as StreamingTestService;
		const stopping = new DeferredPromise<void>();
		const resumeStop = new DeferredPromise<void>();
		const finished = new DeferredPromise<TranscriptionResponse[]>();
		const session: TranscriptionTestSession = {
			async *getStream() {
				yield* await finished.p;
			},
			async stop() {
				await stopping.complete();
				await resumeStop.p;
			},
			async dispose() {
				await finished.complete([]);
			},
		};
		streamingService._sessionActive = true;
		streamingService._session = session;
		streamingService._consumePromise = streamingService._consume(session, 0);

		const stop = service.stop();
		await stopping.p;
		await service.cancel();
		let disposed = false;
		const replacement: TranscriptionTestSession = {
			getStream: () => session.getStream(),
			async stop() { },
			async dispose() { disposed = true; },
		};
		streamingService._session = replacement;
		streamingService._sessionActive = true;
		await resumeStop.complete();

		assert.deepStrictEqual({
			text: await stop,
			disposed,
			active: streamingService._sessionActive,
			session: streamingService._session,
		}, { text: '', disposed: false, active: true, session: replacement });
	});

	test('preserves whitespace-only deltas and subword boundaries without a final segment', async () => {
		const chunks = ['What', ' ', 'is', ' ', 'wrong', ' with', ' the', ' ', 'trans', 'cript', '?'];
		const result = await transcribe(chunks.map(text => ({ is_final: false, content: [{ text }] })));
		assert.deepStrictEqual(result, {
			updates: [
				'What', 'What ', 'What is', 'What is ', 'What is wrong', 'What is wrong with',
				'What is wrong with the', 'What is wrong with the ', 'What is wrong with the trans',
				'What is wrong with the transcript', 'What is wrong with the transcript?',
			].map(text => ({ text, isFinal: false, finalizedText: '' })),
			text: 'What is wrong with the transcript?',
		});
	});

	test('filters language tokens even when split across interim deltas', async () => {
		const chunks = ['<', 'en', '-', 'US', '>Hello', ' ', '<fr-', 'FR>', 'world', '!'];
		const result = await transcribe(chunks.map(transcript => ({ is_final: false, content: [{ transcript }] })));
		assert.deepStrictEqual(result, {
			updates: ['', '', '', '', 'Hello', 'Hello ', 'Hello ', 'Hello ', 'Hello world', 'Hello world!']
				.map(text => ({ text, isFinal: false, finalizedText: '' })),
			text: 'Hello world!',
		});
	});

	test('filters language tokens from final segments and preserves segment refinement', async () => {
		const result = await transcribe([
			{ is_final: true, content: [{ text: '<en-US>Hello' }], start_time: 0, end_time: 1 },
			{ is_final: true, content: [{ text: '<en-US>Hello world.' }], start_time: 0, end_time: 1 },
			{ is_final: true, content: [{ text: '<ja-JP>こんにちは<ja-JP>。' }], start_time: 1, end_time: 2 },
		]);
		assert.deepStrictEqual(result, {
			updates: ['Hello', 'Hello world.', 'Hello world. こんにちは。']
				.map(text => ({ text, isFinal: false, finalizedText: text })),
			text: 'Hello world. こんにちは。',
		});
	});

	test('preserves dictated markup and ordinary locale names', async () => {
		const chunks = ['Use en-US with ', '<', 'di', 'v>', ' and <custom-tag>.'];
		const result = await transcribe(chunks.map(text => ({ is_final: false, content: [{ text }] })));
		assert.strictEqual(result.text, 'Use en-US with <div> and <custom-tag>.');
	});

	test('joins finalized text to a filtered interim tail without changing punctuation', async () => {
		const result = await transcribe([
			{ is_final: true, content: [{ text: '<en-US>Hello' }], start_time: 0, end_time: 1 },
			...['<en-US>', ',', ' ', 'world', '!'].map(text => ({ is_final: false, content: [{ text }] })),
		]);
		assert.deepStrictEqual(result, {
			updates: ['Hello', 'Hello', 'Hello,', 'Hello, ', 'Hello, world', 'Hello, world!']
				.map(text => ({ text, isFinal: false, finalizedText: 'Hello' })),
			text: 'Hello, world!',
		});
	});

	test('restores an incomplete token-like literal when the stream ends', async () => {
		const result = await transcribe([
			{ is_final: false, content: [{ text: 'Use <en-' }] },
		]);
		assert.deepStrictEqual(result, {
			updates: [{ text: 'Use ', isFinal: false, finalizedText: '' }],
			text: 'Use <en-',
		});
	});

	test('selects a persisted model variant when catalog metadata selected an uncached variant', () => {
		const uncached = { id: 'model-cpu:2', isCached: false };
		const cached = { id: 'model-cpu:1', isCached: true };
		let selected = uncached;
		const model = {
			get isCached() { return selected.isCached; },
			variants: [uncached, cached],
			selectVariant: (variant: typeof uncached) => selected = variant,
		};

		selectCachedModelVariant(model);

		assert.strictEqual(selected.id, cached.id);
	});

	test('preserves the selected model variant when it is already cached', () => {
		const selected = { id: 'model-cpu:2', isCached: true };
		let selectionCount = 0;
		const model = {
			isCached: true,
			variants: [selected, { id: 'model-cpu:1', isCached: true }],
			selectVariant: () => selectionCount++,
		};

		selectCachedModelVariant(model);

		assert.strictEqual(selectionCount, 0);
	});
});
