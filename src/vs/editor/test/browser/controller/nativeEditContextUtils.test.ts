/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { FocusTracker } from '../../../browser/controller/editContext/native/nativeEditContextUtils.js';

suite('NativeEditContextUtils', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks focus in the DOM node owner document', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));

		const target = iframe.contentDocument!.createElement('div');
		target.tabIndex = 0;
		iframe.contentDocument!.body.appendChild(target);

		let focused = false;
		const tracker = disposables.add(new FocusTracker(new NullLogService(), target, value => focused = value));
		tracker.focus();

		assert.deepStrictEqual({
			activeElement: iframe.contentDocument!.activeElement === target,
			focused,
			trackerFocused: tracker.isFocused,
		}, {
			activeElement: true,
			focused: true,
			trackerFocused: true,
		});
	});
});
