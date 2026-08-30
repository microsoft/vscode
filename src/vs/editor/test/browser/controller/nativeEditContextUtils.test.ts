/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { FocusTracker, NativeEditContextInputState } from '../../../browser/controller/editContext/native/nativeEditContextUtils.js';

suite('NativeEditContextUtils', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies text updates without changing trailing text', () => {
		const inputState = new NativeEditContextInputState('1234', 0, 0);

		const typeData = inputState.applyTextUpdate({
			text: 'r',
			selectionStart: 1,
			selectionEnd: 1,
			updateRangeStart: 0,
			updateRangeEnd: 0,
		}, true);

		assert.deepStrictEqual({
			typeData,
			text: inputState.text,
			selectionStart: inputState.selectionStart,
			selectionEnd: inputState.selectionEnd,
		}, {
			typeData: {
				text: 'r',
				replacePrevCharCnt: 0,
				replaceNextCharCnt: 0,
				positionDelta: 0,
			},
			text: 'r1234',
			selectionStart: 1,
			selectionEnd: 1,
		});
	});

	test('preserves trailing text when macOS Pinyin commits an English candidate', () => {
		const inputState = new NativeEditContextInputState('revie1234', 5, 5);

		const pendingCandidate = inputState.applyTextUpdate({
			text: 'revie',
			selectionStart: 6,
			selectionEnd: 6,
			updateRangeStart: 0,
			updateRangeEnd: 5,
		}, true);
		const committedCandidate = inputState.applyTextUpdate({
			text: 'review',
			selectionStart: 6,
			selectionEnd: 6,
			updateRangeStart: 0,
			updateRangeEnd: 5,
		}, true);

		assert.deepStrictEqual({
			pendingCandidate,
			committedCandidate,
			text: inputState.text,
			selectionStart: inputState.selectionStart,
			selectionEnd: inputState.selectionEnd,
		}, {
			pendingCandidate: null,
			committedCandidate: {
				text: 'review',
				replacePrevCharCnt: 5,
				replaceNextCharCnt: 0,
				positionDelta: 0,
			},
			text: 'review1234',
			selectionStart: 6,
			selectionEnd: 6,
		});
	});

	test('applies selection-only updates outside composition', () => {
		const inputState = new NativeEditContextInputState('1234', 0, 0);

		const typeData = inputState.applyTextUpdate({
			text: '',
			selectionStart: 1,
			selectionEnd: 1,
			updateRangeStart: 0,
			updateRangeEnd: 0,
		}, false);

		assert.deepStrictEqual({
			typeData,
			text: inputState.text,
			selectionStart: inputState.selectionStart,
			selectionEnd: inputState.selectionEnd,
		}, {
			typeData: {
				text: '',
				replacePrevCharCnt: 0,
				replaceNextCharCnt: 0,
				positionDelta: 1,
			},
			text: '1234',
			selectionStart: 1,
			selectionEnd: 1,
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
