/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getMobileViewportDimension } from '../../browser/parts/mobile/mobileVisualViewport.js';

suite('Sessions - Mobile Visual Viewport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('constrains phone layout to the visible viewport height', () => {
		const layoutViewport = new Dimension(412, 915);

		assert.deepStrictEqual([
			getMobileViewportDimension(layoutViewport, { height: 515 }),
			getMobileViewportDimension(layoutViewport, { height: 980 }),
			getMobileViewportDimension(layoutViewport, undefined),
		], [
			new Dimension(412, 515),
			new Dimension(412, 915),
			layoutViewport,
		]);
	});
});
