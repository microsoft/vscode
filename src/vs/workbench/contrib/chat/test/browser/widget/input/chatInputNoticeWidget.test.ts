/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../browser/widget/input/chatInputNoticeWidget.js';

suite('ChatInputNoticeWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(store: Pick<DisposableStore, 'add'>): HTMLElement {
		const root = dom.$('div');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return root;
	}

	function createNotice(container?: HTMLElement): ChatInputNoticeWidget {
		return disposables.add(new ChatInputNoticeWidget({
			container,
			variant: ChatInputNoticeVariant.Onboarding,
			className: 'test-notice',
			ariaLabel: 'Test notice',
			ariaDescription: 'Test description.',
		}));
	}

	test('builds one shared frame carrying the variant and the producer class', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);

		assert.deepStrictEqual(
			{
				classes: [...notice.domNode.classList],
				parented: notice.domNode.parentElement === container,
				role: notice.domNode.getAttribute('role'),
				label: notice.domNode.getAttribute('aria-label'),
				description: notice.domNode.getAttribute('aria-description'),
				tabIndex: notice.domNode.tabIndex,
			},
			{
				classes: ['chat-input-notice', 'chat-input-notice-onboarding', 'test-notice'],
				parented: true,
				role: 'region',
				label: 'Test notice',
				description: 'Test description.',
				tabIndex: 0,
			});
	});

	test('leaves the node unparented when no container is given', () => {
		const notice = createNotice();

		assert.deepStrictEqual(
			{ parented: !!notice.domNode.parentElement, connected: notice.domNode.isConnected },
			{ parented: false, connected: false });
	});

	test('creates the notice and its actions for an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const container = document.createElement('div');
		auxiliaryDocument.body.appendChild(container);
		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		const notice = createNotice(container);
		const action = notice.addAction({
			ariaLabel: 'Continue',
			icon: Codicon.check,
			onActivate: () => { },
		});

		assert.deepStrictEqual({
			noticeOwnerDocument: notice.domNode.ownerDocument === auxiliaryDocument,
			actionOwnerDocument: action.ownerDocument === auxiliaryDocument,
			mainRealmNotice: notice.domNode instanceof HTMLElement,
			mainRealmAction: action instanceof HTMLElement,
		}, {
			noticeOwnerDocument: true,
			actionOwnerDocument: true,
			mainRealmNotice: true,
			mainRealmAction: true,
		});
	});

	test('interrupts for an introduction, but waits its turn for a tip', () => {
		const container = createContainer(disposables);
		const ariaContainer = dom.append(container, dom.$('div'));
		setARIAContainer(ariaContainer);
		const spoken = (selector: string) => ariaContainer.querySelector(selector)?.textContent ?? '';

		disposables.add(new ChatInputNoticeWidget({
			container,
			variant: ChatInputNoticeVariant.Onboarding,
			ariaLabel: 'An introduction',
		})).announce();
		disposables.add(new ChatInputNoticeWidget({
			container,
			variant: ChatInputNoticeVariant.Tip,
			ariaLabel: 'A tip',
		})).announce();

		assert.deepStrictEqual(
			{ assertive: spoken('.monaco-alert'), polite: spoken('.monaco-status') },
			{
				assertive: 'An introduction. Use Shift+Tab to reach the notice.',
				polite: 'A tip. Use Shift+Tab to reach the notice.',
			});
	});

	test('dismisses on unmodified Escape only, and activates its actions', () => {
		const container = createContainer(disposables);
		let dismissals = 0;
		let activations = 0;
		const notice = disposables.add(new ChatInputNoticeWidget({
			container,
			variant: ChatInputNoticeVariant.Onboarding,
			ariaLabel: 'Test notice',
			onEscape: () => dismissals++,
		}));
		const action = notice.addAction({
			ariaLabel: 'Continue',
			icon: Codicon.check,
			onActivate: () => activations++,
		});

		notice.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, shiftKey: true, bubbles: true }));
		notice.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		action.querySelector<HTMLElement>('.action-label')!.click();

		assert.deepStrictEqual({ dismissals, activations }, { dismissals: 1, activations: 1 });
	});

	test('gives the dismiss action a standard shape, and honours the parent it is given', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);
		const header = dom.append(notice.domNode, dom.$('.header'));

		const housing = notice.addDismissAction({ parent: header, onActivate: () => { } });
		const dismiss = housing.querySelector<HTMLElement>('.action-label')!;

		assert.deepStrictEqual(
			{
				classes: [...dismiss.classList],
				role: dismiss.getAttribute('role'),
				label: dismiss.getAttribute('aria-label'),
				tabIndex: dismiss.tabIndex,
				inHeader: housing.parentElement === header,
			},
			{
				classes: ['action-label', 'codicon', 'codicon-close-compact', 'chat-input-notice-dismiss'],
				role: 'button',
				label: 'Dismiss',
				tabIndex: 0,
				inHeader: true,
			});
	});

	test('registers action listeners in the store it is given, so a rebuilt notice does not accumulate them', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);
		const renderStore = disposables.add(new DisposableStore());
		let activations = 0;

		const action = notice.addAction({
			ariaLabel: 'Continue',
			icon: Codicon.check,
			store: renderStore,
			onActivate: () => activations++,
		});
		const button = () => action.querySelector<HTMLElement>('.action-label');
		button()?.click();
		renderStore.clear();
		button()?.click();

		assert.strictEqual(activations, 1);
	});

	test('stops being a landmark and a tab stop while put away, and comes back intact', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);

		const read = () => ({
			role: notice.domNode.getAttribute('role'),
			label: notice.domNode.getAttribute('aria-label'),
			tabIndex: notice.domNode.getAttribute('tabindex'),
			hidden: notice.domNode.style.display === 'none',
		});

		const shown = read();
		notice.setVisible(false);
		const away = read();
		notice.setVisible(true);
		const back = read();

		assert.deepStrictEqual(
			{ shown, away, back },
			{
				shown: { role: 'region', label: 'Test notice', tabIndex: '0', hidden: false },
				away: { role: null, label: null, tabIndex: null, hidden: true },
				back: { role: 'region', label: 'Test notice', tabIndex: '0', hidden: false },
			});
	});

	test('renames the region for notices whose message is only known per render', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);

		notice.setAriaLabel('Approaching your quota');
		const named = notice.domNode.getAttribute('aria-label');
		notice.setAriaLabel(undefined);

		assert.deepStrictEqual(
			{ named, cleared: notice.domNode.getAttribute('aria-label') },
			{ named: 'Approaching your quota', cleared: null });
	});

	test('reports focus through the notice host contract', () => {
		const container = createContainer(disposables);
		const notice = createNotice(container);

		const before = notice.hasFocus();
		notice.focus();

		assert.deepStrictEqual({ before, after: notice.hasFocus() }, { before: false, after: true });
	});

	test('takes itself out of the DOM when disposed', () => {
		const container = createContainer(disposables);
		const store = new DisposableStore();
		const notice = store.add(new ChatInputNoticeWidget({
			container,
			variant: ChatInputNoticeVariant.Tip,
			ariaLabel: 'Test tip',
		}));

		const attached = notice.domNode.parentElement === container;
		store.dispose();

		assert.deepStrictEqual({ attached, remaining: container.childElementCount }, { attached: true, remaining: 0 });
	});
});
