/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { CreateRemoteAgentJobAction } from '../../browser/actions/chatExecuteActions.js';

suite('ChatExecuteActions', function () {

	let menuService: MenuService;
	const disposables = new DisposableStore();

	setup(function () {
		menuService = new MenuService(NullCommandService, new MockKeybindingService(), new InMemoryStorageService());
		disposables.clear();
	});

	teardown(function () {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('CreateRemoteAgentJobAction is registered in both ChatExecute and ChatExecuteSecondary menus', function () {
		const chatExecuteMenu = menuService.createMenu(MenuId.ChatExecute, new MockContextKeyService());
		const chatExecuteSecondaryMenu = menuService.createMenu(MenuId.ChatExecuteSecondary, new MockContextKeyService());

		const chatExecuteActions = chatExecuteMenu.getActions();
		const chatExecuteSecondaryActions = chatExecuteSecondaryMenu.getActions();

		// Check that CreateRemoteAgentJobAction is present in both menus
		const isInChatExecute = chatExecuteActions.some(([group, actions]) => 
			actions.some(action => action.id === CreateRemoteAgentJobAction.ID)
		);
		
		const isInChatExecuteSecondary = chatExecuteSecondaryActions.some(([group, actions]) => 
			actions.some(action => action.id === CreateRemoteAgentJobAction.ID)
		);

		assert.ok(isInChatExecute, 'CreateRemoteAgentJobAction should be in ChatExecute menu');
		assert.ok(isInChatExecuteSecondary, 'CreateRemoteAgentJobAction should be in ChatExecuteSecondary menu');

		chatExecuteMenu.dispose();
		chatExecuteSecondaryMenu.dispose();
	});

	test('CreateRemoteAgentJobAction is in group_3 in ChatExecuteSecondary menu', function () {
		const chatExecuteSecondaryMenu = menuService.createMenu(MenuId.ChatExecuteSecondary, new MockContextKeyService());
		const chatExecuteSecondaryActions = chatExecuteSecondaryMenu.getActions();

		// Find the group containing the CreateRemoteAgentJobAction
		let foundInGroup3 = false;
		for (const [groupName, actions] of chatExecuteSecondaryActions) {
			if (groupName === 'group_3') {
				foundInGroup3 = actions.some(action => action.id === CreateRemoteAgentJobAction.ID);
				break;
			}
		}

		assert.ok(foundInGroup3, 'CreateRemoteAgentJobAction should be in group_3 of ChatExecuteSecondary menu');

		chatExecuteSecondaryMenu.dispose();
	});
});