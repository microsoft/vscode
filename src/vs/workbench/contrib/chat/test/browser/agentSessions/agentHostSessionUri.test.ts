/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { applyAgentHostSessionConfigChange, getAgentHostSessionConfig, readAgentHostChatSandboxState } from '../../../browser/agentSessions/agentHost/applyAgentHostSessionConfig.js';
import { withChatSandboxState, withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, SessionLifecycle, SessionStatus, StateComponents, type ChatState, type ChatSummary, type ComponentToState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { toAgentHostBackendSessionUri } from '../../../browser/agentSessions/agentHost/agentHostSessionUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { applyAgentHostSubmitConfig } from '../../../browser/agentSessions/agentHost/applyAgentHostSubmitConfig.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ActionType, StateAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';

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
		const agentHostService = new class extends mock<IAgentHostService>() {
			override dispatch(channel: string, action: StateAction) { writes.push({ channel, action }); }
			override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, uri: URI): IAgentSubscription<ComponentToState[T]> {
				const value = states.get(uri.toString()) as ComponentToState[T] | undefined;
				return { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
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

		assert.deepStrictEqual({ read, writes }, {
			read: { mode: 'plan', isolation: 'folder' },
			writes: [
				{ channel: peer, action: { type: ActionType.ChatConfigChanged, config: { mode: 'autopilot' } } },
				{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } } },
			],
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
