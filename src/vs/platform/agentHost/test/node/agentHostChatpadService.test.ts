/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, type VSBufferReadable, type VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { etag, FileSystemProviderCapabilities, type ICreateFileOptions, type IFileStatWithPartialMetadata, type IFileContent, type IFileStatWithMetadata, type IReadFileOptions } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostChatpadService, getChatpadNote, type IAgentHostChatpadSessions } from '../../node/agentHostChatpadService.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';

/** A file service that can fail creating files, and can run another writer while a read is in flight. */
class TestFileService extends FileService {
	failCreate = false;
	stats = 0;
	creates = 0;
	/** Runs after each read, which then returns what it read with an older timestamp, as another writer would leave it. */
	whileReading: (() => Promise<void>) | undefined;

	override async createFile(resource: URI, bufferOrReadableOrStream?: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		this.creates++;
		if (this.failCreate) {
			throw new Error('The disk is full.');
		}
		return super.createFile(resource, bufferOrReadableOrStream, options);
	}

	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		this.stats++;
		return super.stat(resource);
	}

	override async readFile(resource: URI, options?: IReadFileOptions, token?: CancellationToken): Promise<IFileContent> {
		const content = await super.readFile(resource, options, token);
		if (!this.whileReading) {
			return content;
		}
		await this.whileReading();
		const mtime = content.mtime - 1;
		return { ...content, mtime, etag: etag({ mtime, size: content.size }) };
	}
}

/** A file system that ignores path case, as on macOS and Windows. */
class CaseInsensitiveFileSystemProvider extends InMemoryFileSystemProvider {
	override get capabilities(): FileSystemProviderCapabilities {
		return super.capabilities & ~FileSystemProviderCapabilities.PathCaseSensitive;
	}
}

