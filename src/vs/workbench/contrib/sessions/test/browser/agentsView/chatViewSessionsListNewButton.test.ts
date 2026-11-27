/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionWithDropdownActionViewItem } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatViewSessionsListControl } from '../../../browser/agentsView/chatViewSessionsList.js';
import { SessionsView } from '../../../browser/views/sessionsView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chat/browser/actions/chatActions.js';
import { NEW_CHAT_ICON_VARIANTS } from '../../../../chat/browser/actions/chatNewActions.js';
import { createTestAuxiliaryBarPart } from '../../../../../test/browser/parts/auxiliaryBarTestUtils.js';
import '../../../../../browser/media/part.css';

suite('Sessions - Chat view sessions list New button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cmdN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);

	function render(newChatEnabled: boolean, newChatId = ACTION_ID_NEW_CHAT, keybindings: Record<string, ResolvedKeybinding> = {}) {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(IKeybindingService, upcastPartial<IKeybindingService>({ lookupKeybinding: id => keybindings[id] }));
		const menus: IContextMenuDelegate[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu: delegate => { menus.push(delegate as IContextMenuDelegate); } }));
		const contextKeyService = new MockContextKeyService();
		const newChat = new MenuItemAction({ id: newChatId, title: 'New Chat', icon: undefined, precondition: newChatEnabled ? undefined : ContextKeyExpr.false() }, undefined, { shouldForwardArgs: true }, undefined, undefined, contextKeyService, commandService);
		const actions = [newChat, new Separator(), store.add(new Action('newChatWindow', 'New Chat Window'))];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, actions);
		const control = instantiationService.createInstance(ChatViewSessionsListControl, upcastPartial<SessionsView>({ dispose: () => { }, createActionViewItem: () => undefined }), undefined);
		const item = store.add(control.createActionViewItem(submenu, undefined, true) as ActionWithDropdownActionViewItem);
		const container = DOM.$('div');
		item.setActionContext('titleContext');
		item.render(container);
		const primary = container.querySelector<HTMLElement>('.action-dropdown-item > .action-label')!;
		const dropdown = container.querySelector<HTMLElement>('.action-dropdown-item .monaco-dropdown .action-label')!;
		const openMenu = () => dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		return { item, control, submenu, container, primary, dropdown, openMenu, actions, commands, menus };
	}

	test('shows the New menu as the Extensions editor\'s split button: "New" runs New Chat and the ▾ opens the New menu', () => {
		const { item, submenu, primary, dropdown, openMenu, actions, commands, menus } = render(true, ACTION_ID_NEW_CHAT, { [ACTION_ID_NEW_CHAT]: cmdN });

		primary.click();
		openMenu();

		assert.deepStrictEqual({
			isSplitButton: item instanceof ActionWithDropdownActionViewItem,
			isNewMenu: item.action === submenu,
			label: primary.textContent,
			filled: [primary.classList.contains('filled-label'), dropdown.classList.contains('filled-label')],
			ariaLabel: primary.getAttribute('aria-label'),
			disabled: primary.classList.contains('disabled'),
			commands,
			menus: menus.map(menu => ({ sameActions: menu.getActions().every((action, index) => action === actions[index]), context: menu.getActionsContext?.() })),
		}, {
			isSplitButton: true,
			isNewMenu: true,
			label: 'New',
			filled: [true, true],
			ariaLabel: `New Chat (${cmdN.getLabel()})`,
			disabled: false,
			commands: [{ id: ACTION_ID_NEW_CHAT, args: ['titleContext'] }],
			menus: [{ sameActions: true, context: 'titleContext' }],
		});
	});

	test('is disabled, with its ▾, when New Chat is', () => {
		const { primary, openMenu, commands, menus } = render(false);
		primary.click();
		openMenu();
		assert.deepStrictEqual({ disabled: primary.classList.contains('disabled'), ariaDisabled: primary.getAttribute('aria-disabled'), commands, menus: menus.length }, { disabled: true, ariaDisabled: 'true', commands: [], menus: 0 });
	});

	test('shows the keybinding of the canonical New Chat for its icon variants, but runs the variant', () => {
		const variantId = ACTION_ID_NEW_CHAT + NEW_CHAT_ICON_VARIANTS[0].idSuffix;
		const { primary, commands } = render(true, variantId, { [ACTION_ID_NEW_CHAT]: cmdN });
		primary.click();
		assert.deepStrictEqual({ ariaLabel: primary.getAttribute('aria-label'), commands: commands.map(command => command.id) }, { ariaLabel: `New Chat (${cmdN.getLabel()})`, commands: [variantId] });
	});

	test('leaves the New menu to the stock renderer in a title that does not fit its actions by their widths, or without New Chat', () => {
		const { control, submenu } = render(true);
		const withoutNewChat = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, [store.add(new Action('newChatWindow2', 'New Chat Window'))]);
		assert.deepStrictEqual([control.createActionViewItem(submenu, undefined, false), control.createActionViewItem(withoutNewChat, undefined, true)], [undefined, undefined]);
	});

	/** Renders the Chat view's title actions, New and a next icon, in a real secondary side bar title attached to the document. */
	function renderInSecondarySideBarTitle(root: HTMLElement) {
		const rendered = render(true, ACTION_ID_NEW_CHAT, { [ACTION_ID_NEW_CHAT]: cmdN });
		const { control, submenu } = rendered;
		const container = DOM.append(root, DOM.$('.part.auxiliarybar'));
		const part = createTestAuxiliaryBarPart(container, store);
		part.viewActionViewItemProvider = (action, options) => control.createActionViewItem(action, options, true);
		const next = store.add(new Action('next', 'Next', 'codicon codicon-gear'));
		part.setTitleActions('Chat', [submenu, next], []);
		const layout = (width: number) => {
			container.style.width = `${width}px`;
			part.layout(width, 200, 0, 0);
			part.toolbar.relayout();
		};
		const indexOf = (action: IAction) => [...Array(part.toolbar.getItemsLength()).keys()].find(index => part.toolbar.getItemAction(index) === action);
		const newButton = () => {
			const index = indexOf(submenu);
			return index === undefined ? undefined : part.toolbar.getItemElement(index);
		};
		return { ...rendered, part, container, next, layout, indexOf, newButton };
	}

	function attachRoot(): HTMLElement {
		const root = DOM.append(document.body, DOM.$('.monaco-workbench'));
		root.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 100000; background: white;';
		return root;
	}

	/**
	 * Narrows the secondary side bar showing the Chat view one pixel at a time, and records every width at which the shown
	 * "New" button protrudes: over the title or the next icon, out of the toolbar, shrunk from its full width, or with its ▾
	 * not hit at its centre.
	 */
	test('keeps its full width in the secondary side bar title until it moves into the overflow, and comes back', () => {
		const root = attachRoot();
		try {
			const { part, container, next, layout, indexOf, newButton } = renderInSecondarySideBarTitle(root);

			layout(400);
			const fullWidth = newButton()!.getBoundingClientRect().width;
			const protrusions: { width: number; overTitle: boolean; overNextIcon: boolean; outOfToolbar: boolean; shrunk: boolean; dropdownMissed: boolean }[] = [];
			let overflowAt: number | undefined;
			for (let width = 300; width >= 60; width--) {
				layout(width);
				const nextIndex = indexOf(next);
				const nextRect = nextIndex === undefined ? undefined : part.toolbar.getItemElement(nextIndex)!.getBoundingClientRect();
				const shown = newButton();
				if (!shown) {
					overflowAt ??= width;
					continue;
				}
				const rect = shown.getBoundingClientRect();
				const titleRect = container.querySelector('h2')!.getBoundingClientRect();
				const toolbarRect = part.toolbar.getElement().getBoundingClientRect();
				const dropdown = shown.querySelector<HTMLElement>('.monaco-dropdown')!;
				const dropdownRect = dropdown.getBoundingClientRect();
				const hit = document.elementFromPoint(dropdownRect.left + dropdownRect.width / 2, dropdownRect.top + dropdownRect.height / 2);
				const protrusion = {
					width,
					overTitle: titleRect.right > rect.left + 0.5,
					overNextIcon: !!nextRect && rect.right > nextRect.left + 0.5,
					outOfToolbar: rect.left < toolbarRect.left - 0.5 || rect.right > toolbarRect.right + 0.5,
					shrunk: rect.width < fullWidth - 0.5,
					dropdownMissed: !hit || !dropdown.contains(hit),
				};
				if (protrusion.overTitle || protrusion.overNextIcon || protrusion.outOfToolbar || protrusion.shrunk || protrusion.dropdownMissed) {
					protrusions.push(protrusion);
				}
			}
			layout(400);

			assert.ok(fullWidth > 36 && overflowAt !== undefined, `New ${fullWidth}px, overflow at ${overflowAt}px`);
			assert.deepStrictEqual({ protrusions, restored: newButton()?.getBoundingClientRect().width === fullWidth }, { protrusions: [], restored: true });
		} finally {
			root.remove();
		}
	});

	test('moves into the overflow after the other title actions, and comes back before them', () => {
		const root = attachRoot();
		try {
			const { part, submenu, next, layout, indexOf } = renderInSecondarySideBarTitle(root);
			const last = store.add(new Action('last', 'Last', 'codicon codicon-gear'));
			part.setTitleActions('Chat', [submenu, next, last], []);
			const shown = () => [submenu, next, last].filter(action => indexOf(action) !== undefined).map(action => action === submenu ? 'New' : action.id);
			const states: string[][] = [];
			const record = (width: number) => {
				layout(width);
				const actions = shown();
				if (states.at(-1)?.join() !== actions.join()) {
					states.push(actions);
				}
			};
			for (let width = 400; width >= 60; width--) {
				record(width);
			}
			for (let width = 60; width <= 400; width++) {
				record(width);
			}

			assert.deepStrictEqual(states, [['New', 'next', 'last'], ['New', 'next'], ['New'], [], ['New'], ['New', 'next'], ['New', 'next', 'last']]);
		} finally {
			root.remove();
		}
	});

	test('does not lend its width to the stock split button that replaces it', () => {
		const root = attachRoot();
		try {
			const { part, submenu, next, layout } = renderInSecondarySideBarTitle(root);
			layout(300);
			const own = part.getActionMinWidth(submenu);

			part.viewActionViewItemProvider = undefined;
			part.setTitleActions('Chat', [submenu, next], []);
			layout(300);

			assert.ok(own! > 36, `${own}px`);
			assert.strictEqual(part.getActionMinWidth(submenu), 36);
		} finally {
			root.remove();
		}
	});
});
