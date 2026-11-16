/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { NewChatInWorktreeAction, prepareNewAgentHostChat } from '../../../../browser/agentSessions/agentHost/agentHostNewChatActions.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { SessionConfigSchema } from '../../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { ResolveSessionConfigResult } from '../../../../../../../platform/agentHost/common/state/protocol/channels-root/commands.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';

suite('Agent host New Chat entries', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the New Chat dropdown offers New Chat in Worktree with worktree support, with or without the Sessions list, never New Chat (No Workspace), only with AI features on', () => {
		const shown = (options: { readonly worktree: boolean; readonly sessionsList: boolean; readonly chatPart?: boolean; readonly ai?: boolean; readonly agentHost?: boolean; readonly remote?: string; readonly sessionsWindow?: boolean }) => {
			const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.worktree, 'chat.viewSessions.sessionsList.enabled': options.sessionsList });
			// The Chat view's title in a local window with a single folder
			const contextKeyService = store.add(new ContextKeyService(configuration));
			contextKeyService.createKey(ChatContextKeys.enabled.key, options.ai ?? true);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', options.remote ?? '');
			contextKeyService.createKey(AGENT_HOST_ENABLED_CONTEXT_KEY.key, options.agentHost ?? true);
			contextKeyService.createKey('isSessionsWindow', options.sessionsWindow ?? false);
			if (options.chatPart !== undefined) {
				contextKeyService.createKey('chatPartEnabled', options.chatPart);
			}
			return MenuRegistry.getMenuItems(MenuId.ChatNewMenu).filter(isIMenuItem)
				.filter(item => (item.command.id === NewChatInWorktreeAction.ID || item.command.id === 'workbench.action.chat.newChatWithoutWorkspace') && contextKeyService.contextMatchesRules(item.when))
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
			// New Chat opens in the chat area, which cannot start a chat in a worktree yet
			chatPartEnabled: shown({ worktree: true, sessionsList: true, chatPart: true }),
			chatPartDisabled: shown({ worktree: true, sessionsList: true, chatPart: false }),
		}, isWeb ? {
			// In a browser, whose agent host is not available either: `isWeb` is a constant that the entries' `when` takes in as
			// it is made, so tests in a browser can see only this
			neither: [], worktree: [], sessionsList: [], both: [], aiOff: [], noAgentHost: [], remote: [], agentsWindow: [], chatPartEnabled: [], chatPartDisabled: [],
		} : {
			neither: [],
			worktree: ['New Chat in Worktree'],
			sessionsList: [],
			both: ['New Chat in Worktree'],
			aiOff: [],
			noAgentHost: [],
			remote: [],
			agentsWindow: [],
			chatPartEnabled: [],
			chatPartDisabled: ['New Chat in Worktree'],
		});
	});

	test('New Chat in Worktree seeds a new worktree before the chat shows, once its configuration offers one, also on a later attempt, and otherwise reports it and opens nothing', async () => {
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-new' });
		const isolation = (values: readonly string[]) => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: [...values] } } } as SessionConfigSchema });
		const run = async (config: 'ready' | 'secondAttempt' | 'never' | 'unsupported') => {
			const seeds: string[] = [];
			let newWorktree = false;
			const folderService = upcastPartial<IAgentHostNewSessionFolderService>({
				setNewWorktree: () => { seeds.push('worktree'); newWorktree = true; },
				clear: () => { seeds.push('clear'); newWorktree = false; },
			});
			let prepared: ResolveSessionConfigResult | undefined;
			let attempts = 0;
			const provisional = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
				getPreparedSessionConfig: () => prepared,
				releaseSession: () => { seeds.push('release'); prepared = undefined; },
				prepareSessionConfig: async () => {
					attempts++;
					// As the host resolves the configuration it asks for: in a new worktree once seeded
					const values = { isolation: newWorktree ? 'worktree' : 'folder' };
					if (config === 'ready' || (config === 'secondAttempt' && attempts === 2)) {
						prepared = { ...isolation(['folder', 'worktree']), values };
					} else if (config === 'unsupported') {
						prepared = { ...isolation(['folder']), values: { isolation: 'folder' } };
					}
				},
			});
			const warnings: string[] = [];
			const notificationService = upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return undefined!; } });
			const opened = await prepareNewAgentHostChat(resource, folderService, provisional, notificationService);
			return { opened: opened?.toString(), seeds, attempts, warned: warnings.length };
		};

		assert.deepStrictEqual({ ready: await run('ready'), secondAttempt: await run('secondAttempt'), never: await run('never'), unsupported: await run('unsupported') }, {
			ready: { opened: resource.toString(), seeds: ['worktree'], attempts: 1, warned: 0 },
			secondAttempt: { opened: resource.toString(), seeds: ['worktree'], attempts: 2, warned: 0 },
			// Nothing opens: no chat that works in the folder, and the seed goes, so that a later configuration changes nothing
			never: { opened: undefined, seeds: ['worktree', 'clear', 'release'], attempts: 3, warned: 1 },
			unsupported: { opened: undefined, seeds: ['worktree', 'clear', 'release'], attempts: 1, warned: 1 },
		});
	});

	test('without an available agent host, the entry reports that rather than open a chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return undefined!; } }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(false) }));
		const run = (id: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));

		const opened = await run(NewChatInWorktreeAction.ID);

		assert.deepStrictEqual({ opened, warned: warnings.length }, { opened: undefined, warned: 1 });
	});
});
