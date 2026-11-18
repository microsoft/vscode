/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatRequestHistoryService } from '../../../../../workbench/contrib/chat/common/requestHistory/chatRequestHistoryService.js';
import { IChatDeletedEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChatMovedEvent, ISessionReplacedEvent } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { ChatRequestHistorySessionsContribution } from '../../browser/chatRequestHistorySessions.contribution.js';

suite('ChatRequestHistorySessionsContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const client = (path: string, chat?: string) => URI.from({ scheme: 'agent-host-copilotcli', path, fragment: chat });
	const link = (path: string, chat: string | undefined, turn: string) => buildOpenSessionLinkUri(URI.from({ scheme: 'copilotcli', path }), chat, turn, 'local');

	function setup(listed: ISession[] = []) {
		const onDidDeleteSession = store.add(new Emitter<ISession>());
		const onDidDeleteChat = store.add(new Emitter<IChatDeletedEvent>());
		const onDidMoveChat = store.add(new Emitter<IChatMovedEvent>());
		const onDidReplaceSession = store.add(new Emitter<ISessionReplacedEvent>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidDeleteSession = onDidDeleteSession.event;
			override readonly onDidDeleteChat = onDidDeleteChat.event;
			override readonly onDidMoveChat = onDidMoveChat.event;
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override readonly onDidChangeSessions = Event.None;
			override getSessions(): ISession[] { return listed; }
		};
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResourceIdentity(resource: URI): IAgentHostSessionIdentity | undefined {
				return resource.scheme === 'agent-host-copilotcli' ? { backendSession: URI.from({ scheme: 'copilotcli', path: resource.path }), connectionAuthority: 'local' } : undefined;
			}
		};
		const history = store.add(new ChatRequestHistoryService(store.add(new InMemoryStorageService()), new TestConfigurationService()));
		store.add(new ChatRequestHistorySessionsContribution(sessionsManagementService, history, connectionsService, new class extends mock<IWorkbenchEnvironmentService>() { override readonly remoteAuthority = undefined; }));
		const record = (prompt: string, path: string, chat: string | undefined, chatResource = client(path, chat).toString()) =>
			history.record({ prompt, timestamp: history.entries.get().length, link: link(path, chat, prompt), chatResource });
		return { history, record, onDidDeleteSession, onDidDeleteChat, onDidMoveChat, onDidReplaceSession };
	}

	test('entries take the title the Sessions list shows for their chat, and follow its renames', () => {
		const sessionTitle = observableValue('sessionTitle', 'Generated title');
		const mainChat = upcastPartial<IChat>({ resource: client('/s'), title: observableValue('mainChatTitle', 'first request') });
		const peer = upcastPartial<IChat>({ resource: client('/s', 'peer'), title: observableValue('peerTitle', 'Peer chat') });
		const { history, record } = setup([upcastPartial<ISession>({
			resource: client('/s'),
			title: sessionTitle,
			mainChat: observableValue('mainChat', mainChat),
			chats: observableValue('chats', [mainChat, peer]),
		})]);
		record('in main chat', '/s', undefined);
		record('in peer chat', '/s', 'peer');
		sessionTitle.set('Renamed session', undefined);
		assert.deepStrictEqual(history.entries.get().map(entry => `${entry.prompt}: ${entry.title}`), [
			'in peer chat: Peer chat',
			'in main chat: Renamed session',
		]);
	});

	test('requests follow moved and replaced chats and are forgotten with deleted chats and sessions, whichever window recorded them', () => {
		const { history, record, onDidDeleteSession, onDidDeleteChat, onDidMoveChat, onDidReplaceSession } = setup();
		const session = (path: string) => upcastPartial<ISession>({ resource: client(path) });
		const snapshot = () => history.entries.get().map(entry => `${entry.prompt} ${entry.chatResource} ${entry.link}`).sort();

		record('moved', '/a', 'peer');
		record('replaced', '/draft', undefined);
		record('deleted-chat', '/b', 'peer');
		// Another window recorded this one under its own resource for the chat.
		record('deleted-session', '/c', 'other', 'vscode-other-window:/c#other');
		record('kept', '/c2', undefined);

		onDidMoveChat.fire({ from: { session: session('/a'), chat: client('/a', 'peer') }, to: { session: session('/b'), chat: client('/b', 'peer-moved') } });
		onDidReplaceSession.fire({ from: session('/draft'), to: session('/real'), chats: new ResourceMap<URI>() });
		const afterMoves = snapshot();
		onDidDeleteChat.fire({ session: session('/b'), sessionResource: client('/b'), chatResource: client('/b', 'peer') });
		onDidDeleteSession.fire(session('/c'));

		assert.deepStrictEqual({ afterMoves, afterDeletions: snapshot() }, {
			afterMoves: [
				`deleted-chat ${client('/b', 'peer')} ${link('/b', 'peer', 'deleted-chat')}`,
				`deleted-session vscode-other-window:/c#other ${link('/c', 'other', 'deleted-session')}`,
				`kept ${client('/c2')} ${link('/c2', undefined, 'kept')}`,
				`moved ${client('/b', 'peer-moved')} ${link('/b', 'peer-moved', 'moved')}`,
				`replaced ${client('/real')} ${link('/real', undefined, 'replaced')}`,
			],
			afterDeletions: [
				`kept ${client('/c2')} ${link('/c2', undefined, 'kept')}`,
				`moved ${client('/b', 'peer-moved')} ${link('/b', 'peer-moved', 'moved')}`,
				`replaced ${client('/real')} ${link('/real', undefined, 'replaced')}`,
			],
		});
	});
});
