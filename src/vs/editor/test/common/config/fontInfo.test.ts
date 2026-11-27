/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyFontFamilyFallback, EDITOR_FONT_DEFAULTS } from '../../../common/config/fontInfo.js';

suite('applyFontFamilyFallback', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const platformFallback = EDITOR_FONT_DEFAULTS.fontFamily;

	test('appends the platform default font family as a fallback for a custom font', () => {
		const result = applyFontFamilyFallback('MyCustomFont');
		assert.strictEqual(result, `MyCustomFont, ${platformFallback}`);
	});

	test('wraps a font family containing a space in quotes before appending the fallback', () => {
		const result = applyFontFamilyFallback('Fira Code');
		assert.strictEqual(result, `"Fira Code", ${platformFallback}`);
	});

	test('does not double-wrap a font family that already looks escaped', () => {
		const result = applyFontFamilyFallback('"My Font", Consolas');
		assert.strictEqual(result, `"My Font", Consolas, ${platformFallback}`);
	});

	test('does not duplicate the fallback when the font family already equals the platform default', () => {
		const result = applyFontFamilyFallback(platformFallback);
		assert.strictEqual(result, platformFallback);
	});
});
