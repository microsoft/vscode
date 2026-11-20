/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stubChatViewHostServiceDependencies } from '../../../common/chatViewSessionsListServiceTestUtils.js';
import assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
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
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ChatPartEnabledContext, ChatPartVisibleContext } from '../../../../../../common/contextkeys.js';
import { IChatViewHost, IChatViewHostService } from '../../../../browser/chatViewHost.js';
import { ChatViewHostService } from '../../../../browser/widgetHosts/viewPane/chatViewHostService.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { IViewDescriptorService } from '../../../../../../common/views.js';
import { IWorkbenchLayoutService } from '../../../../../../services/layout/browser/layoutService.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';

suite('Agent host New Chat entries', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the New Chat dropdown offers New Chat in Worktree with worktree support, with or without the Sessions list, never New Chat (No Workspace), only with AI features on', () => {
		const shown = (options: { readonly worktree: boolean; readonly sessionsList: boolean; readonly chatPart?: { readonly openInChatPart: boolean; readonly enabled: boolean; readonly visible: boolean }; readonly ai?: boolean; readonly agentHost?: boolean; readonly remote?: string; readonly sessionsWindow?: boolean }) => {
			const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.worktree, 'chat.viewSessions.sessionsList.enabled': options.sessionsList, [ChatConfiguration.ChatViewSessionsOpenChatIn]: options.chatPart?.openInChatPart ? 'chatArea' : 'chatPanel' });
			// The Chat view's title in a local window with a single folder
			const contextKeyService = store.add(new ContextKeyService(configuration));
			contextKeyService.createKey(ChatContextKeys.enabled.key, options.ai ?? true);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', options.remote ?? '');
			contextKeyService.createKey(AGENT_HOST_ENABLED_CONTEXT_KEY.key, options.agentHost ?? true);
			contextKeyService.createKey('isSessionsWindow', options.sessionsWindow ?? false);
			if (options.chatPart) {
				contextKeyService.createKey(ChatPartEnabledContext.key, options.chatPart.enabled);
				contextKeyService.createKey(ChatPartVisibleContext.key, options.chatPart.visible);
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
			// Wherever New Chat starts its chats, the chat part or the Chat view: the entry starts the chat there
			chatPart: [false, true].flatMap(openInChatPart => [false, true].flatMap(enabled => [false, true].map(visible => shown({ worktree: true, sessionsList: true, chatPart: { openInChatPart, enabled, visible } })))),
		}, isWeb ? {
			// In a browser, whose agent host is not available either: `isWeb` is a constant that the entries' `when` takes in as
			// it is made, so tests in a browser can see only this
			neither: [], worktree: [], sessionsList: [], both: [], aiOff: [], noAgentHost: [], remote: [], agentsWindow: [], chatPart: Array.from({ length: 8 }, () => []),
		} : {
			neither: [],
			worktree: ['New Chat in Worktree'],
			sessionsList: [],
			both: ['New Chat in Worktree'],
			aiOff: [],
			noAgentHost: [],
			remote: [],
			agentsWindow: [],
			chatPart: Array.from({ length: 8 }, () => ['New Chat in Worktree']),
		});
	});

	test('New Chat in Worktree seeds a new worktree before the chat shows, once its configuration offers one, also once the agent host connects later, and otherwise reports it and opens nothing; it stops waiting where cancelled or forgotten', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-new' });
		const isolation = (values: readonly string[]) => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: [...values] } } } as SessionConfigSchema });
		const run = async (config: 'ready' | 'connectsLater' | 'never' | 'unsupported' | 'cancelled' | 'forgotten') => {
			const seeds: string[] = [];
			let newWorktree = false;
			const onDidChangeFolder = store.add(new Emitter<URI>());
			const folderService = upcastPartial<IAgentHostNewSessionFolderService>({
				onDidChangeFolder: onDidChangeFolder.event,
				setNewWorktree: () => { seeds.push('worktree'); newWorktree = true; },
				isNewWorktree: () => newWorktree,
				clear: () => { seeds.push('clear'); const had = newWorktree; newWorktree = false; if (had) { onDidChangeFolder.fire(resource); } },
			});
			let prepared: ResolveSessionConfigResult | undefined;
			let attempts = 0;
			let connected = config !== 'connectsLater';
			const onDidChangeSessionResolution = store.add(new Emitter<void>());
			const onDidChangeProvisional = store.add(new Emitter<URI>());
			const provisional = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
				onDidChange: onDidChangeProvisional.event,
				getPreparedSessionConfig: () => prepared,
				releaseSession: () => { seeds.push('release'); prepared = undefined; },
				prepareSessionConfig: async () => {
					attempts++;
					// As the host resolves the configuration it asks for, once connected: in a new worktree once seeded
					const values = { isolation: newWorktree ? 'worktree' : 'folder' };
					if (connected && (config === 'ready' || config === 'connectsLater')) {
						prepared = { ...isolation(['folder', 'worktree']), values };
					} else if (config === 'unsupported') {
						prepared = { ...isolation(['folder']), values: { isolation: 'folder' } };
					}
				},
			});
			const warnings: string[] = [];
			const notificationService = upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return undefined!; } });
			const cts = store.add(new CancellationTokenSource());
			const opening = prepareNewAgentHostChat(resource, folderService, provisional, { onDidChangeSessionResolution: onDidChangeSessionResolution.event }, notificationService, cts.token, 10_000);
			await timeout(1000);
			if (config === 'connectsLater') {
				connected = true;
				onDidChangeSessionResolution.fire();
			} else if (config === 'cancelled') {
				cts.cancel();
			} else if (config === 'forgotten') {
				folderService.clear(resource);
			}
			await timeout(10_000);
			const opened = await opening;
			// No listener stays behind once it settled
			onDidChangeSessionResolution.fire();
			return { opened: opened?.toString(), seeds, attempts, warned: warnings.length };
		};

		assert.deepStrictEqual({
			ready: await run('ready'), connectsLater: await run('connectsLater'), never: await run('never'), unsupported: await run('unsupported'),
			cancelled: await run('cancelled'), forgotten: await run('forgotten'),
		}, {
			ready: { opened: resource.toString(), seeds: ['worktree'], attempts: 1, warned: 0 },
			connectsLater: { opened: resource.toString(), seeds: ['worktree'], attempts: 2, warned: 0 },
			// Nothing opens: no chat that works in the folder, and the seed goes, so that a later configuration changes nothing
			never: { opened: undefined, seeds: ['worktree', 'clear', 'release'], attempts: 1, warned: 1 },
			unsupported: { opened: undefined, seeds: ['worktree', 'clear', 'release'], attempts: 1, warned: 1 },
			cancelled: { opened: undefined, seeds: ['worktree', 'clear', 'release'], attempts: 1, warned: 0 },
			forgotten: { opened: undefined, seeds: ['worktree', 'clear', 'clear', 'release'], attempts: 1, warned: 0 },
		});
	}));

	test('without an available agent host, the entry reports that rather than open a chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return undefined!; } }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(false) }));
		const newChats: unknown[] = [];
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ replaced: constObservable(true), newChat: async target => { newChats.push(target); return true; } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/work/vscode') })] }) }));
		const run = (id: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));

		const opened = await run(NewChatInWorktreeAction.ID);

		assert.deepStrictEqual({ opened, warned: warnings.length, newChats }, { opened: undefined, warned: 1, newChats: [] });
	});

	test('New Chat in Worktree starts the chat where New Chat does: in a host that replaces the Chat view, of the local agent host in a new worktree of the folder, else, or where the host does not take it, in the Chat view', async () => {
		const folder = URI.file('/work/vscode');
		const run = async (host: 'none' | 'takes' | 'declines') => {
			const instantiationService = store.add(new TestInstantiationService());
			const routes: unknown[] = [];
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: () => undefined! }));
			instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
			instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(true) }));
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
				replaced: constObservable(host !== 'none'),
				newChat: async (target, options) => { routes.push({ host: { target, options } }); return host === 'takes'; },
			}));
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: folder })] }) }));
			// The Chat view's path, which seeds the new worktree of its new chat first: here the agent host does not prepare it
			instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: Event.None, setNewWorktree: () => { routes.push('chatView'); }, isNewWorktree: () => false, clear: () => { } }));
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getPreparedSessionConfig: () => undefined, prepareSessionConfig: async () => { }, releaseSession: () => { } }));
			instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ onDidChangeSessionResolution: Event.None }));
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(NewChatInWorktreeAction.ID)!.handler(accessor));
			return routes;
		};

		const host = { host: { target: { folder, providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilotcli', placement: 'worktree' }, options: undefined } };
		assert.deepStrictEqual({ none: await run('none'), takes: await run('takes'), declines: await run('declines') }, {
			none: ['chatView'],
			takes: [host],
			declines: [host, 'chatView'],
		});
	});

	test('where the host that replaces the Chat view does not take it, New Chat in Worktree prepares its chat in the Chat view, not the Chat view\'s default new chat', async () => {
		const folder = URI.file('/work/vscode');
		const instantiationService = store.add(new TestInstantiationService());
		const routes: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: () => undefined! }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(true) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: folder })] }) }));
		// The Chat view, whose New Chat starts its default new chat, whatever it aims at
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			onDidChangeViewVisibility: Event.None,
			getViewWithId: <T>() => null as T | null,
			isViewVisible: () => true,
			openView: async <T>() => upcastPartial<ChatViewPane>({ newChat: async () => { routes.push('defaultNewChat'); return true; } }) as unknown as T,
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		stubChatViewHostServiceDependencies(instantiationService);
		const chatViewHostService = store.add(instantiationService.createInstance(ChatViewHostService));
		instantiationService.stub(IChatViewHostService, chatViewHostService);
		// A host that replaces the Chat view and does not take the new chat
		store.add(chatViewHostService.register({ host: upcastPartial<IChatViewHost>({ newChat: async () => { routes.push('hostDeclines'); return false; } }) }));
		// The Chat view's own path, which seeds its new chat's worktree first: here the agent host does not prepare it
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: Event.None, setNewWorktree: () => { routes.push('prepareWorktree'); }, isNewWorktree: () => false, clear: () => { } }));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getPreparedSessionConfig: () => undefined, prepareSessionConfig: async () => { }, releaseSession: () => { } }));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ onDidChangeSessionResolution: Event.None }));

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(NewChatInWorktreeAction.ID)!.handler(accessor));

		assert.deepStrictEqual(routes, ['hostDeclines', 'prepareWorktree']);
	});
});
