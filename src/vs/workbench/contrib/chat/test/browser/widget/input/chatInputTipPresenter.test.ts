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

	function createPresenter(store: DisposableStore, noticeHost: ChatInputNoticeHost, tip: IChatTip | undefined): { presenter: ChatInputTipPresenter; container: HTMLElement } {
		const instantiationService = workbenchInstantiationService(undefined, store) as TestInstantiationService;
		instantiationService.stub(IChatTipService, {
			getWelcomeTip: () => tip,
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
			{ container, isEligible: () => true, focusInput: () => { } },
			noticeHost,
		);
		return { presenter, container };
	}

	test('disposing while a tip is leading does not rebuild the tip', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const tip: IChatTip = { id: 'tip.test', content: { value: 'A tip' } } as IChatTip;
		const { presenter, container } = createPresenter(store, noticeHost, tip);

		const shownBeforeDispose = container.childElementCount > 0;
		// Disposal releases the tip's claim, which re-runs the presenter's own
		// autorun. That run must not build a replacement into disposed holders.
		presenter.dispose();

		assert.deepStrictEqual(
			{
				shownBeforeDispose,
				nodesAfterDispose: container.childElementCount,
				// Reading from just below the tip lane is the only way to observe
				// whether the tip's own claim was released.
				tipLaneStillClaimed: noticeHost.isSuppressed(ChatInputNoticeLane.Tip + 1, undefined),
			},
			{ shownBeforeDispose: true, nodesAfterDispose: 0, tipLaneStillClaimed: false });
	});
});
