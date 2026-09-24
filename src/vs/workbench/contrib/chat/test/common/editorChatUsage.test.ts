/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { SessionType } from '../../common/chatSessionsService.js';

suite('EditorChatUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('empty history has no last-message age', () => {
		const usage = new EditorChatUsage(disposables.add(new InMemoryStorageService()));
		assert.deepStrictEqual(usage.getTelemetry(), {
			editorSessionsByProvider: '{}',
			editorMessages: 0,
			editorMessagesWithOtherSessionInProgress: 0,
			editorMessagesWithOtherSessionInProgressAcrossWindows: 0,
			editorLastMessageSecondsAgo: undefined,
		});
	});

	test('counts each provider start, every message, and both overlap kinds independently', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new EditorChatUsage(storage);
		usage.recordSubmission(SessionType.Local, true, false, false, 1000);
		usage.recordSubmission(SessionType.Local, false, true, false, 2000);
		usage.recordSubmission(SessionType.AgentHostCopilot, true, false, true, 3000);
		usage.recordSubmission(SessionType.AgentHostClaude, true, true, true, 4000);
		usage.recordSubmission(SessionType.AgentHostCodex, true, false, false, 5000);
		assert.deepStrictEqual(new EditorChatUsage(storage).getTelemetry(7599), {
			editorSessionsByProvider: '{"local":1,"copilot":1,"claude":1,"codex":1}',
			editorMessages: 5,
			editorMessagesWithOtherSessionInProgress: 2,
			editorMessagesWithOtherSessionInProgressAcrossWindows: 3,
			editorLastMessageSecondsAgo: 2,
		});
	});

	test('reads stored counters on each submission and preserves the latest known message date', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = new EditorChatUsage(storage);
		const second = new EditorChatUsage(storage);
		for (let index = 0; index < 20; index++) {
			(index % 2 ? first : second).recordSubmission(SessionType.Local, true, true, true, 20_000 - index * 1000);
		}
		assert.deepStrictEqual(second.getTelemetry(21_000), {
			editorSessionsByProvider: '{"local":20}',
			editorMessages: 20,
			editorMessagesWithOtherSessionInProgress: 20,
			editorMessagesWithOtherSessionInProgressAcrossWindows: 20,
			editorLastMessageSecondsAgo: 1,
		});
	});

	test('stores counters separately in machine-local shared application storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new EditorChatUsage(storage);
		usage.recordSubmission(SessionType.Local, true, true, false, 1000);
		usage.recordSubmission(SessionType.AgentHostCopilot, true, false, true, 2000);
		const keys = storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		assert.deepStrictEqual({
			shared: Object.fromEntries(keys.map(key => [key, storage.getNumber(key, StorageScope.APPLICATION_SHARED)])),
			application: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
			synced: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.USER),
		}, {
			shared: {
				'chat.editorUsage.sessions.local': 1,
				'chat.editorUsage.sessions.copilot': 1,
				'chat.editorUsage.messages': 2,
				'chat.editorUsage.messagesWithOtherSessionInProgress': 1,
				'chat.editorUsage.messagesWithOtherSessionInProgressAcrossWindows': 2,
				'chat.editorUsage.lastMessageDate': 2000,
			},
			application: [],
			synced: [],
		});
	});

	test('normalizes remote authorities and unknown providers, and clamps clock skew', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new EditorChatUsage(storage);
		for (const provider of ['remote-private-host-copilotcli', 'remote-private-host-claude', 'remote-private-host-codex', 'private-extension']) {
			usage.recordSubmission(provider, true, false, false, 5000);
		}
		assert.deepStrictEqual(usage.getTelemetry(4000), {
			editorSessionsByProvider: '{"remoteCopilot":1,"remoteClaude":1,"remoteCodex":1,"other":1}',
			editorMessages: 4,
			editorMessagesWithOtherSessionInProgress: 0,
			editorMessagesWithOtherSessionInProgressAcrossWindows: 0,
			editorLastMessageSecondsAgo: 0,
		});
	});
});
