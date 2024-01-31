/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { inverseEdits } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { generateRandomDisjointEdits, generateRandomMultilineString as randomMultilineString } from 'vs/editor/contrib/inlineCompletions/test/browser/utils';

suite('Single Text Edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('testing getNewRanges', () => {
		function testGetNewRanges() {
			const randomText = randomMultilineString(10);
			const model = createTextModel(randomText);
			const initialModel = createTextModel(randomText);
			const edits = generateRandomDisjointEdits(model, 3);
			model.applyEdits(edits);
			const invEdits = inverseEdits(initialModel, edits);
			model.applyEdits(invEdits);
			assert.deepStrictEqual(model.getValue(), randomText);
			model.dispose();
			initialModel.dispose();
		}

		for (let i = 0; i < 1; i++) {
			testGetNewRanges();
		}
	});
});
