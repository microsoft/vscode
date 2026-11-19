/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isLineDecorationsClickBeforeContent } from '../../../browser/controller/mouseTarget.js';

suite('MouseTarget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('clicks in the line decorations area to the right of the folding chevron place the cursor', () => {
		// Default layout: 10px line decorations + 16px folding controls, 12px font
		const decorationsWidth = 26;
		const fontSize = 12;
		const offsets = [0, 4, 10, 15, 20, 21, 25];

		assert.deepStrictEqual({
			withoutLineDecorations: offsets.map(offsetX => isLineDecorationsClickBeforeContent(offsetX, decorationsWidth, fontSize, false)),
			withLineDecorations: offsets.map(offsetX => isLineDecorationsClickBeforeContent(offsetX, decorationsWidth, fontSize, true)),
			withoutFoldingControls: offsets.filter(offsetX => offsetX < 10).map(offsetX => isLineDecorationsClickBeforeContent(offsetX, 10, fontSize, true)),
		}, {
			withoutLineDecorations: [true, true, true, true, true, true, true],
			withLineDecorations: [false, false, false, false, false, true, true],
			withoutFoldingControls: [false, false],
		});
	});
});
