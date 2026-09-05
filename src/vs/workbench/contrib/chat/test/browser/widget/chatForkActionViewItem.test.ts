/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { ActionRunner, IAction } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ForkConversationActionId } from '../../../browser/actions/chatForkActions.js';
import { ChatForkActionViewItem } from '../../../browser/widget/chatForkActionViewItem.js';

suite('ChatForkActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows a spinner while the fork action is running', async () => {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: ForkConversationActionId,
			title: 'Fork Conversation',
			tooltip: 'Fork conversation from this point',
			icon: Codicon.repoForked,
		}, undefined, undefined, undefined, undefined);
		const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, undefined));
		const container = document.createElement('div');
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
		const runPromise = actionRunner.run(action);
		const label = container.querySelector<HTMLElement>('.action-label');
		const icon = label?.querySelector<HTMLElement>('.chat-fork-action-icon');
		assert.ok(label);
		assert.ok(icon);

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
