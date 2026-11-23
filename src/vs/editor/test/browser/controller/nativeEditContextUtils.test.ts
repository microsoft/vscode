/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { FocusTracker } from '../../../browser/controller/editContext/native/nativeEditContextUtils.js';
import { registerTestIframe } from '../../../../base/test/browser/testWindow.js';

suite('NativeEditContextUtils', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks focus in the DOM node owner document', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));
		disposables.add(registerTestIframe(iframe));

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

	test('clears focus when activeElement moves to another element without blur event', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));
		disposables.add(registerTestIframe(iframe));

		const target1 = iframe.contentDocument!.createElement('div');
		target1.tabIndex = 0;
		iframe.contentDocument!.body.appendChild(target1);

		const target2 = iframe.contentDocument!.createElement('div');
		target2.tabIndex = 0;
		iframe.contentDocument!.body.appendChild(target2);

		let focused1 = false;
		const tracker1 = disposables.add(new FocusTracker(new NullLogService(), target1, value => focused1 = value));
		tracker1.focus();

		assert.strictEqual(tracker1.isFocused, true);
		assert.strictEqual(focused1, true);

		// Move focus directly to target2 without dispatching blur on target1 (simulating window lacking OS focus)
		target2.focus();

		assert.strictEqual(iframe.contentDocument!.activeElement === target2, true);
		assert.strictEqual(tracker1.isFocused, false);
		assert.strictEqual(focused1, false);
	});
});
