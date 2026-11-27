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
import { Emitter } from '../../../../../../base/common/event.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import '../../../../../browser/media/part.css';

suite('Sessions - Chat view sessions list New button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cmdN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);

	function render(newChatEnabled: boolean, newChatId = ACTION_ID_NEW_CHAT, keybindings: Record<string, ResolvedKeybinding> = {}, menuActions: IAction[] = []) {
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
		const contextKeyService = new MockContextKeyService();
		const newChat = new MenuItemAction({ id: newChatId, title: 'New Chat', icon: undefined, precondition: newChatEnabled ? undefined : ContextKeyExpr.false() }, undefined, { shouldForwardArgs: true }, undefined, undefined, contextKeyService, commandService);
		const actions = [newChat, new Separator(), store.add(new Action('newChatWindow', 'New Chat Window')), ...menuActions];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, actions);
		const control = instantiationService.createInstance(ChatViewSessionsListControl, upcastPartial<SessionsView>({ dispose: () => { }, createActionViewItem: () => undefined }), undefined);
		const item = store.add(control.createActionViewItem(submenu, undefined, true) as ActionWithDropdownActionViewItem);
		const container = DOM.$('div');
		item.setActionContext('titleContext');
		item.render(container);
		const primary = container.querySelector<HTMLElement>('.action-dropdown-item > .action-label')!;
		const dropdown = container.querySelector<HTMLElement>('.action-dropdown-item .monaco-dropdown .action-label')!;
		const openMenu = () => dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		const updateKeybinding = (id: string, keybinding: ResolvedKeybinding) => {
			keybindings[id] = keybinding;
			onDidUpdateKeybindings.fire();
		};
		return { item, control, submenu, container, primary, dropdown, openMenu, actions, commands, menus, errors, updateKeybinding };
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

	test('shows the new keybinding of New Chat when it is rebound while shown', () => {
		const { primary, updateKeybinding } = render(true, ACTION_ID_NEW_CHAT, { [ACTION_ID_NEW_CHAT]: cmdN });
		const cmdShiftN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, true, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);
		updateKeybinding(ACTION_ID_NEW_CHAT, cmdShiftN);
		assert.strictEqual(primary.getAttribute('aria-label'), `New Chat (${cmdShiftN.getLabel()})`);
	});

	test('runs the New menu with the context of the title and reports a failure once, even after the menu and the button are gone', async () => {
		const failure = new DeferredPromise<void>();
		const cancellation = new DeferredPromise<void>();
		const contexts: unknown[] = [];
		const failing = store.add(new Action('failing', 'Failing', undefined, true, context => { contexts.push(context); return failure.p; }));
		const cancelled = store.add(new Action('cancelled', 'Cancelled', undefined, true, context => { contexts.push(context); return cancellation.p; }));
		const { item, openMenu, menus, errors } = render(true, ACTION_ID_NEW_CHAT, {}, [failing, cancelled]);
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

	test('leaves the New menu to the stock renderer in a title that does not fit its actions by their widths, or without New Chat', () => {
		const { control, submenu } = render(true);
		const withoutNewChat = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat', isSplitButton: true }, undefined, [store.add(new Action('newChatWindow2', 'New Chat Window'))]);
		assert.deepStrictEqual([control.createActionViewItem(submenu, undefined, false), control.createActionViewItem(withoutNewChat, undefined, true)], [undefined, undefined]);
	});

	/**
	 * Renders the Chat view's title actions, New and a next icon, in a real secondary side bar title attached to the document,
	 * mounted at the given width, and with the stock split button for New if asked.
	 */
	function renderInSecondarySideBarTitle(root: HTMLElement, options?: { readonly width?: number; readonly stock?: boolean }) {
		const rendered = render(true, ACTION_ID_NEW_CHAT, { [ACTION_ID_NEW_CHAT]: cmdN });
		const { control, submenu } = rendered;
		const container = DOM.append(root, DOM.$('.part.auxiliarybar'));
		const part = createTestAuxiliaryBarPart(container, store);
		if (!options?.stock) {
			part.viewActionViewItemProvider = (action, options) => control.createActionViewItem(action, options, true);
		}
		const previous = store.add(new Action('previous', 'Previous', 'codicon codicon-gear'));
		const next = store.add(new Action('next', 'Next', 'codicon codicon-gear'));
		const last = store.add(new Action('last', 'Last', 'codicon codicon-gear'));
		const layout = (width: number) => {
			container.style.width = `${width}px`;
			part.layout(width, 200, 0, 0);
			part.toolbar.relayout();
		};
		if (options?.width !== undefined) {
			container.style.width = `${options.width}px`;
			part.layout(options.width, 200, 0, 0);
		}
		part.setTitleActions('Chat', [submenu, next], []);
		const indexOf = (action: IAction) => [...Array(part.toolbar.getItemsLength()).keys()].find(index => part.toolbar.getItemAction(index) === action);
		const newButton = () => {
			const index = indexOf(submenu);
			return index === undefined ? undefined : part.toolbar.getItemElement(index);
		};
		/** Lays the title out at each width, and records each change of the title actions it shows. */
		const recordShownActions = (widths: readonly number[]) => {
			const states: string[][] = [];
			for (const width of widths) {
				layout(width);
				const shown = [previous, submenu, next, last].filter(action => indexOf(action) !== undefined).map(action => action === submenu ? 'New' : action.id);
				if (states.at(-1)?.join() !== shown.join()) {
					states.push(shown);
				}
			}
			return states;
		};
		return { ...rendered, part, container, previous, next, last, layout, indexOf, newButton, recordShownActions };
	}

	/** The widths from the first to the last, one pixel apart. */
	function widths(from: number, to: number): number[] {
		const step = from < to ? 1 : -1;
		return Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => from + index * step);
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
			const { part, submenu, next, last, recordShownActions } = renderInSecondarySideBarTitle(root);
			part.setTitleActions('Chat', [submenu, next, last], []);
			assert.deepStrictEqual(recordShownActions([...widths(400, 60), ...widths(60, 400)]), [['New', 'next', 'last'], ['New', 'last'], ['New'], [], ['New'], ['New', 'last'], ['New', 'next', 'last']]);
		} finally {
			root.remove();
		}
	});

	test('moves into the overflow last and comes back first also after a title action before it, which keeps its place', () => {
		const root = attachRoot();
		try {
			const { part, previous, submenu, next, recordShownActions } = renderInSecondarySideBarTitle(root);
			part.setTitleActions('Chat', [previous, submenu, next], []);
			assert.deepStrictEqual(recordShownActions([...widths(400, 60), ...widths(60, 400)]), [['previous', 'New', 'next'], ['New', 'next'], ['New'], [], ['New'], ['New', 'next'], ['previous', 'New', 'next']]);
		} finally {
			root.remove();
		}
	});

	test('paints its ▾ only inside it when a product icon theme widens the glyph, in normal and high contrast themes', () => {
		const root = attachRoot();
		try {
			const { layout, newButton } = renderInSecondarySideBarTitle(root);
			layout(400);
			const wideGlyphs = DOM.append(root, DOM.$('style'));
			wideGlyphs.textContent = '.monaco-workbench .monaco-action-bar .action-dropdown-item > .monaco-dropdown .action-label.filled-label::before { content: "WWWWWW"; }';
			const paintsPast = () => {
				const chevron = newButton()!.querySelector<HTMLElement>('.monaco-dropdown .action-label')!;
				const rect = chevron.getBoundingClientRect();
				return chevron.contains(document.elementFromPoint(rect.right + 1, rect.top + rect.height / 2));
			};
			const normal = paintsPast();
			root.classList.add('hc-black', 'vscode-high-contrast');
			layout(400);
			assert.deepStrictEqual({ normal, highContrast: paintsPast() }, { normal: false, highContrast: false });
		} finally {
			root.remove();
		}
	});

	test('needs less width again when its label does, and fits like a button that never needed more', () => {
		const root = attachRoot();
		try {
			const title = renderInSecondarySideBarTitle(root);
			const reference = renderInSecondarySideBarTitle(root);
			title.layout(400);
			reference.layout(400);
			const label = title.newButton()!.querySelector<HTMLElement>(':scope > .action-label')!;

			label.style.paddingRight = '80px';
			title.layout(400);
			const grown = title.part.getActionMinWidth(title.submenu)!;
			label.style.paddingRight = '';
			title.layout(400);

			const needed = reference.part.getActionMinWidth(reference.submenu)!;
			assert.ok(grown > needed, `grown ${grown}px, needed ${needed}px`);
			assert.deepStrictEqual(
				{ minWidth: title.part.getActionMinWidth(title.submenu), shown: title.recordShownActions([...widths(400, 60), ...widths(60, 400)]) },
				{ minWidth: needed, shown: reference.recordShownActions([...widths(400, 60), ...widths(60, 400)]) },
			);
		} finally {
			root.remove();
		}
	});

	test('comes back from the overflow at its full width when the title is first shown narrow', () => {
		const root = attachRoot();
		try {
			const title = renderInSecondarySideBarTitle(root, { width: 60 });
			const reference = renderInSecondarySideBarTitle(root);
			reference.layout(400);
			const fullWidth = reference.newButton()!.getBoundingClientRect().width;
			reference.layout(60);

			const shown = title.recordShownActions(widths(60, 400));
			assert.deepStrictEqual(
				{ shown, width: title.newButton()?.getBoundingClientRect().width },
				{ shown: reference.recordShownActions(widths(60, 400)), width: fullWidth },
			);
		} finally {
			root.remove();
		}
	});

	test('does not lend its width or its place in the overflow order to the stock split button that replaces it', () => {
		const root = attachRoot();
		try {
			const { part, submenu, next, last, layout, recordShownActions } = renderInSecondarySideBarTitle(root);
			part.setTitleActions('Chat', [submenu, next, last], []);
			layout(300);
			const own = part.getActionMinWidth(submenu);

			part.viewActionViewItemProvider = undefined;
			part.setTitleActions('Chat', [submenu, next, last], []);
			layout(300);
			const stock = renderInSecondarySideBarTitle(root, { stock: true });
			stock.part.setTitleActions('Chat', [stock.submenu, stock.next, stock.last], []);

			assert.ok(own! > 36, `${own}px`);
			assert.deepStrictEqual(
				{ minWidth: part.getActionMinWidth(submenu), shown: recordShownActions([...widths(300, 30), ...widths(30, 300)]) },
				{ minWidth: 36, shown: stock.recordShownActions([...widths(300, 30), ...widths(30, 300)]) },
			);
		} finally {
			root.remove();
		}
	});
});
