/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { NewChatInWorktreeAction, NewChatWithoutWorkspaceAction } from '../../../../browser/agentSessions/agentHost/agentHostNewChatActions.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('Agent host New Chat entries', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the New Chat dropdown offers New Chat in Worktree with worktree support and New Chat (No Workspace) with the Sessions list, only with AI features on', () => {
		const shown = (options: { readonly worktree: boolean; readonly sessionsList: boolean; readonly ai?: boolean }) => {
			const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.worktree, 'chat.viewSessions.sessionsList.enabled': options.sessionsList });
			// The Chat view's title in a local window with a single folder
			const contextKeyService = store.add(new ContextKeyService(configuration));
			contextKeyService.createKey(ChatContextKeys.enabled.key, options.ai ?? true);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', '');
			return MenuRegistry.getMenuItems(MenuId.ChatNewMenu).filter(isIMenuItem)
				.filter(item => (item.command.id === NewChatInWorktreeAction.ID || item.command.id === NewChatWithoutWorkspaceAction.ID) && contextKeyService.contextMatchesRules(item.when))
				.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value);
		};

		assert.deepStrictEqual({
			neither: shown({ worktree: false, sessionsList: false }),
			worktree: shown({ worktree: true, sessionsList: false }),
			sessionsList: shown({ worktree: false, sessionsList: true }),
			both: shown({ worktree: true, sessionsList: true }),
			aiOff: shown({ worktree: true, sessionsList: true, ai: false }),
		}, {
			neither: [],
			worktree: ['New Chat in Worktree'],
			sessionsList: ['New Chat (No Workspace)'],
			both: ['New Chat in Worktree', 'New Chat (No Workspace)'],
			aiOff: [],
		});
	});
});
