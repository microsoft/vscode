/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWorkbenchMenuMotionContextMenuOptions, WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from '../../../browser/actions/menuMotion.js';

suite('MenuMotion', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('provides element anchoring and motion options', () => {
		const anchor = $('.anchor');
		const options = getWorkbenchMenuMotionContextMenuOptions(anchor);

		assert.deepStrictEqual({
			anchor: options.getAnchor(),
			menuClassName: options.getMenuClassName?.(),
			closeAnimation: options.closeAnimation
		}, {
			anchor,
			menuClassName: WORKBENCH_MENU_MOTION_CLASS,
			closeAnimation: workbenchMenuCloseAnimation
		});
	});
});
