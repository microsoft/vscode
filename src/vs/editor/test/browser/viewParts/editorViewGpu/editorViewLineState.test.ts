/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorViewLineState } from '../../../../browser/viewParts/editorViewGpu/editorViewLineState.js';

suite('EditorViewLineState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sends values once, then only the runs that change', () => {
		const state = new EditorViewLineState();
		state.spliceLines(0, 0, 6);
		assert.deepStrictEqual(state.foldingControlsToSend(1, ['expanded', null, null, 'collapsed']), [
			{ start: 1, controls: ['expanded', null, null, 'collapsed'] },
		]);
		assert.deepStrictEqual(state.foldingControlsToSend(1, ['expanded', null, null, 'collapsed']), []);
		assert.deepStrictEqual(state.foldingControlsToSend(0, [null, 'collapsed', null, 'expanded', 'collapsed', null]), [
			{ start: 0, controls: [null, 'collapsed'] },
			{ start: 3, controls: ['expanded'] },
			{ start: 5, controls: [null] },
		]);

		assert.deepStrictEqual(state.indentGuidesToSend(0, [0, 1, 2], [0, 0, 1]), [{ start: 0, counts: [0, 1, 2], activeLevels: [0, 0, 1] }]);
		// The active guide moves from line 2 to line 1.
		assert.deepStrictEqual(state.indentGuidesToSend(0, [0, 1, 2], [0, 1, 0]), [{ start: 1, counts: [1, 2], activeLevels: [1, 0] }]);
		assert.deepStrictEqual(state.indentGuidesToSend(0, [0, 1, 2], [0, 1, 0]), []);
	});

	test('a line sent again brings its folding control and loses its guides', () => {
		const state = new EditorViewLineState();
		state.spliceLines(0, 0, 3);
		state.foldingControlsToSend(0, ['expanded', 'expanded', null]);
		state.indentGuidesToSend(0, [1, 1, 1], [1, 1, 1]);

		state.replaceLines(1, 1, [{ text: 'x', foldingControl: 'collapsed' }]);
		assert.deepStrictEqual(state.foldingControlsToSend(0, ['expanded', 'collapsed', null]), []);
		assert.deepStrictEqual(state.foldingControlsToSend(0, ['expanded', 'expanded', null]), [{ start: 1, controls: ['expanded'] }]);
		assert.deepStrictEqual(state.indentGuidesToSend(0, [1, 1, 1], [1, 1, 1]), [{ start: 1, counts: [1], activeLevels: [1] }]);
		// A line sent again without a control has none.
		state.replaceLines(0, 1, [{ text: 'y' }]);
		assert.deepStrictEqual(state.foldingControlsToSend(0, [null, 'expanded', null]), []);
	});

	test('inserted lines have nothing yet and the lines below keep what they have', () => {
		const state = new EditorViewLineState();
		state.spliceLines(0, 0, 3);
		state.foldingControlsToSend(0, [null, 'expanded', 'collapsed']);
		state.indentGuidesToSend(0, [0, 1, 2], [0, 0, 0]);

		// Two lines inserted before line 1, then line 3 (now 5) deleted.
		state.spliceLines(1, 0, 2);
		state.spliceLines(4, 1, 0);
		assert.deepStrictEqual(state.foldingControlsToSend(0, [null, null, null, 'expanded']), [{ start: 1, controls: [null, null] }]);
		assert.deepStrictEqual(state.indentGuidesToSend(0, [0, 0, 0, 1], [0, 0, 0, 0]), [{ start: 1, counts: [0, 0], activeLevels: [0, 0] }]);

		state.reset();
		state.spliceLines(0, 0, 4);
		assert.deepStrictEqual(state.foldingControlsToSend(0, [null, null, null, 'expanded']), [{ start: 0, controls: [null, null, null, 'expanded'] }]);
	});
});
