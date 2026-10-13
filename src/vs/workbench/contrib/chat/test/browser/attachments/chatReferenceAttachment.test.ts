/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, IAgentHostService, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { AGENT_HOST_CHAT_OWNER_TIMEOUT_MS, resolveAgentHostChatOwner } from '../../../browser/agentSessions/agentHost/agentHostChatOwner.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus, StateComponents, type ComponentToState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetInstance } from '../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry, IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { timeout } from '../../../../../../base/common/async.js';
import { IOpener, IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../browser/labels.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatReferenceAttachmentWidget } from '../../../browser/attachments/chatAttachmentWidgets.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ILinkPresentationService } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { AgentHostOpenSessionLinkOpenerContribution } from '../../../browser/agentSessions/agentHost/openSessionLinkOpener.contribution.js';
import { ISessionSummaryHoverService } from '../../../browser/agentSessions/sessionSummaryHoverService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatRequestOriginService } from '../../../common/chatRequestOrigin.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';

suite('ChatReferenceAttachment', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			const owner = async (chat: string) => {
				const resolved = await resolveAgentHostChatOwner(URI.parse(chat), local, remoteHosts, new NullLogService(), AGENT_HOST_CHAT_OWNER_TIMEOUT_MS);
				return resolved && { session: resolved.session.toString(), defaultChat: resolved.defaultChat, connectionAuthority: resolved.connectionAuthority };
			};

			assert.deepStrictEqual({
				localPeer: await owner(peer),
				localDefault: await owner(defaultChat),
				subscribed: await owner(subscribedChat),
				remote: await owner(remoteChat),
				disconnected: await owner(disconnectedChat),
				unknown: await owner(buildChatUri(encoded, 'unknown')),
				// A legacy reference holding a bare session URI opens that session on whichever host has it.
				bareSession: await owner('copilotcli:/bare-session'),
			}, {
				localPeer: { session: 'copilotcli:/local-owner', defaultChat, connectionAuthority: 'local' },
				localDefault: { session: 'copilotcli:/local-owner', defaultChat, connectionAuthority: 'local' },
				subscribed: { session: 'copilotcli:/subscribed-owner', defaultChat: buildDefaultChatUri('copilotcli:/subscribed-owner'), connectionAuthority: 'local' },
				remote: { session: 'copilotcli:/remote-owner', defaultChat: undefined, connectionAuthority: 'remote.example__1' },
				disconnected: undefined,
				unknown: undefined,
				bareSession: { session: 'copilotcli:/bare-session', defaultChat: undefined, connectionAuthority: undefined },
			});
		});

		test('queries hosts in parallel with a per-host timeout and keeps the local-then-remote preference', async () => {
			const chat = buildChatUri(encoded, 'contested');
			const stalled = new FakeConnection([]);
			stalled.listSessions = () => new Promise<IAgentSessionMetadata[]>(() => { });
			const failing = new FakeConnection([]);
			failing.listSessions = async () => { throw new Error('host unavailable'); };
			const log = new TraceLog();
			const owner = async (local: FakeConnection, ...remotes: FakeConnection[]) => {
				const resolved = await resolveAgentHostChatOwner(URI.parse(chat), local, remoteHostsOf(...remotes), log, 20);
				return resolved && `${resolved.session.toString()} on ${resolved.connectionAuthority}`;
			};

			assert.deepStrictEqual({
				localWins: await owner(connection([record('copilotcli:/local-owner', chat)]), connection([record('copilotcli:/remote-owner', chat)])),
				firstRemoteWins: await owner(connection([]), connection([record('copilotcli:/first-remote', chat)]), connection([record('copilotcli:/second-remote', chat)])),
				pastStalledAndFailingHosts: await owner(stalled, failing, connection([record('copilotcli:/reachable-remote', chat)])),
				traces: log.traces.map(trace => trace.replace(/^\[AgentHostChatOwner\] (\S+) .*$/, '$1')),
			}, {
				localWins: 'copilotcli:/local-owner on local',
				firstRemoteWins: 'copilotcli:/first-remote on remote-0.example__1',
				pastStalledAndFailingHosts: 'copilotcli:/reachable-remote on remote-1.example__1',
				traces: ['remote-0.example:1', 'local'],
			});
		});
	});

	suite('chip', () => {
		const owner = 'copilotcli:/chip-owner';
		const recordedDefault = buildChatUri(owner, 'main');
		const defaultIdPeer = buildDefaultChatUri(owner);
		const peer = buildChatUri(owner, 'peer');

		/** Clicks a chip for `chat` whose owner session's state (as the protocol client hands it over) advertises `recordedDefault`. */
		async function openedLinkFor(chat: string): Promise<string[]> {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const opened: string[] = [];
			const state = upcastPartial<SessionState>({ defaultChat: recordedDefault, chats: [recordedDefault, defaultIdPeer, peer].map(resource => ({ resource, title: '', status: SessionStatus.Idle, modifiedAt: '' })) });
			instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>({
				getActiveSubscriptions: () => [{ resource: URI.parse(owner), kind: StateComponents.Session, refCount: 1, holders: [], status: 'snapshot' }],
				getSubscriptionUnmanaged: <T extends StateComponents>() => upcastPartial<IAgentSubscription<ComponentToState[T]>>({ value: state as ComponentToState[T] }),
				listSessions: async () => [],
			}));
			instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({ connections: [] }));
			instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({ open: async target => { opened.push(target.toString()); return true; } }));
			const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const container = document.createElement('div');
			const widget = store.add(instantiationService.createInstance(ChatReferenceAttachmentWidget, createChatReferenceVariableEntry(URI.parse(chat), 'turn-1', 'Chat'), undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, labels));
			widget.element.click();
			await timeout(0);
			return opened;
		}

		test('opens the session for the advertised default chat and leaves out an unaddressable default-id peer', async () => {
			assert.deepStrictEqual({
				recordedDefault: await openedLinkFor(recordedDefault),
				defaultIdPeer: await openedLinkFor(defaultIdPeer),
				peer: await openedLinkFor(peer),
			}, {
				recordedDefault: ['agent-host-session://copilotcli/chip-owner?connectionAuthority=local'],
				defaultIdPeer: [],
				peer: ['agent-host-session://copilotcli/chip-owner?connectionAuthority=local&chat=peer'],
			});
		});

		test('opens local and remote chats on their owning connection when both hosts have the same native session id', async () => {
			const shared = 'copilotcli:/shared';
			const localPeer = buildChatUri(shared, 'local-peer');
			const remotePeer = buildChatUri(shared, 'remote-peer');
			const remoteAddress = 'remote.example:1';
			const remoteAuthority = agentHostAuthority(remoteAddress);
			const sessionRecord = (chat: string): IAgentSessionMetadata => ({ session: URI.parse(shared), provider: 'copilotcli', startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(chat), kind: 'peer' }] });
			class Host extends mock<IAgentConnection>() {
				constructor(private readonly _chat: string) { super(); }
				override getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] { return []; }
				override async listSessions(): Promise<IAgentSessionMetadata[]> { return [sessionRecord(this._chat)]; }
			}
			const local = new Host(localPeer);
			const remote = new Host(remotePeer);

			// The editor-window opener for the chip's links: it maps a backend
			// session to the client session of the connection the link names.
			let linkOpener: IOpener | undefined;
			const openedSessions: string[] = [];
			const clientSessions = new Map<string, URI>();
			store.add(new AgentHostOpenSessionLinkOpenerContribution(
				new class extends mock<IOpenerService>() {
					override registerOpener(opener: IOpener): IDisposable { linkOpener = opener; return Disposable.None; }
				}(),
				new class extends mock<IChatWidgetService>() {
					override async openSession(resource: URI): Promise<IChatWidget | undefined> { openedSessions.push(resource.toString()); return upcastPartial<IChatWidget>({}); }
				}(),
				new class extends mock<IChatSessionsService>() { override async activateChatSessionItemProvider(): Promise<void> { } }(),
				store.add(new ChatRequestOriginService()),
				new class extends mock<ILinkPresentationService>() { override registerLinkPresentationProvider(): IDisposable { return Disposable.None; } }(),
				new NullLogService(),
				new class extends mock<ISessionSummaryHoverService>() { override registerProvider(): IDisposable { return Disposable.None; } }(),
				new class extends mock<IPathService>() { }(),
				new class extends mock<IAgentHostConnectionsService>() {
					override readonly ambientConnection = local;
					override getConnectionByAuthority(authority: string): IAgentConnection | undefined { return authority === remoteAuthority ? remote : undefined; }
					override findSessionResource(resource: URI, authority = AMBIENT_AGENT_HOST_AUTHORITY): URI | undefined { return clientSessions.get(`${authority} ${resource}`); }
					override registerSessionResource(resource: URI, authority = AMBIENT_AGENT_HOST_AUTHORITY, provider?: string): URI {
						const clientSession = resource.with({ scheme: `${authority === AMBIENT_AGENT_HOST_AUTHORITY ? 'agent-host-' : `remote-${authority}-`}${provider}` });
						clientSessions.set(`${authority} ${resource}`, clientSession);
						return clientSession;
					}
				}(),
			));

			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>({
				getActiveSubscriptions: () => local.getActiveSubscriptions(),
				listSessions: () => local.listSessions(),
			}));
			instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({
				connections: [{ address: remoteAddress, name: 'remote', status: RemoteAgentHostConnectionStatus.connected }],
				getConnectionByAuthority: authority => authority === remoteAuthority ? remote : undefined,
			}));
			const links: string[] = [];
			instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
				open: async target => {
					links.push(target.toString());
					return linkOpener!.open(target);
				},
			}));
			const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const click = async (chat: string) => {
				const widget = store.add(instantiationService.createInstance(ChatReferenceAttachmentWidget, createChatReferenceVariableEntry(URI.parse(chat), 'turn-1', 'Chat'), undefined, { shouldFocusClearButton: false, supportsDeletion: false }, document.createElement('div'), labels));
				widget.element.click();
				await timeout(0);
			};

			await click(remotePeer);
			await click(localPeer);

			assert.deepStrictEqual({ links, openedSessions }, {
				links: [
					'agent-host-session://copilotcli/shared?connectionAuthority=remote.example__1&chat=remote-peer',
					'agent-host-session://copilotcli/shared?connectionAuthority=local&chat=local-peer',
				],
				openedSessions: [
					'remote-remote.example__1-copilotcli:/shared#remote-peer',
					'agent-host-copilotcli:/shared#local-peer',
				],
			});
		});
	});
});
