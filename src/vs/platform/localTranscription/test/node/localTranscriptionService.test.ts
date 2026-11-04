/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LocalTranscriptionService, selectCachedModelVariant } from '../../node/localTranscriptionService.js';
import { ILocalTranscriptionResult } from '../../common/localTranscription.js';

type TranscriptionResponse = {
	is_final: boolean;
	content: { text?: string; transcript?: string }[];
	start_time?: number;
	end_time?: number;
};

type StreamingTestService = {
	_sessionActive: boolean;
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
