/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DOMLineBreaksComputerFactory } from '../../../browser/view/domLineBreaksComputer.js';
import { WrappingIndent } from '../../../common/config/editorOptions.js';
import { FontInfo } from '../../../common/config/fontInfo.js';
import { ILineBreaksComputerContext } from '../../../common/modelLineProjectionData.js';

/**
 * Measures `text` the way advanced wrapping does, in a container one pixel wide. The browser then
 * puts every character on a line of its own whichever font it ends up picking, so the break
 * offsets, and with them the visible column each character sits at, do not depend on the machine
 * running the test.
 */
function measure(text: string, useTwoCellFullwidthCharacters: boolean): { breakOffsets: number[]; visibleColumns: number[] } {
	const fontInfo = new FontInfo({
		pixelRatio: 1,
		fontFamily: 'monospace',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: '',
		fontVariationSettings: '',
		lineHeight: 19,
		letterSpacing: 0,
		isMonospace: true,
		typicalHalfwidthCharacterWidth: 1,
		typicalFullwidthCharacterWidth: 2,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 1,
		middotWidth: 1,
		wsmiddotWidth: 1,
		maxDigitWidth: 1
	}, false);
	const context: ILineBreaksComputerContext = {
		getLineContent: () => text,
		getLineInjectedText: () => null
	};
	const computer = DOMLineBreaksComputerFactory.create(mainWindow).createLineBreaksComputer(context, fontInfo, 4, 1, WrappingIndent.None, 'normal', false, useTwoCellFullwidthCharacters);
	computer.addRequest(1, null);
	const lineBreakData = computer.finalize()[0];
	assert.ok(lineBreakData, 'the line should have wrapped');
	return { breakOffsets: lineBreakData.breakOffsets, visibleColumns: lineBreakData.breakOffsetsVisibleColumn };
}

suite('Editor View - DOMLineBreaksComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a full-width character does not shift the narrow characters that follow it', () => {
		// Stretching full-width characters to two cells only changes how they are drawn: both
		// policies count them as two columns, so the two must agree on where every character sits.
		const text = '漢abc漢d';
		assert.deepStrictEqual({
			twoCells: measure(text, true),
			naturalWidth: measure(text, false)
		}, {
			twoCells: { breakOffsets: [1, 2, 3, 4, 5, 6], visibleColumns: [2, 3, 4, 5, 7, 8] },
			naturalWidth: { breakOffsets: [1, 2, 3, 4, 5, 6], visibleColumns: [2, 3, 4, 5, 7, 8] }
		});
	});
});
