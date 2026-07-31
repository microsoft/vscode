/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { selectSearchTreeElementIfPresent } from '../../browser/searchTreeSelection.js';
import { MockObjectTree } from './mockSearchTree.js';

suite('selectSearchTreeElementIfPresent (#328427)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('skips setSelection/setFocus when the element is not materialized', () => {
		const tree = new MockObjectTree<object, object>([]);
		const match = { id: 'remapped-match' };

		assert.strictEqual(selectSearchTreeElementIfPresent(tree, match), false);
		assert.deepStrictEqual(tree.getSelection(), []);
		assert.deepStrictEqual(tree.getFocus(), []);
	});

	test('does not throw Tree element not found for unmaterialized elements', () => {
		const tree = new MockObjectTree<object, object>([]);
		const match = { id: 'remapped-match' };

		assert.doesNotThrow(() => selectSearchTreeElementIfPresent(tree, match));
		assert.throws(() => tree.setSelection([match]), /Tree element not found/);
	});

	test('selects and focuses when the element is materialized', () => {
		const match = { id: 'notebook-match' };
		const tree = new MockObjectTree<object, object>([match]);

		assert.strictEqual(selectSearchTreeElementIfPresent(tree, match), true);
		assert.deepStrictEqual(tree.getSelection(), [match]);
		assert.deepStrictEqual(tree.getFocus(), [match]);
	});

	test('skips redundant setSelection/setFocus when already selected and focused', () => {
		const match = { id: 'notebook-match' };
		const tree = new MockObjectTree<object, object>([match]);
		tree.setSelection([match]);
		tree.setFocus([match]);

		let setSelectionCalls = 0;
		let setFocusCalls = 0;
		tree.setSelection = () => { setSelectionCalls++; };
		tree.setFocus = () => { setFocusCalls++; };

		assert.strictEqual(selectSearchTreeElementIfPresent(tree, match), true);
		assert.strictEqual(setSelectionCalls, 0);
		assert.strictEqual(setFocusCalls, 0);
	});
});
