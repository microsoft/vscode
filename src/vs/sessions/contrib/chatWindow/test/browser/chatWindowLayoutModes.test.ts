/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { Menus, SessionActivityBarGroup } from '../../../../browser/menus.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import '../../browser/chatWindow.contribution.js';

suite('Chat window - layout modes in the Session Activity Bar', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('lead the Session Activity Bar of a chat window with an editor area while it shows its layout actions, without side by side docked', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(isIMenuItem).filter(item => item.group === SessionActivityBarGroup.Layout && item.command.id.startsWith('sessions.chatWindow.'));
		const base: Record<string, ContextKeyValue> = {
			chatIsEnabled: true,
			'sessions.chatWindow': 'test',
			'sessions.chatWindowHasEditor': true,
			'sessions.chatWindowHasEditorArea': true,
			[`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true,
			[`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true,
		};
		const shown = (values: Record<string, ContextKeyValue>) => items
			.filter((item: IMenuItem) => item.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false)
			.map(item => item.command.id);

		assert.deepStrictEqual({
			layoutActions: shown(base),
			docked: shown({ ...base, 'sessions.chatWindowDocked': true }),
			layoutActionsOff: shown({ ...base, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: false }),
			singleEditor: shown({ ...base, 'sessions.chatWindowHasEditorArea': false }),
			mainWindow: shown({ ...base, 'sessions.chatWindow': undefined, 'sessions.chatWindowHasEditor': false, 'sessions.chatWindowHasEditorArea': false }),
		}, {
			layoutActions: ['sessions.chatWindow.showChatOnly', 'sessions.chatWindow.showEditorOnly', 'sessions.chatWindow.showEditorAboveChat', 'sessions.chatWindow.showSideBySide'],
			docked: ['sessions.chatWindow.showChatOnly', 'sessions.chatWindow.showEditorOnly', 'sessions.chatWindow.showEditorAboveChat'],
			layoutActionsOff: [],
			singleEditor: [],
			mainWindow: [],
		});
	});
});
