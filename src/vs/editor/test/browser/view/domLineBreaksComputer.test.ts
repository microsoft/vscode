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
import { ILineBreaksComputerContext, ModelLineProjectionData } from '../../../common/modelLineProjectionData.js';
import { LineInjectedText } from '../../../common/textModelEvents.js';

suite('DOMLineBreaksComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fontInfo = new FontInfo({
		pixelRatio: 1,
		fontFamily: 'Arial',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: '',
		fontVariationSettings: '',
		lineHeight: 19,
		letterSpacing: 0,
		isMonospace: false,
		typicalHalfwidthCharacterWidth: 7,
		typicalFullwidthCharacterWidth: 14,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 7,
		middotWidth: 7,
		wsmiddotWidth: 7,
		maxDigitWidth: 7
	}, false);

	function computeLineBreaks(text: string, injectedText: LineInjectedText[] | null, wrappingColumn = 4): ModelLineProjectionData | null {
		const context: ILineBreaksComputerContext = {
			getLineContent: () => text,
			getLineInjectedText: () => injectedText
		};
		const computer = DOMLineBreaksComputerFactory.create(mainWindow).createLineBreaksComputer(
			context,
			fontInfo,
			4,
			wrappingColumn,
			WrappingIndent.None,
			'normal',
			false
		);
		computer.addRequest(1, null);
		return computer.finalize()[0];
	}

	test('tracks DOM spans without fixed-width injected text', () => {
		const result = computeLineBreaks('alpha beta gamma', null);

		assert.ok(result && result.breakOffsets.length > 1);
	});

	test('tracks DOM spans with fixed-width injected text', () => {
		const result = computeLineBreaks('alpha beta gamma', [
			new LineInjectedText(0, 1, 7, { content: '\xa0', widthInEm: 3 }, 0)
		]);

		assert.ok(result && result.breakOffsets.length > 1);
	});

	test('tracks adjacent fixed-width DOM spans', () => {
		const result = computeLineBreaks('alpha beta gamma', [
			new LineInjectedText(0, 1, 7, { content: 'x', widthInEm: 1 }, 0),
			new LineInjectedText(0, 1, 7, { content: 'y', widthInEm: 1 }, 1)
		]);

		assert.ok(result && result.breakOffsets.length > 1);
	});

	test('splits long DOM spans without fixed-width injected text', () => {
		const text = 'a'.repeat(16385);
		const result = computeLineBreaks(text, null, text.length + 1);

		assert.strictEqual(result?.breakOffsets.at(-1), text.length);
	});
});
