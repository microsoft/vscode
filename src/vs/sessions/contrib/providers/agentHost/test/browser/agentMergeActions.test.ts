/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService, Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { AgentHostPullRequestOperationId } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { AgentMergeSettingId } from '../../../../../../platform/agentHost/common/agentMerge.js';
import { ArtifactIntegrationsSettingId } from '../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../../../workbench/contrib/sessions/browser/menus.js';
import { DesktopChangesEditorTransitionContext, SessionAgentMergeEnabledContext, SessionHasOpenPullRequestContext, SessionIsArchivedContext, SessionPrimaryPullRequestOperationContext, SessionProviderIdContext } from '../../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { IChat, ISession, ISessionChangeset, SessionStatus } from '../../../../../../workbench/services/sessions/common/session.js';
import { GitHubPullRequestCIModel } from '../../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { bindSessionActionContextKeys } from '../../../../../../workbench/contrib/sessionChanges/browser/sessionActionContextKeys.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IChangesRepository } from '../../../../../../workbench/contrib/sessions/common/changesRepositories.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesViewService } from '../../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionHost, ISessionHostService } from '../../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionAgentMergeService } from '../../../../../../workbench/contrib/sessions/browser/sessionAgentMerge.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ISessionsProvider } from '../../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import '../../browser/agentMergeActions.js';

