/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, LayoutModeContext, SplitLayoutContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { Menus } from '../../../../browser/menus.js';
import { DesktopLayoutContext } from '../../../../common/contextkeys.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import '../../browser/chatWindow.contribution.js';
import { MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID, OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID, OPEN_CHAT_IN_WINDOW_COMMAND_ID, OPEN_SESSION_IN_WINDOW_COMMAND_ID, openChatInWindow } from '../../browser/openChatInWindow.js';

function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
	return expression?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
}

suite('Chat window contribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const chatWindowKeys = { [IsSessionsWindowContext.key]: true, [IsAuxiliaryWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, [LayoutModeContext.key]: ChatWindowLayoutMode.SideBySide, [SplitLayoutContext.key]: ChatWindowLayoutMode.SideBySide };

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
		const item = MenuRegistry.getMenuItems(Menus.SessionChatItemContext).filter(isIMenuItem).find(candidate => candidate.command.id === OPEN_CHAT_IN_WINDOW_COMMAND_ID);
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
			instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
				visibleSessions: constObservable([active]),
				mainWindowActiveSession: constObservable<IActiveSession | undefined>(active),
			}));
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial({ groups: [] }) }));
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
});
