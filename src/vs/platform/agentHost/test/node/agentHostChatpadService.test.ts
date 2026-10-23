/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostChatpadService, getChatpadNote, type IAgentHostChatpadSessions } from '../../node/agentHostChatpadService.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';

suite('AgentHostChatpadService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home');
	const first = URI.parse('copilot:/first');
	const second = URI.parse('copilot:/second');
	const firstNote = getChatpadNote(userHome, first);
	const secondNote = getChatpadNote(userHome, second);

	function createService() {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const storageService = disposables.add(new AgentHostStorageService(undefined, logService));
		const service = disposables.add(new AgentHostChatpadService(userHome, storageService, fileService, logService));
		const existing = new Set<string>();
		const sessions: IAgentHostChatpadSessions = {
			find: async session => existing.has(session) ? { provider: 'copilot' } : undefined,
		};
		const readNote = async (note: URI) => (await fileService.readFile(note)).value.toString();
		return { service, fileService, existing, sessions, readNote };
	}

	test('keeps the note in the scratch folder of the Chatpad chat while it exists', async () => {
		const { service, existing, sessions, readNote } = createService();

		const beforeClaim = await service.getChatpad(sessions);
		const claimed = await service.claim(first, sessions);
		const gone = await service.getChatpad(sessions);
		existing.add(first.toString());
		const pad = await service.getChatpad(sessions);

		assert.deepStrictEqual({
			beforeClaim,
			claimed,
			gone,
			pad: pad && { note: pad.note.toString(), session: pad.session.toString(), provider: pad.provider },
			isChatpad: [service.isChatpad(first.toString()), service.isChatpad(second.toString())],
			isNote: [service.isNote(firstNote), service.isNote(secondNote), service.isNote(URI.file('/home/other.md'))],
			content: await readNote(firstNote),
		}, {
			beforeClaim: undefined,
			claimed: true,
			gone: undefined,
			pad: { note: URI.file('/home/.copilot/chats/first/chatpad.md').toString(), session: first.toString(), provider: 'copilot' },
			isChatpad: [true, false],
			isNote: [true, false, false],
			content: '# Chatpad\n\n',
		});
	});

	test('keeps an existing Chatpad chat and replaces one that is gone', async () => {
		const { service, existing, sessions } = createService();

		await service.claim(first, sessions);
		existing.add(first.toString());
		const whileExists = await service.claim(second, sessions);
		const reclaim = await service.claim(first, sessions);
		existing.clear();
		const afterGone = await service.claim(second, sessions);

		assert.deepStrictEqual({
			whileExists,
			reclaim,
			afterGone,
			isChatpad: [service.isChatpad(first.toString()), service.isChatpad(second.toString())],
			isNote: [service.isNote(firstNote), service.isNote(secondNote)],
		}, {
			whileExists: false,
			reclaim: true,
			afterGone: true,
			isChatpad: [false, true],
			isNote: [false, true],
		});
	});

	test('appends text as its own lines without touching existing content, and only with a Chatpad chat', async () => {
		const { service, fileService, existing, sessions, readNote } = createService();

		const withoutChat = await service.append('lost', sessions).then(() => 'appended', () => 'failed');
		await service.claim(first, sessions);
		existing.add(first.toString());
		await service.append('first', sessions);
		await fileService.writeFile(firstNote, VSBuffer.fromString(`${await readNote(firstNote)}edited without newline`));
		await service.append('second\nthird', sessions);

		assert.deepStrictEqual({ withoutChat, content: await readNote(firstNote) }, {
			withoutChat: 'failed',
			content: '# Chatpad\n\nfirst\nedited without newline\nsecond\nthird\n',
		});
	});

	test('does not overwrite an existing note', async () => {
		const { service, fileService, existing, sessions, readNote } = createService();

		await fileService.writeFile(firstNote, VSBuffer.fromString('kept'));
		await service.claim(first, sessions);
		existing.add(first.toString());
		await service.getChatpad(sessions);

		assert.strictEqual(await readNote(firstNote), 'kept');
	});
});
