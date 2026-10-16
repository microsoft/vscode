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

	test('preserves nested ancestor scroll positions when focusing', () => {
		const outer = document.createElement('div');
		outer.style.cssText = 'position: absolute; top: 0; left: 0; width: 200px; height: 100px; overflow: auto;';
		document.body.appendChild(outer);
		disposables.add(toDisposable(() => outer.remove()));

		const inner = document.createElement('div');
		inner.style.cssText = 'position: relative; height: 300px; overflow: auto;';
		outer.appendChild(inner);

		const content = document.createElement('div');
		content.style.height = '900px';
		inner.appendChild(content);

		const target = document.createElement('div');
		target.style.cssText = 'position: absolute; top: 0; width: 1px; height: 1px;';
		target.tabIndex = 0;
		content.appendChild(target);

		outer.scrollTop = 100;
		inner.scrollTop = 200;
		assert.deepStrictEqual([outer.scrollTop, inner.scrollTop], [100, 200]);

		const focusChanges: boolean[] = [];
		const tracker = disposables.add(new FocusTracker(new NullLogService(), target, value => focusChanges.push(value)));
		tracker.focus();

		assert.deepStrictEqual({
			scrollTop: [outer.scrollTop, inner.scrollTop],
			activeElement: document.activeElement === target,
			focused: tracker.isFocused,
			focusChanges,
		}, {
			scrollTop: [100, 200],
			activeElement: true,
			focused: true,
			focusChanges: [true],
		});
	});

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
