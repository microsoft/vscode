/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
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
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, ISubmenuItem, isISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpression, ContextKeyValue, IContext, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorAreaFocusContext, EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, LayoutModeContext, SplitLayoutContext } from '../../../../../workbench/common/contextkeys.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import product from '../../../../../platform/product/common/product.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { DesktopLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext, SessionInChatEditorContext, SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { DesktopChangesTabAvailableContext, DesktopFilesTabAvailableContext, SessionsTitleBarNewSessionEnabledContext } from '../../../../common/agentsWindowContextKeys.js';
import { CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID, CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID, CHAT_WINDOW_OPEN_FILES_COMMAND_ID, NEW_FILE_TAB_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { ISessionHostService, SessionHost, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionChangesService } from '../../../../../workbench/services/sessions/common/sessionChangesService.js';
import { NEW_BROWSER_TAB_COMMAND_ID, NEW_CHANGES_TAB_COMMAND_ID, NEW_SEARCH_TAB_COMMAND_ID, NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from '../../../editor/browser/addTabActions.js';
import '../../../../browser/layoutActions.js';
import '../../../chat/browser/runScriptAction.js';
import '../../../sessions/browser/sessionsActions.js';
import '../../../accountMenu/browser/account.contribution.js';
import { registerSessionsTitleBarMenus } from '../../../sessions/browser/sessionsTitleBarWidget.js';
import { appendNewSessionTitleBarMenuItem } from '../../../chat/browser/newSessionTitleBarMenu.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import '../../browser/chatWindow.contribution.js';
import '../../browser/chatWindowActions.js';
import { NewChatInSessionsWindowAction } from '../../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { NEW_SESSION_ACTION_ID, NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { EmptyFileEditorSearchPickerFocusedContext } from '../../../editor/browser/emptyFileEditorSearch.js';
import { KeybindingResolver, ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID, OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID, OPEN_CHAT_IN_WINDOW_COMMAND_ID, OPEN_SESSION_IN_WINDOW_COMMAND_ID, openChatInWindow } from '../../browser/openChatInWindow.js';
import { ISessionEditorWorkingSetRestoreState, ISessionEditorWorkingSetService } from '../../../layout/common/sessionEditorWorkingSet.js';
import { ITestSessionsService, ITestSessionWithChat, LegacyFakePaneState, stubMissingSessionHostsFromSessionsService, testGridPanes, withCreatedStatus } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { stubSessionsHostLayout } from '../../../../test/browser/sessionsHostLayoutTestUtils.js';

const noEditorWorkingSetOwner = constObservable<ISessionEditorWorkingSetRestoreState>({ owner: undefined, restoring: false, applying: false });

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

	test('the setting is on by default outside stable, in preview and controlled by experiments, and opening a chat in a window is offered only with it on and AI features enabled', () => {
		const setting = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[CHAT_WINDOWS_ENABLED_SETTING];
		const item = MenuRegistry.getMenuItems(Menus.SessionChatItemOpenIn).filter(isIMenuItem).find(candidate => candidate.command.id === OPEN_CHAT_IN_WINDOW_COMMAND_ID);
		const offered = (values: Record<string, ContextKeyValue>) => evaluate(item?.when, { [IsSessionsWindowContext.key]: true, ...values });
		assert.deepStrictEqual({
			default: setting?.default,
			scope: setting?.scope,
			tags: setting?.tags,
			experiment: setting?.experiment,
			off: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
			on: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
			aiDisabled: offered({ [ChatContextKeys.enabled.key]: false, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
		}, { default: product.quality !== 'stable', scope: ConfigurationScope.APPLICATION, tags: ['preview', 'onExP'], experiment: { mode: 'startup' }, off: false, on: true, aiDisabled: false });
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
		const layoutEntries = (menu: typeof AgentsWindowMenus.TitleBarWindowLayout, values: Record<string, ContextKeyValue>) => MenuRegistry.getMenuItems(menu)
			.filter(item => evaluate(item.when, values) && (isISubmenuItem(item) ? item.submenu === AgentsWindowMenus.WindowLayout : !item.isHiddenByDefault && /chatWindow\.toggle(Chat|Editor|Arrangement)$/.test(item.command.id)))
			.map(item => isISubmenuItem(item) ? 'Layout' : item.command.id);
		const stripKeys = { [DesktopLayoutContext.key]: true, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true };
		assert.deepStrictEqual({
			titleBar: layoutEntries(AgentsWindowMenus.TitleBarWindowLayout, chatWindowKeys),
			strip: layoutEntries(Menus.SessionActivityBar, chatWindowKeys),
			titleBarWithStripLayoutActions: layoutEntries(AgentsWindowMenus.TitleBarWindowLayout, { ...chatWindowKeys, ...stripKeys }),
			stripWithStripLayoutActions: layoutEntries(Menus.SessionActivityBar, { ...chatWindowKeys, ...stripKeys }),
			mainWindow: layoutEntries(AgentsWindowMenus.TitleBarWindowLayout, { [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true }),
		}, {
			titleBar: ['workbench.action.chatWindow.toggleEditor', 'Layout'],
			strip: [],
			titleBarWithStripLayoutActions: [],
			stripWithStripLayoutActions: ['workbench.action.chatWindow.toggleEditor', 'Layout'],
			mainWindow: [],
		});
	});

	test('the Layout menu is named Configure Layout in the title bar and the Session Activity Bar, whatever the layout mode, not after the mode', () => {
		const layoutMenuTitles = (menu: typeof AgentsWindowMenus.TitleBarWindowLayout, values: Record<string, ContextKeyValue>) => MenuRegistry.getMenuItems(menu)
			.filter(isISubmenuItem)
			.filter(item => item.submenu === AgentsWindowMenus.WindowLayout && evaluate(item.when, values))
			.map(item => typeof item.title === 'string' ? item.title : item.title.value);
		const stripKeys = { [DesktopLayoutContext.key]: true, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true };
		const modes = [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly];
		const titles = (menu: typeof AgentsWindowMenus.TitleBarWindowLayout, extraKeys: Record<string, ContextKeyValue>) => Object.fromEntries(modes.map(mode => [mode, layoutMenuTitles(menu, { ...chatWindowKeys, ...extraKeys, [LayoutModeContext.key]: mode })]));
		const configureLayout = Object.fromEntries(modes.map(mode => [mode, ['Configure Layout']]));
		assert.deepStrictEqual({
			titleBar: titles(AgentsWindowMenus.TitleBarWindowLayout, {}),
			strip: titles(Menus.SessionActivityBar, stripKeys),
		}, {
			titleBar: configureLayout,
			strip: configureLayout,
		});
	});

	test('the title bar of a chat window shows the command center, with the session of its active chat, the actions of its session and a New Session button that starts one in that window, as the main window\'s does; not the main window\'s navigation, nor what applies to the whole app', () => {
		disposables.add(registerSessionsTitleBarMenus());
		disposables.add(appendNewSessionTitleBarMenuItem());
		const menus = {
			left: AgentsWindowMenus.TitleBarLeftLayout,
			centerLeft: AgentsWindowMenus.TitleBarCenterLeft,
			commandCenter: AgentsWindowMenus.CommandCenter,
			centerRight: AgentsWindowMenus.TitleBarCenterRight,
			right: AgentsWindowMenus.TitleBarRightLayout,
		};
		// The entries of the main window's title bar, by their titles
		const entries = ['Toggle Side Bar', 'New Session', 'Go Back', 'Go Forward', 'Agent Sessions', 'Run', 'Agents Account and Status'];
		const titleOf = (item: IMenuItem | ISubmenuItem) => {
			const title = isISubmenuItem(item) ? item.title : item.command.title;
			return typeof title === 'string' ? title : title?.value;
		};
		const shown = (values: Record<string, ContextKeyValue>) => Object.fromEntries(Object.entries(menus).map(([name, menu]) => [name, [...new Set(MenuRegistry.getMenuItems(menu)
			.filter(item => evaluate(item.when, values))
			.map(titleOf)
			.filter((title): title is string => !!title && entries.includes(title)))].sort()]));
		const newSessionShows = { [SessionsTitleBarNewSessionEnabledContext.key]: true };
		const chatWindow = { ...chatWindowKeys, ...newSessionShows, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true };
		/** The commands of the New Session entries of the left of the title bar. */
		const newSessionCommands = (values: Record<string, ContextKeyValue>) => [...new Set(MenuRegistry.getMenuItems(menus.left)
			.filter((item): item is IMenuItem => isIMenuItem(item) && titleOf(item) === 'New Session' && evaluate(item.when, values))
			.map(item => item.command.id))];

		assert.deepStrictEqual({
			mainWindow: shown({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, ...newSessionShows }),
			chatWindow: shown(chatWindow),
			commands: {
				mainWindow: newSessionCommands({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, ...newSessionShows }),
				chatWindow: newSessionCommands(chatWindow),
				// In every layout mode, also with the layout actions in the window's strip
				chatWindowLayouts: [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly].map(mode => newSessionCommands({ ...chatWindow, [LayoutModeContext.key]: mode, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true })),
				chatWindowOutOfExperiment: newSessionCommands({ ...chatWindow, [SessionsTitleBarNewSessionEnabledContext.key]: false }),
				chatWindowWelcome: newSessionCommands({ ...chatWindow, [SessionsWelcomeVisibleContext.key]: true }),
				chatWindowAIDisabled: newSessionCommands({ ...chatWindow, [ChatContextKeys.enabled.key]: false }),
				chatWindowsTurnedOff: newSessionCommands({ ...chatWindow, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
			},
		}, {
			mainWindow: { left: ['New Session', 'Toggle Side Bar'], centerLeft: ['Go Back', 'Go Forward'], commandCenter: ['Agent Sessions'], centerRight: ['Run'], right: ['Agents Account and Status'] },
			chatWindow: { left: ['New Session'], centerLeft: [], commandCenter: ['Agent Sessions'], centerRight: ['Run'], right: [] },
			commands: {
				mainWindow: [NEW_SESSION_ACTION_ID],
				// The window's own New Session, which starts the session in that window, as its key does
				chatWindow: [NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID],
				chatWindowLayouts: [[NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID], [NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID], [NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID]],
				chatWindowOutOfExperiment: [],
				chatWindowWelcome: [],
				chatWindowAIDisabled: [],
				chatWindowsTurnedOff: [],
			},
		});
	});

	test('in a chat window, Cmd/Ctrl+N starts a new session in that window while its chat, a new session there or its title bar has focus; not in its other editors, nor in the search picker of an empty file editor, nor with AI features disabled or chat windows turned off; in the main window it stays New Session there', () => {
		// The main window's New Session, unless the test run registered it already
		if (!CommandsRegistry.getCommand(NEW_SESSION_ACTION_ID)) {
			disposables.add(registerAction2(NewChatInSessionsWindowAction));
		}
		const chatWindow = { ...chatWindowKeys, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true };
		const chat = { ...chatWindow, [EditorAreaFocusContext.key]: true, [SessionInChatEditorContext.key]: true, [ChatContextKeys.inChatSession.key]: true };
		/** How the default keybindings of `os` resolve the key of New Session in a chat window in each context. */
		const keyOn = (os: OperatingSystem) => {
			const rules = KeybindingsRegistry.getDefaultKeybindingsForOS(os);
			const ownRule = rules.find(rule => rule.command === NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID)!;
			const [ownKeybinding] = USLayoutResolvedKeybinding.resolveKeybinding(ownRule.keybinding!, os);
			const resolver = new KeybindingResolver(rules.flatMap(rule => rule.keybinding && rule.command
				? USLayoutResolvedKeybinding.resolveKeybinding(rule.keybinding, os).map(resolved => new ResolvedKeybindingItem(resolved, rule.command, rule.commandArgs, rule.when ?? undefined, true, null, false))
				: []), [], () => { });
			const resolve = (values: Record<string, ContextKeyValue>) => {
				const result = resolver.resolve({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined }, [], ownKeybinding.getDispatchChords()[0]!);
				return result.kind === ResultKind.KbFound ? result.commandId : undefined;
			};
			const inWindow = (values: Record<string, ContextKeyValue>) => resolve(values) === NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID;
			return {
				key: ownKeybinding.getUserSettingsLabel(),
				chat: inWindow(chat),
				newSession: inWindow({ ...chatWindow, [EditorAreaFocusContext.key]: true, [SessionInChatEditorContext.key]: true }),
				titleBar: inWindow({ ...chatWindow, [EditorAreaFocusContext.key]: false }),
				otherEditor: inWindow({ ...chatWindow, [EditorAreaFocusContext.key]: true }),
				emptyFileEditorPicker: inWindow({ ...chatWindow, [EditorAreaFocusContext.key]: false, [EmptyFileEditorSearchPickerFocusedContext.key]: true }),
				// Its rule does not claim the key there at all, whichever rule of the same weight registered last
				ownRuleInEmptyFileEditorPicker: evaluate(ownRule.when ?? undefined, { ...chatWindow, [EditorAreaFocusContext.key]: false, [EmptyFileEditorSearchPickerFocusedContext.key]: true }),
				aiDisabled: inWindow({ ...chat, [ChatContextKeys.enabled.key]: false }),
				chatWindowsOff: inWindow({ ...chat, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
				mainWindow: resolve({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true, [EditorAreaFocusContext.key]: false }),
			};
		};
		const expected = (key: string) => ({
			key,
			chat: true,
			newSession: true,
			titleBar: true,
			otherEditor: false,
			emptyFileEditorPicker: false,
			ownRuleInEmptyFileEditorPicker: false,
			aiDisabled: false,
			chatWindowsOff: false,
			mainWindow: NEW_SESSION_ACTION_ID,
		});

		// Cmd+N on macOS and Ctrl+N elsewhere, whichever platform the tests run on
		assert.deepStrictEqual({
			macOS: keyOn(OperatingSystem.Macintosh),
			linux: keyOn(OperatingSystem.Linux),
			windows: keyOn(OperatingSystem.Windows),
		}, {
			macOS: expected('cmd+n'),
			linux: expected('ctrl+n'),
			windows: expected('ctrl+n'),
		});
	});

	test('New Session in a chat window opens a new chat in the window it runs for, and is offered in the Command Palette only while chat windows are on and AI features are enabled', async () => {
		const opened: string[] = [];
		const window = upcastPartial<IChatWindow>({ windowId: 7 });
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
			activeWindow: window,
			openNewChat: async (target, options) => { opened.push(`${target.windowId}${options ? ' with options' : ''}`); },
		}));
		await CommandsRegistry.getCommand(NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID)!.handler(instantiationService);
		const commandPalette = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).find(candidate => candidate.command.id === NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID);
		const offered = (values: Record<string, ContextKeyValue>) => !!commandPalette && evaluate(commandPalette.when, values) && evaluate(commandPalette.command.precondition, values);
		const chatWindow = { ...chatWindowKeys, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true };

		assert.deepStrictEqual({
			opened,
			chatWindow: offered(chatWindow),
			chatWindowsOff: offered({ ...chatWindow, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
			aiDisabled: offered({ ...chatWindow, [ChatContextKeys.enabled.key]: false }),
			mainWindow: offered({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
		}, {
			opened: ['7'],
			chatWindow: true,
			chatWindowsOff: false,
			aiDisabled: false,
			mainWindow: false,
		});
	});

	test('the Layout menu disables hiding the part that shows alone, as 491817 does', () => {
		const items = MenuRegistry.getMenuItems(AgentsWindowMenus.WindowLayout).filter(isIMenuItem);
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
			stubSessionsHostLayout(instantiationService);
			const chat = (id: string) => ({ resource: URI.parse(`test:/chat/${id}`) });
			const active = new class extends mock<ITestSessionWithChat>() {
				override readonly sessionId = mainWindowShows;
				override readonly activeChat = constObservable(chat(mainWindowShows)) as ITestSessionWithChat['activeChat'];
			}();
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
				gridShown: constObservable([active]),
				slotPanes: testGridPanes(constObservable([active])),
				mainWindowActiveSession: constObservable<ITestSessionWithChat | undefined>(active),
			}));
			stubMissingSessionHostsFromSessionsService(instantiationService);
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: [] }) }));
			instantiationService.stub(ISessionEditorWorkingSetService, upcastPartial<ISessionEditorWorkingSetService>({ takeEditorsFor: () => undefined, restoreState: noEditorWorkingSetOwner }));
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

	test('a chat of the session the main window shows takes the session\'s editors along when the window shows another chat of it, as the main window keeps the chat it shows', async () => {
		const run = async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			stubSessionsHostLayout(instantiationService);
			instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({ suppressEditorPartAutoVisibility: () => toDisposable(() => { }) }));
			const chat = (id: string) => ({ resource: URI.parse(`test:/chat/${id}`) });
			const pane = upcastPartial<ITestSessionWithChat>({ sessionId: 'alpha', resource: URI.parse('test:/alpha'), activeChat: constObservable(chat('shown')) as ITestSessionWithChat['activeChat'] });
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
				gridShown: constObservable([pane]),
				slotPanes: testGridPanes(constObservable([pane])),
				mainWindowActiveSession: constObservable<ITestSessionWithChat | undefined>(pane),
			}));
			stubMissingSessionHostsFromSessionsService(instantiationService);
			const mainGroups = [upcastPartial<IEditorGroup>({ id: 1 })];
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: mainGroups }) }));
			instantiationService.stub(ISessionEditorWorkingSetService, upcastPartial<ISessionEditorWorkingSetService>({ takeEditorsFor: () => undefined, restoreState: noEditorWorkingSetOwner }));
			let moveFrom: readonly IEditorGroup[] | undefined;
			instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
				open: async (_resource: URI, options?: { editors?: { moveFrom?: readonly IEditorGroup[] } }) => {
					moveFrom = options?.editors?.moveFrom;
					return undefined;
				},
			}));
			await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, upcastPartial<ISession>({ sessionId: 'alpha', resource: pane.resource }), chat('other').resource));
			return moveFrom?.length;
		};

		assert.strictEqual(await run(), 1);
	});

	test('with a working set per chat, opening another chat of the session the main window shows takes that chat\'s stash and leaves the shown chat\'s editors', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		stubSessionsHostLayout(instantiationService);
		instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({ suppressEditorPartAutoVisibility: () => toDisposable(() => { }) }));
		const chat = (id: string) => ({ resource: URI.parse(`test:/chat/${id}`) });
		const pane = upcastPartial<ITestSessionWithChat>({ sessionId: 'alpha', resource: URI.parse('test:/alpha'), activeChat: constObservable(chat('a')) as ITestSessionWithChat['activeChat'] });
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			gridShown: constObservable([pane]),
			slotPanes: testGridPanes(constObservable([pane])),
			mainWindowActiveSession: constObservable<ITestSessionWithChat | undefined>(pane),
		}));
		stubMissingSessionHostsFromSessionsService(instantiationService);
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: [upcastPartial<IEditorGroup>({ id: 1 })] }) }));
		const saved = [upcastPartial<EditorInput>({ typeId: 'saved' })];
		instantiationService.stub(ISessionEditorWorkingSetService, upcastPartial<ISessionEditorWorkingSetService>({
			restoreState: constObservable<ISessionEditorWorkingSetRestoreState>({ owner: { sessionResource: pane.resource, chatResource: chat('a').resource }, restoring: false, applying: false }),
			takeEditorsFor: () => ({ editors: saved, activeEditor: saved[0], accept: () => { }, dispose: () => { } }),
		}));
		let opened: { moveFrom: number | undefined; takesSaved: boolean } | undefined;
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
			open: async (_resource: URI, options?: { editors?: { moveFrom?: readonly IEditorGroup[]; editors?: readonly EditorInput[] } }) => {
				opened = { moveFrom: options?.editors?.moveFrom?.length, takesSaved: options?.editors?.editors === saved };
				return undefined;
			},
		}));
		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, upcastPartial<ISession>({ sessionId: 'alpha', resource: pane.resource }), chat('b').resource));

		assert.deepStrictEqual(opened, { moveFrom: 0, takesSaved: true });
	});

	test('a session another pane shows takes the editors it has saved along, which stay saved unless the window has them, and the main window\'s editors stay', async () => {
		const run = async (windowHasEditors: boolean) => {
			const instantiationService = disposables.add(new TestInstantiationService());
			stubSessionsHostLayout(instantiationService);
			instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({ suppressEditorPartAutoVisibility: () => toDisposable(() => { }) }));
			const chat = (id: string) => ({ resource: URI.parse(`test:/chat/${id}`) });
			const focused = upcastPartial<ITestSessionWithChat>({ sessionId: 'beta', resource: URI.parse('test:/beta'), activeChat: constObservable(chat('beta')) as ITestSessionWithChat['activeChat'] });
			const other = upcastPartial<ITestSessionWithChat>({ sessionId: 'alpha', resource: URI.parse('test:/alpha'), activeChat: constObservable(chat('alpha')) as ITestSessionWithChat['activeChat'] });
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
				gridShown: constObservable([other, focused]),
				slotPanes: testGridPanes(constObservable([other, focused])),
				mainWindowActiveSession: constObservable<ITestSessionWithChat | undefined>(focused),
			}));
			stubMissingSessionHostsFromSessionsService(instantiationService);
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: [upcastPartial<IEditorGroup>({ id: 1 })] }) }));
			const saved = [upcastPartial<EditorInput>({ typeId: 'saved' })];
			const events: string[] = [];
			instantiationService.stub(ISessionEditorWorkingSetService, upcastPartial<ISessionEditorWorkingSetService>({
				restoreState: noEditorWorkingSetOwner,
				takeEditorsFor: (session: ISession) => session.sessionId === 'alpha' ? { editors: saved, activeEditor: saved[0], accept: () => events.push('accepted'), dispose: () => events.push('disposed') } : undefined,
			}));
			let opened: { moveFrom: number | undefined; editors: readonly EditorInput[] | undefined } | undefined;
			instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
				open: async (_resource: URI, options?: { editors?: { moveFrom?: readonly IEditorGroup[]; editors?: readonly EditorInput[] } }) => {
					opened = { moveFrom: options?.editors?.moveFrom?.length, editors: options?.editors?.editors };
					return upcastPartial<IChatWindow>({ mainPart: upcastPartial<IChatWindow['mainPart']>({ groups: [upcastPartial<IEditorGroup>({ contains: () => windowHasEditors })] }) });
				},
			}));
			await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, upcastPartial<ISession>({ sessionId: 'alpha', resource: other.resource })));
			return { moveFrom: opened?.moveFrom, takesSaved: opened?.editors === saved, events };
		};

		assert.deepStrictEqual({ received: await run(true), notReceived: await run(false) }, {
			received: { moveFrom: 0, takesSaved: true, events: ['accepted', 'disposed'] },
			notReceived: { moveFrom: 0, takesSaved: true, events: ['disposed'] },
		});
	});

	test('a chat opened in a window opens exactly that chat, also its session\'s main chat, which is named by the session, while a session opens the chat it shows', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		stubSessionsHostLayout(instantiationService);
		const shown = { resource: URI.parse('test:/chat/nested') };
		const pane = upcastPartial<ITestSessionWithChat>({ sessionId: 'alpha', activeChat: constObservable(shown) as ITestSessionWithChat['activeChat'] });
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			gridShown: constObservable([pane]),
			slotPanes: testGridPanes(constObservable([pane])),
			mainWindowActiveSession: constObservable<ITestSessionWithChat | undefined>(pane),
		}));
		stubMissingSessionHostsFromSessionsService(instantiationService);
		instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({ suppressEditorPartAutoVisibility: () => toDisposable(() => { }) }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ groups: [] }) }));
		instantiationService.stub(ISessionEditorWorkingSetService, upcastPartial<ISessionEditorWorkingSetService>({ takeEditorsFor: () => undefined, restoreState: noEditorWorkingSetOwner }));
		const opened: { resource: string; exactChat: boolean | undefined }[] = [];
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
			open: async (resource: URI, options?: { exactChat?: boolean }) => {
				opened.push({ resource: resource.toString(), exactChat: options?.exactChat });
				return undefined;
			},
		}));
		const session = upcastPartial<ISession>({ sessionId: 'alpha', resource: URI.parse('test:/alpha') });

		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, session.resource));
		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session));

		assert.deepStrictEqual(opened, [
			{ resource: 'test:/alpha', exactChat: true },
			{ resource: 'test:/chat/nested', exactChat: false },
		]);
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
		const addTabMenu = MenuRegistry.getMenuItems(AgentsWindowMenus.SessionsEditorTabsBarAddTab).filter(isIMenuItem);
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
			const windowSession = constObservable<LegacyFakePaneState | undefined>(upcastPartial<LegacyFakePaneState>({ resource: URI.parse('test:/window'), detachedChat: URI.parse('test:/window/chat'), ...withCreatedStatus(constObservable(true)) }));
			const scoped = disposables.add(new TestInstantiationService());
			const windowHost = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: windowSession, chat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:/window/chat') })), contextKeyService: upcastPartial<IContextKeyService>({}), windowId: constObservable(window.windowId) });
			const mainSession = constObservable<ITestSessionWithChat | undefined>(upcastPartial<ITestSessionWithChat>({ resource: URI.parse('test:/main'), ...withCreatedStatus(constObservable(true)), activeChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:/main/chat') })) }));
			const mainHost = new SessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: mainSession, chat: derived(reader => mainSession.read(reader)?.activeChat.read(reader)), contextKeyService: upcastPartial<IContextKeyService>({}), windowId: constObservable(mainWindowId) });
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
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ activeSession: constObservable<ITestSessionWithChat | undefined>(upcastPartial<ITestSessionWithChat>({ resource: URI.parse('test:/main') })) }));
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
