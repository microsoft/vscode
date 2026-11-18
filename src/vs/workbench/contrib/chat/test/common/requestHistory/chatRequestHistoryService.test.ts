/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { canOpenChatRequestHistoryEntryIn, chatRequestHistoryLinkMatches, getChatRequestHistoryLinkTarget, IChatRequestHistoryEntry, IChatRequestHistoryRecord, MAX_CHAT_REQUEST_HISTORY_ENTRIES, MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH, retargetChatRequestHistoryLink, searchChatRequestHistory } from '../../../common/requestHistory/chatRequestHistory.js';
import { ChatRequestHistoryService } from '../../../common/requestHistory/chatRequestHistoryService.js';

suite('ChatRequestHistory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.parse('copilotcli:/session-1');

	function record(prompt: string, timestamp: number, overrides: Partial<IChatRequestHistoryRecord> = {}): IChatRequestHistoryRecord {
		return {
			prompt,
			timestamp,
			link: buildOpenSessionLinkUri(session, undefined, `turn-${timestamp}`, 'local'),
			chatResource: 'agent-host-copilotcli:/session-1',
			...overrides,
		};
	}

	function createService(storage: InMemoryStorageService, configuration = new TestConfigurationService()): ChatRequestHistoryService {
		return store.add(new ChatRequestHistoryService(storage, configuration));
	}

	function prompts(entries: readonly IChatRequestHistoryEntry[]): string[] {
		return entries.map(entry => entry.prompt);
	}

	test('search matches every term in the prompt, chat title, or host, newest first', () => {
		const entries = [
			{ ...record('Fix the login redirect', 1, { title: 'Auth bugs', host: 'Local' }), id: 'a' },
			{ ...record('Add telemetry for login', 3, { title: 'Metrics', host: 'devbox' }), id: 'b' },
			{ ...record('Refactor the parser', 2, { title: 'Parser work', host: 'devbox' }), id: 'c' },
		];
		assert.deepStrictEqual({
			all: prompts(searchChatRequestHistory(entries, '')),
			login: prompts(searchChatRequestHistory(entries, 'LOGIN')),
			allTerms: prompts(searchChatRequestHistory(entries, 'login devbox')),
			title: prompts(searchChatRequestHistory(entries, 'auth')),
			limited: prompts(searchChatRequestHistory(entries, '', { limit: 1 })),
			since: prompts(searchChatRequestHistory(entries, '', { since: 2 })),
		}, {
			all: ['Add telemetry for login', 'Refactor the parser', 'Fix the login redirect'],
			login: ['Add telemetry for login', 'Fix the login redirect'],
			allTerms: ['Add telemetry for login'],
			title: ['Fix the login redirect'],
			limited: ['Add telemetry for login'],
			since: ['Add telemetry for login', 'Refactor the parser'],
		});
	});

	test('a request link follows its chat to another session, keeping its turn and host', () => {
		const link = buildOpenSessionLinkUri(session, 'peer', 'turn-1', 'devbox');
		const target = getChatRequestHistoryLinkTarget(link)!;
		const moved = retargetChatRequestHistoryLink(link, { backendSession: URI.parse('copilotcli:/session-2'), connectionAuthority: 'devbox', chatId: undefined });
		assert.deepStrictEqual({
			moved,
			matchesChat: chatRequestHistoryLinkMatches(link, target, 'chat'),
			matchesOtherChat: chatRequestHistoryLinkMatches(link, { ...target, chatId: 'other' }, 'chat'),
			matchesSession: chatRequestHistoryLinkMatches(link, { ...target, chatId: 'other' }, 'session'),
			matchesOtherHost: chatRequestHistoryLinkMatches(link, { ...target, connectionAuthority: 'local' }, 'session'),
		}, {
			moved: buildOpenSessionLinkUri(URI.parse('copilotcli:/session-2'), undefined, 'turn-1', 'devbox'),
			matchesChat: true,
			matchesOtherChat: false,
			matchesSession: true,
			matchesOtherHost: false,
		});
	});

	test('a request on a window\'s own agent host opens only in windows connected where that window was, others from any window', () => {
		const entry = (connectionAuthority: string, remoteAuthority?: string): IChatRequestHistoryEntry => ({
			...record('request', 1, { link: buildOpenSessionLinkUri(session, undefined, 'turn-1', connectionAuthority) }),
			...(remoteAuthority ? { remoteAuthority } : {}),
			id: 'id',
		});
		const windows = [undefined, 'wsl+Ubuntu', 'ssh-remote+box'];
		assert.deepStrictEqual({
			local: windows.map(window => canOpenChatRequestHistoryEntryIn(entry('local'), window)),
			wsl: windows.map(window => canOpenChatRequestHistoryEntryIn(entry('local', 'wsl+Ubuntu'), window)),
			remoteHost: windows.map(window => canOpenChatRequestHistoryEntryIn(entry('devbox'), window)),
		}, {
			local: [true, false, false],
			wsl: [false, true, false],
			remoteHost: [true, true, true],
		});
	});

	test('windows share one history, and a request recorded again replaces its entry', () => {
		const storage = store.add(new InMemoryStorageService());
		const first = createService(storage);
		const second = createService(storage);
		first.record(record('first', 1));
		second.record(record('second', 2));
		first.record(record('first, edited', 3, { link: record('first', 1).link }));
		assert.deepStrictEqual({
			first: prompts(first.entries.get()),
			second: prompts(second.entries.get()),
			reloaded: prompts(createService(storage).entries.get()),
		}, {
			first: ['first, edited', 'second'],
			second: ['first, edited', 'second'],
			reloaded: ['first, edited', 'second'],
		});
	});

	test('keeps the newest entries and truncates long prompts', () => {
		const service = createService(store.add(new InMemoryStorageService()));
		for (let i = 0; i <= MAX_CHAT_REQUEST_HISTORY_ENTRIES; i++) {
			service.record(record(i === MAX_CHAT_REQUEST_HISTORY_ENTRIES ? 'x'.repeat(MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH + 1) : `request ${i}`, i));
		}
		const entries = service.entries.get();
		assert.deepStrictEqual({
			count: entries.length,
			newestLength: entries[0].prompt.length,
			oldest: entries.at(-1)?.prompt,
		}, {
			count: MAX_CHAT_REQUEST_HISTORY_ENTRIES,
			newestLength: MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH,
			oldest: 'request 1',
		});
	});

	for (const setting of [ChatConfiguration.RequestHistoryEnabled, ChatAIDisabledSettingId]) {
		test(`neither records nor returns requests while ${setting} turns it off, and keeps what it has`, () => {
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			const service = createService(store.add(new InMemoryStorageService()), configuration);
			const toggle = (off: boolean) => {
				configuration.setUserConfiguration(setting, setting === ChatAIDisabledSettingId ? off : !off);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === setting }));
			};
			service.record(record('kept', 1));
			toggle(true);
			service.record(record('dropped', 2));
			const whileOff = { entries: prompts(service.entries.get()), search: prompts(service.search('')) };
			toggle(false);
			assert.deepStrictEqual({ whileOff, afterwards: prompts(service.entries.get()) }, {
				whileOff: { entries: [], search: [] },
				afterwards: ['kept'],
			});
		});
	}

	test('updates, removes and clears entries in every window', () => {
		const storage = store.add(new InMemoryStorageService());
		const first = createService(storage);
		const second = createService(storage);
		first.record(record('one', 1));
		first.record(record('two', 2));
		first.record(record('three', 3));
		second.update(entry => entry.prompt === 'one' ? { title: 'Renamed' } : undefined);
		second.remove(entry => entry.prompt === 'two');
		const before = first.entries.get().map(entry => `${entry.prompt}:${entry.title}`);
		second.clear();
		assert.deepStrictEqual({ before, after: first.entries.get() }, {
			before: ['three:undefined', 'one:Renamed'],
			after: [],
		});
	});
});
