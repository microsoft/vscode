/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ActionRunner, IAction, Separator } from '../../../../../../base/common/actions.js';
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
		return commandId === 'newChat' ? new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyN)], OperatingSystem.Windows) : undefined;
	}
}

class RecordingActionRunner extends ActionRunner {
	readonly runs: { id: string; context: unknown }[] = [];
	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		this.runs.push({ id: action.id, context });
	}
}

/** A resize observer whose callback the test runs. */
class TestResizeObserver implements ResizeObserver {
	static callback: ResizeObserverCallback | undefined;
	constructor(callback: ResizeObserverCallback) { TestResizeObserver.callback = callback; }
	observe(): void { }
	unobserve(): void { }
	disconnect(): void { }
}

suite('Sessions - ChatViewNewSplitButtonActionViewItem', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createItem(container: HTMLElement) {
		const contextKeyService = new MockContextKeyService();
		const commandService = upcastPartial<ICommandService>({});
		const action = (id: string, title: string) => new MenuItemAction({ id, title }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const actions = [action('newChat', 'New Chat'), action('newChatEditor', 'New Chat Editor'), new Separator(), action('newChatWindow', 'New Chat Window')];
		const submenu = new SubmenuItemAction({ submenu: MenuId.ChatNewMenu, title: 'New Chat' }, undefined, actions);
		const contextMenuService = new TestContextMenuService();
		const item = store.add(new ChatViewNewSplitButtonActionViewItem(submenu, { resizeObserverCtor: TestResizeObserver }, contextMenuService, new TestKeybindingService() as IKeybindingService));
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

	test('hides the keybinding exactly when the full button touches the next action and restores it', async () => {
		const title = DOM.append(mainWindow.document.body, DOM.$('.pane-header'));
		store.add({ dispose: () => title.remove() });
		title.style.width = '500px';
		const toolbar = DOM.append(title, DOM.$('.monaco-action-bar'));
		const actions = DOM.append(toolbar, DOM.$('ul.actions-container'));
		actions.style.display = 'flex';
		const container = DOM.append(actions, DOM.$('li.action-item'));
		container.style.marginRight = '4px';
		const next = DOM.append(actions, DOM.$('li.action-item'));
		next.style.flex = '0 0 22px';
		createItem(container);
		await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
		const button = container.firstElementChild as HTMLElement;
		const fullWidth = button.getBoundingClientRect().width;
		const states = [container.classList.contains('narrow')];

		for (const freeSpace of [0.5, 0, -0.5, 0.5]) {
			toolbar.style.width = `${fullWidth + 22 + freeSpace}px`;
			TestResizeObserver.callback?.([], upcastPartial<ResizeObserver>({}));
			states.push(container.classList.contains('narrow'));
		}

		assert.deepStrictEqual(states, [false, false, true, true, false]);
	});
});
