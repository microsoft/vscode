/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority, createAgentHostResourceUriMapper, createEditorRemoteAgentHostResourceUriMapper, IAgentHostResourceUriMapper, identityAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestCopilotHomeService } from '../../../../../platform/environment/test/common/testCopilotHomeService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatContextPickService, isChatContextPickerPickItem } from '../../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { createChatReferenceVariableEntry, withSessionContextSource } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ICopilotHomeService } from '../../../../../workbench/services/environment/common/copilotHomeService.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { SessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { SessionReferenceContextPicker } from '../../browser/sessionReferenceContext.js';

suite('SessionReferenceContext', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(resource: string, title: string, updated: number, providerId = 'local-agent-host', harness = 'copilot', status = SessionStatus.Completed): ISession {
		const uri = URI.parse(resource);
		const chat = upcastPartial<IChat>({ resource: uri });
		return upcastPartial<ISession>({
			resource: uri, providerId, harness, sessionId: resource,
			title: constObservable(title), status: constObservable(status),
			updatedAt: constObservable(new Date(updated)), mainChat: constObservable(chat), icon: Codicon.copilot,
		});
	}

	const local = session('agent-host-copilotcli:/protocol-session', 'Local source', 2);
	const legacy = session('copilotcli:/legacy-sdk-id', 'Legacy source', 1, 'legacy');
	const remote = session('remote-host-one-copilotcli:/protocol-session', 'Remote source', 3, 'agenthost-one');
	const sources = [legacy, local, remote, session('remote-other-copilotcli:/other', 'Other host', 4, 'agenthost-other'), session('agent-host-claude:/claude', 'Claude', 5, 'local-agent-host', 'claude')];
	const backendChat = URI.parse('ahp-chat:/opaque-chat-unrelated-to-session-or-sdk-id');

	function createPicker(initialSession: ISession = session('agent-host-copilotcli:/draft', '', 0, 'local-agent-host', 'copilot', SessionStatus.Untitled), resourceUris: IAgentHostResourceUriMapper = identityAgentHostResourceUriMapper) {
		let target: { session: ISession; chat: IChat } | undefined = { session: initialSession, chat: initialSession.mainChat.get() };
		let hidden = false;
		let backendAvailable = true;
		let preparingContainer = false;
		const warnings: string[] = [];
		const localConnection = upcastPartial<IAgentConnection>({ resourceUris });
		const remoteConnection = upcastPartial<IAgentConnection>({ resourceUris: createAgentHostResourceUriMapper('host-one') });
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: URI.parse('vscode-chat-session:/placeholder') }),
		});
		const providers = ['local-agent-host', 'agenthost-one', 'agenthost-other'].map(id => upcastPartial<IAgentHostSessionsProvider>({
			id,
			remoteAddress: id === 'agenthost-one' ? 'host-one' : id === 'agenthost-other' ? 'other' : undefined,
			getBackendChatResource: () => backendAvailable ? backendChat : undefined,
			isDevContainerRequested: () => preparingContainer,
		}));
		const instantiationService = store.add(new TestInstantiationService());
		const providersService = store.add(new SessionsProvidersService(upcastPartial<ILifecycleService>({ willShutdown: false })));
		for (const provider of providers) {
			store.add(providersService.registerProvider(provider));
		}
		store.add(providersService.registerProvider(upcastPartial<ISessionsProvider>({ id: 'local' })));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionItems: async function* () { } }));
		instantiationService.stub(ICopilotHomeService, new TestCopilotHomeService(URI.file('/home/test')));
		instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({ connections: [] }));
		const contribution = store.add(new SessionReferenceContextPicker(
			widget, () => target,
			new ChatContextPickService(),
			upcastPartial<ISessionsManagementService>({ getSessions: () => sources }),
			providersService,
			upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResourceIdentity: () => undefined,
				getConnectionByAuthority: authority => authority === 'local'
					? localConnection : authority === 'host-one' ? remoteConnection : undefined,
			}),
			upcastPartial<IChatEntitlementService>({ get sentiment() { return { hidden }; } }),
			upcastPartial<INotificationService>({ warn: message => warnings.push(String(message)) }),
			instantiationService,
		));
		return {
			widget, contribution, warnings,
			set target(value: { session: ISession; chat: IChat } | undefined) { target = value; },
			set hidden(value: boolean) { hidden = value; },
			set backendAvailable(value: boolean) { backendAvailable = value; },
			set preparingContainer(value: boolean) { preparingContainer = value; },
			async picks() {
				const picker = contribution.asPicker(widget);
				assert.ok(picker.picks instanceof Promise);
				return (await picker.picks).filter(isChatContextPickerPickItem);
			},
		};
	}

	for (const status of [SessionStatus.Untitled, SessionStatus.Completed]) {
		test(`uses the scoped target and opaque backend identity before or after first send (${status})`, async () => {
			const target = session('agent-host-copilotcli:/target', '', 0, 'local-agent-host', 'copilot', status);
			const picker = createPicker(target);
			const picks = await picker.picks();
			assert.deepStrictEqual({
				enabled: picker.contribution.isEnabled(picker.widget),
				otherWidget: picker.contribution.isEnabled(upcastPartial<IChatWidget>({ location: ChatAgentLocation.Chat })),
				labels: picks.map(pick => pick.label),
				attachment: await picks[0].asAttachment(),
			}, {
				enabled: true, otherWidget: false,
				labels: ['Local source'],
				attachment: withSessionContextSource(createChatReferenceVariableEntry(backendChat, undefined, 'Local source'), 'local'),
			});
		});
	}

	test('filters by the actual host, excludes the owning session in peer chats, and requires advertised chat identity', async () => {
		const self = createPicker(local);
		self.target = { session: local, chat: upcastPartial<IChat>({ resource: local.resource.with({ fragment: 'peer' }) }) };
		const remotePicker = createPicker(session('remote-host-one-copilotcli:/draft', '', 0, 'agenthost-one'));
		const unresolved = createPicker();
		unresolved.backendAvailable = false;
		assert.deepStrictEqual({
			self: (await self.picks()).map(pick => pick.label),
			remote: (await remotePicker.picks()).map(pick => pick.label),
			unresolved: (await unresolved.picks()).map(pick => pick.label),
		}, { self: [], remote: ['Remote source'], unresolved: [] });
	});

	test('uses the chat harness instead of its parent session scheme and preserves other providers\' pickers', async () => {
		const copilotPeer = createPicker(session('agent-host-claude:/parent', '', 0, 'local-agent-host', 'claude'));
		copilotPeer.target = { session: session('agent-host-claude:/parent', '', 0, 'local-agent-host', 'claude'), chat: upcastPartial<IChat>({ resource: URI.parse('agent-host-claude:/parent#peer'), harness: 'copilot' }) };
		const claudePeer = createPicker();
		claudePeer.target = { session: local, chat: upcastPartial<IChat>({ resource: local.resource.with({ fragment: 'peer' }), harness: 'claude' }) };
		const localChat = createPicker(session('vscode-chat-session:/local', '', 0, 'local'));
		const hidden = createPicker();
		hidden.hidden = true;
		const container = createPicker();
		container.preparingContainer = true;
		const unresolved = createPicker();
		unresolved.target = undefined;
		assert.deepStrictEqual({
			enabled: [copilotPeer, claudePeer, localChat, hidden, container, unresolved].map(picker => picker.contribution.isEnabled(picker.widget)),
			claudePicks: await claudePeer.picks(),
			copilotPicks: (await copilotPeer.picks()).map(pick => pick.label),
		}, { enabled: [true, true, true, false, false, false], claudePicks: [], copilotPicks: ['Local source'] });
	});

	test('validates host changes without forbidding supported same-host cross-harness sends', () => {
		const picker = createPicker();
		const attachment = withSessionContextSource(createChatReferenceVariableEntry(backendChat, undefined, 'Source'), 'local');
		const sameHost = session('agent-host-claude:/target', '', 0, 'local-agent-host', 'claude');
		picker.target = { session: sameHost, chat: sameHost.mainChat.get() };
		const sameHostAccepted = picker.contribution.validateAttachments([attachment]);
		picker.target = { session: remote, chat: remote.mainChat.get() };
		assert.deepStrictEqual({ sameHostAccepted, otherHostAccepted: picker.contribution.validateAttachments([attachment]), warnings: picker.warnings.length }, {
			sameHostAccepted: true, otherHostAccepted: false, warnings: 1,
		});
	});

	test('uses the production editor-remote resource authority without confusing it with client-local context', async () => {
		const authority = agentHostAuthority('vscode-remote://wsl+Ubuntu');
		const picker = createPicker(undefined, createEditorRemoteAgentHostResourceUriMapper('wsl+Ubuntu', authority));
		const [pick] = await picker.picks();
		const attachment = await pick.asAttachment();
		assert.ok(attachment !== 'noop' && !Array.isArray(attachment) && attachment.kind === 'chatReference');
		assert.deepStrictEqual({
			attachment,
			sameHost: picker.contribution.validateAttachments([attachment]),
			clientLocal: picker.contribution.validateAttachments([withSessionContextSource(attachment, 'local')]),
		}, {
			attachment: withSessionContextSource(createChatReferenceVariableEntry(backendChat, undefined, 'Local source'), authority),
			sameHost: true, clientLocal: false,
		});
	});

	for (const change of ['target', 'hideAI', 'source']) {
		test(`rejects a stale selection after ${change} changes`, async () => {
			const picker = createPicker();
			const [pick] = await picker.picks();
			if (change === 'target') {
				picker.target = { session: remote, chat: remote.mainChat.get() };
			} else if (change === 'hideAI') {
				picker.hidden = true;
			} else {
				picker.backendAvailable = false;
			}
			assert.deepStrictEqual({ result: await pick.asAttachment(), warnings: picker.warnings.length }, { result: 'noop', warnings: 1 });
		});
	}
});
