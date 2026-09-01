/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DOMLineBreaksComputerFactory } from '../../../browser/view/domLineBreaksComputer.js';
import { WrappingIndent } from '../../../common/config/editorOptions.js';
import { FontInfo } from '../../../common/config/fontInfo.js';
import { ILineBreaksComputerContext } from '../../../common/modelLineProjectionData.js';
import { LineInjectedText } from '../../../common/textModelEvents.js';

suite('DOMLineBreaksComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('wraps mixed ASCII and a full-width grapheme at atomic two-cell boundaries', () => {
		const text = 'a擦\u0301b';
		const context: ILineBreaksComputerContext = {
			getLineContent: () => text,
			getLineInjectedText: () => null,
		};
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
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 15,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: 10,
			middotWidth: 10,
			wsmiddotWidth: 10,
			maxDigitWidth: 10,
		}, false);
		const computer = DOMLineBreaksComputerFactory.create(getActiveWindow()).createLineBreaksComputer(
			context,
			fontInfo,
			4,
			2,
			WrappingIndent.None,
			'normal',
			false,
			true,
		);
		computer.addRequest(1, null);

		assert.deepStrictEqual(computer.finalize()[0]?.breakOffsets, [1, 3, 4]);
	});

	test('wraps full-width graphemes at atomic boundaries with fixed-width injected text', () => {
		const text = 'a擦\u0301b';
		const injectedText = [
			new LineInjectedText(
				0,
				1,
				2,
				{ content: 'Z', widthInEm: 1 },
				0,
			),
		];
		const context: ILineBreaksComputerContext = {
			getLineContent: () => text,
			getLineInjectedText: () => injectedText,
		};
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
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 15,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: 10,
			middotWidth: 10,
			wsmiddotWidth: 10,
			maxDigitWidth: 10,
		}, false);
		const computer = DOMLineBreaksComputerFactory.create(getActiveWindow()).createLineBreaksComputer(
			context,
			fontInfo,
			4,
			4,
			WrappingIndent.None,
			'normal',
			false,
			true,
		);
		computer.addRequest(1, null);

		assert.deepStrictEqual(computer.finalize()[0]?.breakOffsets, [2, 5]);
	});
});
