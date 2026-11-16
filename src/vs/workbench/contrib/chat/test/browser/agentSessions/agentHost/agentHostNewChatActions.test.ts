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
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';

suite('Agent host New Chat entries', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the New Chat dropdown offers New Chat in Worktree with worktree support and New Chat (No Workspace) with the Sessions list, only with AI features on', () => {
		const shown = (options: { readonly worktree: boolean; readonly sessionsList: boolean; readonly ai?: boolean; readonly agentHost?: boolean; readonly remote?: string; readonly sessionsWindow?: boolean }) => {
			const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.worktree, 'chat.viewSessions.sessionsList.enabled': options.sessionsList });
			// The Chat view's title in a local window with a single folder. In a browser, `isWeb` is a constant that hides the
			// entries by construction, and its agent host is not available either
			const contextKeyService = store.add(new ContextKeyService(configuration));
			contextKeyService.createKey(ChatContextKeys.enabled.key, options.ai ?? true);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', options.remote ?? '');
			contextKeyService.createKey(AGENT_HOST_ENABLED_CONTEXT_KEY.key, options.agentHost ?? true);
			contextKeyService.createKey('isSessionsWindow', options.sessionsWindow ?? false);
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
			noAgentHost: shown({ worktree: true, sessionsList: true, agentHost: false }),
			remote: shown({ worktree: true, sessionsList: true, remote: 'ssh-remote' }),
			agentsWindow: shown({ worktree: true, sessionsList: true, sessionsWindow: true }),
		}, {
			neither: [],
			worktree: ['New Chat in Worktree'],
			sessionsList: ['New Chat (No Workspace)'],
			both: ['New Chat in Worktree', 'New Chat (No Workspace)'],
			aiOff: [],
			noAgentHost: [],
			remote: [],
			agentsWindow: [],
		});
	});

	test('without an available agent host, the entries report that rather than open a chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return undefined!; } }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(false) }));
		const run = (id: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));

		const opened = [await run(NewChatInWorktreeAction.ID), await run(NewChatWithoutWorkspaceAction.ID)];

		assert.deepStrictEqual({ opened, warned: warnings.length }, { opened: [undefined, undefined], warned: 2 });
	});
});
