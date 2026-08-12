/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatTip, IChatTipService } from '../../../../browser/chatTipService.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../browser/widget/input/chatInputNoticeHost.js';
import { ChatInputTipPresenter } from '../../../../browser/widget/input/chatInputTipPresenter.js';

suite('ChatInputTipPresenter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const TIP: IChatTip = { id: 'tip.test', content: { value: 'A tip' } } as IChatTip;

	function createPresenter(store: DisposableStore, noticeHost: ChatInputNoticeHost, options?: { isEligible?: () => boolean }) {
		let welcomeTipCalls = 0;
		const instantiationService = workbenchInstantiationService(undefined, store) as TestInstantiationService;
		instantiationService.stub(IChatTipService, {
			getWelcomeTip: () => { welcomeTipCalls++; return TIP; },
			onDidDismissTip: () => toDisposable(() => { }),
			onDidNavigateTip: () => toDisposable(() => { }),
			onDidHideTip: () => toDisposable(() => { }),
			onDidDisableTips: () => toDisposable(() => { }),
			hasMultipleTips: () => false,
		} as Partial<IChatTipService>);

		const container = dom.$('.chat-getting-started-tip-container');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const presenter = instantiationService.createInstance(
			ChatInputTipPresenter,
			{ container, isEligible: options?.isEligible ?? (() => true), focusInput: () => { } },
			noticeHost,
		);
		return { presenter, container, showing: () => container.childElementCount > 0, welcomeTipCalls: () => welcomeTipCalls };
	}

	test('shows a tip, yields the space to a notification, and takes it back', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, showing } = createPresenter(store, noticeHost);
		store.add(presenter);

		const shownInitially = showing();
		// A notification owns the space outright; the tip must come off screen and
		// then return on its own once the notification goes away.
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });
		const shownUnderNotification = showing();
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);

		assert.deepStrictEqual(
			{ shownInitially, shownUnderNotification, shownAfter: showing() },
			{ shownInitially: true, shownUnderNotification: false, shownAfter: true });
	});

	test('evaluates the tip once per render', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		// `getWelcomeTip` persists rotation state and reports the tip as shown, so
		// rendering must never ask for it twice for a single appearance.
		const { presenter, welcomeTipCalls } = createPresenter(store, noticeHost);
		store.add(presenter);

		assert.strictEqual(welcomeTipCalls(), 1);
	});

	test('renders nothing and holds no space while the surface is ineligible', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, showing, welcomeTipCalls } = createPresenter(store, noticeHost, { isEligible: () => false });
		store.add(presenter);

		assert.deepStrictEqual(
			{ showing: showing(), welcomeTipCalls: welcomeTipCalls(), focusable: noticeHost.hasFocusableNotice() },
			{ showing: false, welcomeTipCalls: 0, focusable: false });
	});

	test('disposing takes the tip down and releases the space', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, container, showing } = createPresenter(store, noticeHost);

		const shownBeforeDispose = showing();
		presenter.dispose();

		assert.deepStrictEqual(
			{ shownBeforeDispose, nodesAfterDispose: container.childElementCount, focusable: noticeHost.hasFocusableNotice() },
			{ shownBeforeDispose: true, nodesAfterDispose: 0, focusable: false });
	});
});
