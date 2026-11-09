/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { RGBA } from '../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { executeTransform, lighten, withOpacity } from '../../common/colorUtils.js';
import { TestColorTheme } from './testThemeService.js';

suite('Color transforms', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('withOpacity replaces alpha without changing RGB', () => {
		const theme = new TestColorTheme();
		const colors = ['#123456', '#12345622', '#12345600'];

		assert.deepStrictEqual(colors.map(color => executeTransform(withOpacity(color, 0.8), theme)?.rgba), colors.map(() => new RGBA(18, 52, 86, 0.8)));
	});

	test('withOpacity resolves theme colours, nested transforms and missing colours', () => {
		const theme = new TestColorTheme({ source: '#12345622' });

		assert.deepStrictEqual([
			executeTransform(withOpacity('source', 0.8), theme)?.rgba,
			executeTransform(withOpacity(lighten('source', 1), 0.6), theme)?.rgba,
			executeTransform(withOpacity('missing', 0.8), theme),
		], [
			new RGBA(18, 52, 86, 0.8),
			new RGBA(36, 104, 172, 0.6),
			undefined,
		]);
	});

	test('withOpacity clamps alpha to its valid range', () => {
		const theme = new TestColorTheme();

		assert.deepStrictEqual([0, 1, -1, 2].map(opacity => executeTransform(withOpacity('#12345622', opacity), theme)?.rgba), [
			new RGBA(18, 52, 86, 0),
			new RGBA(18, 52, 86, 1),
			new RGBA(18, 52, 86, 0),
			new RGBA(18, 52, 86, 1),
		]);
	});
});
