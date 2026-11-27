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
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatViewSessionsListControl } from '../../../browser/agentsView/chatViewSessionsList.js';
import { SessionsView } from '../../../browser/views/sessionsView.js';
import { CompactButtonActionViewItem } from '../../../browser/widgets/compactButtonActionViewItem.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { Event } from '../../../../../../base/common/event.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chat/browser/actions/chatActions.js';

suite('Sessions - Chat view sessions list New button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(newChatEnabled: boolean, menuAction?: IAction, newChatId = 'newChat', keybindings: Record<string, ResolvedKeybinding> = {}) {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(IKeybindingService, upcastPartial<IKeybindingService>({ lookupKeybinding: id => keybindings[id], lookupKeybindings: id => keybindings[id] ? [keybindings[id]] : [], onDidUpdateKeybindings: Event.None }));
		const menus: IContextMenuDelegate[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu: delegate => { menus.push(delegate as IContextMenuDelegate); } }));
		const errors: unknown[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: error => { errors.push(error); } }));
		const contextKeyService = new MockContextKeyService();
		const newChat = new MenuItemAction({ id: newChatId, title: 'New Chat', icon: undefined, precondition: newChatEnabled ? undefined : ContextKeyExpr.false() }, undefined, { shouldForwardArgs: true }, undefined, undefined, contextKeyService, commandService);
		const actions = [newChat, new Separator(), menuAction ?? store.add(new Action('newChatWindow', 'New Chat Window'))];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, actions);
		const control = instantiationService.createInstance(ChatViewSessionsListControl, upcastPartial<SessionsView>({ dispose: () => { }, createActionViewItem: () => undefined }), undefined);
		const item = store.add(control.createActionViewItem(submenu) as CompactButtonActionViewItem);
		const container = DOM.$('div');
		item.render(container);
		item.setActionContext('titleContext');
		return { item, control, submenu, container, actions, commands, menus, errors };
	}

	test('shows New Chat as the compact "New" button whose joined ▾ part is the New menu', async () => {
		const { item, submenu, container, actions, commands, menus } = render(true);
		const primary = container.querySelector<HTMLElement>('.agent-sessions-compact-new-button')!;

		primary.click();
		container.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			isCompactButton: item instanceof CompactButtonActionViewItem,
			isNewMenu: item.action === submenu,
			label: primary.querySelector('.new-session-button-label')!.textContent,
			disabled: primary.classList.contains('disabled'),
			commands,
			menus: menus.map(menu => { const menuActions = menu.getActions(); return menuActions.length === actions.length && menuActions.every((action, index) => action === actions[index]); }),
		}, { isCompactButton: true, isNewMenu: true, label: 'New', disabled: false, commands: [{ id: 'newChat', args: ['titleContext'] }], menus: [true] });
	});

	test('is disabled when New Chat is, keeping its ▾ part', () => {
		const { container } = render(false);
		const primary = container.querySelector<HTMLElement>('.agent-sessions-compact-new-button')!;
		const dropdown = container.querySelector<HTMLElement>('.monaco-dropdown-button')!;
		assert.deepStrictEqual({
			primary: primary.classList.contains('disabled'),
			ariaDisabled: primary.getAttribute('aria-disabled'),
			dropdown: dropdown.classList.contains('disabled'),
			tabStop: [primary.tabIndex, dropdown.tabIndex],
		}, { primary: true, ariaDisabled: 'true', dropdown: false, tabStop: [-1, 0] });
	});

	test('runs the New menu with the context of the title and reports a failure once, even after the button is gone', async () => {
		const failure = new DeferredPromise<void>();
		const cancellation = new DeferredPromise<void>();
		const contexts: unknown[] = [];
		const failing = store.add(new Action('failing', 'Failing', undefined, true, context => { contexts.push(context); return failure.p; }));
		const cancelled = store.add(new Action('cancelled', 'Cancelled', undefined, true, context => { contexts.push(context); return cancellation.p; }));
		const { item, container, menus, errors } = render(true, failing);
		container.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		const menu = menus[0];

		// The menu closes as the action starts, and the toolbar may dispose the button before the action ends
		const failed = menu.actionRunner!.run(failing, null);
		const cancelledRun = menu.actionRunner!.run(cancelled, null);
		item.dispose();
		failure.error(new Error('failed'));
		cancellation.error(new CancellationError());
		await Promise.all([failed, cancelledRun]);

		assert.deepStrictEqual({ contexts, errors: errors.map(error => (error as Error).message) }, { contexts: ['titleContext', 'titleContext'], errors: ['failed'] });
	});

	test('shows the keybinding of the canonical New Chat for its icon variants, but runs the variant', () => {
		const newChatKeybinding = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);
		const { container, commands } = render(true, undefined, 'newChat.copilot', { [ACTION_ID_NEW_CHAT]: newChatKeybinding });
		const primary = container.querySelector<HTMLElement>('.agent-sessions-compact-new-button')!;
		primary.click();
		assert.deepStrictEqual({ ariaLabel: primary.getAttribute('aria-label'), hasChip: !!primary.querySelector('.monaco-keybinding'), commands: commands.map(command => command.id) },
			{ ariaLabel: `New Chat (${newChatKeybinding.getAriaLabel()})`, hasChip: true, commands: ['newChat.copilot'] });
	});

	test('is one tab stop whose parts the arrow keys move between, and whose menu opens from the keyboard when New Chat is disabled', () => {
		const keyDown = (element: HTMLElement, key: string, keyCode: number) => element.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
		const enabled = render(true);
		const disabled = render(false);
		document.body.append(enabled.container, disabled.container);
		try {
			const parts = (container: HTMLElement) => [container.querySelector<HTMLElement>('.agent-sessions-compact-new-button')!, container.querySelector<HTMLElement>('.monaco-dropdown-button')!];
			const [primary, dropdown] = parts(enabled.container);
			const [, disabledDropdown] = parts(disabled.container);
			const focused = () => document.activeElement === primary ? 'primary' : document.activeElement === dropdown ? 'dropdown' : document.activeElement === disabledDropdown ? 'disabledDropdown' : 'other';

			enabled.item.setFocusable(true);
			const tabStops = [primary.tabIndex, dropdown.tabIndex];
			enabled.item.focus();
			const initial = focused();
			keyDown(primary, 'ArrowRight', 39);
			const right = focused();
			keyDown(dropdown, 'ArrowLeft', 37);
			const left = focused();

			disabled.item.focus();
			const disabledInitial = focused();
			keyDown(disabledDropdown, 'ArrowLeft', 37);
			const disabledLeft = focused();
			keyDown(disabledDropdown, 'Enter', 13);

			assert.deepStrictEqual({ tabStops, initial, right, left, disabledInitial, disabledLeft, menus: disabled.menus.length, commands: disabled.commands }, {
				tabStops: [0, -1], initial: 'primary', right: 'dropdown', left: 'primary', disabledInitial: 'disabledDropdown', disabledLeft: 'disabledDropdown', menus: 1, commands: [],
			});
		} finally {
			enabled.container.remove();
			disabled.container.remove();
		}
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
