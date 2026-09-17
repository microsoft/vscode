/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { PRE_EXISTING_SESSION_URI, ScriptedMockAgent } from './mockAgent.js';

suite('Scripted mock agent workspace', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('restored session and chat catalogs preserve the configured real workspace', async () => {
		const workspace = URI.file(join(process.cwd(), '.build', 'scripted-mock-workspace'));
		const agent = store.add(new ScriptedMockAgent(workspace.fsPath));
		const [sessions, chats, session, chat] = await Promise.all([
			agent.listSessions(), agent.listExternalChats(), agent.getSessionMetadata(PRE_EXISTING_SESSION_URI),
			agent.getChatMetadata(URI.parse(buildDefaultChatUri(PRE_EXISTING_SESSION_URI)), PRE_EXISTING_SESSION_URI),
		]);
		assert.deepStrictEqual({
			sessions: sessions.map(session => session.project?.uri.toString()),
			chats: chats.map(chat => chat.project?.uri.toString()),
			session: session?.project?.uri.toString(), chat: chat?.project?.uri.toString(),
		}, {
			sessions: sessions.map(() => workspace.toString()), chats: chats.map(() => workspace.toString()),
			session: workspace.toString(), chat: workspace.toString(),
		});
	});

	test('the default virtual project remains available without a configured workspace', async () => {
		const agent = store.add(new ScriptedMockAgent(''));
		assert.strictEqual((await agent.getSessionMetadata(PRE_EXISTING_SESSION_URI))?.project?.uri.toString(), 'mock-project:/mock');
	});
});
