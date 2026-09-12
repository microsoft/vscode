/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow, ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ActionRunner, IAction } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ForkConversationActionId } from '../../../browser/actions/chatForkActions.js';
import { ChatForkActionViewItem } from '../../../browser/widget/chatForkActionViewItem.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import '../../../browser/widget/media/chat.css';

suite('ChatForkActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createViewItem() {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: ForkConversationActionId,
			title: 'Fork Conversation',
			tooltip: 'Fork conversation from this point',
			icon: Codicon.repoForked,
		}, undefined, undefined, undefined, undefined);
		const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, undefined));
		const context = Object.freeze(upcastPartial<IChatRequestViewModel>({
			id: 'request-2',
			sessionResource: URI.parse('test-chat:/source'),
			message: { text: 'second request', parts: [] },
		}));
		return { action, viewItem, context };
	}

	test('forwards Alt-click with the checkpoint without changing ordinary clicks or keyboard activation', async () => {
		const { action, viewItem, context } = createViewItem();
		const calls: { action: IAction; context: unknown }[] = [];
		const actionRunner = store.add(new class extends ActionRunner {
			protected override async runAction(action: IAction, context?: unknown): Promise<void> {
				calls.push({ action, context });
			}
		});
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		const actionBar = store.add(new ActionBar(container, { actionViewItemProvider: () => viewItem, actionRunner, context }));
		actionBar.push(action);

		for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, {}]) {
			await viewItem.onClick(new MouseEvent('click', modifiers));
		}
		actionBar.focus(0);
		for (const keyCode of [13, 32]) {
			const didRun = Event.toPromise(actionRunner.onDidRun);
			for (const type of ['keydown', 'keyup']) {
				actionBar.getContainer().dispatchEvent(new KeyboardEvent(type, { keyCode, bubbles: true }));
			}
			await didRun;
		}

		assert.deepStrictEqual({
			calls,
			context: viewItem._context,
		}, {
			calls: [context, context, context, context, { element: context, toSide: true }, context, context, context].map(context => ({ action, context })),
			context,
		});
	});

	test('clears the Alt-click running state when forking fails', async () => {
		const { action, viewItem, context } = createViewItem();
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		viewItem.render(container);
		viewItem.setActionContext(context);
		const operation = new DeferredPromise<void>();
		const actionRunner = store.add(new class extends ActionRunner {
			protected override async runAction(): Promise<void> {
				await operation.p;
			}
		});
		viewItem.actionRunner = actionRunner;
		const didRun = Event.toPromise(actionRunner.onDidRun);
		const click = viewItem.onClick(new MouseEvent('click', { altKey: true }));
		const label = container.querySelector('.action-label');
		const busyDuring = label?.getAttribute('aria-busy');
		const error = new Error('Fork failed');
		await operation.error(error);
		await click;

		assert.deepStrictEqual({
			result: await didRun,
			busyDuring,
			busyAfter: label?.getAttribute('aria-busy'),
			label: label?.getAttribute('aria-label'),
			context: viewItem._context,
		}, {
			result: { action, error },
			busyDuring: 'true',
			busyAfter: 'false',
			label: 'Fork conversation from this point',
			context,
		});
	});

	test('centers the fork icon and shows a centered spinner while the fork action is running', async () => {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: ForkConversationActionId,
			title: 'Fork Conversation',
			tooltip: 'Fork conversation from this point',
			icon: Codicon.repoForked,
		}, undefined, undefined, undefined, undefined);
		const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, undefined));
		const session = append(mainWindow.document.body, $('.interactive-session'));
		store.add(toDisposable(() => session.remove()));
		session.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		session.style.setProperty('--vscode-spacing-size60', '6px');
		session.style.setProperty('--vscode-strokeThickness', '1px');
		const checkpoint = append(session, $('.checkpoint-container'));
		const toolbar = append(checkpoint, $('.monaco-toolbar'));
		const actionBar = append(toolbar, $('.monaco-action-bar'));
		const actions = append(actionBar, $('ul.actions-container'));
		const container = append(actions, $('li.action-item'));
		viewItem.render(container);

		const operation = new DeferredPromise<void>();
		const actionRunner = store.add(new class extends ActionRunner {
			protected override async runAction(_action: IAction): Promise<void> {
				await operation.p;
			}
		});
		viewItem.actionRunner = actionRunner;
		viewItem.setActionContext(upcastPartial<IChatRequestViewModel>({
			id: 'request-2',
			sessionResource: URI.parse('test-chat:/source'),
			message: { text: 'second request', parts: [] },
		}));

		const forkIconClass = `codicon-${Codicon.repoForkedCompact.id}`;
		const loadingIconClass = `codicon-${Codicon.loadingCompact.id}`;
		const label = container.querySelector<HTMLElement>('.action-label');
		const icon = label?.querySelector<HTMLElement>('.chat-fork-action-icon');
		assert.ok(label);
		assert.ok(icon);

		const getLayout = () => {
			const labelBounds = label.getBoundingClientRect();
			const iconBounds = icon.getBoundingClientRect();
			return {
				glyphAlignment: getWindow(icon).getComputedStyle(icon).justifyContent,
				centeredHorizontally: Math.abs(iconBounds.x + iconBounds.width / 2 - labelBounds.x - labelBounds.width / 2) < 0.5,
				centeredVertically: Math.abs(iconBounds.y + iconBounds.height / 2 - labelBounds.y - labelBounds.height / 2) < 0.5,
				buttonWidth: labelBounds.width,
				buttonHeight: labelBounds.height,
			};
		};
		const expectedLayout = {
			glyphAlignment: 'center',
			centeredHorizontally: true,
			centeredVertically: true,
			buttonWidth: 30,
			buttonHeight: 22,
		};
		const idleLayout = getLayout();
		const runPromise = viewItem.onClick(new MouseEvent('click', { altKey: true }));
		const runningLayout = getLayout();

		assert.deepStrictEqual({
			during: {
				buttonCodicon: label.classList.contains('codicon'),
				buttonSpinning: label.classList.contains('codicon-modifier-spin'),
				forkIcon: icon.classList.contains(forkIconClass),
				loadingIcon: icon.classList.contains(loadingIconClass),
				iconSpinning: icon.classList.contains('codicon-modifier-spin'),
				busy: label.getAttribute('aria-busy'),
				label: label.getAttribute('aria-label'),
				itemClass: container.classList.contains('chat-fork-action-item'),
				labelClass: label.classList.contains('chat-fork-action-label'),
			},
		}, {
			during: {
				buttonCodicon: true,
				buttonSpinning: false,
				forkIcon: false,
				loadingIcon: true,
				iconSpinning: true,
				busy: 'true',
				label: 'Forking conversation',
				itemClass: true,
				labelClass: true,
			},
		});

		operation.complete();
		await runPromise;

		assert.deepStrictEqual({
			idle: idleLayout,
			running: runningLayout,
			completed: getLayout(),
		}, {
			idle: expectedLayout,
			running: expectedLayout,
			completed: expectedLayout,
		});

		assert.deepStrictEqual({
			buttonCodicon: label.classList.contains('codicon'),
			buttonSpinning: label.classList.contains('codicon-modifier-spin'),
			forkIcon: icon.classList.contains(forkIconClass),
			loadingIcon: icon.classList.contains(loadingIconClass),
			iconSpinning: icon.classList.contains('codicon-modifier-spin'),
			busy: label.getAttribute('aria-busy'),
			label: label.getAttribute('aria-label'),
			itemClass: container.classList.contains('chat-fork-action-item'),
			labelClass: label.classList.contains('chat-fork-action-label'),
		}, {
			buttonCodicon: true,
			buttonSpinning: false,
			forkIcon: true,
			loadingIcon: false,
			iconSpinning: false,
			busy: 'false',
			label: 'Fork conversation from this point',
			itemClass: true,
			labelClass: true,
		});
	});

	test('keeps the hover, focus ring and click target on the fork button when a separator precedes it', () => {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: ForkConversationActionId,
			title: 'Fork Conversation',
			tooltip: 'Fork conversation from this point',
			icon: Codicon.repoForked,
		}, undefined, undefined, undefined, undefined);
		const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, undefined));
		const session = append(mainWindow.document.body, $('.interactive-session'));
		store.add(toDisposable(() => session.remove()));
		session.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		session.style.setProperty('--vscode-fontSize-label1', '12px');
		session.style.setProperty('--vscode-spacing-size40', '4px');
		session.style.setProperty('--vscode-spacing-size60', '6px');
		session.style.setProperty('--vscode-spacing-size80', '8px');
		session.style.setProperty('--vscode-strokeThickness', '1px');
		const checkpoint = append(session, $('.checkpoint-container'));
		const toolbar = append(checkpoint, $('.monaco-toolbar'));
		const actionBar = append(toolbar, $('.monaco-action-bar'));
		const actions = append(actionBar, $('ul.actions-container'));
		append(actions, $('li.action-item.chat-restore-checkpoint-item', undefined, $('a.action-label', undefined, 'Restore Checkpoint')));
		const container = append(actions, $('li.action-item'));
		viewItem.render(container);

		const label = container.querySelector<HTMLElement>('.action-label');
		assert.ok(label);

		const itemBounds = container.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const separator = getWindow(container).getComputedStyle(container, '::before');
		const separatorRight = itemBounds.left - parseFloat(separator.marginRight);

		assert.deepStrictEqual({
			separatorContent: separator.content,
			separatorPosition: separator.position,
			separatorPointerEvents: separator.pointerEvents,
			separatorRendered: parseFloat(separator.width) > 0,
			separatorRightEdgeToButton: labelBounds.left - separatorRight,
			// The hover, focus ring and click listeners all derive from the item's box.
			targetLeftOffset: itemBounds.left - labelBounds.left,
			targetWidthOffset: itemBounds.width - labelBounds.width,
		}, {
			separatorContent: '"\u00B7"',
			separatorPosition: 'absolute',
			separatorPointerEvents: 'none',
			separatorRendered: true,
			separatorRightEdgeToButton: 4,
			targetLeftOffset: 0,
			targetWidthOffset: 0,
		});
	});
});
