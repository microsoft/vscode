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
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
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
import { Emitter } from '../../../../../../base/common/event.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chat/browser/actions/chatActions.js';
import { NEW_CHAT_ICON_VARIANTS } from '../../../../chat/browser/actions/chatNewActions.js';
import { createTestAuxiliaryBarPart } from '../../../../../test/browser/parts/auxiliaryBarTestUtils.js';
import '../../../../../browser/media/part.css';

suite('Sessions - Chat view sessions list New button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(newChatEnabled: boolean, menuAction?: IAction, newChatId = 'newChat', keybindings: Record<string, ResolvedKeybinding> = {}) {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return undefined; } });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		const onDidUpdateKeybindings = store.add(new Emitter<void>());
		const keybindingService = upcastPartial<IKeybindingService>({ lookupKeybinding: id => keybindings[id], lookupKeybindings: id => keybindings[id] ? [keybindings[id]] : [], onDidUpdateKeybindings: onDidUpdateKeybindings.event });
		instantiationService.stub(IKeybindingService, keybindingService);
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
		const updateKeybinding = (id: string, keybinding: ResolvedKeybinding) => {
			keybindings[id] = keybinding;
			onDidUpdateKeybindings.fire();
		};
		return { item, control, submenu, container, actions, commands, menus, errors, keybindingService, updateKeybinding };
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

	test('shows the keybinding of the canonical New Chat for its icon variants, but runs the variant, and none for another command without one', () => {
		const newChatKeybinding = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);
		const variantId = ACTION_ID_NEW_CHAT + NEW_CHAT_ICON_VARIANTS[0].idSuffix;
		const shown = (newChatId: string) => {
			const { container, commands } = render(true, undefined, newChatId, { [ACTION_ID_NEW_CHAT]: newChatKeybinding });
			const primary = container.querySelector<HTMLElement>('.agent-sessions-compact-new-button')!;
			primary.click();
			return { ariaLabel: primary.getAttribute('aria-label'), hasChip: !!primary.querySelector('.monaco-keybinding'), commands: commands.map(command => command.id) };
		};
		assert.deepStrictEqual({ variant: shown(variantId), other: shown('other.newSession') }, {
			variant: { ariaLabel: `New Chat (${newChatKeybinding.getAriaLabel()})`, hasChip: true, commands: [variantId] },
			other: { ariaLabel: 'New Chat', hasChip: false, commands: ['other.newSession'] },
		});
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

	const cmdN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Macintosh);
	const cmdShiftAltN = new USLayoutResolvedKeybinding([new KeyCodeChord(true, true, true, false, KeyCode.KeyN)], OperatingSystem.Macintosh);

	/** Renders the Chat view's title actions, New and a next icon, in a real secondary side bar title attached to the document. */
	function renderInSecondarySideBarTitle(root: HTMLElement) {
		const rendered = render(true, undefined, ACTION_ID_NEW_CHAT, { [ACTION_ID_NEW_CHAT]: cmdN });
		const { control, submenu } = rendered;
		const container = DOM.append(root, DOM.$('.part.auxiliarybar'));
		const part = createTestAuxiliaryBarPart(container, store, { onDidUpdateKeybindings: rendered.keybindingService.onDidUpdateKeybindings });
		part.viewActionViewItemProvider = (action, options) => control.createActionViewItem(action, options);
		const next = store.add(new Action('next', 'Next', 'codicon codicon-gear'));
		part.setTitleActions('Chat', [submenu, next], []);
		const layout = (width: number) => {
			container.style.width = `${width}px`;
			part.layout(width, 200, 0, 0);
			part.toolbar.relayout();
		};
		const indexOf = (action: IAction) => [...Array(part.toolbar.getItemsLength()).keys()].find(index => part.toolbar.getItemAction(index) === action);
		const pill = () => {
			const index = indexOf(submenu);
			return index === undefined ? undefined : part.toolbar.getItemElement(index)!.querySelector<HTMLElement>('.agent-sessions-compact-new-button-dropdown')!;
		};
		const nextRect = () => {
			const index = indexOf(next);
			return index === undefined ? undefined : part.toolbar.getItemElement(index)!.getBoundingClientRect();
		};
		/** Where New is: shown whole and clear of the next icon, which stays in the title, or in the overflow. */
		const state = () => {
			const shown = pill();
			const nextIcon = nextRect();
			const partRect = container.getBoundingClientRect();
			const nextIconInTitle = !!nextIcon && nextIcon.left >= partRect.left - 0.5 && nextIcon.right <= partRect.right + 0.5;
			if (!shown) {
				return { newButton: 'overflow', nextIconInTitle };
			}
			return { newButton: nextIcon && shown.getBoundingClientRect().right > nextIcon.left + 0.5 ? 'overNextIcon' : 'shown', nextIconInTitle };
		};
		/** The narrowest width New is shown at, narrowing one pixel at a time. */
		const narrowestShownWidth = () => {
			let width = 300;
			for (; width >= 60; width--) {
				layout(width);
				if (!pill()) {
					break;
				}
			}
			return width + 1;
		};
		return { ...rendered, part, container, next, layout, indexOf, pill, nextRect, state, narrowestShownWidth };
	}

	function attachRoot(): HTMLElement {
		const root = DOM.append(document.body, DOM.$('.monaco-workbench'));
		root.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 100000; background: white;';
		return root;
	}

	/**
	 * Narrows the secondary side bar showing the Chat view one pixel at a time, and records every width at which the shown
	 * "New" button protrudes: over the title or the next icon, out of the toolbar, shrunk from its full width, or with its
	 * dropdown part not hit at its centre.
	 */
	test('keeps its full width in the secondary side bar title until it moves into the overflow, and comes back', () => {
		const root = attachRoot();
		try {
			const { part, container, next, layout, indexOf, pill } = renderInSecondarySideBarTitle(root);

			layout(400);
			const pillWidth = pill()!.getBoundingClientRect().width;
			const protrusions: { width: number; overTitle: boolean; overNextIcon: boolean; outOfToolbar: boolean; shrunk: boolean; dropdownMissed: boolean }[] = [];
			let overflowAt: number | undefined;
			let lastFit: { width: number; spareWidth: number } | undefined;
			const nextIconOutside: number[] = [];
			for (let width = 300; width >= 60; width--) {
				layout(width);
				const nextIndex = indexOf(next);
				const nextRect = nextIndex === undefined ? undefined : part.toolbar.getItemElement(nextIndex)!.getBoundingClientRect();
				const partRect = container.getBoundingClientRect();
				if (nextRect && (nextRect.left < partRect.left - 0.5 || nextRect.right > partRect.right + 0.5)) {
					nextIconOutside.push(width);
				}
				const shown = pill();
				if (!shown) {
					overflowAt ??= width;
					continue;
				}
				const pillRect = shown.getBoundingClientRect();
				const titleRect = container.querySelector('h2')!.getBoundingClientRect();
				const toolbarRect = part.toolbar.getElement().getBoundingClientRect();
				lastFit = { width, spareWidth: pillRect.left - titleRect.right };
				const dropdown = shown.querySelector<HTMLElement>('.monaco-dropdown-button')!;
				const dropdownRect = dropdown.getBoundingClientRect();
				const hit = document.elementFromPoint(dropdownRect.left + dropdownRect.width / 2, dropdownRect.top + dropdownRect.height / 2);
				const protrusion = {
					width,
					overTitle: titleRect.right > pillRect.left + 0.5,
					overNextIcon: !!nextRect && pillRect.right > nextRect.left + 0.5,
					outOfToolbar: pillRect.left < toolbarRect.left - 0.5 || pillRect.right > toolbarRect.right + 0.5,
					shrunk: pillRect.width < pillWidth - 0.5,
					dropdownMissed: !hit || !dropdown.contains(hit),
				};
				if (protrusion.overTitle || protrusion.overNextIcon || protrusion.outOfToolbar || protrusion.shrunk || protrusion.dropdownMissed) {
					protrusions.push(protrusion);
				}
			}
			layout(400);

			// New moves into the overflow only once it no longer fits: just before that, the title leaves it no more spare room than the toolbar padding.
			assert.ok(pillWidth > 36 && overflowAt !== undefined && lastFit?.width === overflowAt + 1 && lastFit.spareWidth < 12, `pill ${pillWidth}px, overflow at ${overflowAt}px, last fit ${JSON.stringify(lastFit)}`);
			assert.deepStrictEqual({ protrusions, nextIconOutside, restored: pill()?.getBoundingClientRect().width === pillWidth }, { protrusions: [], nextIconOutside: [], restored: true });
		} finally {
			root.remove();
		}
	});

	test('moves into the overflow when a longer keybinding no longer fits at the same width, and back when it fits again', async () => {
		const root = attachRoot();
		try {
			const { part, submenu, layout, state, narrowestShownWidth, updateKeybinding } = renderInSecondarySideBarTitle(root);
			const width = narrowestShownWidth();
			layout(width);
			const before = { state: state(), minWidth: part.getActionMinWidth(submenu) };

			updateKeybinding(ACTION_ID_NEW_CHAT, cmdShiftAltN);
			await timeout(0);
			const longer = { state: state(), minWidth: part.getActionMinWidth(submenu) };

			updateKeybinding(ACTION_ID_NEW_CHAT, cmdN);
			await timeout(0);

			assert.ok(longer.minWidth! > before.minWidth!, `${before.minWidth}px, then ${longer.minWidth}px`);
			assert.deepStrictEqual({ before: before.state, longer: longer.state, after: state() }, {
				before: { newButton: 'shown', nextIconInTitle: true },
				longer: { newButton: 'overflow', nextIconInTitle: true },
				after: { newButton: 'shown', nextIconInTitle: true },
			});
		} finally {
			root.remove();
		}
	});

	test('fits again when it comes back from the overflow with a longer keybinding', async () => {
		const root = attachRoot();
		try {
			const { layout, state, narrowestShownWidth, updateKeybinding } = renderInSecondarySideBarTitle(root);
			const width = narrowestShownWidth();
			layout(width - 1);
			const hidden = state();

			updateKeybinding(ACTION_ID_NEW_CHAT, cmdShiftAltN);
			await timeout(0);
			layout(width);
			await timeout(0);
			const atOldWidth = state();
			layout(300);
			await timeout(0);

			assert.deepStrictEqual({ hidden, atOldWidth, wide: state() }, {
				hidden: { newButton: 'overflow', nextIconInTitle: true },
				atOldWidth: { newButton: 'overflow', nextIconInTitle: true },
				wide: { newButton: 'shown', nextIconInTitle: true },
			});
		} finally {
			root.remove();
		}
	});

	test('does not lend its width to the stock split button that replaces it', () => {
		const root = attachRoot();
		try {
			const { part, submenu, next, layout } = renderInSecondarySideBarTitle(root);
			layout(300);
			const joined = part.getActionMinWidth(submenu);

			part.viewActionViewItemProvider = undefined;
			part.setTitleActions('Chat', [submenu, next], []);
			layout(300);

			assert.ok(joined! > 36, `${joined}px`);
			assert.strictEqual(part.getActionMinWidth(submenu), 36);
		} finally {
			root.remove();
		}
	});
});
