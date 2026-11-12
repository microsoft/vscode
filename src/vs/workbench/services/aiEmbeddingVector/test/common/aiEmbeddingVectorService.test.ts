/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AiEmbeddingVectorService, IAiEmbeddingVectorProvider } from '../../common/aiEmbeddingVectorService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('AiEmbeddingVectorService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: AiEmbeddingVectorService;

	setup(() => {
		service = new AiEmbeddingVectorService(store.add(new NullLogService()));
	});

	test('should reject empty model when registering provider', () => {
		const provider: IAiEmbeddingVectorProvider = {
			provideAiEmbeddingVector: () => Promise.resolve([[1]])
		};

		assert.throws(
			() => service.registerAiEmbeddingVectorProvider('', provider),
			/Embedding vector model must be a non-empty string\./
		);
	});

	test('should reject whitespace-only model when registering provider', () => {
		const provider: IAiEmbeddingVectorProvider = {
			provideAiEmbeddingVector: () => Promise.resolve([[1]])
		};

		assert.throws(
			() => service.registerAiEmbeddingVectorProvider('   ', provider),
			/Embedding vector model must be a non-empty string\./
		);
	});

	test('should register and unregister provider with valid model', () => {
		const provider: IAiEmbeddingVectorProvider = {
			provideAiEmbeddingVector: () => Promise.resolve([[1]])
		};

		const disposable = service.registerAiEmbeddingVectorProvider('test-model', provider);
		assert.strictEqual(service.isEnabled(), true);
		disposable.dispose();
		assert.strictEqual(service.isEnabled(), false);
	});
});
