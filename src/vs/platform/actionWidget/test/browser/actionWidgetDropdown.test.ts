/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IActionListCloseAnimation } from '../../browser/actionList.js';
import { ACTION_WIDGET_DROPDOWN_MOTION_CLASS, actionWidgetDropdownCloseAnimation, withActionWidgetDropdownMotion } from '../../browser/actionWidgetDropdown.js';

suite('ActionWidgetDropdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies motion defaults idempotently and preserves overrides', () => {
		const customCloseAnimation: IActionListCloseAnimation = {
			className: 'custom-closing',
			duration: 42
		};

		assert.deepStrictEqual({
			defaults: withActionWidgetDropdownMotion(undefined),
			overrides: withActionWidgetDropdownMotion({
				className: `custom ${ACTION_WIDGET_DROPDOWN_MOTION_CLASS}`,
				closeAnimation: customCloseAnimation,
				showFilter: true
			})
		}, {
			defaults: {
				className: ACTION_WIDGET_DROPDOWN_MOTION_CLASS,
				closeAnimation: actionWidgetDropdownCloseAnimation
			},
			overrides: {
				className: `custom ${ACTION_WIDGET_DROPDOWN_MOTION_CLASS}`,
				closeAnimation: customCloseAnimation,
				showFilter: true
			}
		});
	});
});
