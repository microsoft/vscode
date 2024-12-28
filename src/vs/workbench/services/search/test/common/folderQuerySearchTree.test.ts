/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import assert from 'assert';
import { FolderQuerySearchTree } from '../../common/folderQuerySearchTree.js';
import { IFolderQuery } from '../../common/search.js';

suite('FolderQuerySearchTree', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const fq1 = { folder: URI.parse('file:///folder1?query1#fragment1') };
	const fq2 = { folder: URI.parse('file:///folder2?query2#fragment2') };
	const fq3 = { folder: URI.parse('file:///folder3?query3#fragment3') };
	const fq4 = { folder: URI.parse('file:///folder3?query3') };
	const fq5 = { folder: URI.parse('file:///folder3') };

	const folderQueries: IFolderQuery<URI>[] = [
		fq1,
		fq2,
		fq3,
		fq4,
		fq5,
	];

	const getFolderQueryInfo = (fq: IFolderQuery<URI>, i: number) => ({ folder: fq.folder, index: i });

	test('find query fragment aware substr correctly', () => {
		const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
		const result = tree.findQueryFragmentAwareSubstr(fq1.folder);
		const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1/foo/bar?query1#fragment1'));
		assert.deepStrictEqual(result, { folder: fq1.folder, index: 0 });
		assert.deepStrictEqual(result2, { folder: fq1.folder, index: 0 });
	});

	test('do not to URIs that do not have queries if the base has query', () => {
		const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
		const result = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1'));
		const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1?query1'));
		assert.deepStrictEqual(result, undefined);
		assert.deepStrictEqual(result2, undefined);
	});

	test('match correct entry with query/fragment', () => {
		const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
		const result = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt?query3#fragment3'));
		assert.deepStrictEqual(result, { folder: fq3.folder, index: 2 });

		const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt?query3'));
		assert.deepStrictEqual(result2, { folder: fq4.folder, index: 3 });

		const result3 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt'));
		assert.deepStrictEqual(result3, { folder: fq5.folder, index: 4 });
	});

	test('can find substr of non-query/fragment URIs', () => {
		const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
		const result = tree.findQueryFragmentAwareSubstr(fq5.folder);
		const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/hello/world'));
		assert.deepStrictEqual(result, { folder: fq5.folder, index: 4 });
		assert.deepStrictEqual(result2, { folder: fq5.folder, index: 4 });
	});

	test('iterate over all folderQueryInfo correctly', () => {
		const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
		const results: any[] = [];
		tree.forEachFolderQueryInfo(info => results.push(info));
		assert.equal(results.length, 5);
		assert.deepStrictEqual(results, folderQueries.map((fq, i) => getFolderQueryInfo(fq, i)));
	});


	test('`/` as a path', () => {
		const trie = new FolderQuerySearchTree([{ folder: URI.parse('memfs:/?q=1') }], getFolderQueryInfo);

		assert.deepStrictEqual(trie.findQueryFragmentAwareSubstr(URI.parse('memfs:/file.txt?q=1')), { folder: URI.parse('memfs:/?q=1'), index: 0 });
	});
});
