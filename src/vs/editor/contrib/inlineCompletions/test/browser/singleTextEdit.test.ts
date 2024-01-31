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

		function testInverseEdits() {
			const randomText = randomMultilineString(10);
			const model = createTextModel(randomText);

			const edits = generateRandomDisjointEdits(model, 3);
			const invEdits = inverseEdits(model, edits);

			model.applyEdits(edits);
			model.applyEdits(invEdits);

			assert.deepStrictEqual(model.getValue(), randomText);
			model.dispose();
		}

		for (let i = 0; i < 1; i++) {
			testInverseEdits();
		}
	});
});
