/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DOMLineBreaksComputerFactory } from '../../../browser/view/domLineBreaksComputer.js';
import { WrappingIndent } from '../../../common/config/editorOptions.js';
import { FontInfo } from '../../../common/config/fontInfo.js';
import { ILineBreaksComputerContext } from '../../../common/modelLineProjectionData.js';
import { mainWindow } from '../../../../base/browser/window.js';

suite('DOMLineBreaksComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fontInfo = new FontInfo({
		pixelRatio: 1,
		fontFamily: 'monospace',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: '',
		fontVariationSettings: '',
		lineHeight: 20,
		letterSpacing: 0,
		isMonospace: true,
		typicalHalfwidthCharacterWidth: 20,
		typicalFullwidthCharacterWidth: 20,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 20,
		middotWidth: 20,
		wsmiddotWidth: 20,
		maxDigitWidth: 20
	}, false);

	function getBreakOffsets(text: string, forceFullwidthCharacterWidth: boolean): readonly number[] | null {
		const context: ILineBreaksComputerContext = {
			getLineContent: () => text,
			getLineInjectedText: () => null,
		};
		const computer = DOMLineBreaksComputerFactory.create(mainWindow).createLineBreaksComputer(
			context,
			fontInfo,
			4,
			2,
			WrappingIndent.None,
			'normal',
			false,
			forceFullwidthCharacterWidth
		);
		computer.addRequest(1, null);
		return computer.finalize()[0]?.breakOffsets ?? null;
	}

	test('forces eligible full-width characters to two cells', () => {
		assert.deepStrictEqual({
			natural: getBreakOffsets('a\u6F22b', false),
			bmp: getBreakOffsets('a\u6F22b', true),
			combining: getBreakOffsets('a\u6F22\u0301b', true),
			rtl: getBreakOffsets('a\u6F22\u0639b', true),
		}, {
			natural: null,
			bmp: [1, 2, 3],
			combining: null,
			rtl: null,
		});
	});
});
