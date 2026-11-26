/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Action, ActionRunner, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCodeChord } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
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

/** An icon action of the title. */
class IconActionViewItem extends BaseActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.style.width = '16px';
		container.style.height = '16px';
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

	/**
	 * A title as the auxiliary bar's: a label and a responsive toolbar that overflows the New split button first, with
	 * `iconCount` icon actions after it.
	 */
	function createTitle(width: number, iconCount: number) {
		const title = DOM.append(mainWindow.document.body, DOM.$('.composite.title'));
		store.add({ dispose: () => title.remove() });
		title.style.display = 'flex';
		title.style.width = `${width}px`;
		// The spacing of the title's actions, which the toolbar's responsive layout accounts for
		DOM.append(title, DOM.$('style')).textContent = '.composite.title .action-item { margin-right: 4px; }';
		const label = DOM.append(title, DOM.$('span'));
		label.style.flex = '0 0 auto';
		const host = DOM.append(title, DOM.$('div'));
		host.style.flex = '1';
		host.style.minWidth = '0';
		const { submenu } = createSubmenu();
		const icons = Array.from({ length: iconCount }, (_, index) => store.add(new Action(`icon${index}`, `Icon ${index}`)));
		const toolbar = store.add(new ToolBar(host, { showContextMenu: () => { } }, {
			responsiveBehavior: { enabled: true, kind: 'all', overflowFrom: 'start', minItems: 0, actionMinWidth: 22, getActionMinWidth: action => action === submenu ? 36 : undefined },
			actionViewItemProvider: (action, options) => action === submenu
				? new ChatViewNewSplitButtonActionViewItem(submenu, options, new TestContextMenuService(), new TestKeybindingService() as IKeybindingService)
				: new IconActionViewItem(undefined, action, options),
		}));
		toolbar.setActions([submenu, ...icons]);
		const actionsContainer = host.querySelector<HTMLElement>('.actions-container')!;
		actionsContainer.style.justifyContent = 'flex-end';

		/** What the title shows, and whether the full button would fit next to the other actions when it is narrow. */
		const state = () => {
			const item = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button');
			if (!item) {
				return 'overflow';
			}
			const button = item.firstElementChild!.getBoundingClientRect();
			const next = item.nextElementSibling!.getBoundingClientRect();
			assert.ok(button.right <= next.left + 0.5 && button.right <= actionsContainer.getBoundingClientRect().right + 0.5, `the button overlaps the next action at ${title.style.width}`);
			assert.match(item.querySelector('.monaco-button')?.getAttribute('aria-label') ?? '', /\(Control\+N\)$/);
			if (!item.classList.contains('narrow')) {
				return 'full';
			}
			const hint = item.querySelector<HTMLElement>('.chat-view-new-split-button-keybinding')!;
			const gap = parseFloat(mainWindow.getComputedStyle(hint.parentElement!).columnGap) || 0;
			const used = [...actionsContainer.children].reduce((sum, child) => {
				const style = mainWindow.getComputedStyle(child);
				return sum + child.getBoundingClientRect().width + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
			}, 0);
			assert.ok(used + hint.getBoundingClientRect().width + gap > actionsContainer.clientWidth + 0.5, `the full button would fit at ${title.style.width}`);
			return 'compact';
		};
		return { title, label, actionsContainer, state };
	}

	test('hides the keybinding exactly when the full button does not fit, before the toolbar overflows it', async () => {
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

		for (let width = 200; width >= 40; width -= 2) {
			await record(width);
		}
		for (let width = 40; width <= 200; width += 4) {
			await record(width);
		}

		assert.deepStrictEqual(states, ['full', 'compact', 'overflow', 'compact', 'full']);
	});

	test('updates the keybinding when the other actions or the title change and the title does not', async () => {
		const { label, actionsContainer, state } = createTitle(300, 3);
		await layout();
		const states = [state()];
		const icon = actionsContainer.lastElementChild as HTMLElement;

		// The title's label takes more than the room left
		const hint = actionsContainer.querySelector<HTMLElement>('.chat-view-new-split-button-keybinding')!;
		const free = actionsContainer.clientWidth - [...actionsContainer.children].reduce((sum, child) => sum + child.getBoundingClientRect().width + parseFloat(mainWindow.getComputedStyle(child).marginLeft) + parseFloat(mainWindow.getComputedStyle(child).marginRight), 0);
		label.style.width = `${free + hint.getBoundingClientRect().width / 2}px`;
		await layout();
		states.push(state());

		label.style.width = '0px';
		await layout();
		states.push(state());

		// An action of the title grows
		icon.style.width = `${icon.getBoundingClientRect().width + free + hint.getBoundingClientRect().width / 2}px`;
		await layout();
		states.push(state());

		// ... and hides
		icon.style.display = 'none';
		await layout();
		states.push(state());

		assert.deepStrictEqual(states, ['full', 'compact', 'full', 'compact', 'full']);
	});
});
