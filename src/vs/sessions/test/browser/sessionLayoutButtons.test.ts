/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { ToolBar } from '../../../base/browser/ui/toolbar/toolbar.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Separator, toAction } from '../../../base/common/actions.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { InMemoryStorageService } from '../../../platform/storage/common/storage.js';
import { bindSessionLayoutButtonsContext, getSessionLayoutButtonsContextMenuActions, registerLayoutButtons, registerSessionLayoutButtonsContextMenu, SessionLayoutButton, SessionLayoutButtonsService } from '../../browser/sessionLayoutButtons.js';

suite('Sessions - Layout buttons', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// Two window kinds, as the main window and the chat windows register them: their own menus, commands and state.
	const kinds = ['main', 'chatWindow'].map(kind => {
		const mode = new RawContextKey<string>(`test.layoutButtons.${kind}.mode`, 'sideBySide');
		const stacked = new RawContextKey<boolean>(`test.layoutButtons.${kind}.stacked`, false);
		return {
			kind,
			mode,
			stacked,
			window: new RawContextKey<boolean>(`test.layoutButtons.${kind}.window`, false),
			titleBar: new MenuId(`test.layoutButtons.${kind}.titleBar`),
			layoutMenu: new MenuId(`test.layoutButtons.${kind}.layoutMenu`),
			commandIds: { [SessionLayoutButton.Chat]: `${kind}.toggleChat`, [SessionLayoutButton.Editor]: `${kind}.toggleEditor`, [SessionLayoutButton.Arrangement]: `${kind}.toggleArrangement` },
		};
	});

	function setup() {
		for (const kind of kinds) {
			disposables.add(registerLayoutButtons({
				layoutMenu: kind.layoutMenu,
				layoutMenuTitles: [{ title: 'Layout', when: ContextKeyExpr.true() }],
				buttonMenus: [{ menu: kind.titleBar, group: 'navigation', order: 0, when: ContextKeyExpr.true() }],
				when: kind.window,
				commandIds: kind.commandIds,
				state: { chatShown: kind.mode.notEqualsTo('editorOnly'), editorShown: kind.mode.notEqualsTo('chatOnly'), stacked: kind.stacked },
			}));
		}
		const storageService = disposables.add(new InMemoryStorageService());
		const service = new SessionLayoutButtonsService(storageService);
		// A window of each kind: they share the global context, as every window of the Agents window does.
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(bindSessionLayoutButtonsContext(service, contextKeyService));
		const windows = kinds.map(kind => {
			const windowContext = disposables.add(contextKeyService.createScoped(document.createElement('div')));
			kind.window.bindTo(windowContext).set(true);
			return { kind, context: windowContext, mode: kind.mode.bindTo(windowContext), stacked: kind.stacked.bindTo(windowContext) };
		});
		// The title bar of each window: its Layout menu entry and its buttons with their icons.
		const describe = () => Object.fromEntries(windows.map(({ kind, context }) => {
			const shown = MenuRegistry.getMenuItems(kind.titleBar).filter(item => context.contextMatchesRules(item.when));
			return [kind.kind, [
				...shown.filter(isIMenuItem).map(item => `${item.command.id.split('.')[1]}:${ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : ''}`),
				...shown.filter(isISubmenuItem).filter(item => item.submenu === kind.layoutMenu).map(() => 'Layout'),
			]];
		}));
		return { storageService, service, windows, describe };
	}

	test('promoting an action in any window shows its button in every window, the Layout menu hides once all are promoted and shows again when one is hidden, and the state persists', () => {
		const { storageService, service, describe } = setup();
		const initially = describe();
		service.setPromoted(SessionLayoutButton.Chat, true);
		const chatPromoted = describe();
		service.setPromoted(SessionLayoutButton.Editor, true);
		service.setPromoted(SessionLayoutButton.Arrangement, true);
		const allPromoted = describe();
		service.setPromoted(SessionLayoutButton.Editor, false);
		const oneHidden = describe();
		// Another window, or the next start: the same state.
		const restored = [...new SessionLayoutButtonsService(storageService).promoted.get()];

		assert.deepStrictEqual({ initially, chatPromoted, allPromoted, oneHidden, restored }, {
			initially: { main: ['toggleEditor:layout-sidebar-right', 'Layout'], chatWindow: ['toggleEditor:layout-sidebar-right', 'Layout'] },
			chatPromoted: {
				main: ['toggleChat:layout-sidebar-left', 'toggleEditor:layout-sidebar-right', 'Layout'],
				chatWindow: ['toggleChat:layout-sidebar-left', 'toggleEditor:layout-sidebar-right', 'Layout'],
			},
			allPromoted: {
				main: ['toggleChat:layout-sidebar-left', 'toggleEditor:layout-sidebar-right', 'toggleArrangement:split-vertical'],
				chatWindow: ['toggleChat:layout-sidebar-left', 'toggleEditor:layout-sidebar-right', 'toggleArrangement:split-vertical'],
			},
			oneHidden: {
				main: ['toggleChat:layout-sidebar-left', 'toggleArrangement:split-vertical', 'Layout'],
				chatWindow: ['toggleChat:layout-sidebar-left', 'toggleArrangement:split-vertical', 'Layout'],
			},
			restored: [SessionLayoutButton.Chat, SessionLayoutButton.Arrangement],
		});
	});

	test('in a fresh profile only Show Editor is promoted, in every window, beside the Layout menu, and once hidden it stays hidden', () => {
		const { storageService, service, describe } = setup();
		const fresh = { promoted: [...service.promoted.get()], titleBars: describe() };
		service.setPromoted(SessionLayoutButton.Editor, false);
		const afterHidingAll = { promoted: [...new SessionLayoutButtonsService(storageService).promoted.get()], titleBars: describe() };

		assert.deepStrictEqual({ fresh, afterHidingAll }, {
			fresh: {
				promoted: [SessionLayoutButton.Editor],
				titleBars: { main: ['toggleEditor:layout-sidebar-right', 'Layout'], chatWindow: ['toggleEditor:layout-sidebar-right', 'Layout'] },
			},
			afterHidingAll: { promoted: [], titleBars: { main: ['Layout'], chatWindow: ['Layout'] } },
		});
	});

	test('the chat and editor buttons show the state of their window by their icon, and the arrangement button what it does, the other arrangement, by its icon and title; side by side and stacked, with no toggled state', () => {
		const { service, windows, describe } = setup();
		for (const button of [SessionLayoutButton.Chat, SessionLayoutButton.Editor, SessionLayoutButton.Arrangement]) {
			service.setPromoted(button, true);
		}
		const [, chatWindow] = windows;
		const icons = () => describe().chatWindow.map(entry => entry.split(':')[1]);
		const states: Record<string, string[]> = {};
		for (const stacked of [false, true]) {
			chatWindow.stacked.set(stacked);
			for (const mode of ['both', 'chatOnly', 'editorOnly']) {
				chatWindow.mode.set(mode);
				states[`${stacked ? 'stacked' : 'sideBySide'} ${mode}`] = icons();
			}
		}
		const toggled = MenuRegistry.getMenuItems(chatWindow.kind.titleBar).filter(isIMenuItem).some(item => !!item.command.toggled);
		const arrangementTitles: Record<string, string> = {};
		for (const stacked of [false, true]) {
			chatWindow.stacked.set(stacked);
			const item = MenuRegistry.getMenuItems(chatWindow.kind.titleBar).filter(isIMenuItem).find(item => item.command.id === chatWindow.kind.commandIds[SessionLayoutButton.Arrangement] && chatWindow.context.contextMatchesRules(item.when))!;
			arrangementTitles[stacked ? 'stacked' : 'sideBySide'] = typeof item.command.title === 'string' ? item.command.title : item.command.title.value;
		}

		assert.deepStrictEqual({ states, arrangementTitles, toggled }, {
			states: {
				'sideBySide both': ['layout-sidebar-left', 'layout-sidebar-right', 'split-vertical'],
				'sideBySide chatOnly': ['layout-sidebar-left', 'layout-sidebar-right-off', 'split-vertical'],
				'sideBySide editorOnly': ['layout-sidebar-left-off', 'layout-sidebar-right', 'split-vertical'],
				'stacked both': ['layout-statusbar', 'session-layout-editor-above', 'split-horizontal'],
				'stacked chatOnly': ['layout-statusbar', 'session-layout-editor-above-off', 'split-horizontal'],
				'stacked editorOnly': ['session-layout-chat-below-off', 'session-layout-editor-above', 'split-horizontal'],
			},
			arrangementTitles: { sideBySide: 'Stacked', stacked: 'Side by Side' },
			toggled: false,
		});
	});

	test('the context menu of the Layout menu promotes or hides each action, and that of a promoted button hides it first', () => {
		const { service } = setup();
		const describe = (button: SessionLayoutButton | undefined) => getSessionLayoutButtonsContextMenuActions(service, button).map(action => action instanceof Separator ? '---' : `${action.checked ? '[x] ' : ''}${action.label}`);

		const layoutMenu = describe(undefined);
		getSessionLayoutButtonsContextMenuActions(service, undefined)[0].run();
		const afterPromotingChat = describe(undefined);
		const promotedButton = describe(SessionLayoutButton.Chat);
		getSessionLayoutButtonsContextMenuActions(service, SessionLayoutButton.Chat)[0].run();

		assert.deepStrictEqual({ layoutMenu, afterPromotingChat, promotedButton, afterHide: [...service.promoted.get()] }, {
			layoutMenu: ['Show Chat', '[x] Show Editor', 'Stacked'],
			afterPromotingChat: ['[x] Show Chat', '[x] Show Editor', 'Stacked'],
			promotedButton: ['Hide \'Show Chat\'', '---', '[x] Show Chat', '[x] Show Editor', 'Stacked'],
			afterHide: [SessionLayoutButton.Editor],
		});
	});
	test('a right click on the Layout menu entry or a promoted button of a toolbar shows the context menu of the layout buttons, and on another action the toolbar\'s own', () => {
		const { service } = setup();
		service.setPromoted(SessionLayoutButton.Editor, true);
		const [kind] = kinds;
		const shown: string[][] = [];
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu: delegate => { shown.push((delegate.getActions?.() ?? []).map(action => action instanceof Separator ? '---' : action.label)); } });
		const container = append(mainWindow.document.body, $('div'));
		disposables.add(toDisposable(() => container.remove()));
		const toolBar = disposables.add(new ToolBar(container, contextMenuService));
		// The actions as a menu toolbar renders them: the Layout menu entry, a promoted button, and another action.
		const layoutMenu = Object.assign(Object.create(SubmenuItemAction.prototype) as SubmenuItemAction, { id: 'layout', label: 'Layout', enabled: true, class: undefined, tooltip: '', checked: undefined, item: { submenu: kind.layoutMenu } });
		const editorButton = Object.assign(Object.create(MenuItemAction.prototype) as MenuItemAction, { id: kind.commandIds[SessionLayoutButton.Editor], label: 'Show Editor', enabled: true, class: undefined, tooltip: '', checked: undefined, item: {} });
		const other = toAction({ id: 'other', label: 'Other', run: () => { } });
		toolBar.setActions([layoutMenu, editorButton, other]);
		disposables.add(registerSessionLayoutButtonsContextMenu(toolBar, service, contextMenuService));
		const rightClick = (index: number) => {
			const before = shown.length;
			toolBar.getItemElement(index)!.querySelector('.action-label')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			return shown.length > before ? shown[shown.length - 1] : 'not shown';
		};

		assert.deepStrictEqual({ layoutMenu: rightClick(0), promotedButton: rightClick(1), other: rightClick(2) }, {
			layoutMenu: ['Show Chat', 'Show Editor', 'Stacked'],
			promotedButton: ['Hide \'Show Editor\'', '---', 'Show Chat', 'Show Editor', 'Stacked'],
			other: 'not shown',
		});
	});
});
