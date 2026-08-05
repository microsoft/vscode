/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../browser/widget/input/chatInputNoticeHost.js';

suite('ChatInputNoticeHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('suppresses lower-precedence notices until every higher claim is released', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const tipSuppressed: boolean[] = [];
		const record = () => tipSuppressed.push(host.isSuppressed(ChatInputNoticeLane.Tip, undefined));

		record();
		const notification = host.occupy(ChatInputNoticeLane.Notification);
		record();
		// Counted claims: two producers may share the onboarding lane.
		const voice = host.occupy(ChatInputNoticeLane.Onboarding);
		const dictation = host.occupy(ChatInputNoticeLane.Onboarding);
		notification.dispose();
		voice.dispose();
		record();
		dictation.dispose();
		record();

		assert.deepStrictEqual(tipSuppressed, [false, true, true, false]);
	});

	test('does not suppress a notice by an equal or lower-precedence claim', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		disposables.add(new DisposableStore()).add(host.occupy(ChatInputNoticeLane.Tip));

		assert.deepStrictEqual(
			{
				tip: host.isSuppressed(ChatInputNoticeLane.Tip, undefined),
				notification: host.isSuppressed(ChatInputNoticeLane.Notification, undefined),
			},
			{ tip: false, notification: false });
	});

	test('toggles focus between the leading notice and the input', () => {
		let noticeFocused = false;
		let inputFocusCount = 0;
		const host = disposables.add(new ChatInputNoticeHost(() => inputFocusCount++));
		const store = disposables.add(new DisposableStore());

		const withNothingShowing = host.toggleFocus();
		store.add(host.occupy(ChatInputNoticeLane.Tip, {
			hasFocus: () => noticeFocused,
			focus: () => { noticeFocused = true; },
		}));
		const movedIntoNotice = host.toggleFocus();
		const wentBackToInput = host.toggleFocus();

		assert.deepStrictEqual(
			{ withNothingShowing, movedIntoNotice, noticeFocused, wentBackToInput, inputFocusCount },
			{ withNothingShowing: false, movedIntoNotice: true, noticeFocused: true, wentBackToInput: true, inputFocusCount: 1 });
	});

	test('releases a lane only once when its claim is disposed repeatedly', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());

		store.add(host.occupy(ChatInputNoticeLane.Notification));
		const duplicate = host.occupy(ChatInputNoticeLane.Notification);
		duplicate.dispose();
		duplicate.dispose();

		assert.strictEqual(host.isSuppressed(ChatInputNoticeLane.Tip, undefined), true);
	});
});
