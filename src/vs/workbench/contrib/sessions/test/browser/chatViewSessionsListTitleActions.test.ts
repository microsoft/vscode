/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { Menus } from '../../browser/menus.js';

suite('Chat view sessions list title actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the actions of the sessions header are contributed to the Chat view title while the sessions list is shown', () => {
		const store = registerSessionsListActions();
		try {
			const describe = (id: MenuId) => MenuRegistry.getMenuItems(id).filter(isIMenuItem).map(item => item.command.id);
			const header = describe(Menus.SidebarSessionsHeader);
			const titleItems = MenuRegistry.getMenuItems(MenuId.ViewTitle).filter(item => item.when?.serialize().includes('chatViewSessionsList'));
			const title = titleItems.map(item => isIMenuItem(item) ? item.command.id : item.submenu.id);
			assert.deepStrictEqual({
				find: title.includes('sessionsViewPane.find'),
				compact: title.includes('sessionsViewPane.toggleCompact'),
				collapse: title.includes('sessionsViewPane.collapseAllGroups'),
				filter: title.includes(Menus.SessionsViewFilter.id),
				onlyForChatView: titleItems.every(item => item.when?.serialize().includes(`view == 'workbench.panel.chat.view.copilot'`)),
				gatedOnAiAndVisibleList: titleItems.every(item => {
					const when = item.when?.serialize() ?? '';
					return when.includes('chatIsEnabled') && when.includes('agentSessionsViewerVisible');
				}),
				headerKept: header.includes('sessionsViewPane.find'),
			}, { find: true, compact: true, collapse: true, filter: true, onlyForChatView: true, gatedOnAiAndVisibleList: true, headerKept: true });
		} finally {
			store.dispose();
		}
	});
});
