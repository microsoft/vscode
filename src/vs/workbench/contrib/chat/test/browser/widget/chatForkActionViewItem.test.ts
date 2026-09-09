/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow, ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ActionRunner, IAction } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ForkConversationActionId } from '../../../browser/actions/chatForkActions.js';
import { ChatForkActionViewItem } from '../../../browser/widget/chatForkActionViewItem.js';
import '../../../browser/widget/media/chat.css';

suite('ChatForkActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
		const runPromise = actionRunner.run(action);
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
});
