/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToggleMenuAction, ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatViewSessionsListControl } from '../../../browser/agentsView/chatViewSessionsList.js';
import { SessionsView } from '../../../browser/views/sessionsView.js';

suite('Sessions - Chat view sessions list New button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(newChatEnabled: boolean) {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		const menus: (readonly IAction[])[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu: delegate => { menus.push(delegate.getActions?.() ?? []); } }));
		const contextKeyService = new MockContextKeyService();
		const newChat = new MenuItemAction({ id: 'newChat', title: 'New Chat', icon: undefined, precondition: newChatEnabled ? undefined : ContextKeyExpr.false() }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const actions = [newChat, new Separator(), store.add(new Action('newChatWindow', 'New Chat Window'))];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, actions);
		const control = instantiationService.createInstance(ChatViewSessionsListControl, upcastPartial<SessionsView>({ dispose: () => { }, createActionViewItem: () => undefined }), undefined);
		const item = store.add(control.createActionViewItem(submenu)!);
		const container = DOM.$('div');
		item.render(container);
		item.setActionContext('titleContext');
		return { item, control, submenu, container, actions, commands, menus };
	}

	test('shows New Chat as a "New" split button whose menu is the New menu', async () => {
		const { item, submenu, container, actions, commands, menus } = render(true);
		const primary = container.querySelector<HTMLElement>('.action-container .action-label')!;

		primary.click();
		container.querySelector<HTMLElement>('.dropdown-action-container .action-label')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		await Promise.resolve();

		assert.deepStrictEqual({
			isSplitButton: item instanceof DropdownWithPrimaryActionViewItem,
			isNewMenu: item.action === submenu,
			label: primary.textContent,
			disabled: primary.classList.contains('disabled'),
			commands,
			menus: menus.map(menu => menu.length === actions.length && menu.every((action, index) => action === actions[index])),
		}, { isSplitButton: true, isNewMenu: true, label: 'New', disabled: false, commands: [{ id: 'newChat', args: ['titleContext'] }], menus: [true] });
	});

	test('is disabled when New Chat is', () => {
		const { container } = render(false);
		assert.deepStrictEqual({
			button: container.classList.contains('disabled'),
			primary: container.querySelector<HTMLElement>('.action-container .action-label')!.classList.contains('disabled'),
			ariaDisabled: container.querySelector<HTMLElement>(':scope > .action-container')!.getAttribute('aria-disabled'),
		}, { button: true, primary: true, ariaDisabled: 'true' });
	});

	test('moves into the overflow of a responsive title toolbar as a split button, and back', () => {
		const { control, submenu } = render(true);
		const container = document.body.appendChild(DOM.$('div'));
		try {
			let availableWidth = 400;
			const toolbar = store.add(new ToolBar(container, upcastPartial({ showContextMenu: () => { } }), {
				actionViewItemProvider: (action, options) => control.createActionViewItem(action, options),
				// As the Chat view's title in the secondary side bar
				responsiveBehavior: {
					enabled: true, kind: 'all', minItems: 0, overflowFrom: 'start', actionMinWidth: 22, reserveMinWidth: false, getAvailableWidth: () => availableWidth,
					getActionMinWidth: action => action instanceof SubmenuItemAction && action.item.isSplitButton ? 36 : undefined,
				},
			}));
			const other = store.add(new Action('other', 'Other'));
			toolbar.setActions([submenu, other]);
			const shown = () => [0, 1, 2].map(index => toolbar.getItemAction(index)?.id);

			const wide = shown();
			// Room for two generic actions, but not for the split button and another action
			availableWidth = 55;
			toolbar.relayout();
			const narrow = shown();
			const overflow = [0, 1].map(index => toolbar.getItemAction(index)).find(action => action instanceof ToggleMenuAction);
			const inOverflow = overflow instanceof ToggleMenuAction && overflow.menuActions.includes(submenu);
			availableWidth = 400;
			toolbar.relayout();

			assert.deepStrictEqual({ wide, narrow, inOverflow, restored: shown(), isNewMenu: toolbar.getItemAction(0) === submenu }, {
				wide: [submenu.id, 'other', undefined],
				narrow: ['other', 'toolbar.toggle.more', undefined],
				inOverflow: true,
				restored: [submenu.id, 'other', undefined],
				isNewMenu: true,
			});
		} finally {
			container.remove();
		}
	});
});