suite('Agent Merge Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** A session where Agent Merge applies: agent host provider, live, with an open pull request. */
	function createContext(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly artifactIntegrationsEnabled?: boolean; readonly archived?: boolean; readonly hasOpenPullRequest?: boolean; readonly repositoryWithoutAgentMerge?: boolean }): Context {
		const context = new Context(1, null);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(ChatContextKeys.enabled.key, true);
		context.setValue(SessionProviderIdContext.key, 'local-agent-host');
		context.setValue(SessionIsArchivedContext.key, options.archived ?? false);
		context.setValue(`config.${AgentMergeSettingId.Enabled}`, options.featureEnabled ?? true);
		context.setValue(`config.${ArtifactIntegrationsSettingId}`, options.artifactIntegrationsEnabled ?? false);
		context.setValue(SessionHasOpenPullRequestContext.key, options.hasOpenPullRequest ?? true);
		context.setValue(SessionPrimaryPullRequestOperationContext.key, options.primaryOperation);
		context.setValue(SessionAgentMergeEnabledContext.key, options.agentMergeEnabled);
		if (options.repositoryWithoutAgentMerge) {
			context.setValue('sessionAgentMergeUnavailable', true);
		}
		return context;
	}

	function ownsPrimaryButton(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly artifactIntegrationsEnabled?: boolean; readonly archived?: boolean; readonly hasOpenPullRequest?: boolean; readonly repositoryWithoutAgentMerge?: boolean }): boolean {
		const item = MenuRegistry.getMenuItems(Menus.ChangesOperationsDropdown)
			.find(entry => !isIMenuItem(entry) && entry.submenu === Menus.ChangesAgentMerge);
		assert.ok(item, 'Agent Merge is contributed to the changes operations dropdown');
		return item.when?.evaluate(createContext(options)) ?? true;
	}

	test('Agent Merge takes the primary button in the auto-merge states, enabled or not', () => {
		// Agent Merge replaces the auto-merge operations on the button, so it has
		// to take the button while it is still off — enabling it is one of the
		// entries its dropdown offers.
		assert.deepStrictEqual({
			enableAutoMergeWhileOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: false }),
			enableAutoMergeWhileOn: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: true }),
			disableAutoMergeWhileOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.DisableAutoMerge, agentMergeEnabled: false }),
			disableAutoMergeWhileOn: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.DisableAutoMerge, agentMergeEnabled: true }),
			// A blocked pull request advertises no operation at all.
			noOperationWhileOff: ownsPrimaryButton({ primaryOperation: '', agentMergeEnabled: false }),
		}, {
			enableAutoMergeWhileOff: true,
			enableAutoMergeWhileOn: true,
			disableAutoMergeWhileOff: true,
			disableAutoMergeWhileOn: true,
			noOperationWhileOff: true,
		});
	});

	test('Agent Merge owns a draft pull request until CI and review comments are ready', () => {
		assert.deepStrictEqual({
			agentMergeMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReadyWithAgentMerge, agentMergeEnabled: true }),
			staleAgentMergeMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReadyWithAgentMerge, agentMergeEnabled: false }),
			normalMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReady, agentMergeEnabled: true }),
		}, {
			agentMergeMarkReady: true,
			staleAgentMergeMarkReady: false,
			normalMarkReady: false,
		});
	});

	test('Agent Merge leaves the primary button to the operation that moves the pull request along', () => {
		assert.deepStrictEqual({
			markReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReady, agentMergeEnabled: true }),
			merge: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.Merge, agentMergeEnabled: true }),
		}, {
			markReady: false,
			merge: false,
		});
	});

	test('Agent Merge does not stand in where it is unavailable', () => {
		// `chat.agentMerge.enabled` is off by default on stable, and an archived
		// session offers nothing. The auto-merge operations are dropped from the
		// bar regardless, so these states simply offer no button.
		assert.deepStrictEqual({
			featureOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: false, featureEnabled: false }),
			artifactIntegrations: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: true, artifactIntegrationsEnabled: true }),
			archived: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: true, archived: true }),
			mergeCompleted: ownsPrimaryButton({ primaryOperation: '', agentMergeEnabled: true, hasOpenPullRequest: false }),
			// A picked repository whose host doesn't serve its own scope, such as a remote one
			repositoryWithoutAgentMerge: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: false, repositoryWithoutAgentMerge: true }),
		}, {
			featureOff: false,
			artifactIntegrations: false,
			archived: false,
			mergeCompleted: false,
			repositoryWithoutAgentMerge: false,
		});
	});

	test('the Agent Merge dropdown offers whichever of enable/disable applies', () => {
		const entryVisible = (id: string, agentMergeEnabled: boolean) => {
			const item = MenuRegistry.getMenuItems(Menus.ChangesAgentMerge)
				.find(entry => isIMenuItem(entry) && entry.command.id === id);
			assert.ok(item, `${id} is contributed to the Agent Merge menu`);
			return item.when?.evaluate(createContext({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled })) ?? true;
		};

		assert.deepStrictEqual({
			enableWhileOff: entryVisible('sessions.agentHost.agentMerge.enableInSession', false),
			disableWhileOff: entryVisible('sessions.agentHost.agentMerge.disableInSession', false),
			enableWhileOn: entryVisible('sessions.agentHost.agentMerge.enableInSession', true),
			disableWhileOn: entryVisible('sessions.agentHost.agentMerge.disableInSession', true),
		}, {
			enableWhileOff: true,
			disableWhileOff: false,
			enableWhileOn: false,
			disableWhileOn: true,
		});
	});

	test('the Agent Merge primary menu places its toggle before the configuration submenu', () => {
		const visibleEntries = (menu: typeof Menus.ChangesAgentMerge, agentMergeEnabled: boolean) => MenuRegistry.getMenuItems(menu)
			.filter(entry => entry.group === '1_agentMerge')
			.filter(entry => entry.when?.evaluate(createContext({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled })) ?? true)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(entry => isIMenuItem(entry) ? entry.command.id : entry.submenu.id);

		assert.deepStrictEqual({
			operationsWhileOff: visibleEntries(Menus.ChangesOperationsDropdown, false),
			operationsWhileOn: visibleEntries(Menus.ChangesOperationsDropdown, true),
			primaryWhileOff: visibleEntries(Menus.ChangesAgentMerge, false),
			primaryWhileOn: visibleEntries(Menus.ChangesAgentMerge, true),
		}, {
			operationsWhileOff: ['sessions.agentHost.agentMerge.enableInSession', Menus.ChangesAgentMergeConfigure.id],
			operationsWhileOn: ['sessions.agentHost.agentMerge.disableInSession', Menus.ChangesAgentMergeConfigure.id],
			primaryWhileOff: ['sessions.agentHost.agentMerge.enableInSession', Menus.ChangesAgentMergeConfigure.id],
			primaryWhileOn: ['sessions.agentHost.agentMerge.disableInSession', Menus.ChangesAgentMergeConfigure.id],
		});
	});

	test('all Agent Merge configuration entries are nested under Configure Agent Merge', () => {
		const topLevelConfigurationCommands = [Menus.ChangesOperationsDropdown, Menus.ChangesAgentMerge]
			.flatMap(menu => MenuRegistry.getMenuItems(menu))
			.filter(isIMenuItem)
			.map(item => item.command.id)
			.filter(id => id.startsWith('sessions.agentHost.agentMerge.toggle.') || id === 'sessions.agentHost.agentMerge.openDefaults');
		const configurationItems = MenuRegistry.getMenuItems(Menus.ChangesAgentMergeConfigure);

		assert.deepStrictEqual({
			topLevelConfigurationCommands,
			commands: configurationItems.filter(isIMenuItem).map(item => item.command.id),
			submenus: configurationItems.filter(isISubmenuItem).map(item => item.submenu.id),
		}, {
			topLevelConfigurationCommands: [],
			commands: [
				'sessions.agentHost.agentMerge.toggle.addressReviews',
				'sessions.agentHost.agentMerge.toggle.fixCI',
				'sessions.agentHost.agentMerge.toggle.resolveConflicts',
				'sessions.agentHost.agentMerge.openDefaults',
			],
			submenus: Array(3).fill(Menus.ChangesAgentMergeMergePullRequest.id),
		});
	});

	test('enables Agent Merge for the repository the Changes of the target chat show, whichever window runs it', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const chat = (session: string, name: string) => upcastPartial<IChat>({ resource: URI.parse(`agent-host-copilotcli:/${session}#${name}`), title: constObservable(name) });
		const sessionOf = (id: string, mainChat: IChat) => upcastPartial<ISession>({ sessionId: id, resource: URI.parse(`agent-host-copilotcli:/${id}`), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, mainChat: constObservable(mainChat) });
		const first = chat('a', 'first');
		const second = chat('a', 'second');
		const other = chat('b', 'main');
		const sessionA = sessionOf('a', first);
		const sessionB = sessionOf('b', other);
		const api = URI.file('/work/api');
		const web = URI.file('/work/web');
		// Picked per chat: two chats of one session, and a chat of a session the main window does not show
		const picked = new Map<IChat, URI | undefined>([[first, api], [second, undefined], [other, web]]);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: (resource: URI) => {
				const target = [first, second, other].find(candidate => candidate.resource.toString() === resource.toString());
				return target && { session: target === other ? sessionB : sessionA, chat: target };
			},
		}));
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfChat: () => undefined }));
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			getSessionChanges: (_session, chatObs) => upcastPartial<IChangesSessionObservables>({
				repositoryObs: constObservable(picked.get(chatObs.get()!) ? upcastPartial<IChangesRepository>({ root: picked.get(chatObs.get()!)! }) : undefined),
			}),
		}));
		const writes: { session: string; chat: string | undefined; repository: string | undefined }[] = [];
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>() => upcastPartial<IAgentHostSessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				setAgentMergeEnabled: async (sessionId: string, _enabled: boolean, chat?: URI, repository?: URI) => { writes.push({ session: sessionId, chat: chat?.fragment, repository: repository?.path }); },
				supportsRepositoryAgentMerge: () => true,
			}) as unknown as T,
		}));

		for (const target of [first, second, other]) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessions.agentHost.agentMerge.enableInSession')!.handler(accessor, { chat: target }));
		}

		assert.deepStrictEqual(writes, [
			{ session: 'a', chat: 'first', repository: '/work/api' },
			{ session: 'a', chat: 'second', repository: undefined },
			{ session: 'b', chat: 'main', repository: '/work/web' },
		]);
	});

	test('acts on the chat of the Changes header it runs from, and refuses a repository without Agent Merge of its own', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const mainChat = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilotcli:/a#main'), title: constObservable('main') });
		const headerChat = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilotcli:/a#header'), title: constObservable('header') });
		const session = upcastPartial<ISession>({ sessionId: 'a', resource: URI.parse('agent-host-copilotcli:/a'), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, mainChat: constObservable(mainChat) });
		const supported = URI.file('/work/api');
		const unsupported = URI.file('/work/remote');
		let picked: URI | undefined;
		// The header's host shows the session's other chat; the focused host is not asked
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({
			getHost: id => id === 'header-host' ? upcastPartial<ISessionHost>({ session: constObservable(session), chat: constObservable(headerChat) }) : undefined,
		}));
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			getSessionChanges: () => upcastPartial<IChangesSessionObservables>({ repositoryObs: constObservable(picked && upcastPartial<IChangesRepository>({ root: picked, name: basename(picked) })) }),
		}));
		const writes: string[] = [];
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>() => upcastPartial<IAgentHostSessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				setAgentMergeEnabled: async (_sessionId: string, _enabled: boolean, chat?: URI, repository?: URI) => { writes.push(`${chat?.fragment}:${repository?.path}`); },
				supportsRepositoryAgentMerge: (_sessionId: string, repository: URI) => repository.path === supported.path,
			}) as unknown as T,
		}));
		const runFromHeader = async () => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessions.agentHost.agentMerge.enableInSession')!.handler(accessor, undefined, undefined, { sessionHostId: 'header-host' }));

		picked = supported;
		await runFromHeader();
		picked = unsupported;
		const refusal = await runFromHeader().then(() => undefined, (error: Error) => error.message);

		assert.deepStrictEqual({ writes, refusal }, {
			writes: ['header:/work/api'],
			refusal: 'Agent Merge is not available for the repository \'remote\' of this session.',
		});
	});

	test('the context key binder tells whether the repository the Changes show has Agent Merge of its own', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		// As much of a session as every binder of the session action keys reads
		const session = upcastPartial<ISession>({ sessionId: 'a', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, status: constObservable(SessionStatus.Completed) });
		const repository = observableValue<IChangesRepository | undefined>('test.repository', undefined);
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>() => upcastPartial<IAgentHostSessionsProvider>({ id: LOCAL_AGENT_HOST_PROVIDER_ID, supportsRepositoryAgentMerge: () => false }) as unknown as T,
		}));
		instantiationService.stub(ISessionAgentMergeService, upcastPartial<ISessionAgentMergeService>({ getConfigurationObservable: () => constObservable(undefined) }));
		const scoped = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(bindSessionActionContextKeys(instantiationService, {
			session: constObservable(session),
			chat: constObservable(undefined),
			changes: {
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(upcastPartial<ISessionChangeset>({ operations: constObservable([]) })),
				changesetOperationsObs: constObservable([]),
				operationsChangesetObs: constObservable(upcastPartial<ISessionChangeset>({ operations: constObservable([]) })),
				repositoryObs: repository,
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			},
			pullRequest: {
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			},
		}, scoped));
		const unavailable = () => scoped.getContextKeyValue<boolean>('sessionAgentMergeUnavailable');

		const all = unavailable();
		repository.set(upcastPartial<IChangesRepository>({ root: URI.file('/work/remote') }), undefined);
		const remote = unavailable();

		assert.deepStrictEqual({ all, remote }, { all: false, remote: true });
	});

	test('the context key binder does not re-read the editor transition key for unrelated context changes', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const scoped = disposables.add(new ContextKeyService(new TestConfigurationService()));
		let reads = 0;
		const getContextKeyValue = scoped.getContextKeyValue.bind(scoped);
		scoped.getContextKeyValue = <T>(key: string) => {
			if (key === DesktopChangesEditorTransitionContext.key) {
				reads++;
			}
			return getContextKeyValue<T>(key);
		};
		disposables.add(bindSessionActionContextKeys(instantiationService, {
			session: constObservable(undefined),
			chat: constObservable(undefined),
			changes: {
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(upcastPartial<ISessionChangeset>({ operations: constObservable([]) })),
				changesetOperationsObs: constObservable([]),
				operationsChangesetObs: constObservable(upcastPartial<ISessionChangeset>({ operations: constObservable([]) })),
				repositoryObs: constObservable(undefined),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			},
			pullRequest: {
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			},
		}, scoped));

		const unrelated = scoped.createKey<number>('unrelatedKey', 0);
		const afterBind = reads;
		unrelated.set(1);
		unrelated.set(2);

		assert.strictEqual(reads - afterBind, 0);
	});
});
