/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { FileChunk } from '../../../chunking/common/chunk';
import { PersistentTfIdf, TfIdfDoc } from '../tfidf';

/**
 * Generates all permutations of an array.
 *
 * This is useful for testing to make sure order does not effect the result.
 */
function permutate<T>(arr: T[]): T[][] {
	if (arr.length === 0) {
		return [[]];
	}

	const result: T[][] = [];

	for (let i = 0; i < arr.length; i++) {
		const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
		const permutationsRest = permutate(rest);
		for (let j = 0; j < permutationsRest.length; j++) {
			result.push([arr[i], ...permutationsRest[j]]);
		}
	}

	return result;
}

function assertPathsEqual(result: readonly FileChunk[], expected: readonly string[], docs?: TfIdfDoc[]) {
	assert.deepStrictEqual(result.map(x => x.file.path), expected,
		docs ? `Failed for doc order: ${docs.map(x => x.uri.path)}` : undefined);
}

suite('TF-IDF', () => {
	test('Search should return nothing when empty', async () => {
		const tfidf = new PersistentTfIdf(':memory:');
		tfidf;
		assertPathsEqual(await tfidf.search('something'), []);
	});

	test('Search should return nothing for term not in documents ', async () => {
		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([
			testFile('A', 'cat dog fish'),
		]);
		assertPathsEqual(await tfidf.search('elephant'), []);
	});

	test('Should return document with exact match', async () => {
		for (const docs of permutate([
			testFile('A', 'cat dog cat'),
			testFile('B', 'cat fish'),
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('dog'), ['/A'], docs);
		}
	});

	test('Should return document with more matches first', async () => {
		for (const docs of permutate([
			testFile('/A', 'cat dog cat'),
			testFile('/B', 'cat fish'),
			testFile('/C', 'frog'),
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('cat'), ['/A', '/B'], docs);
		}
	});

	test('Should return document with more matches first when term appears in all documents', async () => {
		for (const docs of permutate([
			testFile('/A', 'cat dog cat cat'),
			testFile('/B', 'cat fish'),
			testFile('/C', 'frog cat cat'),
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('cat'), ['/A', '/C', '/B'], docs);
		}
	});

	test('Should weigh less common term higher', async () => {
		for (const docs of permutate([
			testFile('A', 'cat dog cat'),
			testFile('B', 'fish'),
			testFile('C', 'cat cat cat cat'),
			testFile('D', 'cat fish')
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('cat the dog'), ['/A', '/C', '/D'], docs);
		}
	});

	test('Should ignore case and punctuation', async () => {
		for (const docs of permutate([
			testFile('/A', 'Cat doG.cat'),
			testFile('/B', 'cAt fiSH'),
			testFile('/C', 'frOg'),
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('. ,CaT!  '), ['/A', '/B'], docs);
		}
	});

	test('Should match on camelCase words', async () => {
		for (const docs of permutate([
			testFile('/A', 'catDog cat'),
			testFile('/B', 'fishCatFish'),
			testFile('/C', 'frogcat'),
		])) {
			const tfidf = new PersistentTfIdf(':memory:');
			await tfidf.addOrUpdate(docs);
			assertPathsEqual(await tfidf.search('catDOG'), ['/A', '/B'], docs);
		}
	});

	test('Should not match document after delete', async () => {
		const docA = testFile('/A', 'cat dog cat');
		const docB = testFile('/B', 'cat fish');
		const docC = testFile('/C', 'frog');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB, docC]);
		assertPathsEqual(await tfidf.search('cat'), ['/A', '/B']);

		tfidf.delete([docA.uri]);
		assertPathsEqual(await tfidf.search('cat'), ['/B']);

		tfidf.delete([docC.uri]);
		assertPathsEqual(await tfidf.search('cat'), ['/B']);

		tfidf.delete([docB.uri]);
		assertPathsEqual(await tfidf.search('cat'), []);
	});

	test('Should match for snake_case', async () => {
		const docA = testFile('/A', 'cat_dog cat _dog cat_');
		const docB = testFile('/B', 'fish cat bird_horse');
		const docC = testFile('/C', 'fish');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB, docC]);
		assertPathsEqual(await tfidf.search('cat'), ['/A', '/B']);
		assertPathsEqual(await tfidf.search('cat_dog'), ['/A', '/B']);
		assertPathsEqual(await tfidf.search('_dog'), ['/A']);
		assertPathsEqual(await tfidf.search('cat_'), ['/A', '/B']);
		assertPathsEqual(await tfidf.search('fish_cat'), ['/A', '/B', '/C']);
		assertPathsEqual(await tfidf.search('man_bear_pig'), []);

		// Make sure snake case is broken up too for searches
		assertPathsEqual(await tfidf.search('bird_horse'), ['/B']);
		assertPathsEqual(await tfidf.search('bird'), ['/B']);
		assertPathsEqual(await tfidf.search('horse'), ['/B']);
	});

	test('Should match with leading/trailing underscores', async () => {
		const docA = testFile('/A', '_cat dog_');
		const docB = testFile('/B', 'fish');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB]);
		assertPathsEqual(await tfidf.search('cat'), ['/A']);
		assertPathsEqual(await tfidf.search('_cat'), ['/A']);
		assertPathsEqual(await tfidf.search('cat_'), ['/A']);
		assertPathsEqual(await tfidf.search('dog'), ['/A']);
		assertPathsEqual(await tfidf.search('_dog'), ['/A']);
		assertPathsEqual(await tfidf.search('dog_'), ['/A']);
	});

	test('Should match words with digits', async () => {
		const docA = testFile('/A', 'cat2 dog');
		const docB = testFile('/B', 'fish cat2fish bi2rd');
		const docC = testFile('/C', 'fish3');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB, docC]);
		assertPathsEqual(await tfidf.search('cat2'), ['/A']);
		assertPathsEqual(await tfidf.search('cat2fish'), ['/B']);
		assertPathsEqual(await tfidf.search('fish'), ['/B', '/C']); // Should also match fish3
	});

	test('Should match words using $', async () => {
		const docA = testFile('/A', '$cat dog');
		const docB = testFile('/B', 'fish cat');
		const docC = testFile('/C', 'cat$ dog$cat');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB, docC]);
		assertPathsEqual(await tfidf.search('$cat'), ['/A']);
		assertPathsEqual(await tfidf.search('dog$cat'), ['/C']);
	});

	test('Should match on function calls', async () => {
		const docA = testFile('/A', 'cat() dog');
		const docB = testFile('/B', 'fish cat');
		const docC = testFile('/C', 'fish');

		const tfidf = new PersistentTfIdf(':memory:');
		await tfidf.addOrUpdate([docA, docB, docC]);
		assertPathsEqual(await tfidf.search('cat()'), ['/A', '/B']);
		assertPathsEqual(await tfidf.search('cat'), ['/A', '/B']);
	});
});

function testFile(path: string, content: string): TfIdfDoc {
	const uri = URI.file(path);
	return {
		uri,
		async getContentVersionId() { return '123'; },
		async getChunks() {
			return [{ file: uri, text: content, rawText: content, range: Range.lift({ startColumn: 0, startLineNumber: 0, endColumn: 0, endLineNumber: 0 }) }];
		},
	};
}
