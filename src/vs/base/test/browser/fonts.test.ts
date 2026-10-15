/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DEFAULT_UI_TYPOGRAPHY, getUITypography, IUITypography, onDidChangeUITypography, scaleUIMetric, setUITypography } from '../../browser/fonts.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('UI Typography', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => setUITypography(DEFAULT_UI_TYPOGRAPHY));

	test('scaleUIMetric rounds up and never shrinks', () => {
		const scale = (fontSize: number) => {
			setUITypography({ fontSize, fontFamily: undefined });
			return [22, 35, 72].map(px => scaleUIMetric(px));
		};

		assert.deepStrictEqual({ 10: scale(10), 13: scale(13), 18: scale(18), 26: scale(26) }, {
			10: [22, 35, 72],
			13: [22, 35, 72],
			18: [31, 49, 100],
			26: [44, 70, 144],
		});
	});

	test('setUITypography fires only for size or family changes', () => {
		const events: IUITypography[] = [];
		store.add(onDidChangeUITypography(typography => events.push(typography)));

		setUITypography({ fontSize: 13, fontFamily: undefined });
		setUITypography({ fontSize: 18, fontFamily: undefined });
		setUITypography({ fontSize: 18, fontFamily: undefined });
		setUITypography({ fontSize: 18, fontFamily: 'Inter' });
		setUITypography(DEFAULT_UI_TYPOGRAPHY);

		assert.deepStrictEqual({ events, current: getUITypography() }, {
			events: [
				{ fontSize: 18, fontFamily: undefined },
				{ fontSize: 18, fontFamily: 'Inter' },
				{ fontSize: 13, fontFamily: undefined },
			],
			current: DEFAULT_UI_TYPOGRAPHY,
		});
	});
});