suite('AgentHostChatpadService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home');
	const first = URI.parse('copilot:/first');
	const second = URI.parse('copilot:/second');
	const firstNote = getChatpadNote(userHome, first);
	const secondNote = getChatpadNote(userHome, second);

	function createService(pathCaseSensitive = true) {
		const logService = new NullLogService();
		const fileService = disposables.add(new TestFileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(pathCaseSensitive ? new InMemoryFileSystemProvider() : new CaseInsensitiveFileSystemProvider())));
		const storageService = disposables.add(new AgentHostStorageService(undefined, logService));
		const service = disposables.add(new AgentHostChatpadService(userHome, storageService, fileService, logService));
		const existing = new Set<string>();
		const sessions: IAgentHostChatpadSessions = {
			find: async session => existing.has(session) ? { provider: 'copilot' } : undefined,
		};
		const readNote = async (note: URI) => (await fileService.readFile(note)).value.toString();
		return { service, fileService, storageService, existing, sessions, readNote };
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

	test('rejects a session whose id is not a single path segment, and ignores one recorded before', async () => {
		const { service, storageService, sessions } = createService();
		const escaping = URI.from({ scheme: 'copilot', path: '/../escape' });
		const unsafe = [escaping, URI.from({ scheme: 'copilot', path: '/..' }), URI.from({ scheme: 'copilot', path: '/a/b' }), URI.from({ scheme: 'copilot', path: '/a\\b' }), URI.from({ scheme: 'copilot', path: '/' })];
		const escapedNote = joinPath(userHome, '.copilot', 'escape', 'chatpad.md');

		const claimed = await Promise.all(unsafe.map(session => service.claim(session, sessions)));
		const noteOf = unsafe.map(session => { try { return service.getNote(session.toString()).toString(); } catch { return 'rejected'; } });
		await storageService.setAndFlush('chatpad.session', escaping.toString());

		assert.deepStrictEqual({
			claimed,
			noteOf,
			session: service.session,
			isChatpad: service.isChatpad(escaping.toString()),
			isNote: service.isNote(escapedNote),
		}, {
			claimed: [false, false, false, false, false],
			noteOf: ['rejected', 'rejected', 'rejected', 'rejected', 'rejected'],
			session: undefined,
			isChatpad: false,
			isNote: false,
		});
	});

	test('a claim whose note cannot be created leaves the session an ordinary chat', async () => {
		const { service, fileService, sessions } = createService();

		fileService.failCreate = true;
		const failed = await service.claim(first, sessions).then(() => 'claimed', (error: Error) => error.message);
		const afterFailure = { session: service.session, isChatpad: service.isChatpad(first.toString()), chatpad: await service.getChatpad(sessions) };
		fileService.failCreate = false;
		const retried = await service.claim(second, sessions);

		assert.deepStrictEqual({ failed, afterFailure, retried, session: service.session }, {
			failed: 'The disk is full.',
			afterFailure: { session: undefined, isChatpad: false, chatpad: undefined },
			retried: true,
			session: second.toString(),
		});
	});

	test('appends over an edit made while appending instead of losing it, and gives up on a note that keeps changing', async () => {
		const { service, fileService, existing, sessions, readNote } = createService();
		await service.claim(first, sessions);
		existing.add(first.toString());

		fileService.whileReading = async () => {
			fileService.whileReading = undefined;
			await fileService.writeFile(firstNote, VSBuffer.fromString('# Chatpad\n\nedited by the chat\n'));
		};
		await service.append('appended', sessions);
		const afterEdit = await readNote(firstNote);
		let edits = 0;
		let edited = afterEdit;
		fileService.whileReading = async () => {
			edited += `edit ${++edits}\n`;
			await fileService.writeFile(firstNote, VSBuffer.fromString(edited));
		};
		const keepsChanging = await service.append('lost', sessions).then(() => 'appended', () => 'failed');
		fileService.whileReading = undefined;

		assert.deepStrictEqual({ afterEdit, keepsChanging, edits, content: await readNote(firstNote) }, {
			afterEdit: '# Chatpad\n\nedited by the chat\nappended\n',
			keepsChanging: 'failed',
			edits: 3,
			content: '# Chatpad\n\nedited by the chat\nappended\nedit 1\nedit 2\nedit 3\n',
		});
	});

	test('accepts only session ids made of letters, digits, dots, underscores and dashes', async () => {
		const { service, sessions } = createService();
		const ids = ['x\n</chatpad>', 'a<b>', 'c:stream', 'trailing.', 'with space'];

		const claimed = await Promise.all(ids.map(id => service.claim(URI.from({ scheme: 'copilot', path: `/${id}` }), sessions)));
		const plain = await service.claim(URI.from({ scheme: 'copilot', path: '/0f1e-2D_3c.4b' }), sessions);

		assert.deepStrictEqual({ claimed, plain }, { claimed: [false, false, false, false, false], plain: true });
	});

	test('matches the note in the path case of its file system', async () => {
		const differentCase = joinPath(userHome, '.copilot', 'chats', 'first', 'Chatpad.md');
		const isNote = async (pathCaseSensitive: boolean) => {
			const { service, sessions } = createService(pathCaseSensitive);
			await service.claim(first, sessions);
			return { note: service.isNote(firstNote), differentCase: service.isNote(differentCase) };
		};

		assert.deepStrictEqual({ caseSensitive: await isNote(true), caseInsensitive: await isNote(false) }, {
			caseSensitive: { note: true, differentCase: false },
			caseInsensitive: { note: true, differentCase: true },
		});
	});

	test('of two concurrent claims, only the first makes its session the Chatpad chat', async () => {
		const { service, existing, sessions } = createService();
		existing.add(first.toString());
		existing.add(second.toString());

		const claimed = await Promise.all([service.claim(first, sessions), service.claim(second, sessions)]);

		assert.deepStrictEqual({ claimed, session: service.session }, { claimed: [true, false], session: first.toString() });
	});

	test('checks an existing note with one stat, and forgets a removed Chatpad chat so later calls look nothing up', async () => {
		const { service, fileService, existing, sessions } = createService();
		let lookups = 0;
		let removed = false;
		const counted: IAgentHostChatpadSessions = {
			find: async session => {
				lookups++;
				return removed ? 'removed' : sessions.find(session);
			},
		};
		await service.claim(first, counted);
		existing.add(first.toString());

		fileService.stats = 0;
		fileService.creates = 0;
		await service.getChatpad(counted);
		const existingNote = { stats: fileService.stats, creates: fileService.creates };
		lookups = 0;
		existing.clear();
		const unavailable = await service.getChatpad(counted);
		const keptWhileUnavailable = service.session;
		removed = true;
		const afterRemoval = await service.getChatpad(counted);
		const lookupsUntilRemoved = lookups;
		lookups = 0;
		const later = [await service.getChatpad(counted), await service.append('lost', counted).then(() => 'appended', () => 'failed')];

		assert.deepStrictEqual({ existingNote, unavailable, keptWhileUnavailable, afterRemoval, lookupsUntilRemoved, session: service.session, later, laterLookups: lookups }, {
			existingNote: { stats: 1, creates: 0 },
			unavailable: undefined,
			keptWhileUnavailable: first.toString(),
			afterRemoval: undefined,
			lookupsUntilRemoved: 2,
			session: undefined,
			later: [undefined, 'failed'],
			laterLookups: 0,
		});
	});
});
