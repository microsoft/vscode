/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { openNewSearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpression, ContextKeyValue, IContext, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, LayoutModeContext, SplitLayoutContext } from '../../../../../workbench/common/contextkeys.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { Menus } from '../../../../browser/menus.js';
import { DesktopChangesTabAvailableContext, DesktopFilesTabAvailableContext, DesktopLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID, CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID, CHAT_WINDOW_OPEN_FILES_COMMAND_ID, NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ActiveSessionHost, ISessionHostService, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { NEW_BROWSER_TAB_COMMAND_ID, NEW_CHANGES_TAB_COMMAND_ID, NEW_SEARCH_TAB_COMMAND_ID, NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from '../../../editor/browser/addTabActions.js';
import '../../../../browser/layoutActions.js';
import '../../../chat/browser/runScriptAction.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import '../../browser/chatWindow.contribution.js';
import { MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID, OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID, OPEN_CHAT_IN_WINDOW_COMMAND_ID, OPEN_SESSION_IN_WINDOW_COMMAND_ID, openChatInWindow } from '../../browser/openChatInWindow.js';
import { ITestSessionsService, stubMissingSessionHostsFromSessionsService } from '../../../../services/sessions/test/browser/sessionHostTestUtils.js';

function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
	return expression?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
}

suite('Chat window contribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const chatWindowKeys = { [IsSessionsWindowContext.key]: true, [IsAuxiliaryWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, [LayoutModeContext.key]: ChatWindowLayoutMode.SideBySide, [SplitLayoutContext.key]: ChatWindowLayoutMode.SideBySide };

	test('in a chat window, the main window\'s Browser command opens a new pinned browser tab in its main part, as in the main window, and its Search command searches in its main part, by the services of that part, rather than in the part that has focus', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const windowGroup = upcastPartial<IEditorGroup>({ id: 2, count: 1, getEditors: () => [] });
		const mainPart = upcastPartial<IChatWindow['mainPart']>({ activeGroup: windowGroup, groups: [windowGroup] });
		const events: unknown[] = [];
		const window = upcastPartial<IChatWindow>({ windowId: 2, mainPart, showEditor: () => events.push('show editor') });
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({ activeWindow: window }));
		const fresh = upcastPartial<EditorInput>({});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({ getOrCreateLazy: () => fresh as never }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: async (input: unknown, options?: unknown, group?: unknown) => {
				events.push({ open: input === fresh ? 'new browser' : 'other', options, group: group === windowGroup ? 'chat window main part' : 'other' });
				return undefined;
			},
		}));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			getScopedInstantiationService: part => upcastPartial<IInstantiationService>({
				invokeFunction: (fn: unknown, ...fnArgs: unknown[]) => events.push({ search: fn === openNewSearchEditor, args: fnArgs, by: part === mainPart ? 'chat window main part' : 'other' }) as never,
			}),
		}));

		await instantiationService.invokeFunction(accessor => new NewBrowserTabAction().run(accessor));
		await instantiationService.invokeFunction(accessor => new NewSearchTabAction().run(accessor));

		assert.deepStrictEqual(events, [
			'show editor',
			{ open: 'new browser', options: { pinned: true }, group: 'chat window main part' },
			'show editor',
			{ search: true, args: [{ location: 'new' }], by: 'chat window main part' },
		]);
	});

	test('registers the commands of chat windows', () => {
		const commands = [
			OPEN_CHAT_IN_WINDOW_COMMAND_ID,
			OPEN_SESSION_IN_WINDOW_COMMAND_ID,
			OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID,
			MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID,
			'workbench.action.chatWindow.showEditorAboveChat',
			// The strip's checked side panel entries hide the editor parts of a window with layout modes with it.
			'workbench.action.chatWindow.toggleEditor',
			'sessions.chatWindow.openChanges',
		];
		assert.deepStrictEqual(commands.filter(id => !CommandsRegistry.getCommand(id)), []);
	});

	test('the setting is off by default, and opening a chat in a window is offered only with it on and AI features enabled', () => {
		const setting = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[CHAT_WINDOWS_ENABLED_SETTING];
		const item = MenuRegistry.getMenuItems(Menus.SessionChatItemOpenIn).filter(isIMenuItem).find(candidate => candidate.command.id === OPEN_CHAT_IN_WINDOW_COMMAND_ID);
		const offered = (values: Record<string, ContextKeyValue>) => evaluate(item?.when, { [IsSessionsWindowContext.key]: true, ...values });
		assert.deepStrictEqual({
			default: setting?.default,
			scope: setting?.scope,
			off: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
			on: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
			aiDisabled: offered({ [ChatContextKeys.enabled.key]: false, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
		}, { default: false, scope: ConfigurationScope.APPLICATION, off: false, on: true, aiDisabled: false });
	});

	test('the session header offers Open in New Window in the main window and Move to Main Window in a chat window', () => {
		const offered = (values: Record<string, ContextKeyValue>) => MenuRegistry.getMenuItems(Menus.SessionHeaderContext).filter(isIMenuItem)
			.filter(item => (item.command.id === OPEN_SESSION_IN_WINDOW_COMMAND_ID || item.command.id === MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID) && evaluate(item.when, values))
			.map(item => item.command.id);
		const enabled = { [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true, sessionIsCreated: true };
		assert.deepStrictEqual({
			mainWindow: offered({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, ...enabled }),
			chatWindow: offered({ ...chatWindowKeys, ...enabled }),
			editorWindow: offered({ [IsSessionsWindowContext.key]: true, [IsAuxiliaryWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, ...enabled }),
		}, {
			mainWindow: [OPEN_SESSION_IN_WINDOW_COMMAND_ID],
			chatWindow: [MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID],
			editorWindow: [],
		});
	});

	test('the Layout menu and Show Editor show in the title bar of a chat window, or in its Session Activity Bar while the strip shows the layout actions; never in the main window', () => {
		const layoutEntries = (menu: typeof Menus.TitleBarWindowLayout, values: Record<string, ContextKeyValue>) => MenuRegistry.getMenuItems(menu)
			.filter(item => evaluate(item.when, values) && (isISubmenuItem(item) ? item.submenu === Menus.WindowLayout : !item.isHiddenByDefault && /chatWindow\.toggle(Chat|Editor|Arrangement)$/.test(item.command.id)))
			.map(item => isISubmenuItem(item) ? 'Layout' : item.command.id);
		const stripKeys = { [DesktopLayoutContext.key]: true, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true };
		assert.deepStrictEqual({
			titleBar: layoutEntries(Menus.TitleBarWindowLayout, chatWindowKeys),
			strip: layoutEntries(Menus.SessionActivityBar, chatWindowKeys),
			titleBarWithStripLayoutActions: layoutEntries(Menus.TitleBarWindowLayout, { ...chatWindowKeys, ...stripKeys }),
			stripWithStripLayoutActions: layoutEntries(Menus.SessionActivityBar, { ...chatWindowKeys, ...stripKeys }),
			mainWindow: layoutEntries(Menus.TitleBarWindowLayout, { [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true }),
		}, {
			titleBar: ['workbench.action.chatWindow.toggleEditor', 'Layout'],
			strip: [],
			titleBarWithStripLayoutActions: [],
			stripWithStripLayoutActions: ['workbench.action.chatWindow.toggleEditor', 'Layout'],
			mainWindow: [],
		});
	});

	test('the Layout menu disables hiding the part that shows alone, as 491817 does', () => {
		const items = MenuRegistry.getMenuItems(Menus.WindowLayout).filter(isIMenuItem);
		const enabled = (mode: ChatWindowLayoutMode) => items
			.filter(item => evaluate(item.when, { ...chatWindowKeys, [LayoutModeContext.key]: mode }) && evaluate(item.command.precondition, { ...chatWindowKeys, [LayoutModeContext.key]: mode }))
			.map(item => item.command.id.replace('workbench.action.chatWindow.', ''));
		assert.deepStrictEqual({
			sideBySide: enabled(ChatWindowLayoutMode.SideBySide),
			chatOnly: enabled(ChatWindowLayoutMode.ChatOnly),
			editorOnly: enabled(ChatWindowLayoutMode.EditorOnly),
		}, {
			sideBySide: ['toggleChat', 'toggleEditor', 'toggleArrangement'],
			chatOnly: ['toggleEditor', 'toggleArrangement'],
			editorOnly: ['toggleChat', 'toggleArrangement'],
		});
	});

	test('the main window\'s editors moving to a chat window are not the user closing them: the main window keeps its side pane for the session it shows next', async () => {
		const run = async (mainWindowShows: string) => {
			const instantiationService = new TestInstantiationService();
			let suppressions = 0;
			instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
				suppressEditorPartAutoVisibility: () => {
					suppressions++;
					return toDisposable(() => suppressions--);
				},
			}));
			const chat = (id: string) => ({ resource: URI.parse(`test:/chat/${id}`) });
			const active = new class extends mock<IActiveSession>() {
				override readonly sessionId = mainWindowShows;
				override readonly activeChat = constObservable(chat(mainWindowShows)) as IActiveSession['activeChat'];
			}();
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
				visibleSessions: constObservable([active]),
				mainWindowActiveSession: constObservable<IActiveSession | undefined>(active),
			}));
			stubMissingSessionHostsFromSessionsService(instantiationService);
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: [] }) }));
			let whileOpening: number | undefined;
			instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
				open: async () => {
					whileOpening = suppressions;
					return undefined;
				},
			}));
			const session = upcastPartial<ISession>({ sessionId: 'alpha', resource: URI.parse('test:/alpha') });
			await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, chat('alpha').resource));
			instantiationService.dispose();
			return { suppressedWhileOpening: whileOpening! > 0, afterwards: suppressions };
		};

		assert.deepStrictEqual({ takesEditors: await run('alpha'), leavesEditors: await run('gamma') }, {
			takesEditors: { suppressedWhileOpening: true, afterwards: 0 },
			leavesEditors: { suppressedWhileOpening: false, afterwards: 0 },
		});
	});

	test('the keys of the Agents window\'s Add Tab commands and Run work in a chat window, Toggle Side Bar\'s does not; their menu entries stay in the main window', () => {
		for (const action of [NewChangesTabAction, NewFileTabAction, NewBrowserTabAction, NewSearchTabAction]) {
			disposables.add(registerAction2(action));
		}
		const commands = {
			changes: NEW_CHANGES_TAB_COMMAND_ID,
			files: NEW_FILE_TAB_COMMAND_ID,
			browser: NEW_BROWSER_TAB_COMMAND_ID,
			search: NEW_SEARCH_TAB_COMMAND_ID,
			run: 'workbench.action.agentSessions.runScriptPrimary',
			toggleSideBar: 'workbench.action.agentToggleSidebarVisibility',
		};
		const rules = KeybindingsRegistry.getDefaultKeybindings();
		const bound = (values: Record<string, ContextKeyValue>) => Object.entries(commands)
			.filter(([, id]) => rules.some(rule => rule.command === id && evaluate(rule.when ?? undefined, values)))
			.map(([name]) => name);
		const addTabMenu = MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTab).filter(isIMenuItem);
		const addTabIds = [...Object.values(commands), CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID, CHAT_WINDOW_OPEN_FILES_COMMAND_ID, CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID];
		const addTabEntries = (values: Record<string, ContextKeyValue>) => addTabMenu
			.filter(item => addTabIds.includes(item.command.id) && evaluate(item.when, values))
			.map(item => item.command.id)
			.filter((id, index, ids) => ids.indexOf(id) === index)
			.sort();
		// The keys of the main window's tabs that a chat window inherits do not apply to it.
		const chatWindow = { ...chatWindowKeys, [SessionHasWorkspaceContext.key]: true, [DesktopChangesTabAvailableContext.key]: false, [DesktopFilesTabAvailableContext.key]: false, [IsTopRightEditorGroupContext.key]: true, [EditorTabsVisibleContext.key]: false };
		const mainWindow = { [IsSessionsWindowContext.key]: true, [IsAuxiliaryWindowContext.key]: false, [ChatContextKeys.enabled.key]: true, [SessionHasWorkspaceContext.key]: true, [DesktopChangesTabAvailableContext.key]: true, [DesktopFilesTabAvailableContext.key]: true, [IsTopRightEditorGroupContext.key]: true, [EditorTabsVisibleContext.key]: false };

		assert.deepStrictEqual({
			keys: {
				mainWindow: bound(mainWindow),
				chatWindow: bound(chatWindow),
				quickChatWindow: bound({ ...chatWindow, [SessionHasWorkspaceContext.key]: false, [IsQuickChatSessionContext.key]: true }),
				otherAuxiliaryWindow: bound({ ...mainWindow, [IsAuxiliaryWindowContext.key]: true }),
			},
			addTabMenu: { mainWindow: addTabEntries(mainWindow), chatWindow: addTabEntries(chatWindow) },
		}, {
			keys: {
				mainWindow: ['changes', 'files', 'browser', 'search', 'run', 'toggleSideBar'],
				chatWindow: ['changes', 'files', 'browser', 'search', 'run'],
				quickChatWindow: ['browser', 'run'],
				otherAuxiliaryWindow: ['toggleSideBar'],
			},
			addTabMenu: {
				mainWindow: [NEW_BROWSER_TAB_COMMAND_ID, NEW_CHANGES_TAB_COMMAND_ID, NEW_FILE_TAB_COMMAND_ID, NEW_SEARCH_TAB_COMMAND_ID].sort(),
				chatWindow: [CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID, CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID, CHAT_WINDOW_OPEN_FILES_COMMAND_ID].sort(),
			},
		});
	});

	test('the main window\'s Changes command opens the Changes tab in the chat window it runs in, for its session: from a key of the user\'s while the window has focus, or from an entry of the window; from an entry of the main window, in the main window\'s editor area, even while a chat window has focus', async () => {
		const mainWindowId = 1;
		const run = async (focusedWindow: 'chat' | 'main', ...args: unknown[]) => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const opened: unknown[] = [];
			const mainGroup = upcastPartial<IEditorGroup>({ id: 1, count: 0, findEditors: () => [] });
			const windowGroup = upcastPartial<IEditorGroup>({ id: 2, count: 0, getEditors: () => [] });
			let editorShown = false;
			const window = upcastPartial<IChatWindow>({
				windowId: 2,
				mainPart: upcastPartial<IChatWindow['mainPart']>({ activeGroup: windowGroup, groups: [windowGroup] }),
				chatPart: upcastPartial<IChatWindow['chatPart']>({ groups: [] }),
				terminalsPart: constObservable(undefined),
				showEditor: () => { editorShown = true; },
			});
			// The session of the window, which its host shows, differs from the active session of the main window.
			const windowSession = constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ resource: URI.parse('test:/window'), scopedChatResource: URI.parse('test:/window/chat'), isCreated: constObservable(true) }));
			const scoped = disposables.add(new TestInstantiationService());
			const windowHost = new ActiveSessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: windowSession, chat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:/window/chat') })), contextKeyService: upcastPartial<IContextKeyService>({}), windowId: constObservable(window.windowId) });
			const mainSession = constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ resource: URI.parse('test:/main'), isCreated: constObservable(true), activeChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:/main/chat') })) }));
			const mainHost = new ActiveSessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: mainSession, contextKeyService: upcastPartial<IContextKeyService>({}), windowId: constObservable(mainWindowId) });
			instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: windowId => windowId === window.windowId ? windowHost : windowId === mainWindowId ? mainHost : undefined }));
			instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
				activeWindow: focusedWindow === 'chat' ? window : undefined,
				windows: constObservable([window]),
				getWindow: (windowId: number) => windowId === window.windowId ? window : undefined,
			}));
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
				mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ activeGroup: mainGroup }),
				getScopedInstantiationService: () => scoped,
			}));
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ activeSession: constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ resource: URI.parse('test:/main') })) }));
			stubMissingSessionHostsFromSessionsService(instantiationService);
			instantiationService.stub(ISessionChangesService, upcastPartial<ISessionChangesService>({
				getChangesEditorResource: resource => resource,
				getSessionResource: () => undefined,
				openChangesEditor: async (resource, options, group) => {
					opened.push({ session: resource.toString(), chat: options?.chatResource?.toString(), group: group === windowGroup ? 'chatWindow' : group === mainGroup ? 'mainWindow' : 'other' });
					return undefined;
				},
			}));
			instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
				executeCommand: async <R>(id: string, ...commandArgs: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...commandArgs)) as R,
			}));
			await instantiationService.invokeFunction(accessor => new NewChangesTabAction().run(accessor, ...args));
			return { opened, editorShown };
		};
		const inChatWindow = { opened: [{ session: 'test:/window', chat: 'test:/window/chat', group: 'chatWindow' }], editorShown: true };
		const inMainWindow = { opened: [{ session: 'test:/main', chat: undefined, group: 'mainWindow' }], editorShown: false };

		assert.deepStrictEqual({
			keyInChatWindow: await run('chat'),
			keyWithArgumentsOfItsOwnInChatWindow: await run('chat', { reason: 'user' }),
			entryOfChatWindowBeforeItHasFocus: await run('main', { windowId: 2 }),
			groupOfChatWindowBeforeItHasFocus: await run('main', { groupId: 2 }),
			keyInMainWindow: await run('main'),
			entryOfMainWindowWhileChatWindowHasFocus: await run('chat', { windowId: mainWindowId }),
			groupOfMainWindowWhileChatWindowHasFocus: await run('chat', { groupId: 1 }),
		}, {
			keyInChatWindow: inChatWindow,
			keyWithArgumentsOfItsOwnInChatWindow: inChatWindow,
			entryOfChatWindowBeforeItHasFocus: inChatWindow,
			groupOfChatWindowBeforeItHasFocus: inChatWindow,
			keyInMainWindow: inMainWindow,
			entryOfMainWindowWhileChatWindowHasFocus: inMainWindow,
			groupOfMainWindowWhileChatWindowHasFocus: inMainWindow,
		});
	});
});
