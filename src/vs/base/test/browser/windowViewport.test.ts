/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindowViewportState, IWindowViewportTarget } from '../../browser/windowViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Window viewport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports layout viewport when visual viewport is unavailable', () => {
		const target = {
			innerWidth: 800,
			innerHeight: 600,
			visualViewport: null,
		} as IWindowViewportTarget;

		assert.deepStrictEqual(getWindowViewportState(target), {
			hasVisualViewport: false,
			layoutWidth: 800,
			layoutHeight: 600,
			visualWidth: 800,
			visualHeight: 600,
			visualOffsetLeft: 0,
			visualOffsetTop: 0,
			visualScale: 1,
		});
	});

	test('reports visual viewport dimensions, offset, and scale', () => {
		const target = {
			innerWidth: 800,
			innerHeight: 600,
			visualViewport: {
				width: 400,
				height: 300,
				offsetLeft: 10,
				offsetTop: 20,
				scale: 2,
			},
		} as IWindowViewportTarget;

		assert.deepStrictEqual(getWindowViewportState(target), {
			hasVisualViewport: true,
			layoutWidth: 800,
			layoutHeight: 600,
			visualWidth: 400,
			visualHeight: 300,
			visualOffsetLeft: 10,
			visualOffsetTop: 20,
			visualScale: 2,
		});
	});
});
