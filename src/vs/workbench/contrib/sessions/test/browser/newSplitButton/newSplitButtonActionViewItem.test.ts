/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { ActionWithDropdownActionViewItem } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { INewSplitButtonOptions, NewSplitButtonActionViewItem } from '../../../browser/newSplitButton/newSplitButtonActionViewItem.js';

suite('Sessions - New split button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cmdN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OS);
	const PRIMARY_ID = 'newChat';

	function render(primaryEnabled: boolean, keybindings: Record<string, ResolvedKeybinding> = {}, menuActions: IAction[] = [], menuId = MenuId.ChatNewMenu, buttonOptions?: INewSplitButtonOptions, primaryId = PRIMARY_ID) {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		const onDidUpdateKeybindings = store.add(new Emitter<void>());
		instantiationService.stub(IKeybindingService, upcastPartial<IKeybindingService>({ lookupKeybinding: id => keybindings[id], onDidUpdateKeybindings: onDidUpdateKeybindings.event }));
		const errors: unknown[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: error => { errors.push(error); } }));
		const menus: IContextMenuDelegate[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu: delegate => { menus.push(delegate as IContextMenuDelegate); } }));
		const primaryAction = new MenuItemAction({ id: primaryId, title: 'New Chat', icon: undefined, precondition: primaryEnabled ? undefined : ContextKeyExpr.false() }, undefined, { shouldForwardArgs: true }, undefined, undefined, new MockContextKeyService(), commandService);
		const actions = [primaryAction, new Separator(), store.add(new Action('newChatWindow', 'New Chat Window')), ...menuActions];
		const submenu = new SubmenuItemAction({ submenu: menuId, title: 'New Chat', isSplitButton: true }, undefined, actions);
		const item = store.add(instantiationService.createInstance(NewSplitButtonActionViewItem, submenu, primaryAction, undefined, buttonOptions));
		const container = DOM.$('div');
		item.setActionContext('titleContext');
		item.render(container);
		const primary = container.querySelector<HTMLElement>('.action-dropdown-item > .action-label')!;
		const dropdown = container.querySelector<HTMLElement>('.action-dropdown-item .monaco-dropdown .action-label')!;
		const openMenu = () => dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		const updateKeybinding = (id: string, keybinding: ResolvedKeybinding | undefined) => {
			if (keybinding) {
				keybindings[id] = keybinding;
			} else {
				delete keybindings[id];
			}
			onDidUpdateKeybindings.fire();
		};
		const shownKeybinding = () => primary.querySelector('.new-split-button-keybinding')?.textContent ?? null;
		return { item, submenu, container, primary, dropdown, openMenu, actions, commands, menus, errors, updateKeybinding, shownKeybinding };
	}

	test('shows the New menu as the Extensions editor\'s split button: "New" runs New Chat and the ▾ opens the New menu', () => {
		const { item, submenu, primary, dropdown, openMenu, actions, commands, menus, shownKeybinding } = render(true, { [PRIMARY_ID]: cmdN });

		primary.click();
		openMenu();

		assert.deepStrictEqual({
			isSplitButton: item instanceof ActionWithDropdownActionViewItem,
			isNewMenu: item.action === submenu,
			label: primary.firstChild?.textContent,
			keybinding: shownKeybinding(),
			filled: [primary.classList.contains('filled-label'), dropdown.classList.contains('filled-label')],
			ariaLabel: primary.getAttribute('aria-label'),
			disabled: primary.classList.contains('disabled'),
			commands,
			menus: menus.map(menu => ({ sameActions: menu.getActions().every((action, index) => action === actions[index]), context: menu.getActionsContext?.() })),
		}, {
			isSplitButton: true,
			isNewMenu: true,
			label: 'New',
			keybinding: cmdN.getLabel(),
			filled: [true, true],
			ariaLabel: `New Chat (${cmdN.getAriaLabel()})`,
			disabled: false,
			commands: [{ id: PRIMARY_ID, args: ['titleContext'] }],
			menus: [{ sameActions: true, context: 'titleContext' }],
		});
	});

	test('is disabled, with its ▾, when New Chat is', () => {
		const { primary, openMenu, commands, menus } = render(false);
		primary.click();
		openMenu();
		assert.deepStrictEqual({ disabled: primary.classList.contains('disabled'), ariaDisabled: primary.getAttribute('aria-disabled'), commands, menus: menus.length }, { disabled: true, ariaDisabled: 'true', commands: [], menus: 0 });
	});

	test('shows the new keybinding of New Chat when it is rebound while shown, and none when it is unbound', () => {
		const { primary, updateKeybinding, shownKeybinding } = render(true, { [PRIMARY_ID]: cmdN });
		const cmdShiftN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, true, false, false, KeyCode.KeyN)], OS);
		const shown = () => ({ label: primary.textContent, keybinding: shownKeybinding(), ariaLabel: primary.getAttribute('aria-label') });
		updateKeybinding(PRIMARY_ID, cmdShiftN);
		const rebound = shown();
		updateKeybinding(PRIMARY_ID, undefined);
		assert.deepStrictEqual([rebound, shown()], [
			{ label: `New${cmdShiftN.getLabel()}`, keybinding: cmdShiftN.getLabel(), ariaLabel: `New Chat (${cmdShiftN.getAriaLabel()})` },
			{ label: 'New', keybinding: null, ariaLabel: 'New Chat' },
		]);
	});

	test('speaks the keybinding of New Chat in the label\'s aria-label, not the glyphs it shows', () => {
		const macCmdN = new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, false, true, KeyCode.KeyN)], OperatingSystem.Macintosh);
		const { primary, shownKeybinding } = render(true, { [PRIMARY_ID]: macCmdN });
		assert.deepStrictEqual({ keybinding: shownKeybinding(), ariaLabel: primary.getAttribute('aria-label') }, { keybinding: '⌘N', ariaLabel: 'New Chat (Command+N)' });
	});

	test('runs the New menu with the context of the title and reports a failure once, even after the menu and the button are gone', async () => {
		const failure = new DeferredPromise<void>();
		const cancellation = new DeferredPromise<void>();
		const contexts: unknown[] = [];
		const failing = store.add(new Action('failing', 'Failing', undefined, true, context => { contexts.push(context); return failure.p; }));
		const cancelled = store.add(new Action('cancelled', 'Cancelled', undefined, true, context => { contexts.push(context); return cancellation.p; }));
		const { item, openMenu, menus, errors } = render(true, {}, [failing, cancelled]);
		openMenu();
		const menu = menus[0];

		// The menu closes as the action starts, and the toolbar may dispose the button before the action ends
		const failed = menu.actionRunner!.run(failing, menu.getActionsContext?.());
		const cancelledRun = menu.actionRunner!.run(cancelled, menu.getActionsContext?.());
		item.dispose();
		failure.error(new Error('failed'));
		cancellation.error(new CancellationError());
		await Promise.all([failed, cancelledRun]);

		assert.deepStrictEqual({ contexts, errors: errors.map(error => (error as Error).message) }, { contexts: ['titleContext', 'titleContext'], errors: ['failed'] });
	});

	test('runs any menu item action of any menu with any label, and shows the keybinding of its fallback action when the primary has none', () => {
		const { primary, openMenu, actions, commands, menus, shownKeybinding } = render(true, { other: cmdN }, [], MenuId.ViewTitle, { label: 'Add', keybindingActionId: 'other' }, 'addThing');
		primary.click();
		openMenu();
		assert.deepStrictEqual({
			label: primary.firstChild?.textContent,
			keybinding: shownKeybinding(),
			ariaLabel: primary.getAttribute('aria-label'),
			commands: commands.map(command => command.id),
			menus: menus.map(menu => menu.getActions().every((action, index) => action === actions[index])),
		}, {
			label: 'Add',
			keybinding: cmdN.getLabel(),
			ariaLabel: `New Chat (${cmdN.getAriaLabel()})`,
			commands: ['addThing'],
			menus: [true],
		});
	});

	test('shows the keybindings of the menu actions in the ▾ menu only when asked to', () => {
		const cmdO = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyO)], OS);
		const menuKeybindings = (buttonOptions: INewSplitButtonOptions | undefined) => {
			const inFolder = store.add(new Action('newInFolder', 'New in Folder...'));
			const { openMenu, menus } = render(true, { [PRIMARY_ID]: cmdN, newInFolder: cmdO }, [inFolder], MenuId.ChatNewMenu, buttonOptions);
			openMenu();
			return menus[0].getActions().map(action => menus[0].getKeyBinding?.(action)?.getLabel() ?? null);
		};
		assert.deepStrictEqual({
			shown: menuKeybindings({ showMenuKeybindings: true }),
			byDefault: menuKeybindings(undefined),
		}, {
			shown: [cmdN.getLabel(), null, null, cmdO.getLabel()],
			byDefault: [null, null, null, null],
		});
	});
});
