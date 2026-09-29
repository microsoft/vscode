/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAgentHostSessionsProvider, IAgentMergeClientState } from '../../common/agentHostSessionsProvider.js';
import { getSessionAgentMergeStateObservable } from '../../browser/sessionAgentMerge.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession } from '../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../services/sessions/common/sessionsProvider.js';

suite('sessionAgentMerge', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the Agent Merge state of the folder a chat works in, sharing the session folder with the main chat', () => {
		const requests: Array<string | undefined> = [];
		const provider: ISessionsProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'local-agent-host';
			override getAgentMergeClientStateObservable(_sessionId: string, chat?: URI): IObservable<IAgentMergeClientState | undefined> {
				requests.push(chat?.toString());
				return constObservable({ enabled: chat !== undefined });
			}
		};
		const providers = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === provider.id ? provider as T : undefined;
			}
		};
		const mainChat = { resource: URI.parse('agent-host-session:/session#main') } as IChat;
		const peerChat = { resource: URI.parse('agent-host-session:/session#peer') } as IChat;
		const session = { sessionId: 'session', providerId: provider.id, mainChat: constObservable(mainChat) } as unknown as ISession;

		const sessionFolder = getSessionAgentMergeStateObservable(session, providers);
		const mainChatFolder = getSessionAgentMergeStateObservable(session, providers, mainChat);
		const peerChatFolder = getSessionAgentMergeStateObservable(session, providers, peerChat);
		const peerChatFolderAgain = getSessionAgentMergeStateObservable(session, providers, peerChat);

		assert.deepStrictEqual({
			requests,
			mainChatSharesSessionFolder: mainChatFolder === sessionFolder,
			peerChatCached: peerChatFolderAgain === peerChatFolder,
			enabled: [sessionFolder.get()?.enabled, peerChatFolder.get()?.enabled],
		}, {
			requests: [undefined, peerChat.resource.toString()],
			mainChatSharesSessionFolder: true,
			peerChatCached: true,
			enabled: [false, true],
		});
	});
});
