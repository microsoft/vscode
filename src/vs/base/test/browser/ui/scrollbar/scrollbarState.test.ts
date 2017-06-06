/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ScrollbarState } from "vs/base/browser/ui/scrollbar/scrollbarState";

suite('ScrollbarState', () => {
	test('inflates slider size', () => {
		let actual = new ScrollbarState(0, 14, 0);
		actual.setVisibleSize(339);
		actual.setScrollSize(42423);
		actual.setScrollPosition(32787);

		assert.equal(actual.getArrowSize(), 0);
		assert.equal(actual.getRectangleLargeSize(), 339);
		assert.equal(actual.getRectangleSmallSize(), 14);
		assert.equal(actual.isNeeded(), true);
		assert.equal(actual.getSliderSize(), 20);
		assert.equal(actual.getSliderPosition(), 252);
		assert.equal(actual.getSliderCenter(), 262);
	});
});
