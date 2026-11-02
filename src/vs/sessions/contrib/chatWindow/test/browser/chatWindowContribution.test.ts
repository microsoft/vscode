/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
import { MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID, OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID, OPEN_CHAT_IN_WINDOW_COMMAND_ID, OPEN_SESSION_IN_WINDOW_COMMAND_ID } from '../../browser/openChatInWindow.js';

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
			.filter(item => evaluate(item.when, values) && (isISubmenuItem(item) ? item.submenu === Menus.WindowLayout : !item.isHiddenByDefault && /chatWindow\.toggle/.test(item.command.id)))
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
});
