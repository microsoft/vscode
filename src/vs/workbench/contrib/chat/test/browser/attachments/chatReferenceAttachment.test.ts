/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, IAgentHostService, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConnectionsService } from '../../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import type { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { agentHostAuthority, identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
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
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
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
				chatReferenceMatched: registry.createWidget(chatReferenceEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement, undefined) === fake,
				genericMatched: registry.createWidget(genericEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement, undefined) === fake,
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
		const authority = 'remote.example__1';

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
		class TraceLog extends NullLogService {
			readonly traces: string[] = [];
			override trace(message: string): void {
				this.traces.push(message);
			}
		}

		test('resolves owners on the given connection from held state, then its session records, never from the chat URI', async () => {
			const connection = new FakeConnection([
				{ session: URI.parse('copilotcli:/record-owner'), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(defaultChat), kind: 'default' }, { chat: URI.parse(peer), kind: 'peer' }] },
			], { session: 'copilotcli:/subscribed-owner', state: upcastPartial<SessionState>({ defaultChat: buildDefaultChatUri('copilotcli:/subscribed-owner'), chats: [{ resource: subscribedChat, title: '', status: SessionStatus.Idle, modifiedAt: '' }] }) });
			const owner = async (chat: string) => {
				const resolved = await resolveAgentHostChatOwner(URI.parse(chat), connection, authority, new NullLogService(), AGENT_HOST_CHAT_OWNER_TIMEOUT_MS);
				return resolved && { session: resolved.session.toString(), defaultChat: resolved.defaultChat, connectionAuthority: resolved.connectionAuthority };
			};

			assert.deepStrictEqual({
				peer: await owner(peer),
				default: await owner(defaultChat),
				subscribed: await owner(subscribedChat),
				unknown: await owner(buildChatUri(encoded, 'unknown')),
				// A legacy reference holding a bare session URI opens that session.
				bareSession: await owner('copilotcli:/bare-session'),
			}, {
				peer: { session: 'copilotcli:/record-owner', defaultChat, connectionAuthority: authority },
				default: { session: 'copilotcli:/record-owner', defaultChat, connectionAuthority: authority },
				subscribed: { session: 'copilotcli:/subscribed-owner', defaultChat: buildDefaultChatUri('copilotcli:/subscribed-owner'), connectionAuthority: authority },
				unknown: undefined,
				bareSession: { session: 'copilotcli:/bare-session', defaultChat: undefined, connectionAuthority: authority },
			});
		});

		test('gives up on a connection that fails or does not list its sessions in time', async () => {
			const stalled = new FakeConnection([]);
			stalled.listSessions = () => new Promise<IAgentSessionMetadata[]>(() => { });
			const failing = new FakeConnection([]);
			failing.listSessions = async () => { throw new Error('host unavailable'); };
			const log = new TraceLog();

			assert.deepStrictEqual({
				stalled: await resolveAgentHostChatOwner(URI.parse(peer), stalled, 'stalled', log, 20),
				failing: await resolveAgentHostChatOwner(URI.parse(peer), failing, 'failing', log, 20),
				traces: log.traces.map(trace => trace.replace(/^\[AgentHostChatOwner\] (\S+) .*$/, '$1')),
			}, {
				stalled: undefined,
				failing: undefined,
				traces: ['stalled', 'failing'],
			});
		});
	});

	suite('chip', () => {
		const shared = 'copilotcli:/shared';
		const sharedDefault = buildDefaultChatUri(shared);
		const sharedPeer = buildChatUri(shared, 'peer');
		const remoteAddress = 'remote.example:1';
		const remoteAuthority = agentHostAuthority(remoteAddress);
		const localSessionResource = URI.parse('agent-host-copilotcli:/containing');
		const remoteSessionResource = URI.parse(`remote-${remoteAuthority}-copilotcli:/containing`);

		/** A host that lists the shared session, with the same default and peer chat URIs on every host. */
		class Host extends mock<IAgentConnection>() {
			readonly onAgentHostStart = Event.None;
			readonly onAgentHostExit = Event.None;
			override readonly resourceUris = identityAgentHostResourceUriMapper;
			override getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] { return []; }
			override getSubscriptionUnmanaged<T extends StateComponents>(): IAgentSubscription<ComponentToState[T]> | undefined { return undefined; }
			override async listSessions(): Promise<IAgentSessionMetadata[]> {
				return [{ session: URI.parse(shared), provider: 'copilotcli', startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(sharedDefault), kind: 'default' }, { chat: URI.parse(sharedPeer), kind: 'peer' }] }];
			}
		}

		/**
		 * Clicks a chip for `chat` shown in the chat of `sessionResource`, with a
		 * local and a remote host that both list the shared session, and returns
		 * the link it hands to the opener and the client session the editor
		 * window's link opener opens for it.
		 */
		async function click(chat: string, sessionResource: URI | undefined): Promise<{ links: string[]; opened: string[] }> {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const remote = new Host();
			instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>(new Host()));
			instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({
				onDidChangeConnections: Event.None,
				connections: [{ address: remoteAddress, name: 'remote', clientId: 'remote', status: RemoteAgentHostConnectionStatus.connected }],
				getConnection: address => address === remoteAddress ? remote : undefined,
				getConnectionByAuthority: authority => authority === remoteAuthority ? remote : undefined,
			}));
			const connections = store.add(instantiationService.createInstance(AgentHostConnectionsService));
			instantiationService.stub(IAgentHostConnectionsService, connections);

			let linkOpener: IOpener | undefined;
			const opened: string[] = [];
			store.add(new AgentHostOpenSessionLinkOpenerContribution(
				new class extends mock<IOpenerService>() {
					override registerOpener(opener: IOpener): IDisposable { linkOpener = opener; return Disposable.None; }
				}(),
				new class extends mock<IChatWidgetService>() {
					override async openSession(resource: URI): Promise<IChatWidget | undefined> { opened.push(resource.toString()); return upcastPartial<IChatWidget>({}); }
				}(),
				new class extends mock<IChatSessionsService>() { override async activateChatSessionItemProvider(): Promise<void> { } }(),
				store.add(new ChatRequestOriginService()),
				new class extends mock<ILinkPresentationService>() { override registerLinkPresentationProvider(): IDisposable { return Disposable.None; } }(),
				new NullLogService(),
				new class extends mock<ISessionSummaryHoverService>() { override registerProvider(): IDisposable { return Disposable.None; } }(),
				new class extends mock<IPathService>() { }(),
				connections,
			));
			const links: string[] = [];
			instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
				open: async target => {
					links.push(target.toString());
					return linkOpener!.open(target);
				},
			}));
			const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const widget = store.add(instantiationService.createInstance(ChatReferenceAttachmentWidget, createChatReferenceVariableEntry(URI.parse(chat), 'turn-1', 'Chat'), sessionResource, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, document.createElement('div'), labels));
			widget.element.click();
			await timeout(0);
			return { links, opened };
		}

		test('opens the referenced chat on the host of the chat that shows the chip when both hosts list the same chat URIs', async () => {
			assert.deepStrictEqual({
				remoteDefault: await click(sharedDefault, remoteSessionResource),
				localDefault: await click(sharedDefault, localSessionResource),
				remotePeer: await click(sharedPeer, remoteSessionResource),
			}, {
				remoteDefault: {
					links: [`agent-host-session://copilotcli/shared?connectionAuthority=${remoteAuthority}`],
					opened: [`remote-${remoteAuthority}-copilotcli:/shared`],
				},
				localDefault: {
					links: ['agent-host-session://copilotcli/shared?connectionAuthority=local'],
					opened: ['agent-host-copilotcli:/shared'],
				},
				remotePeer: {
					links: [`agent-host-session://copilotcli/shared?connectionAuthority=${remoteAuthority}&chat=peer`],
					opened: [`remote-${remoteAuthority}-copilotcli:/shared#peer`],
				},
			});
		});

		test('builds no link when the chat that shows the chip has no agent host connection', async () => {
			assert.deepStrictEqual({
				notAgentHost: await click(sharedDefault, URI.parse('vscode-chat-session://local/containing')),
				disconnectedRemote: await click(sharedDefault, URI.parse('remote-gone.example__1-copilotcli:/containing')),
				noSession: await click(sharedDefault, undefined),
			}, {
				notAgentHost: { links: [], opened: [] },
				disconnectedRemote: { links: [], opened: [] },
				noSession: { links: [], opened: [] },
			});
		});

		test('opens the session for the advertised default chat and addresses a default-id peer by its full chat URI', async () => {
			const owner = 'copilotcli:/chip-owner';
			const recordedDefault = buildChatUri(owner, 'main');
			const defaultIdPeer = buildDefaultChatUri(owner);
			const peer = buildChatUri(owner, 'peer');
			const linkFor = async (chat: string) => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				const opened: string[] = [];
				const state = upcastPartial<SessionState>({ defaultChat: recordedDefault, chats: [recordedDefault, defaultIdPeer, peer].map(resource => ({ resource, title: '', status: SessionStatus.Idle, modifiedAt: '' })) });
				const local = upcastPartial<IAgentConnection>({
					getActiveSubscriptions: () => [{ resource: URI.parse(owner), kind: StateComponents.Session, refCount: 1, holders: [], status: 'snapshot' }],
					getSubscriptionUnmanaged: <T extends StateComponents>() => upcastPartial<IAgentSubscription<ComponentToState[T]>>({ value: state as ComponentToState[T] }),
					listSessions: async () => [],
				});
				instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
					resolveSessionResourceIdentity: resource => resource === localSessionResource ? { connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/containing') } : undefined,
					getConnectionByAuthority: authority => authority === 'local' ? local : undefined,
				}));
				instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({ open: async target => { opened.push(target.toString()); return true; } }));
				const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const widget = store.add(instantiationService.createInstance(ChatReferenceAttachmentWidget, createChatReferenceVariableEntry(URI.parse(chat), 'turn-1', 'Chat'), localSessionResource, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, document.createElement('div'), labels));
				widget.element.click();
				await timeout(0);
				return opened;
			};

			assert.deepStrictEqual({
				recordedDefault: await linkFor(recordedDefault),
				defaultIdPeer: await linkFor(defaultIdPeer),
				peer: await linkFor(peer),
			}, {
				recordedDefault: ['agent-host-session://copilotcli/chip-owner?connectionAuthority=local'],
				defaultIdPeer: ['agent-host-session://copilotcli/chip-owner?connectionAuthority=local&chat=ahp-chat%3A%2F%2Fdefault%2FY29waWxvdGNsaTovY2hpcC1vd25lcg'],
				peer: ['agent-host-session://copilotcli/chip-owner?connectionAuthority=local&chat=peer'],
			});
		});
	});
});
