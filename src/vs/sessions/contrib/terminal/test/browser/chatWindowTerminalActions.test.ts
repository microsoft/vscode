/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, isIMenuItem, isISubmenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ActiveEditorContext, IsSessionsWindowContext, LayoutModeContext, ResourceContextKey } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { bindWindowLayoutContext, bindWindowTerminalsContext } from '../../../../../workbench/contrib/chatWindow/browser/chatWindowContextKeys.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { terminalEditorId } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { MoveTerminalEditorToPanelWhen } from '../../../../../workbench/contrib/terminal/browser/terminalMenus.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { IContentPart, IEditorGroup, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ADD_CHAT_WINDOW_TERMINAL_COMMAND_ID, ChatWindowTerminalPositionMenu, TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID } from '../../browser/chatWindowTerminalActions.js';
import { IChatWindowTerminalsService } from '../../browser/chatWindowTerminals.js';

suite('Chat window terminal actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function partOf(...groupIds: number[]): IContentPart {
		return upcastPartial<IContentPart>({ groups: groupIds.map(id => upcastPartial<IEditorGroup>({ id })) });
	}

	/** Chat windows whose main part has the group `windowId * 10`, and whose terminals have the groups after it. */
	function createWindows(calls: string[], ...windows: { readonly windowId: number; readonly terminalGroups: number[] }[]) {
		return windows.map(({ windowId, terminalGroups }) => {
			const position = observableValue<ChatWindowTerminalPosition>('position', ChatWindowTerminalPosition.FullWidth);
			return new class extends mock<IChatWindow>() {
				override readonly windowId = windowId;
				override readonly mainPart: IContentPart = partOf(windowId * 10);
				override readonly chatPart: IEditorPart = partOf(windowId * 10 + 9);
				override readonly terminalsPart = observableValue<IContentPart | undefined>('terminals', partOf(...terminalGroups));
				override readonly terminalPosition = position;
				override setTerminalPosition(value: ChatWindowTerminalPosition) {
					calls.push(`${windowId}:position:${value}`);
					position.set(value, undefined);
				}
			}();
		});
	}

	function createEnvironment(windows: readonly IChatWindow[], activeWindow: IChatWindow | undefined, calls: string[]) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override readonly windows = observableValue<readonly IChatWindow[]>('windows', windows);
			override get activeWindow() { return activeWindow; }
		}());
		instantiationService.stub(IChatWindowTerminalsService, new class extends mock<IChatWindowTerminalsService>() {
			override async toggle(window: IChatWindow) { calls.push(`${window.windowId}:toggle`); }
			override async addTerminal(window: IChatWindow) { calls.push(`${window.windowId}:add`); }
		}());
		const run = (id: string, ...args: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args));
		return { instantiationService, run };
	}

	test('the keys of the panel and the terminal act in a chat window, above the main window\'s rules; they and the side panel\'s key, whichever command they run, are not sent to the shell', () => {
		const keybindings = KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID);
		assert.deepStrictEqual({
			bound: keybindings.length,
			scoped: keybindings.every(rule => rule.when?.keys().includes(LayoutModeContext.key) && rule.when.keys().includes(IsSessionsWindowContext.key)),
			skipShell: [TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, TOGGLE_SIDE_PANEL_COMMAND_ID].every(id => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(id)),
		}, {
			bound: 2,
			scoped: true,
			skipShell: true,
		});
	});

	test('a terminal in a chat window does not offer to move into the panel, which is the main window\'s; a terminal in the main window does', () => {
		const mainWindowContext = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const chatWindowContext = disposables.add(mainWindowContext.createScoped(mainWindow.document.createElement('div')));
		disposables.add(bindWindowLayoutContext(chatWindowContext, { layoutMode: constObservable(ChatWindowLayoutMode.SideBySide), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.SideBySide) }));
		// The context of the tab of a terminal editor, in a part of each window.
		const offersMove = (windowContext: ContextKeyService | ReturnType<ContextKeyService['createScoped']>) => {
			const tab = disposables.add(windowContext.createScoped(mainWindow.document.createElement('div')));
			ResourceContextKey.Scheme.bindTo(tab).set(Schemas.vscodeTerminal);
			return tab.contextMatchesRules(MoveTerminalEditorToPanelWhen);
		};

		assert.deepStrictEqual({ mainWindow: offersMove(mainWindowContext), chatWindow: offersMove(chatWindowContext) }, { mainWindow: true, chatWindow: false });
	});

	test('the panel key in a chat window, with or without its terminals and wherever the focus is in the window, toggles its terminals, never the main window\'s panel', () => {
		const iframe = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(iframe);
		disposables.add({ dispose: () => iframe.remove() });
		const body = iframe.contentDocument!.body;
		const focused = append(append(body, $('div.container')), $('div.focused'));
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		// The window's own context, on the body of its document, as the window shell binds it.
		const windowContextKeyService = disposables.add(contextKeyService.createScoped(body));
		const terminalsVisible = observableValue('terminalsVisible', false);
		disposables.add(bindWindowLayoutContext(windowContextKeyService, { layoutMode: observableValue('mode', ChatWindowLayoutMode.SideBySide), splitLayout: observableValue<ChatWindowSplitLayout>('split', ChatWindowLayoutMode.SideBySide) }));
		disposables.add(bindWindowTerminalsContext(windowContextKeyService, { terminalsVisible, terminalPosition: observableValue('position', ChatWindowTerminalPosition.FullWidth) }));
		// The main window's Toggle Panel takes the key wherever no rule of more weight applies.
		const rules = [
			{ command: 'workbench.action.togglePanel', weight: KeybindingWeight.WorkbenchContrib, when: undefined },
			...KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID && (rule.keybinding?.chords[0] as KeyCodeChord | undefined)?.keyCode === KeyCode.KeyJ).map(rule => ({ command: rule.command, weight: rule.weight1, when: rule.when ?? undefined })),
		];
		const resolve = (element: HTMLElement) => {
			const context = contextKeyService.getContext(element);
			return rules.filter(rule => !rule.when || rule.when.evaluate(context)).sort((a, b) => b.weight - a.weight)[0].command;
		};
		const resolved = [false, true].map(withTerminals => {
			terminalsVisible.set(withTerminals, undefined);
			return { withTerminals, inWindow: resolve(focused), noFocus: resolve(body), mainWindow: resolve(mainWindow.document.body) };
		});

		assert.deepStrictEqual(resolved, [
			{ withTerminals: false, inWindow: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, noFocus: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, mainWindow: 'workbench.action.togglePanel' },
			{ withTerminals: true, inWindow: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, noFocus: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, mainWindow: 'workbench.action.togglePanel' },
		]);
	});

	test('the terminal actions act on the chat window they are invoked from, else on the one that has focus, and the position is only offered side by side', async () => {
		const calls: string[] = [];
		const windows = createWindows(calls, { windowId: 1, terminalGroups: [11] }, { windowId: 2, terminalGroups: [21] });
		const { run } = createEnvironment(windows, windows[0], calls);
		await run(TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID, { groupId: 21 });
		await run(ADD_CHAT_WINDOW_TERMINAL_COMMAND_ID, { groupId: 20 });
		await run('workbench.action.chatWindow.terminalPosition.underChat', { groupId: 21 });
		await run(TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		const layoutContext = LayoutModeContext.bindTo(contextKeyService);
		const positionItems = MenuRegistry.getMenuItems(ChatWindowTerminalPositionMenu).filter(isIMenuItem);
		const preconditions = [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked].map(mode => {
			layoutContext.set(mode);
			return positionItems.map(item => contextKeyService.contextMatchesRules(item.command.precondition));
		});

		assert.deepStrictEqual({ calls, preconditions }, {
			calls: ['2:toggle', '2:add', '2:position:underChat', '1:toggle'],
			preconditions: [[true, true, true], [true, true, true], [false, false, false]],
		});
	});

	test('Terminal Position from the editor title of a chat window\'s terminals acts on that window; without a context, or with a group of no chat window, on the one that has focus', async () => {
		const calls: string[] = [];
		const windows = createWindows(calls, { windowId: 1, terminalGroups: [11] }, { windowId: 2, terminalGroups: [21, 22] });
		const { run } = createEnvironment(windows, windows[0], calls);
		await run('workbench.action.chatWindow.terminalPosition.underChat', URI.parse('vscode-terminal:/1/1'), { groupId: 22 });
		await run('workbench.action.chatWindow.terminalPosition.underEditor', { groupId: 20 });
		await run('workbench.action.chatWindow.terminalPosition.fullWidth');
		await run('workbench.action.chatWindow.terminalPosition.underChat', { groupId: 99 });

		assert.deepStrictEqual(calls, ['2:position:underChat', '2:position:underEditor', '1:position:fullWidth', '1:position:underChat']);
	});

	for (const [where, menuId, editorContext] of [['the More Actions of', MenuId.EditorTitle, false], ['the context menu of a tab of', MenuId.EditorTitleContext, true]] as const) {
		test(`from ${where} a chat window's terminals, Terminal Position shows the position chosen and moves the terminals of that window, not of the one that has focus`, async () => {
			const calls: string[] = [];
			const windows = createWindows(calls, { windowId: 1, terminalGroups: [11] }, { windowId: 2, terminalGroups: [21] });
			const { instantiationService } = createEnvironment(windows, windows[0], calls);
			instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
					return instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)) as R | undefined;
				}
			}());
			instantiationService.stub(IKeybindingService, new MockKeybindingService());
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			const menuService = disposables.add(instantiationService.createInstance(MenuService));
			instantiationService.stub(IMenuService, menuService);

			// The context of the group of the terminals of window 2: a terminal is its active editor.
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
			IsSessionsWindowContext.bindTo(contextKeyService).set(true);
			ActiveEditorContext.bindTo(contextKeyService).set(terminalEditorId);
			const window = windows[1];
			disposables.add(bindWindowLayoutContext(contextKeyService, { layoutMode: observableValue('mode', ChatWindowLayoutMode.SideBySide), splitLayout: observableValue<ChatWindowSplitLayout>('split', ChatWindowLayoutMode.SideBySide) }));
			disposables.add(bindWindowTerminalsContext(contextKeyService, { terminalsVisible: observableValue('visible', true), terminalPosition: window.terminalPosition }));

			// As the editor title toolbar of the group, or the context menu of a tab, asks for its actions: with the resource
			// of its editor, a terminal, as the first argument, forwarding the context of the menu after it.
			const positions = () => {
				const menu = menuService.createMenu(menuId, contextKeyService);
				const actions = menu.getActions({ arg: URI.parse('vscode-terminal:/1/1'), shouldForwardArgs: true }).flatMap(([, groupActions]) => groupActions);
				menu.dispose();
				const submenu = actions.find((action): action is SubmenuItemAction => action instanceof SubmenuItemAction && action.label === 'Terminal Position');
				return (submenu?.actions ?? []).filter((action): action is MenuItemAction => action instanceof MenuItemAction);
			};
			const checked = (items: readonly IAction[]) => items.filter(item => item.checked).map(item => item.label);

			const before = positions();
			const underEditor = before.find(item => item.label === 'Under Editor');
			if (underEditor) {
				// The toolbar runs its actions with the group, a tab's context menu with the group and the index of the editor.
				await disposables.add(new ActionRunner()).run(underEditor, editorContext ? { groupId: 21, editorIndex: 0 } : { groupId: 21 });
			}

			assert.deepStrictEqual({ offered: before.map(item => item.label), checkedBefore: checked(before), calls, checkedAfter: checked(positions()) }, {
				offered: ['Full Width', 'Under Editor', 'Under Chat'],
				checkedBefore: ['Full Width'],
				calls: ['2:position:underEditor'],
				checkedAfter: ['Under Editor'],
			});
		});
	}

	test('Terminal Position shows only in the title of a terminal of a chat window', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		const activeEditor = ActiveEditorContext.bindTo(contextKeyService);
		const layoutMode = LayoutModeContext.bindTo(contextKeyService);
		const item = MenuRegistry.getMenuItems(MenuId.EditorTitle).filter(isISubmenuItem).find(candidate => candidate.submenu === ChatWindowTerminalPositionMenu);
		const shows = (editorId: string, mode: ChatWindowLayoutMode | undefined) => {
			activeEditor.set(editorId);
			if (mode) {
				layoutMode.set(mode);
			} else {
				layoutMode.reset();
			}
			return contextKeyService.contextMatchesRules(item?.when);
		};

		assert.deepStrictEqual({
			terminalInChatWindow: shows(terminalEditorId, ChatWindowLayoutMode.SideBySide),
			fileInChatWindow: shows('workbench.editors.files.fileEditorInput', ChatWindowLayoutMode.SideBySide),
			terminalInMainWindow: shows(terminalEditorId, undefined),
		}, { terminalInChatWindow: true, fileInChatWindow: false, terminalInMainWindow: false });
	});
});
