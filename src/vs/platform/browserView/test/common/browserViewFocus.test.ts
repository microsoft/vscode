/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewReportedFocus } from '../../common/browserViewFocus.js';

suite('BrowserViewReportedFocus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the page\'s focus only while its window has focus: not while another window is active, though the page keeps focus in its own', () => {
		const reported: boolean[] = [];
		const focus = new BrowserViewReportedFocus(false, true, focused => reported.push(focused));
		const steps: boolean[] = [];
		const step = (change: () => void) => {
			change();
			steps.push(focus.focused);
		};

		step(() => focus.setViewFocused(true));		// the user clicks into the page
		step(() => focus.setWindowFocused(false));	// another window is activated; the page gets no blur
		step(() => focus.setViewFocused(true));		// a page event in the inactive window
		step(() => focus.setWindowFocused(true));	// back to its window
		step(() => focus.setViewFocused(false));	// focus moves to the workbench of its window
		step(() => focus.setWindowFocused(false));

		assert.deepStrictEqual({ steps, reported, initiallyFocusedInInactiveWindow: new BrowserViewReportedFocus(true, false, () => { }).focused }, {
			steps: [true, false, false, true, false, false],
			reported: [true, false, true, false],
			initiallyFocusedInInactiveWindow: false,
		});
	});
});
