/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
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
		const commands: string[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		const menus: (readonly IAction[])[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu: delegate => { menus.push(delegate.getActions?.() ?? []); } }));
		const contextKeyService = new MockContextKeyService();
		const newChat = new MenuItemAction({ id: 'newChat', title: 'New Chat', icon: undefined, precondition: newChatEnabled ? undefined : ContextKeyExpr.false() }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const actions = [newChat, new Separator(), store.add(new Action('newChatWindow', 'New Chat Window'))];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat' }, undefined, actions);
		const control = instantiationService.createInstance(ChatViewSessionsListControl, upcastPartial<SessionsView>({ dispose: () => { } }), undefined);
		const item = store.add(control.createActionViewItem(submenu)!);
		const container = DOM.$('div');
		item.render(container);
		return { item, container, actions, commands, menus };
	}

	test('shows New Chat as a "New" split button whose menu is the New menu', async () => {
		const { item, container, actions, commands, menus } = render(true);
		const primary = container.querySelector<HTMLElement>('.action-container .action-label')!;

		primary.click();
		container.querySelector<HTMLElement>('.dropdown-action-container .action-label')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		await Promise.resolve();

		assert.deepStrictEqual({
			isSplitButton: item instanceof DropdownWithPrimaryActionViewItem,
			label: primary.textContent,
			disabled: primary.classList.contains('disabled'),
			commands,
			menus: menus.map(menu => menu.length === actions.length && menu.every((action, index) => action === actions[index])),
		}, { isSplitButton: true, label: 'New', disabled: false, commands: ['newChat'], menus: [true] });
	});

	test('is disabled when New Chat is', () => {
		const { container } = render(false);
		assert.strictEqual(container.querySelector<HTMLElement>('.action-container .action-label')!.classList.contains('disabled'), true);
	});
});
