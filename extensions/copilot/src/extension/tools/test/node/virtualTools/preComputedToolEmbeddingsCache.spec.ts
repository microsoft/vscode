/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { EmbeddingType, EmbeddingVector } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { IEmbeddingsCache } from '../../../../../platform/embeddings/common/embeddingsIndex';
import { NullEnvService } from '../../../../../platform/env/common/nullEnvService';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { PreComputedToolEmbeddingsCache } from '../../../common/virtualTools/preComputedToolEmbeddingsCache';

function createCache(data: readonly { readonly key: string; readonly embedding: EmbeddingVector }[] | Record<string, { readonly embedding: EmbeddingVector }>): PreComputedToolEmbeddingsCache {
	const embeddingsCache = new class extends mock<IEmbeddingsCache>() {
		override readonly embeddingType = EmbeddingType.metis_1024_I16_Binary;

		override async getCache<T>(): Promise<T> {
			return data as T;
		}
	}();
	const instantiationService = new class extends mock<IInstantiationService>() { }();
	instantiationService.createInstance = (() => embeddingsCache) as IInstantiationService['createInstance'];
	return new PreComputedToolEmbeddingsCache(new TestLogService(), instantiationService, NullEnvService.Instance);
}

describe('PreComputedToolEmbeddingsCache', () => {
	test('loads published array entries by tool name', async () => {
		const cache = createCache([{ key: 'click_element', embedding: [1, 0] }]);

		await cache.initialize();

		expect(cache.get({ name: 'click_element' })).toEqual({
			type: EmbeddingType.metis_1024_I16_Binary,
			value: [1, 0],
		});
	});

	test('loads legacy object entries by tool name', async () => {
		const cache = createCache({ click_element: { embedding: [1, 0] } });

		await cache.initialize();

		expect(cache.get({ name: 'click_element' })).toEqual({
			type: EmbeddingType.metis_1024_I16_Binary,
			value: [1, 0],
		});
	});
});
