/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { RemoteAgentHostConnectionStatus, type IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { AGENT_HOST_CHAT_OWNER_TIMEOUT_MS, resolveAgentHostChatOwner } from '../../../browser/agentSessions/agentHost/agentHostChatOwner.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus, StateComponents, type ComponentToState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetInstance } from '../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry, IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

suite('ChatReferenceAttachment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// A chat-reference entry's `value` is the opaque **backend** chat URI
	// (`ahp-chat://...`), identical to what `MessageChatAttachment.resource`
	// carries on the wire.
	const backendSession = AgentSession.uri('claude', 'abc123');
	const backendDefaultChat = URI.parse(buildDefaultChatUri(backendSession));

	function createFakeWidget(): IChatAttachmentWidgetInstance {
		return {
			element: {} as HTMLElement,
			onDidDelete: Event.None,
			onDidOpen: Event.None,
			dispose: () => { },
		};
	}

	test('registry selects the chat-reference widget for a chat-reference entry only', () => {
		const registry = new ChatAttachmentWidgetRegistry();
		const fake = createFakeWidget();
		const disposable = registry.registerFactory('chatReference', () => fake);

		const chatReferenceEntry = createChatReferenceVariableEntry(backendDefaultChat, 'turn-1', 'My Chat');
		const genericEntry: IChatRequestVariableEntry = { kind: 'generic', id: 'other', name: 'other', value: 'v' };

		assert.deepStrictEqual(
			{
				chatReferenceMatched: registry.createWidget(chatReferenceEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement) === fake,
				genericMatched: registry.createWidget(genericEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement) === fake,
			},
			{
				chatReferenceMatched: true,
				genericMatched: false,
			}
		);

		disposable.dispose();
	});

	suite('resolveAgentHostChatOwner', () => {
		const encoded = 'copilotcli:/encoded';
		const peer = buildChatUri(encoded, 'peer');
		const defaultChat = buildDefaultChatUri(encoded);
		const subscribedChat = buildChatUri(encoded, 'subscribed');
		const remoteChat = buildChatUri(encoded, 'remote');
		const disconnectedChat = buildChatUri(encoded, 'disconnected');

		class FakeConnection extends mock<IAgentConnection>() {
			constructor(private readonly _sessions: readonly IAgentSessionMetadata[], private readonly _subscribed?: { readonly session: string; readonly state: SessionState }) {
				super();
			}
			override getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
				return this._subscribed ? [{ resource: URI.parse(this._subscribed.session), kind: StateComponents.Session, refCount: 1, holders: [], status: 'snapshot' }] : [];
			}
			override getSubscriptionUnmanaged<T extends StateComponents>(): IAgentSubscription<ComponentToState[T]> | undefined {
				const state = this._subscribed?.state;
				return state && upcastPartial<IAgentSubscription<ComponentToState[T]>>({ value: state as ComponentToState[T] });
			}
			override async listSessions(): Promise<IAgentSessionMetadata[]> {
				return [...this._sessions];
			}
		}
		const connection = (sessions: readonly IAgentSessionMetadata[], subscribed?: { readonly session: string; readonly state: SessionState }) => new FakeConnection(sessions, subscribed);
		const record = (session: string, chat: string): IAgentSessionMetadata => ({ session: URI.parse(session), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(chat), kind: 'peer' }] });
		const remoteHostsOf = (...remotes: FakeConnection[]) => upcastPartial<IRemoteAgentHostService>({
			connections: remotes.map((_, index) => ({ address: `remote-${index}.example:1`, name: `remote-${index}`, status: RemoteAgentHostConnectionStatus.connected })),
			getConnectionByAuthority: authority => {
				const index = remotes.findIndex((_, candidate) => agentHostAuthority(`remote-${candidate}.example:1`) === authority);
				return index === -1 ? undefined : remotes[index];
			},
		});
		class TraceLog extends NullLogService {
			readonly traces: string[] = [];
			override trace(message: string): void {
				this.traces.push(message);
			}
		}

		test('resolves owners from held state, then local and connected remote host records, never from the chat URI', async () => {
			const local = connection([
				{ session: URI.parse('copilotcli:/local-owner'), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(defaultChat), kind: 'default' }, { chat: URI.parse(peer), kind: 'peer' }] },
			], { session: 'copilotcli:/subscribed-owner', state: upcastPartial<SessionState>({ defaultChat: buildDefaultChatUri('copilotcli:/subscribed-owner'), chats: [{ resource: subscribedChat, title: '', status: SessionStatus.Idle, modifiedAt: '' }] }) });
			const remote = connection([{ session: URI.parse('copilotcli:/remote-owner'), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(remoteChat), kind: 'peer' }] }]);
			const disconnected = connection([{ session: URI.parse('copilotcli:/disconnected-owner'), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(disconnectedChat), kind: 'peer' }] }]);
			const remoteHosts = upcastPartial<IRemoteAgentHostService>({
				connections: [
					{ address: 'remote.example:1', name: 'remote', status: RemoteAgentHostConnectionStatus.connected },
					{ address: 'disconnected.example:1', name: 'disconnected', status: RemoteAgentHostConnectionStatus.disconnected },
				],
				getConnectionByAuthority: authority => authority === agentHostAuthority('remote.example:1') ? remote : authority === agentHostAuthority('disconnected.example:1') ? disconnected : undefined,
			});
			const owner = async (chat: string) => (await resolveAgentHostChatOwner(URI.parse(chat), local, remoteHosts, new NullLogService(), AGENT_HOST_CHAT_OWNER_TIMEOUT_MS))?.toString();

			assert.deepStrictEqual({
				localPeer: await owner(peer),
				localDefault: await owner(defaultChat),
				subscribed: await owner(subscribedChat),
				remote: await owner(remoteChat),
				disconnected: await owner(disconnectedChat),
				unknown: await owner(buildChatUri(encoded, 'unknown')),
				// A legacy reference holding a bare session URI opens that session.
				bareSession: await owner('copilotcli:/bare-session'),
			}, {
				localPeer: 'copilotcli:/local-owner',
				localDefault: 'copilotcli:/local-owner',
				subscribed: 'copilotcli:/subscribed-owner',
				remote: 'copilotcli:/remote-owner',
				disconnected: undefined,
				unknown: undefined,
				bareSession: 'copilotcli:/bare-session',
			});
		});

		test('queries hosts in parallel with a per-host timeout and keeps the local-then-remote preference', async () => {
			const chat = buildChatUri(encoded, 'contested');
			const stalled = new FakeConnection([]);
			stalled.listSessions = () => new Promise<IAgentSessionMetadata[]>(() => { });
			const failing = new FakeConnection([]);
			failing.listSessions = async () => { throw new Error('host unavailable'); };
			const log = new TraceLog();
			const owner = async (local: FakeConnection, ...remotes: FakeConnection[]) => (await resolveAgentHostChatOwner(URI.parse(chat), local, remoteHostsOf(...remotes), log, 20))?.toString();

			assert.deepStrictEqual({
				localWins: await owner(connection([record('copilotcli:/local-owner', chat)]), connection([record('copilotcli:/remote-owner', chat)])),
				firstRemoteWins: await owner(connection([]), connection([record('copilotcli:/first-remote', chat)]), connection([record('copilotcli:/second-remote', chat)])),
				pastStalledAndFailingHosts: await owner(stalled, failing, connection([record('copilotcli:/reachable-remote', chat)])),
				traces: log.traces.map(trace => trace.replace(/^\[AgentHostChatOwner\] (\S+) .*$/, '$1')),
			}, {
				localWins: 'copilotcli:/local-owner',
				firstRemoteWins: 'copilotcli:/first-remote',
				pastStalledAndFailingHosts: 'copilotcli:/reachable-remote',
				traces: ['remote-0.example:1', 'local'],
			});
		});
	});
});
