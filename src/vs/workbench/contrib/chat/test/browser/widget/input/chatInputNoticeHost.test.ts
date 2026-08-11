/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
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
			focusTarget: {
				hasFocus: () => noticeFocused,
				focus: () => { noticeFocused = true; },
			},
		}));
		const movedIntoNotice = host.toggleFocus();
		const wentBackToInput = host.toggleFocus();

		assert.deepStrictEqual(
			{ withNothingShowing, movedIntoNotice, noticeFocused, wentBackToInput, inputFocusCount },
			{ withNothingShowing: false, movedIntoNotice: true, noticeFocused: true, wentBackToInput: true, inputFocusCount: 1 });
	});

	test('focuses the leading lane, not whichever notice registered last', () => {
		const focused: string[] = [];
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const target = (name: string) => ({ focusTarget: { hasFocus: () => false, focus: () => { focused.push(name); } } });

		const notification = host.occupy(ChatInputNoticeLane.Notification, target('notification'));
		// A tip claiming afterwards must not steal focus from the notification.
		store.add(host.occupy(ChatInputNoticeLane.Tip, target('tip')));
		host.toggleFocus();
		notification.dispose();
		host.toggleFocus();

		assert.deepStrictEqual(focused, ['notification', 'tip']);
	});

	test('keeps a lane claimed while the notice in it is swapped', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const tipSuppressed: boolean[] = [];
		store.add(autorun(reader => tipSuppressed.push(host.isSuppressed(ChatInputNoticeLane.Tip, reader))));

		// Voice hands the onboarding lane over to dictation. The tip must not get
		// a window to flash into between the two claims.
		host.setOccupied(ChatInputNoticeLane.Onboarding, true, { hasFocus: () => false, focus: () => { } });
		host.setOccupied(ChatInputNoticeLane.Onboarding, true, { hasFocus: () => false, focus: () => { } });
		host.setOccupied(ChatInputNoticeLane.Onboarding, false);

		assert.deepStrictEqual(tipSuppressed, [false, true, false]);
	});

	test('keeps a re-claim made while a lane is being released releasable', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());

		host.setOccupied(ChatInputNoticeLane.Onboarding, true);
		// A reaction that claims the lane the moment it frees. Its lease must still
		// be tracked, or the lane could never be released again.
		let reclaimed = false;
		store.add(autorun(reader => {
			if (!host.isSuppressed(ChatInputNoticeLane.Tip, reader) && !reclaimed) {
				reclaimed = true;
				host.setOccupied(ChatInputNoticeLane.Onboarding, true);
			}
		}));

		host.setOccupied(ChatInputNoticeLane.Onboarding, false);
		const claimedAfterReentrantRelease = host.isSuppressed(ChatInputNoticeLane.Tip, undefined);
		host.setOccupied(ChatInputNoticeLane.Onboarding, false);

		assert.deepStrictEqual(
			{ reclaimed, claimedAfterReentrantRelease, released: !host.isSuppressed(ChatInputNoticeLane.Tip, undefined) },
			{ reclaimed: true, claimedAfterReentrantRelease: true, released: true });
	});

	test('leads the newest claim in a lane and returns to the previous one after it', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const leading: string[] = [];
		const claim = (name: string) => host.occupy(ChatInputNoticeLane.Onboarding, {
			onDidChangeLeading: isLeading => leading.push(`${name}:${isLeading}`),
		});

		// Recency within a lane and precedence between lanes are one mechanism, so
		// a peer introduction and a notification both put the first card away.
		const voice = store.add(claim('voice'));
		const dictation = claim('dictation');
		const notification = host.occupy(ChatInputNoticeLane.Notification);
		notification.dispose();
		dictation.dispose();
		void voice;

		assert.deepStrictEqual(leading, [
			'voice:true',
			'voice:false', 'dictation:true',
			'dictation:false',
			'dictation:true',
			'dictation:false', 'voice:true',
		]);
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
