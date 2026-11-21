/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionInfo, IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ChatRequestHistoryRecorder } from '../../../browser/requestHistory/chatRequestHistoryRecorder.js';
import { IChatRequestSubmittedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatChangeEvent, IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';
import { ChatRequestHistoryService } from '../../../common/requestHistory/chatRequestHistoryService.js';

suite('ChatRequestHistoryRecorder', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(windowRemoteAuthority?: string) {
		const onDidSubmitRequest = store.add(new Emitter<IChatRequestSubmittedEvent>());
		const onDidDisposeSession = store.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' | 'disposed' }>());
		const onDidDeleteChatSessionItem = store.add(new Emitter<URI>());
		const onDidChangeModel = store.add(new Emitter<IChatChangeEvent>());
		const onDidDisposeModel = store.add(new Emitter<void>());
		const models = new Map<string, IChatModel>();
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = onDidSubmitRequest.event;
			override readonly onDidDisposeSession = onDidDisposeSession.event;
			override getSession(resource: URI) { return models.get(resource.toString()); }
		};
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override readonly connections = [
				upcastPartial<IAgentHostConnectionInfo>({ authority: AMBIENT_AGENT_HOST_AUTHORITY, name: 'Local' }),
				upcastPartial<IAgentHostConnectionInfo>({ authority: 'devbox', name: 'Dev Box' }),
			];
			override resolveSessionResourceIdentity(resource: URI): IAgentHostSessionIdentity | undefined {
				const backendSession = URI.from({ scheme: 'copilotcli', path: resource.path });
				return resource.scheme === 'remote-devbox-copilotcli' ? { backendSession, connectionAuthority: 'devbox' }
					: resource.scheme === 'agent-host-copilotcli' ? { backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY }
						: undefined;
			}
		};
		const history = store.add(new ChatRequestHistoryService(store.add(new InMemoryStorageService()), new TestConfigurationService()));
		store.add(new ChatRequestHistoryRecorder(
			chatService,
			new class extends mock<IChatSessionsService>() { override readonly onDidDeleteChatSessionItem = onDidDeleteChatSessionItem.event; },
			history,
			connectionsService,
			new class extends mock<IAgentHostUntitledProvisionalSessionService>() { override async waitForPending() { return undefined; } },
			new class extends mock<ILabelService>() { override getHostLabel(_scheme: string, authority?: string) { return `WSL: ${authority}`; } },
			new class extends mock<IWorkbenchEnvironmentService>() { override readonly remoteAuthority = windowRemoteAuthority; },
			new NullLogService(),
		));

		const send = async (resource: URI, request: Partial<IChatRequestModel> & { readonly text: string }) => {
			const message = upcastPartial<IParsedChatRequest>({ text: request.text });
			models.set(resource.toString(), upcastPartial<IChatModel>({
				sessionResource: resource,
				title: 'Remote work',
				onDidChange: onDidChangeModel.event,
				onDidDispose: onDidDisposeModel.event,
				lastRequest: upcastPartial<IChatRequestModel>({ id: 'request-id', timestamp: 5, message, isHiddenFromTranscript: false, isRequestHiddenFromTranscript: false, ...request }),
			}));
			onDidSubmitRequest.fire({ chatSessionResource: resource, message });
			await timeout(0);
		};
		return { history, send, onDidChangeModel, onDidDeleteChatSessionItem };
	}

	test('records the requests the user sends to an agent host with a link to their turn, and follows their chat title', async () => {
		const { history, send, onDidChangeModel } = setup();
		const peerChat = URI.parse('remote-devbox-copilotcli:/session-1#peer');
		await send(peerChat, { text: '  Find the flaky test  ', id: 'turn-1' });
		await send(peerChat, { text: 'Automation', id: 'turn-2', isSystemInitiated: true });
		await send(peerChat, { text: 'Delegated', id: 'turn-3', origin: upcastPartial({}) });
		await send(URI.parse('vscode-chat-session:/local'), { text: 'Not on an agent host', id: 'turn-4' });
		onDidChangeModel.fire({ kind: 'setCustomTitle', title: 'Flaky test hunt' });

		assert.deepStrictEqual(history.entries.get().map(({ id: _id, ...entry }) => entry), [{
			prompt: 'Find the flaky test',
			timestamp: 5,
			link: buildOpenSessionLinkUri(URI.parse('copilotcli:/session-1'), 'peer', 'turn-1', 'devbox'),
			chatResource: peerChat.toString(),
			title: 'Flaky test hunt',
			host: 'Dev Box',
		}]);
	});

	test('a request on the agent host of a remote window remembers that window, and is not labeled as this computer', async () => {
		const { history, send } = setup('wsl+Ubuntu');
		await send(URI.parse('agent-host-copilotcli:/session-1'), { text: 'Build in WSL', id: 'turn-1' });
		await send(URI.parse('remote-devbox-copilotcli:/session-2'), { text: 'Build on the dev box', id: 'turn-2', timestamp: 6 });

		assert.deepStrictEqual(history.entries.get().map(entry => ({ prompt: entry.prompt, host: entry.host, remoteAuthority: entry.remoteAuthority })), [
			{ prompt: 'Build on the dev box', host: 'Dev Box', remoteAuthority: undefined },
			{ prompt: 'Build in WSL', host: 'WSL: wsl+Ubuntu', remoteAuthority: 'wsl+Ubuntu' },
		]);
	});

	test('a session deleted in the window forgets the requests of all its chats, a deleted chat only its own', async () => {
		const { history, send, onDidDeleteChatSessionItem } = setup();
		await send(URI.parse('remote-devbox-copilotcli:/session-1'), { text: 'Main chat', id: 'turn-1', timestamp: 1 });
		await send(URI.parse('remote-devbox-copilotcli:/session-1#peer'), { text: 'Peer chat', id: 'turn-2', timestamp: 2 });
		await send(URI.parse('remote-devbox-copilotcli:/session-2#peer'), { text: 'Other session peer', id: 'turn-3', timestamp: 3 });
		await send(URI.parse('remote-devbox-copilotcli:/session-2#kept'), { text: 'Other session kept', id: 'turn-4', timestamp: 4 });

		onDidDeleteChatSessionItem.fire(URI.parse('remote-devbox-copilotcli:/session-1'));
		onDidDeleteChatSessionItem.fire(URI.parse('remote-devbox-copilotcli:/session-2#peer'));

		assert.deepStrictEqual(history.entries.get().map(entry => entry.prompt), ['Other session kept']);
	});
});
