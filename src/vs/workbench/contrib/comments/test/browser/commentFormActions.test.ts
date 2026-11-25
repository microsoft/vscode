/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { CommentFormActions } from '../../browser/commentFormActions.js';

suite('CommentFormActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders an additional primary action and keeps it as the default action', async () => {
		const container = dom.$('.comment-actions-test');
		const additionalAction = store.add(new Action('additional', 'Add Feedback', undefined, false));
		const menu = new class extends mock<IMenu>() {
			override readonly onDidChange = Event.None;
			override getActions() {
				return [];
			}
		}();
		const invokedActions: string[] = [];
		const actions = store.add(new CommentFormActions(
			new class extends mock<IKeybindingService>() {
				override lookupKeybinding() {
					return undefined;
				}
			}(),
			new class extends mock<IContextKeyService>() { }(),
			new class extends mock<IContextMenuService>() { }(),
			container,
			action => {
				invokedActions.push(action.id);
			},
		));

		actions.setActions(menu, false, [additionalAction]);
		const buttons = [...container.querySelectorAll<HTMLElement>('.monaco-button')];
		const disabledBefore = buttons.map(button => button.getAttribute('aria-disabled') === 'true');
		additionalAction.enabled = true;
		actions.updateAction(additionalAction);
		const disabledAfter = buttons.map(button => button.getAttribute('aria-disabled') === 'true');
		await actions.triggerDefaultAction();

		assert.deepStrictEqual({
			labels: buttons.map(button => button.textContent),
			disabledBefore,
			disabledAfter,
			invokedActions,
		}, {
			labels: ['Add Feedback'],
			disabledBefore: [true],
			disabledAfter: [false],
			invokedActions: ['additional'],
		});
	});
});
