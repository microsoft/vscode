/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IZaphKnowledgeChunk } from '../common/zaphBrainTypes';
import { ZaphBrainRagIndex } from './zaphBrainRagIndex';

suite('ZaphBrainRagIndex', () => {
	const chunks: IZaphKnowledgeChunk[] = [
		{
			id: 'c1',
			scraperId: 's1',
			text: 'Rust ownership and borrowing rules for memory safety',
			metadata: { category: 'programming', subcategory: 'rust', domain: 'rust-lang.org', url: 'https://rust-lang.org', tags: ['rust'] },
		},
		{
			id: 'c2',
			scraperId: 's2',
			text: 'React useState hook for component state management',
			metadata: { category: 'frameworks', subcategory: 'react', domain: 'react.dev', url: 'https://react.dev', tags: ['react'] },
		},
	];

	test('ranks relevant chunks higher', () => {
		const index = new ZaphBrainRagIndex(chunks);
		const results = index.search('rust ownership memory', 5, CancellationToken.None);
		assert.ok(results.length >= 1);
		assert.strictEqual(results[0].chunk.id, 'c1');
		assert.ok(results[0].score > 0);
	});
});
