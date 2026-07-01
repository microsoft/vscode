/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldCollapseCustomDiffToInline } from '../../browser/customEditors.js';

suite('CustomEditorService - shouldCollapseCustomDiffToInline', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('collapses only when space-limited and width is at or below the breakpoint', () => {
		const actual = {
			disabled: shouldCollapseCustomDiffToInline(false, 100, 900),
			wider: shouldCollapseCustomDiffToInline(true, 1200, 900),
			atBreakpoint: shouldCollapseCustomDiffToInline(true, 900, 900),
			belowBreakpoint: shouldCollapseCustomDiffToInline(true, 400, 900),
			unknownWidth: shouldCollapseCustomDiffToInline(true, undefined, 900),
			unknownBreakpoint: shouldCollapseCustomDiffToInline(true, 400, undefined),
		};

		assert.deepStrictEqual(actual, {
			disabled: false,
			wider: false,
			atBreakpoint: true,
			belowBreakpoint: true,
			unknownWidth: false,
			unknownBreakpoint: false,
		});
	});
});
