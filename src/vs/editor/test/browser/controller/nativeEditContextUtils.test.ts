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

	test('clears focus of a previously focused tracker when no blur event is dispatched', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));
		disposables.add(registerTestIframe(iframe));

		const iframeWindow = iframe.contentWindow!;
		const iframeDocument = iframe.contentDocument!;
		const createTarget = () => {
			const target = iframeDocument.createElement('div');
			target.tabIndex = 0;
			iframeDocument.body.appendChild(target);
			return target;
		};
		const first = createTarget();
		const second = createTarget();

		const changes: string[] = [];
		const firstTracker = disposables.add(new FocusTracker(new NullLogService(), first, value => changes.push(`first:${value}`)));
		const secondTracker = disposables.add(new FocusTracker(new NullLogService(), second, value => changes.push(`second:${value}`)));
		firstTracker.focus();

		// Simulate a window without OS focus, where the browser dispatches no blur event
		const suppressBlur = (e: FocusEvent) => e.stopImmediatePropagation();
		iframeWindow.addEventListener('blur', suppressBlur, true);
		disposables.add(toDisposable(() => iframeWindow.removeEventListener('blur', suppressBlur, true)));
		secondTracker.focus();

		assert.deepStrictEqual({
			activeElement: iframeDocument.activeElement === second,
			firstFocused: firstTracker.isFocused,
			secondFocused: secondTracker.isFocused,
			changes,
		}, {
			activeElement: true,
			firstFocused: false,
			secondFocused: true,
			changes: ['first:true', 'first:false', 'second:true'],
		});
	});
});
