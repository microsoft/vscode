/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { clearFullwidthLetterSpacingProviders, getFullwidthLetterSpacingProvider } from '../../../browser/config/fullwidthLetterSpacing.js';
import { FontInfo } from '../../../common/config/fontInfo.js';

suite('FullwidthLetterSpacingProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		clearFullwidthLetterSpacingProviders();
	});

	test('measures graphemes in their effective text style', () => {
		const style = mainWindow.document.createElement('style');
		style.textContent = [
			'.fullwidth-letter-spacing-small { font-size: 10px; }',
			'.fullwidth-letter-spacing-large { font-size: 20px; }',
		].join('\n');
		mainWindow.document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));

		const provider = getFullwidthLetterSpacingProvider(mainWindow, createFontInfo(), true)!;
		provider.prepare([
			{ grapheme: '中', className: 'fullwidth-letter-spacing-small' },
			{ grapheme: '中', className: 'fullwidth-letter-spacing-large' },
		]);

		assert.ok(
			provider.getLetterSpacing('中', 'fullwidth-letter-spacing-small')
			> provider.getLetterSpacing('中', 'fullwidth-letter-spacing-large')
		);
	});

	test('accepts zero-width full-width graphemes', () => {
		const provider = getFullwidthLetterSpacingProvider(mainWindow, createFontInfo(), true)!;
		provider.prepare([{ grapheme: '\u3099', className: '' }]);

		assert.ok(Number.isFinite(provider.getLetterSpacing('\u3099', '')));
	});
});

function createFontInfo(): FontInfo {
	return new FontInfo({
		pixelRatio: 1,
		fontFamily: 'monospace',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: 'normal',
		fontVariationSettings: 'normal',
		lineHeight: 20,
		letterSpacing: 0,
		isMonospace: true,
		typicalHalfwidthCharacterWidth: 8,
		typicalFullwidthCharacterWidth: 16,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 8,
		middotWidth: 8,
		wsmiddotWidth: 8,
		maxDigitWidth: 8,
	}, true);
}
