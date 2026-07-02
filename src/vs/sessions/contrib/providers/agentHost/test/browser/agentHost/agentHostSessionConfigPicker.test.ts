/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../../../browser/menus.js';

import '../../../browser/agentHostSessionConfigPicker.js';

suite('Agent Host Session Config Picker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('places mode immediately before approvals in secondary toolbars', () => {
		const summarize = (menu: MenuId, ids: readonly string[]) => MenuRegistry.getMenuItems(menu)
			.filter(isIMenuItem)
			.filter(item => ids.includes(item.command.id))
			.map(item => ({ id: item.command.id, order: item.order }))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

		const newSessionIds = [
			'sessions.agentHost.newSessionModePicker',
			'sessions.agentHost.newSessionApprovePicker',
			'sessions.agentHost.newSessionPermissionModePicker',
		];
		const runningSessionIds = [
			'sessions.agentHost.runningSessionModePicker',
			'sessions.agentHost.runningSessionConfigPicker',
			'sessions.agentHost.runningSessionPermissionModePicker',
		];

		assert.deepStrictEqual({
			newSessionPrimary: summarize(Menus.NewSessionConfig, newSessionIds),
			newSessionSecondary: summarize(Menus.NewSessionControl, newSessionIds),
			runningSessionPrimary: summarize(MenuId.ChatInput, runningSessionIds),
			runningSessionSecondary: summarize(MenuId.ChatInputSecondary, runningSessionIds),
		}, {
			newSessionPrimary: [],
			newSessionSecondary: [
				{ id: 'sessions.agentHost.newSessionModePicker', order: 0 },
				{ id: 'sessions.agentHost.newSessionApprovePicker', order: 1 },
				{ id: 'sessions.agentHost.newSessionPermissionModePicker', order: 2 },
			],
			runningSessionPrimary: [],
			runningSessionSecondary: [
				{ id: 'sessions.agentHost.runningSessionModePicker', order: 9 },
				{ id: 'sessions.agentHost.runningSessionConfigPicker', order: 10 },
				{ id: 'sessions.agentHost.runningSessionPermissionModePicker', order: 11 },
			],
		});
	});
});
