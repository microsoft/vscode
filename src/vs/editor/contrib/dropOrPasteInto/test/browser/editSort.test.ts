/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DocumentOnDropEdit } from 'vs/editor/common/languages';
import { sortEditsByYieldTo } from 'vs/editor/contrib/dropOrPasteInto/browser/edit';

type DropEdit = DocumentOnDropEdit & { providerId: string | undefined };

function createTestEdit(providerId: string, args?: Partial<DropEdit>): DropEdit {
	return {
		label: '',
		insertText: '',
		providerId,
		...args,
	};
}

suite('sortEditsByYieldTo', () => {
	test('Should noop for empty edits', () => {
		const edits: DropEdit[] = [];

		assert.deepStrictEqual(sortEditsByYieldTo(edits), []);
	});

	test('Yielded to edit should get sorted after target', () => {
		const edits: DropEdit[] = [
			createTestEdit('a', { yieldTo: [{ providerId: 'b' }] }),
			createTestEdit('b'),
		];
		assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.providerId), ['b', 'a']);
	});

	test('Should handle chain of yield to', () => {
		{
			const edits: DropEdit[] = [
				createTestEdit('c', { yieldTo: [{ providerId: 'a' }] }),
				createTestEdit('a', { yieldTo: [{ providerId: 'b' }] }),
				createTestEdit('b'),
			];

			assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.providerId), ['b', 'a', 'c']);
		}
		{
			const edits: DropEdit[] = [
				createTestEdit('a', { yieldTo: [{ providerId: 'b' }] }),
				createTestEdit('c', { yieldTo: [{ providerId: 'a' }] }),
				createTestEdit('b'),
			];

			assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.providerId), ['b', 'a', 'c']);
		}
	});

	test(`Should not reorder when yield to isn't used`, () => {
		const edits: DropEdit[] = [
			createTestEdit('c', { yieldTo: [{ providerId: 'x' }] }),
			createTestEdit('a', { yieldTo: [{ providerId: 'y' }] }),
			createTestEdit('b'),
		];

		assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.providerId), ['c', 'a', 'b']);
	});
});
