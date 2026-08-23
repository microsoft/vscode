/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { isChatInputStackSlotShowing } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { findTranscriptContextEntry, getTranscriptProgress, NewChatView, shouldShowSessionChatTip, shouldShowTranscriptPreparationProgress } from '../../browser/chatView.js';
import { SessionsChatViewStateService } from '../../browser/chatViewStateService.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';

suite('Sessions - Chat View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Reaches the banner without standing up the widget's whole service graph. */
	interface ISubSessionTipRenderer {
		_renderSubSessionTip(container: HTMLElement): void;
	}

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual({ forwarded, petHostVisible: isVisible.get() }, { forwarded: [false, true], petHostVisible: true });
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
		assert.strictEqual(isVisible.get(), false);
	});

	test('stores view state independently by chat resource', () => {
		const service = new SessionsChatViewStateService();
		const first = URI.parse('test:///first');
		const second = URI.parse('test:///second');

		service.set(first, { scrollTop: 120, isAtBottom: false });
		service.set(second, { scrollTop: 700, isAtBottom: true });
		assert.deepStrictEqual({
			first: service.get(first),
			second: service.get(second),
		}, {
			first: { scrollTop: 120, isAtBottom: false },
			second: { scrollTop: 700, isAtBottom: true },
		});
	});

	test('bounds stored view state', () => {
		const service = new SessionsChatViewStateService();
		for (let index = 0; index <= CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT; index++) {
			service.set(URI.parse(`test:///${index}`), { scrollTop: index });
		}

		assert.deepStrictEqual({
			evicted: service.get(URI.parse('test:///0')),
			retained: service.get(URI.parse(`test:///${CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT}`)),
		}, {
			evicted: undefined,
			retained: { scrollTop: CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT },
		});
	});


	test('allows transcript progress until a hidden bootstrap completes or visible content appears', () => {
		assert.deepStrictEqual({
			empty: shouldShowTranscriptPreparationProgress(0, 0, undefined),
			hiddenPending: shouldShowTranscriptPreparationProgress(1, 0, true),
			hiddenComplete: shouldShowTranscriptPreparationProgress(1, 0, false),
			visiblePending: shouldShowTranscriptPreparationProgress(2, 1, true),
		}, {
			empty: true,
			hiddenPending: true,
			hiddenComplete: false,
			visiblePending: false,
		});
	});

	test('shows the session-list status message in the pre-request progress surface', () => {
		assert.deepStrictEqual({
			fallback: getTranscriptProgress(true, 'Working...'),
			activity: getTranscriptProgress(true, 'Creating isolated worktree (42%)'),
			noActivity: getTranscriptProgress(true, undefined),
			visibleRequest: getTranscriptProgress(false, 'Creating isolated worktree (42%)'),
		}, {
			fallback: 'Working...',
			activity: 'Creating isolated worktree (42%)',
			noActivity: undefined,
			visibleRequest: undefined,
		});
	});

	test('does not show chat tips while the initial request is active', () => {
		assert.deepStrictEqual({
			unbound: shouldShowSessionChatTip(undefined),
			untitled: shouldShowSessionChatTip(SessionStatus.Untitled),
			inProgress: shouldShowSessionChatTip(SessionStatus.InProgress),
			needsInput: shouldShowSessionChatTip(SessionStatus.NeedsInput),
			completed: shouldShowSessionChatTip(SessionStatus.Completed),
		}, {
			unbound: true,
			untitled: true,
			inProgress: false,
			needsInput: false,
			completed: true,
		});
	});

	test('finds transcript context in hidden request attachments', () => {
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: 'PR',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		assert.strictEqual(findTranscriptContextEntry([{
			variableData: { variables: [] },
			attachedContext: [attachment],
		}]), attachment);
	});

	test('the sub-session tip yields the space to a notification and comes back', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const container = dom.$('div');
		store.add(toDisposable(() => container.remove()));

		// Built through the prototype: the banner only needs its storage key, the
		// input's notice host, and somewhere to keep its listeners.
		const widget = Object.create(NewChatInSessionWidget.prototype) as ISubSessionTipRenderer;
		Object.assign(widget, {
			storageService: { getBoolean: () => false, store: () => { } },
			_newChatInput: { noticeHost, focus: () => { } },
			_tipDisposable: store.add(new MutableDisposable()),
		});
		widget._renderSubSessionTip(container);

		const showing = () => {
			const tip = container.querySelector<HTMLElement>('.sub-session-tip-container');
			return !!tip && isChatInputStackSlotShowing(tip);
		};
		const shownInitially = showing();
		// A notification owns the space outright, so the banner must not stack with it.
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });
		const shownUnderNotification = showing();
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);

		assert.deepStrictEqual(
			{ shownInitially, shownUnderNotification, shownAfter: showing() },
			{ shownInitially: true, shownUnderNotification: false, shownAfter: true });
	});

});
