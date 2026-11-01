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
import { LineInjectedText } from '../../../common/textModelEvents.js';

/**
 * Measures `text` the way advanced wrapping does, in a container one pixel wide unless
 * `wrappingColumn` is given. The browser then puts every character on a line of its own whichever
 * font it ends up picking, so the break offsets, and with them the visible column each character
 * sits at, do not depend on the machine running the test.
 */
function measure(text: string, useTwoCellFullwidthCharacters: boolean, injectedTexts: LineInjectedText[] | null = null, wrappingColumn = 1): { breakOffsets: number[]; visibleColumns: number[] } {
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
		getLineInjectedText: () => injectedTexts
	};
	const computer = DOMLineBreaksComputerFactory.create(mainWindow).createLineBreaksComputer(context, fontInfo, 4, wrappingColumn, WrappingIndent.None, 'normal', false, useTwoCellFullwidthCharacters);
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

	test('a space that ends the line after injected text reserving space does not prevent wrapping', () => {
		// The space renders in a span of its own, which has no client rects.
		const { breakOffsets } = measure('ab ', false, [new LineInjectedText(0, 1, 3, { content: '', widthInEm: 1 }, 0)]);
		assert.deepStrictEqual(breakOffsets, [1, 3]);
	});

	test('a space between injected texts reserving space stays on the line it ends', () => {
		// In a container 41px wide, `a` and the space take about 17px, so the 2em (28px) that the
		// injected text before `b` reserves goes on the next line, along with `b`. The space renders in a
		// span of its own between the injected texts, and is collapsed where the line wraps.
		const { breakOffsets } = measure('a b', false, [
			new LineInjectedText(0, 1, 2, { content: '', widthInEm: 0.001 }, 0),
			new LineInjectedText(0, 1, 3, { content: '', widthInEm: 2 }, 1),
		], 41);
		assert.deepStrictEqual(breakOffsets, [2, 3]);
	});
});
