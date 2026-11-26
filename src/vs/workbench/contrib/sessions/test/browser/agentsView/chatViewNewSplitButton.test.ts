/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Action, ActionRunner, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCodeChord } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chat/browser/actions/chatActions.js';
import { ChatViewNewSplitButtonActionViewItem } from '../../../browser/agentsView/chatViewNewSplitButton.js';

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	delegate: IContextMenuDelegate | undefined;

	override showContextMenu(delegate: IContextMenuDelegate): void {
		this.delegate = delegate;
	}
}

class TestKeybindingService extends MockKeybindingService {
	override lookupKeybinding(commandId: string) {
		return commandId === 'newChat' || commandId === ACTION_ID_NEW_CHAT ? new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Windows) : undefined;
	}
}

class RecordingActionRunner extends ActionRunner {
	readonly runs: { id: string; context: unknown }[] = [];
	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		this.runs.push({ id: action.id, context });
	}
}

/** An icon action of the title, which renders its label as the title's actions do. */
class IconActionViewItem extends BaseActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		const label = DOM.append(container, DOM.$('a.action-label'));
		label.style.display = 'block';
		label.style.width = '16px';
		label.style.height = '16px';
	}
}

/** Lets the resize observers and animation frames of the title run. */
async function layout(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
		await new Promise(resolve => setTimeout(resolve, 0));
	}
}

