/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../browser/widget/input/chatInputNoticeHost.js';

suite('ChatInputNoticeHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Records every leadership announcement as `name:leading`. */
	function recorder(host: ChatInputNoticeHost) {
		const events: string[] = [];
		const claim = (name: string, lane: ChatInputNoticeLane) => host.occupy(lane, {
			onDidChangeLeading: leading => events.push(`${name}:${leading}`),
		});
		return { events, claim };
	}

	test('leads the lowest lane, and the newest claim within it', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const { events, claim } = recorder(host);

		// Recency within a lane and precedence between lanes are one mechanism, so
		// a peer introduction and a notification both put the first card away.
		store.add(claim('voice', ChatInputNoticeLane.Onboarding));
		const dictation = claim('dictation', ChatInputNoticeLane.Onboarding);
		const notification = claim('notification', ChatInputNoticeLane.Notification);
		notification.dispose();
		dictation.dispose();

		assert.deepStrictEqual(events, [
			'voice:true',
			'voice:false', 'dictation:true',
			'dictation:false', 'notification:true',
			'notification:false', 'dictation:true',
			'dictation:false', 'voice:true',
		]);
	});

	test('does not put a notice away for an equal or lower-precedence claim', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const { events, claim } = recorder(host);

		store.add(claim('notification', ChatInputNoticeLane.Notification));
		store.add(claim('tip', ChatInputNoticeLane.Tip));

		assert.deepStrictEqual(events, ['notification:true']);
	});

	test('keeps a lane claimed while the notice in it is swapped', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const { events, claim } = recorder(host);
		store.add(claim('tip', ChatInputNoticeLane.Tip));

		// Voice hands the onboarding lane over to dictation. The tip must not get
		// a window to lead in between the two claims.
		const target = { hasFocus: () => false, focus: () => { } };
		host.setOccupied(ChatInputNoticeLane.Onboarding, true, target);
		host.setOccupied(ChatInputNoticeLane.Onboarding, true, target);
		host.setOccupied(ChatInputNoticeLane.Onboarding, false);

		assert.deepStrictEqual(events, ['tip:true', 'tip:false', 'tip:true']);
	});

	test('does not announce a leader that a re-entrant claim already replaced', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const events: string[] = [];
		let notification: IDisposable | undefined;

		// Standing down is a real side effect (it moves focus), so a callback can
		// change who owns the space while the host is still announcing.
		store.add(host.occupy(ChatInputNoticeLane.Onboarding, {
			onDidChangeLeading: leading => {
				events.push(`voice:${leading}`);
				if (!leading && !notification) {
					notification = store.add(host.occupy(ChatInputNoticeLane.Notification, {
						onDidChangeLeading: it => events.push(`notification:${it}`),
					}));
				}
			},
		}));
		store.add(host.occupy(ChatInputNoticeLane.Onboarding, {
			onDidChangeLeading: leading => events.push(`dictation:${leading}`),
		}));

		// Dictation must never be told it leads: by the time voice had stood down,
		// a notification owned the space.
		assert.deepStrictEqual(events, ['voice:true', 'voice:false', 'notification:true']);
	});

	test('does not strand a lane when a re-entrant release beats the new lease', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		const events: string[] = [];
		let released = false;

		// The onboarding card reacts to being put away by taking the notification
		// down. That release happens before the notification's lease is stored, so
		// storing it afterwards would leave lane 0 held by a notification the widget
		// already considers hidden - and the card below it never comes back.
		store.add(host.occupy(ChatInputNoticeLane.Onboarding, {
			onDidChangeLeading: leading => {
				events.push(`onboarding:${leading}`);
				if (!leading && !released) {
					released = true;
					host.setOccupied(ChatInputNoticeLane.Notification, false);
				}
			},
		}));
		host.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });

		assert.deepStrictEqual(
			{ released, events },
			{ released: true, events: ['onboarding:true', 'onboarding:false', 'onboarding:true'] });
	});

	test('hands focus back to the input only when the notice standing down held it', () => {
		let inputFocusCount = 0;
		const host = disposables.add(new ChatInputNoticeHost(() => inputFocusCount++));
		const store = disposables.add(new DisposableStore());
		let noticeHasFocus = true;

		// Standing down is not the producer's decision, so the host - not every
		// producer that can be displaced - keeps focus out of <body>. Content
		// displaced while the user is typing in the input must not move it.
		store.add(host.occupy(ChatInputNoticeLane.Tip, {
			focusTarget: { hasFocus: () => noticeHasFocus, focus: () => { } },
		}));
		const notification = host.occupy(ChatInputNoticeLane.Notification);
		const afterFocusedStandDown = inputFocusCount;
		// Coming back is not a stand-down: the notice is announced, not focused.
		notification.dispose();
		const afterReturning = inputFocusCount;

		noticeHasFocus = false;
		store.add(host.occupy(ChatInputNoticeLane.Notification));

		assert.deepStrictEqual(
			{ afterFocusedStandDown, afterReturning, afterUnfocusedStandDown: inputFocusCount },
			{ afterFocusedStandDown: 1, afterReturning: 1, afterUnfocusedStandDown: 1 });
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

	test('reports no focusable notice while the leading claim has nothing to focus yet', () => {
		const host = disposables.add(new ChatInputNoticeHost(() => { }));
		const store = disposables.add(new DisposableStore());
		let built = false;

		// A claim is held from the moment content is wanted, but the card behind it
		// is only built once it leads. Focus must not be reported as handled - and
		// the "no notice" announcement suppressed - during that window.
		store.add(host.occupy(ChatInputNoticeLane.Onboarding, {
			focusTarget: { hasFocus: () => false, focus: () => { }, canFocus: () => built },
		}));
		const whileUnbuilt = host.toggleFocus();
		built = true;
		const onceBuilt = host.toggleFocus();

		assert.deepStrictEqual({ whileUnbuilt, onceBuilt }, { whileUnbuilt: false, onceBuilt: true });
	});

	test('disposal stands the leader down and refuses further claims', () => {
		const host = new ChatInputNoticeHost(() => { });
		const { events, claim } = recorder(host);
		const notification = claim('notification', ChatInputNoticeLane.Notification);

		// Releasing a lane during teardown must not promote a pending claim: the
		// content behind it would be rebuilt - and marked as seen - on a dying input.
		const pending = claim('pending', ChatInputNoticeLane.Onboarding);
		host.dispose();
		notification.dispose();
		claim('afterDispose', ChatInputNoticeLane.Tip).dispose();
		pending.dispose();

		assert.deepStrictEqual(events, ['notification:true', 'notification:false']);
	});
});
