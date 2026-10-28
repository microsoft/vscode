/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { applyAgentHostSessionConfigChange, dispatchAgentHostConfigChange, getAgentHostEffectiveChatConfig, getAgentHostSessionConfig, hostPublishesCompleteChatConfig, readAgentHostChatSandboxState } from '../../../browser/agentSessions/agentHost/applyAgentHostSessionConfig.js';
import { withChatSandboxState, withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, SessionLifecycle, SessionStatus, StateComponents, type ChatState, type ChatSummary, type ComponentToState, type RootState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { toAgentHostBackendSessionUri } from '../../../browser/agentSessions/agentHost/agentHostSessionUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { applyAgentHostSubmitConfig } from '../../../browser/agentSessions/agentHost/applyAgentHostSubmitConfig.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ActionType, StateAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatProvidersConfigKey } from '../../../../../../platform/agentHost/common/agentHostChatProviders.js';

suite('Agent Host committed configuration identity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a subagent\'s sandbox state is the one the chat that spawned it runs with', () => {
		const session = 'copilotcli:/sandboxed';
		const [main, peer, subagent] = [buildDefaultChatUri(session), buildChatUri(session, 'peer'), buildChatUri(session, 'subagent')];
		const summary = (resource: string, origin?: ChatSummary['origin']): ChatSummary => ({ resource, title: resource, status: SessionStatus.Idle, modifiedAt: new Date(0).toISOString(), ...(origin ? { origin } : {}) });
		const state: SessionState = {
			provider: 'copilotcli', title: 'sandboxed', status: SessionStatus.Idle, lifecycle: SessionLifecycle.Ready, activeClients: [], defaultChat: main,
			chats: [summary(main), summary(peer), summary(subagent, { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 't' })],
			_meta: withChatSandboxState(withSessionSandboxState(undefined, { enabled: false }), peer, { enabled: true }),
		};
		assert.deepStrictEqual([main, peer, subagent].map(chat => readAgentHostChatSandboxState(state, chat)?.enabled), [false, true, true]);
	});

	test('typed approval commands use the discovered standard binding before dispatch', async () => {
		const resource = URI.parse('agent-host-other:/shared');
		const backendSession = URI.parse('session-store://tenant/shared');
		const config = { schema: { type: 'object' as const, properties: { approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'] } } }, values: { approvalMode: 'assisted' } };
		const writes: { channel: string; action: StateAction }[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override readonly initializeResult = constObservable(undefined);
			override readonly rootState = { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			override dispatch(channel: string, action: StateAction) { writes.push({ channel, action }); }
			override getSubscriptionUnmanaged() {
				return { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
		}();
		const applied = await applyAgentHostSubmitConfig(resource, { autoApprove: 'default' }, {
			agentHostService,
			connectionsService: new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY }; }
				override resolveSessionResource() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, connection: agentHostService }; }
			}(),
			provisionalService: new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
				override get() { return undefined; }
				override getResolvedConfig() { return config; }
				override async refreshResolvedConfig() { }
			}(),
			workingDirectoryResolver: new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { override resolve() { return undefined; } }(),
			workspaceContextService: new class extends mock<IWorkspaceContextService>() { override getWorkspace() { return { id: 'test', folders: [] }; } }(),
			configurationService: new TestConfigurationService(),
			dialogService: new TestDialogService(),
			storageService: store.add(new InMemoryStorageService()),
		});
		assert.deepStrictEqual({ applied, writes }, { applied: true, writes: [{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { approvalMode: 'manual' } } }] });
	});

	test('a chat reads its own values and its changes go to the chat or its session by property', async () => {
		const resource = URI.parse('agent-host-copilotcli:/shared').with({ fragment: 'peer' });
		const backendSession = URI.parse('copilotcli:/shared');
		const peer = buildChatUri(backendSession, 'peer');
		const summary: ChatSummary = { resource: peer, title: 'Peer', status: SessionStatus.Idle, modifiedAt: new Date(0).toISOString() };
		const states = new Map<string, SessionState | ChatState>([
			[backendSession.toString(), {
				provider: 'copilotcli', title: 'Shared', status: SessionStatus.Idle, lifecycle: SessionLifecycle.Ready, activeClients: [],
				chats: [summary], defaultChat: buildDefaultChatUri(backendSession),
				config: {
					schema: {
						type: 'object', properties: {
							mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], sessionMutable: true, chatMutable: true },
							isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], sessionMutable: true },
						},
					},
					values: { mode: 'interactive', isolation: 'folder' },
				},
			}],
			[peer, { ...summary, turns: [], config: { values: { mode: 'plan' } } }],
		]);
		const writes: { channel: string; action: StateAction }[] = [];
		const resolvedProviders: (string | undefined)[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override readonly initializeResult = constObservable(undefined);
			override readonly rootState = { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			override dispatch(channel: string, action: StateAction) { writes.push({ channel, action }); }
			override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, uri: URI): IAgentSubscription<ComponentToState[T]> {
				const value = states.get(uri.toString()) as ComponentToState[T] | undefined;
				return { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
			override async resolveSessionConfig(params: { provider?: string }) { resolvedProviders.push(params.provider); return { schema: { type: 'object' as const, properties: {} }, values: {} }; }
		}();
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResourceIdentity() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY }; }
			override resolveSessionResource() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, connection: agentHostService }; }
		}();
		const provisionalService = new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
			override get() { return undefined; }
			override getResolvedConfig() { return undefined; }
			override async refreshResolvedConfig() { }
		}();
		const read = getAgentHostSessionConfig(resource, provisionalService, connectionsService)?.values;

		await applyAgentHostSessionConfigChange(resource, { mode: 'autopilot', isolation: 'worktree' }, {
			agentHostService,
			connectionsService,
			provisionalService,
			workingDirectoryResolver: new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { override resolve() { return undefined; } }(),
			workspaceContextService: new class extends mock<IWorkspaceContextService>() { override getWorkspace() { return { id: 'test', folders: [] }; } }(),
			configurationService: new TestConfigurationService(),
		});

		assert.deepStrictEqual({ read, writes, resolvedProviders }, {
			read: { mode: 'plan', isolation: 'folder' },
			// A chat on its session's agent uses the session's config: no agent config is resolved for it.
			resolvedProviders: [],
			writes: [
				{ channel: peer, action: { type: ActionType.ChatConfigChanged, config: { mode: 'autopilot' } } },
				{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } } },
			],
		});
	});

	test('a chat on another agent reads its own schema from its state, never the session\'s, and writes only its chat-settable properties', async () => {
		const resource = URI.parse('agent-host-copilotcli:/mixed').with({ fragment: 'peer' });
		const backendSession = URI.parse('copilotcli:/mixed');
		const peer = buildChatUri(backendSession, 'peer');
		const summary: ChatSummary = { resource: peer, title: 'Peer', status: SessionStatus.Idle, modifiedAt: new Date(0).toISOString(), provider: 'claude' };
		const states = new Map<string, SessionState | ChatState>([
			[backendSession.toString(), {
				provider: 'copilotcli', title: 'Mixed', status: SessionStatus.Idle, lifecycle: SessionLifecycle.Ready, activeClients: [],
				chats: [summary], defaultChat: buildDefaultChatUri(backendSession), workingDirectories: ['file:///repo'],
				config: {
					schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], sessionMutable: true, chatMutable: true }, isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], sessionMutable: true } } },
					values: { mode: 'interactive', isolation: 'folder' },
				},
			}],
		]);
		const effort = { type: 'string' as const, title: 'Effort', enum: ['low', 'medium', 'high'], default: 'medium', chatMutable: true };
		const verbose = { type: 'boolean' as const, title: 'Verbose', default: false, chatMutable: true };
		const writes: { channel: string; action: StateAction }[] = [];
		const resolved: (string | undefined)[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override readonly initializeResult = constObservable(undefined);
			override readonly rootState = { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			override dispatch(channel: string, action: StateAction) { writes.push({ channel, action }); }
			override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, uri: URI): IAgentSubscription<ComponentToState[T]> {
				const value = states.get(uri.toString()) as ComponentToState[T] | undefined;
				return { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
			override async resolveSessionConfig(params: { provider?: string }) {
				resolved.push(params.provider);
				return { schema: { type: 'object' as const, properties: {} }, values: {} };
			}
		}();
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResourceIdentity() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY }; }
			override resolveSessionResource() { return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, connection: agentHostService }; }
		}();
		const provisionalService = new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
			override get() { return undefined; }
			override getResolvedConfig() { return states.get(backendSession.toString()) && (states.get(backendSession.toString()) as SessionState).config; }
			override async refreshResolvedConfig() { }
		}();
		// Until the chat's state arrives it has no config: never the session's (or its provisional) config.
		const pending = getAgentHostSessionConfig(resource, provisionalService, connectionsService);
		states.set(peer, { ...summary, turns: [], config: { schema: { type: 'object', properties: { effort, verbose } }, values: { effort: 'high' } } });
		const read = getAgentHostSessionConfig(resource, provisionalService, connectionsService);

		await applyAgentHostSessionConfigChange(resource, { effort: 'low', mode: 'plan', isolation: 'worktree' }, {
			agentHostService,
			connectionsService,
			provisionalService,
			workingDirectoryResolver: new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { override resolve() { return undefined; } }(),
			workspaceContextService: new class extends mock<IWorkspaceContextService>() { override getWorkspace() { return { id: 'test', folders: [] }; } }(),
			configurationService: new TestConfigurationService(),
		});

		assert.deepStrictEqual({ pending, read, resolved, writes }, {
			pending: undefined,
			read: { schema: { type: 'object', properties: { effort, verbose } }, values: { effort: 'high', verbose: false } },
			resolved: [],
			writes: [{ channel: peer, action: { type: ActionType.ChatConfigChanged, config: { effort: 'low' } } }],
		});
	});

	test('a change from the default chat writes what the session may set to the session on a host that applies it to the default chat (chats with their own agents on), and to the default chat otherwise', () => {
		const backendSession = URI.parse('copilotcli:/main');
		const main = buildDefaultChatUri(backendSession);
		const summary: ChatSummary = { resource: main, title: 'Main', status: SessionStatus.Idle, modifiedAt: new Date(0).toISOString() };
		const state: SessionState = {
			provider: 'copilotcli', title: 'Main', status: SessionStatus.Idle, lifecycle: SessionLifecycle.Ready, activeClients: [], chats: [summary], defaultChat: main,
			config: {
				schema: {
					type: 'object', properties: {
						mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], sessionMutable: true, chatMutable: true },
						effort: { type: 'string', title: 'Effort', enum: ['low', 'high'], chatMutable: true },
						isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], sessionMutable: true },
					},
				},
				values: { mode: 'interactive', isolation: 'folder' },
			},
		};
		const write = (rootConfigKeys: readonly string[], values: Record<string, unknown> = {}) => {
			const writes: { channel: string; action: StateAction }[] = [];
			const rootState: RootState = { agents: [], config: { schema: { type: 'object', properties: Object.fromEntries(rootConfigKeys.map(key => [key, { type: 'boolean', title: key }])) }, values } };
			dispatchAgentHostConfigChange({
				dispatch: (channel, action) => writes.push({ channel, action }),
				rootState: { value: rootState, verifiedValue: rootState, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
			}, backendSession, main, state, { mode: 'plan', effort: 'high', isolation: 'worktree' });
			return writes;
		};

		const older = [
			{ channel: main, action: { type: ActionType.ChatConfigChanged, config: { mode: 'plan', effort: 'high' } } },
			{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } } },
		];
		// An older host keeps the setting's value this client mirrors to it, but doesn't declare it.
		assert.deepStrictEqual(write([], { [ChatProvidersConfigKey.Enabled]: true }), older);
		assert.deepStrictEqual({ current: write([ChatProvidersConfigKey.Enabled], { [ChatProvidersConfigKey.Enabled]: true }), gateOff: write([ChatProvidersConfigKey.Enabled], { [ChatProvidersConfigKey.Enabled]: false }), older: write([]) }, {
			// Only what a chat alone may set reaches the default chat; each property is written once.
			current: [
				{ channel: main, action: { type: ActionType.ChatConfigChanged, config: { effort: 'high' } } },
				{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { mode: 'plan', isolation: 'worktree' } } },
			],
			// With chats with their own agents off, a host behaves as an older one.
			gateOff: [
				{ channel: main, action: { type: ActionType.ChatConfigChanged, config: { mode: 'plan', effort: 'high' } } },
				{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } } },
			],
			// An older host lets the default chat's own value win over the session's.
			older: [
				{ channel: main, action: { type: ActionType.ChatConfigChanged, config: { mode: 'plan', effort: 'high' } } },
				{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } } },
			],
		});
	});

	test('a host publishes complete chat values only while it declares and enables chats with their own agents', () => {
		const publishes = (declared: boolean, value: unknown) => hostPublishesCompleteChatConfig({
			agents: [],
			config: { schema: { type: 'object', properties: declared ? { [ChatProvidersConfigKey.Enabled]: { type: 'boolean', title: 'Enabled' } } : {} }, values: { [ChatProvidersConfigKey.Enabled]: value } },
		});
		assert.deepStrictEqual({ on: publishes(true, true), off: publishes(true, false), undeclaredButOn: publishes(false, true), noRoot: hostPublishesCompleteChatConfig(undefined) }, {
			on: true, off: false, undeclaredButOn: false, noRoot: false,
		});
	});

	test('a chat\'s effective config is an overlay on its session\'s unless its host publishes complete values (chats with their own agents on)', () => {
		const session = {
			schema: {
				type: 'object' as const, properties: {
					mode: { type: 'string' as const, title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], default: 'interactive', sessionMutable: true, chatMutable: true },
					isolation: { type: 'string' as const, title: 'Isolation', enum: ['folder', 'worktree'], sessionMutable: true },
				},
			},
			values: { mode: 'plan', isolation: 'folder' },
		};
		assert.deepStrictEqual({
			// An older host, or one with the setting off, publishes only what the chat set itself.
			overlay: getAgentHostEffectiveChatConfig(session, { values: {} }, false).values,
			// With the setting on, a host publishes the chat's values; one it omits is its default.
			complete: getAgentHostEffectiveChatConfig(session, { values: {} }, true).values,
			completeSet: getAgentHostEffectiveChatConfig(session, { values: { mode: 'autopilot', isolation: 'worktree' } }, true).values,
		}, {
			overlay: { mode: 'plan', isolation: 'folder' },
			complete: { mode: 'interactive', isolation: 'folder' },
			completeSet: { mode: 'autopilot', isolation: 'folder' },
		});
	});

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		for (const backendResource of [`${provider}:/shared`, 'ahp-session:/shared', 'session-store://tenant/shared?revision%3D2']) {
			test(`${provider} config changes use the advertised backend ${backendResource}`, async () => {
				const resource = URI.parse(`agent-host-${provider}:/shared`);
				const backendSession = URI.parse(backendResource);
				const dispatched: string[] = [];
				const refreshedProviders: string[] = [];
				const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
					override resolveSessionResourceIdentity(): { backendSession: URI; connectionAuthority: string } {
						return { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY };
					}
				}();
				const agentHostService = new class extends mock<IAgentHostService>() {
					override readonly initializeResult = constObservable(undefined);
					override dispatch(channel: string): void { dispatched.push(channel); }
					override getSubscriptionUnmanaged() {
						return { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
					}
				}();
				const provisionalService = new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
					override getResolvedConfig(): undefined { return undefined; }
					override async refreshResolvedConfig(_resource: URI, provider: string): Promise<void> { refreshedProviders.push(provider); }
				}();
				const applied = await applyAgentHostSessionConfigChange(resource, { mode: 'plan' }, {
					agentHostService,
					connectionsService,
					provisionalService,
					workingDirectoryResolver: new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() {
						override resolve(): undefined { return undefined; }
					}(),
					workspaceContextService: new class extends mock<IWorkspaceContextService>() {
						override getWorkspace() { return { id: 'test', folders: [] }; }
					}(),
					configurationService: new TestConfigurationService() satisfies IConfigurationService,
				});
				assert.deepStrictEqual({
					applied, dispatched, refreshedProviders,
					backend: toAgentHostBackendSessionUri(resource, connectionsService)?.toString(),
				}, { applied: true, dispatched: [backendResource], refreshedProviders: [provider], backend: backendResource });
			});
		}
	}
});