suite('Sessions - ChatViewNewSplitButtonActionViewItem', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSubmenu(primaryId = 'newChat') {
		const contextKeyService = new MockContextKeyService();
		const commandService = upcastPartial<ICommandService>({});
		const action = (id: string, title: string) => new MenuItemAction({ id, title }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const actions = [action(primaryId, 'New Chat'), action('newChatEditor', 'New Chat Editor'), new Separator(), action('newChatWindow', 'New Chat Window')];
		return { submenu: new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat' }, undefined, actions), actions };
	}

	function createItem(container: HTMLElement, primaryId?: string) {
		const { submenu, actions } = createSubmenu(primaryId);
		const contextMenuService = new TestContextMenuService();
		const item = store.add(new ChatViewNewSplitButtonActionViewItem(submenu, undefined, contextMenuService, new TestKeybindingService() as IKeybindingService));
		const runner = store.add(new RecordingActionRunner());
		item.actionRunner = runner;
		item.setActionContext('titleContext');
		item.render(container);
		return { item, actions, runner, contextMenuService };
	}

	test('shows New with the keybinding of New Chat, runs it, and opens the same menu', async () => {
		const container = DOM.$('div');
		const { actions, runner, contextMenuService } = createItem(container);
		const [primary, dropdown] = container.querySelectorAll<HTMLElement>('.monaco-button');

		primary.click();
		dropdown.click();
		const menuActions = contextMenuService.delegate?.getActions();
		await contextMenuService.delegate?.actionRunner?.run(actions[3], 'menuContext');

		assert.deepStrictEqual({
			label: primary.querySelector('.chat-view-new-split-button-label')?.textContent,
			hasKeybinding: !!primary.querySelector('.chat-view-new-split-button-keybinding:not(.hidden)')?.textContent,
			ariaLabel: primary.getAttribute('aria-label'),
			sameMenu: menuActions?.length === actions.length && menuActions.every((action, index) => action === actions[index]),
			runs: runner.runs,
		}, {
			label: 'New',
			hasKeybinding: true,
			ariaLabel: 'New Chat (Control+N)',
			sameMenu: true,
			runs: [{ id: 'newChat', context: 'titleContext' }, { id: 'newChatWindow', context: 'titleContext' }],
		});
	});

	test('reports a failing menu action to the menu, and consumes taps so that a containing pane header does not toggle', async () => {
		const container = DOM.$('div');
		const { item, actions, runner, contextMenuService } = createItem(container);
		const failure = new Error('failed');
		item.actionRunner = store.add(new class extends ActionRunner {
			protected override async runAction(): Promise<void> { throw failure; }
		}());
		const [primary, dropdown] = container.querySelectorAll<HTMLElement>('.monaco-button');

		dropdown.click();
		const menuErrors: unknown[] = [];
		store.add(contextMenuService.delegate!.actionRunner!.onDidRun(e => menuErrors.push(e.error)));
		await contextMenuService.delegate?.actionRunner?.run(actions[1]);
		item.actionRunner = runner;
		const tap = (element: HTMLElement) => {
			const event = new CustomEvent(TouchEventType.Tap, { bubbles: true, cancelable: true });
			element.dispatchEvent(event);
			return event.defaultPrevented;
		};

		assert.deepStrictEqual({
			menuErrors,
			tapsConsumed: [tap(primary), tap(dropdown)],
			runs: runner.runs.map(run => run.id),
		}, {
			menuErrors: [failure],
			tapsConsumed: [true, true],
			runs: ['newChat'],
		});
	});

	test('shows the keybinding of New Chat for its icon variants', () => {
		const container = DOM.$('div');
		createItem(container, `${ACTION_ID_NEW_CHAT}.copilotIcon`);
		const primary = container.querySelector<HTMLElement>('.monaco-button');

		assert.deepStrictEqual({
			hasKeybinding: !!primary?.querySelector('.chat-view-new-split-button-keybinding:not(.hidden)')?.textContent,
			ariaLabel: primary?.getAttribute('aria-label'),
		}, {
			hasKeybinding: true,
			ariaLabel: 'New Chat (Control+N)',
		});
	});

	test('shows the icon of New Chat, within the width reserved for a split button, in a title that does not shrink it', async () => {
		const title = DOM.append(mainWindow.document.body, DOM.$('div'));
		store.add({ dispose: () => title.remove() });
		title.style.width = '300px';
		const container = DOM.append(title, DOM.$('div'));
		const { runner } = createItem(container);
		await layout();
		const [primary, dropdown] = container.querySelectorAll<HTMLElement>('.monaco-button');
		primary.click();

		assert.deepStrictEqual({
			iconOnly: container.classList.contains('icon-only'),
			shown: [...primary.children].filter(child => child.checkVisibility({ visibilityProperty: true })).map(child => child.className),
			fitsReservedWidth: container.firstElementChild!.getBoundingClientRect().width <= 36,
			ariaLabel: primary.getAttribute('aria-label'),
			hasDropdown: !!dropdown,
			runs: runner.runs,
		}, {
			iconOnly: true,
			shown: [`${ThemeIcon.asClassName(Codicon.plus)} chat-view-new-split-button-icon`],
			fitsReservedWidth: true,
			ariaLabel: 'New Chat (Control+N)',
			hasDropdown: true,
			runs: [{ id: 'newChat', context: 'titleContext' }],
		});
	});

	/**
	 * A title as the auxiliary bar's: a label and a responsive toolbar that overflows the New split button first, with
	 * `iconCount` icon actions and a hidden separator after it. As the auxiliary bar, it reserves 36px for a split button.
	 */
	function createTitle(width: number, iconCount: number) {
		const title = DOM.append(mainWindow.document.body, DOM.$('.composite.title'));
		store.add({ dispose: () => title.remove() });
		title.style.display = 'flex';
		title.style.width = `${width}px`;
		// The part lays out its title at a fixed height, which the actions do not change
		title.style.height = '35px';
		// The spacing of the title's actions, which the toolbar's responsive layout accounts for, and the separator that ends
		// the actions, hidden without the part's own
		DOM.append(title, DOM.$('style')).textContent = `
			.composite.title .action-item { margin-right: 4px; }
			.composite.title .action-item:last-child:has(> .action-label.separator) { display: none; }`;
		const label = DOM.append(title, DOM.$('span'));
		label.style.flex = '0 0 auto';
		const host = DOM.append(title, DOM.$('div'));
		host.style.flex = '1';
		host.style.minWidth = '0';
		const { submenu } = createSubmenu();
		const icons = Array.from({ length: iconCount }, (_, index) => store.add(new Action(`icon${index}`, `Icon ${index}`)));
		const toolbar = store.add(new ToolBar(host, { showContextMenu: () => { } }, {
			responsiveBehavior: {
				enabled: true, kind: 'all', overflowFrom: 'start', minItems: 0, actionMinWidth: 22,
				getActionMinWidth: action => action === submenu ? 36 : undefined,
			},
			actionViewItemProvider: (action, options) => {
				if (action === submenu) {
					return new ChatViewNewSplitButtonActionViewItem(submenu, options, new TestContextMenuService(), new TestKeybindingService() as IKeybindingService);
				}
				return action.id === Separator.ID ? undefined : new IconActionViewItem(undefined, action, options);
			},
		}));
		toolbar.setActions([submenu, ...icons, new Separator()]);
		const actionsContainer = host.querySelector<HTMLElement>('.actions-container')!;
		actionsContainer.style.justifyContent = 'flex-end';

		/** The room between the button and the next shown action, or the end of the title. */
		const clearance = (item: HTMLElement) => {
			const right = item.firstElementChild!.getBoundingClientRect().right;
			for (let next = item.nextElementSibling; next; next = next.nextElementSibling) {
				const rect = next.getBoundingClientRect();
				if (rect.width > 0) {
					return rect.left - right;
				}
			}
			return actionsContainer.getBoundingClientRect().right - right;
		};

		const sizeClasses = { full: [], compact: ['compact'], icon: ['icon-only'] };
		const sizeOf = (item: HTMLElement) => item.classList.contains('icon-only') ? 'icon' : item.classList.contains('compact') ? 'compact' : 'full';
		/** The room that the button would keep with the given size, which it measures without a paint. */
		const clearanceWith = (item: HTMLElement, size: keyof typeof sizeClasses) => {
			const current = sizeOf(item);
			item.classList.remove('compact', 'icon-only');
			item.classList.add(...sizeClasses[size]);
			const result = clearance(item);
			item.classList.remove('compact', 'icon-only');
			item.classList.add(...sizeClasses[current]);
			return result;
		};

		/**
		 * What the title shows: the largest size of the button that keeps a pixel before the next action, and the icon
		 * otherwise, which never overlaps it.
		 */
		const state = () => {
			const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button');
			if (!item) {
				return 'overflow';
			}
			assert.match(item.querySelector('.monaco-button')?.getAttribute('aria-label') ?? '', /\(Control\+N\)$/);
			const size = sizeOf(item);
			const shown = clearance(item);
			assert.ok(shown >= (size === 'icon' ? 0 : 1), `the ${size} button touches the next action at ${title.style.width}: ${shown}`);
			const larger = size === 'icon' ? 'compact' : size === 'compact' ? 'full' : undefined;
			if (larger) {
				const wouldBe = clearanceWith(item, larger);
				assert.ok(wouldBe < 1, `the ${larger} button would fit at ${title.style.width}: ${wouldBe}`);
			}
			return size;
		};
		return { title, label, toolbar, actionsContainer, clearance, state };
	}

	test('shrinks the button exactly when a larger size does not fit, before the toolbar overflows it', async function () {
		// Lays out the title at every width of the sweep
		this.timeout(30_000);
		const { title, state } = createTitle(300, 2);
		const states: string[] = [];
		const record = async (width: number) => {
			title.style.width = `${width}px`;
			await layout();
			const current = state();
			if (states.at(-1) !== current) {
				states.push(current);
			}
		};

		for (let width = 200; width >= 40; width -= 1) {
			await record(width);
		}
		for (let width = 40; width <= 200; width += 3) {
			await record(width);
		}

		assert.deepStrictEqual(states, ['full', 'compact', 'icon', 'overflow', 'icon', 'compact', 'full']);
	});

	test('restores the button as the icon and shows its largest size that fits before the first paint', async () => {
		const { title, toolbar, actionsContainer, clearance } = createTitle(300, 2);
		await layout();
		title.style.width = '40px';
		toolbar.relayout();
		const overflowed = !actionsContainer.querySelector('.chat-view-new-split-button');

		title.style.width = '300px';
		toolbar.relayout();
		const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button')!;
		const restored = { iconOnly: item.classList.contains('icon-only'), overlaps: clearance(item) < 0 };
		// Notified after the button's own observer, in the same rendering, which comes before the paint
		const atFirstPaint = await new Promise<{ full: boolean; touches: boolean }>(resolve => {
			const observer = new DOM.DisposableResizeObserver('test', () => resolve({ full: !item.classList.contains('compact') && !item.classList.contains('icon-only'), touches: clearance(item) < 1 }), mainWindow);
			store.add(observer);
			store.add(observer.observe(item.querySelector('.monaco-dropdown-button')!));
		});

		assert.deepStrictEqual({ overflowed, restored, atFirstPaint }, {
			overflowed: true,
			restored: { iconOnly: true, overlaps: false },
			atFirstPaint: { full: true, touches: false },
		});
	});

	test('shows the icon when the label needs more room at the same width', async () => {
		const { title, actionsContainer, state } = createTitle(300, 2);
		let width = 200;
		do {
			title.style.width = `${width -= 1}px`;
			await layout();
		} while (state() !== 'compact');
		const states = [state()];

		actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button-label')!.style.fontSize = '40px';
		await layout();
		states.push(state());

		assert.deepStrictEqual(states, ['compact', 'icon']);
	});

	test('fits again before the paint when only the keybinding needs more or less room at the same width', async () => {
		const { title, actionsContainer, clearance, state } = createTitle(300, 2);
		// The narrowest width with the full button
		let width = 200;
		do {
			title.style.width = `${width -= 1}px`;
			await layout();
		} while (state() === 'full');
		title.style.width = `${width + 1}px`;
		await layout();
		const states = [state()];

		const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button')!;
		const hint = item.querySelector<HTMLElement>('.chat-view-new-split-button-keybinding')!;
		/** Changes the keybinding's font and reports what the button shows when it is notified, before the paint. */
		const changeFont = (fontSize: string) => new Promise<{ size: string; touches: boolean }>(resolve => {
			const observer = new DOM.DisposableResizeObserver('test', () => {
				observer.dispose();
				resolve({ size: item.classList.contains('compact') ? 'compact' : item.classList.contains('icon-only') ? 'icon' : 'full', touches: clearance(item) < 1 });
			}, mainWindow);
			store.add(observer);
			hint.style.fontSize = fontSize;
			store.add(observer.observe(hint));
		});
		const atPaint = [await changeFont('40px')];
		await layout();
		states.push(state());
		atPaint.push(await changeFont(''));
		await layout();
		states.push(state());

		assert.deepStrictEqual({ states, atPaint }, {
			states: ['full', 'compact', 'full'],
			atPaint: [{ size: 'compact', touches: false }, { size: 'full', touches: false }],
		});
	});

	test('does not lay out its sizes again when what it fits to does not change', async () => {
		const { title, actionsContainer, state } = createTitle(300, 2);
		let width = 200;
		do {
			title.style.width = `${width -= 1}px`;
			await layout();
		} while (state() !== 'icon');
		const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button')!;
		const writes: string[] = [];
		const observer = new MutationObserver(records => writes.push(...records.map(() => item.className)));
		observer.observe(item, { attributes: true, attributeFilter: ['class'] });
		store.add({ dispose: () => observer.disconnect() });

		// Notifies the button about the row without changing the widths it fits to
		title.style.height = '40px';
		const icon = [...actionsContainer.children].find(child => child !== item && child.firstElementChild) as HTMLElement;
		(icon.firstElementChild as HTMLElement).style.height = '18px';
		await layout();
		writes.push(...observer.takeRecords().map(() => item.className));

		assert.deepStrictEqual({ size: state(), writes }, { size: 'icon', writes: [] });
	});

	test('fits again before the paint when the toolbar replaces an action with one of the same width that takes more room', async () => {
		const { title, actionsContainer, clearance, state } = createTitle(300, 2);
		// The narrowest width with the full button
		let width = 200;
		do {
			title.style.width = `${width -= 1}px`;
			await layout();
		} while (state() === 'full');
		title.style.width = `${width + 1}px`;
		await layout();
		const states = [state()];

		const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button')!;
		// The last icon, whose larger margin moves the icons before it towards the button
		const icon = [...actionsContainer.children].filter(child => child !== item && mainWindow.getComputedStyle(child).display !== 'none').at(-1) as HTMLElement;
		const replacement = icon.cloneNode(true) as HTMLElement;
		replacement.style.marginRight = '16px';
		/** What the button shows, and whether it touches the next action or leaves the row over the title's label. */
		const shown = () => ({
			size: item.classList.contains('compact') ? 'compact' : item.classList.contains('icon-only') ? 'icon' : 'full',
			overlaps: clearance(item) < 1 || item.getBoundingClientRect().left < actionsContainer.getBoundingClientRect().left,
		});
		// Reports what the button shows once the replacement is notified, before the paint
		const atPaint = await new Promise<{ size: string; overlaps: boolean }>(resolve => {
			const observer = new MutationObserver(() => {
				observer.disconnect();
				resolve(shown());
			});
			store.add({ dispose: () => observer.disconnect() });
			observer.observe(actionsContainer, { childList: true });
			icon.replaceWith(replacement);
		});
		await layout();

		assert.deepStrictEqual({ states, atPaint, afterPaint: shown() }, {
			states: ['full'],
			atPaint: { size: 'compact', overlaps: false },
			afterPaint: { size: 'compact', overlaps: false },
		});
	});

	test('updates the size when the other actions or the title change and the title does not', async () => {
		const { label, actionsContainer, state } = createTitle(300, 3);
		await layout();
		const states = [state()];
		const shownChildren = () => [...actionsContainer.children].filter(child => mainWindow.getComputedStyle(child).display !== 'none');
		const icon = shownChildren().at(-1) as HTMLElement;

		// The title's label takes more than the room left
		const hint = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button-keybinding')!;
		const free = actionsContainer.clientWidth - shownChildren().reduce((sum, child) => sum + child.getBoundingClientRect().width + parseFloat(mainWindow.getComputedStyle(child).marginLeft) + parseFloat(mainWindow.getComputedStyle(child).marginRight), 0);
		label.style.width = `${free + hint.getBoundingClientRect().width / 2}px`;
		await layout();
		states.push(state());

		label.style.width = '0px';
		await layout();
		states.push(state());

		// An action of the title grows
		const iconLabel = icon.firstElementChild as HTMLElement;
		iconLabel.style.width = `${iconLabel.getBoundingClientRect().width + free + hint.getBoundingClientRect().width / 2}px`;
		await layout();
		states.push(state());

		// ... and hides
		icon.style.display = 'none';
		await layout();
		states.push(state());

		assert.deepStrictEqual(states, ['full', 'compact', 'full', 'compact', 'full']);
	});
});
