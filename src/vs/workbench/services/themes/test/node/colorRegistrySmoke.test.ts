/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	ACTIVITY_BAR_HOVER_FOREGROUND,
	ACTIVITY_BAR_HOVER_BACKGROUND,
	ACTIVITY_BAR_TOP_HOVER_FOREGROUND,
	ACTIVITY_BAR_TOP_HOVER_BACKGROUND
} from '../../../../common/theme.js';

suite('Themes - Activity Bar hover color tokens (smoke)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('hover color tokens are registered', () => {
		assert.strictEqual(ACTIVITY_BAR_HOVER_FOREGROUND, 'activityBar.hoverForeground');
		assert.strictEqual(ACTIVITY_BAR_HOVER_BACKGROUND, 'activityBar.hoverBackground');
		assert.strictEqual(ACTIVITY_BAR_TOP_HOVER_FOREGROUND, 'activityBarTop.hoverForeground');
		assert.strictEqual(ACTIVITY_BAR_TOP_HOVER_BACKGROUND, 'activityBarTop.hoverBackground');
	});
});
