/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EmbeddingsService } from '../../common/embeddingsService.js';

suite('Workbench embeddings service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses the registered extension provider without changing inputs or cancellation', async () => {
		const service = store.add(new EmbeddingsService());
		const token = store.add(new CancellationTokenSource());
		const calls: string[][] = [];
		store.add(service.registerProvider('copilot.test', {
			provideEmbeddings: async (input, cancellation) => {
				assert.strictEqual(cancellation, token.token);
				calls.push(input);
				return [{ values: [1, 0] }];
			},
		}));
		assert.deepStrictEqual({
			result: await service.computeEmbeddings('copilot.test', ['synthetic example'], token.token),
			calls,
			models: [...service.allProviders],
		}, { result: [{ values: [1, 0] }], calls: [['synthetic example']], models: ['copilot.test'] });
	});

	test('disposing an older registration does not remove its replacement', async () => {
		const service = store.add(new EmbeddingsService());
		const token = store.add(new CancellationTokenSource());
		const older = store.add(service.registerProvider('copilot.test', { provideEmbeddings: async () => [{ values: [1, 0] }] }));
		const newer = store.add(service.registerProvider('copilot.test', { provideEmbeddings: async () => [{ values: [0, 1] }] }));
		older.dispose();
		assert.deepStrictEqual(await service.computeEmbeddings('copilot.test', ['synthetic'], token.token), [{ values: [0, 1] }]);
		newer.dispose();
		await assert.rejects(service.computeEmbeddings('copilot.test', ['synthetic'], token.token), /No embeddings provider/);
	});

	test('propagates provider failures rather than returning empty success', async () => {
		const service = store.add(new EmbeddingsService());
		const token = store.add(new CancellationTokenSource());
		store.add(service.registerProvider('copilot.test', { provideEmbeddings: async () => { throw new Error('endpoint unavailable'); } }));
		await assert.rejects(service.computeEmbeddings('copilot.test', ['synthetic'], token.token), /endpoint unavailable/);
	});

	test('does not contact a provider for a cancelled request', async () => {
		const service = store.add(new EmbeddingsService());
		const token = store.add(new CancellationTokenSource());
		let calls = 0;
		store.add(service.registerProvider('copilot.test', { provideEmbeddings: async () => { calls++; return [{ values: [1, 0] }]; } }));
		token.cancel();
		await assert.rejects(service.computeEmbeddings('copilot.test', ['synthetic'], token.token), isCancellationError);
		assert.strictEqual(calls, 0);
	});
});
