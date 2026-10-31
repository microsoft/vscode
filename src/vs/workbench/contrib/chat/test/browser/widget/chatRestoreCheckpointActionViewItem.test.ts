/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { StartOverActionId } from '../../../browser/chatEditing/chatEditingActions.js';
import { ChatRestoreCheckpointActionViewItem } from '../../../browser/widget/chatRestoreCheckpointActionViewItem.js';

suite('ChatRestoreCheckpointActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows Start Over confirmation labels before discarding edits', async () => {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: StartOverActionId,
			title: 'Start Over',
			tooltip: 'Clears the chat and undoes all changes',
			icon: Codicon.discard,
		}, undefined, undefined, undefined, undefined);
		const viewItem = store.add(instantiationService.createInstance(
			ChatRestoreCheckpointActionViewItem,
			action,
			undefined,
			() => true,
			'Cancel starting over',
			'Confirm starting over and discarding all edits'
		));
		const container = document.createElement('div');
		viewItem.render(container);

		await viewItem.onClick(new MouseEvent('click'));

		const label = container.querySelector<HTMLElement>('.action-label:first-child');
		const cancel = container.querySelector<HTMLElement>('.chat-restore-checkpoint-cancel');
		assert.deepStrictEqual({
			confirming: container.classList.contains('confirming'),
			label: label?.textContent,
			ariaLabel: label?.getAttribute('aria-label'),
			cancelAriaLabel: cancel?.getAttribute('aria-label'),
		}, {
			confirming: true,
			label: 'Discard Edits',
			ariaLabel: 'Confirm starting over and discarding all edits',
			cancelAriaLabel: 'Cancel starting over',
		});
	});
});
