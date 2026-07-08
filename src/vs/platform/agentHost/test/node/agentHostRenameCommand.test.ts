/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { ActionType, type StateAction } from '../../common/state/sessionActions.js';
import { AH_META_TITLE_SOURCE_DB_KEY, buildChatUri, buildDefaultChatUri, SessionStatus, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { AgentHostRenameCompletionProvider, parseRenameCommand } from '../../node/agentHostRenameCommand.js';
import { AgentSession } from '../../common/agentService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { RenameLocalCommand } from '../../node/localCommands/renameLocalCommand.js';
import type { ILocalChatCommandContext } from '../../node/localCommands/localChatCommand.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

suite('agentHostRenameCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseRenameCommand', () => {
		test('matches lone /rename as empty title', () => {
			assert.strictEqual(parseRenameCommand('/rename'), '');
		});

		test('captures the trimmed title after a space', () => {
			assert.strictEqual(parseRenameCommand('/rename My New Title'), 'My New Title');
		});

		test('trims surrounding whitespace from the title', () => {
			assert.strictEqual(parseRenameCommand('/rename   spaced   '), 'spaced');
		});

		test('rejects /renamed (longer command)', () => {
			assert.strictEqual(parseRenameCommand('/renamed'), undefined);
		});

		test('rejects /rename-foo (no separator)', () => {
			assert.strictEqual(parseRenameCommand('/rename-foo'), undefined);
		});

		test('rejects leading whitespace', () => {
			assert.strictEqual(parseRenameCommand(' /rename x'), undefined);
		});

		test('case-sensitive', () => {
			assert.strictEqual(parseRenameCommand('/RENAME x'), undefined);
		});
	});

	suite('AgentHostRenameCompletionProvider', () => {
		const session = 'mock:/abc';

		function run(text: string, hasHistory = true, offset = text.length) {
			const provider = new AgentHostRenameCompletionProvider(() => hasHistory);
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
		}

		test('offers /rename for a lone "/" when the session has history', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/rename ']);
		});

		test('offers /rename when "/r" is typed', async () => {
			const items = await run('/r');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/rename ']);
		});

		test('omits /rename when the session has no history', async () => {
			const items = await run('/', false);
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when the typed prefix does not match', async () => {
			const items = await run('/zz');
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when input does not start with /', async () => {
			const items = await run('hello', true, 5);
			assert.deepStrictEqual(items, []);
		});

		test('attachment is Simple with command + description meta', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.attachment), [{
				type: MessageAttachmentKind.Simple,
				label: '/rename',
				_meta: { command: 'rename', description: 'Rename this chat' },
			}]);
		});
	});

	suite('RenameLocalCommand execution', () => {

		const sessionUri = AgentSession.uri('mock', 's1').toString();

		function setup() {
			const store = new DisposableStore();
			const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
			const dispatched: { channel: ProtocolURI; action: StateAction }[] = [];
			const persisted: { session: ProtocolURI; key: string; value: string }[] = [];
			const chatTitleUpdates: { session: ProtocolURI; chat: ProtocolURI; title: string }[] = [];
			const context: ILocalChatCommandContext = {
				logService: new NullLogService(),
				terminalManager: store.add(new TestAgentHostTerminalManager()),
				dispatch: (channel, action) => dispatched.push({ channel, action }),
				getState: channel => stateManager.getSessionState(channel),
				updateChatTitle: (session, chat, title) => chatTitleUpdates.push({ session, chat, title }),
				persistSessionFlag: (session, key, value) => persisted.push({ session, key, value }),
			};
			const command = store.add(new RenameLocalCommand(context));
			return { store, stateManager, dispatched, persisted, chatTitleUpdates, command };
		}

		test('a session-level /rename marks the title user-set (merging existing meta) and persists it', async () => {
			const { store, stateManager, dispatched, persisted, command } = setup();
			stateManager.createSession({
				resource: sessionUri, provider: 'mock', title: '', status: SessionStatus.Idle,
				createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
				_meta: { existing: 'keep' },
			});

			const work = command.tryHandle({ turnChannel: buildDefaultChatUri(sessionUri), turnId: 't1', text: '/rename Login validation fix' });
			assert.ok(work);
			await work();

			const titleActions = dispatched
				.filter(d => d.action.type === ActionType.SessionTitleChanged || d.action.type === ActionType.SessionMetaChanged)
				.map(d => d.action);
			assert.deepStrictEqual({ titleActions, persisted }, {
				titleActions: [
					{ type: ActionType.SessionTitleChanged, title: 'Login validation fix' },
					{ type: ActionType.SessionMetaChanged, _meta: { existing: 'keep', titleSource: 'user' } },
				],
				persisted: [
					{ session: sessionUri, key: 'customTitle', value: 'Login validation fix' },
					{ session: sessionUri, key: AH_META_TITLE_SOURCE_DB_KEY, value: 'user' },
				],
			});
			store.dispose();
		});

		test('a peer-chat /rename renames only that chat and leaves the session provenance untouched', async () => {
			const { store, dispatched, persisted, chatTitleUpdates, command } = setup();
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			const work = command.tryHandle({ turnChannel: peerChat, turnId: 't1', text: '/rename Side quest' });
			assert.ok(work);
			await work();

			assert.deepStrictEqual({
				markedUser: dispatched.some(d => d.action.type === ActionType.SessionMetaChanged),
				chatTitleUpdates,
				persisted,
			}, {
				markedUser: false,
				chatTitleUpdates: [{ session: sessionUri, chat: peerChat, title: 'Side quest' }],
				persisted: [{ session: sessionUri, key: `customChatTitle:${peerChat}`, value: 'Side quest' }],
			});
			store.dispose();
		});
	});
});
