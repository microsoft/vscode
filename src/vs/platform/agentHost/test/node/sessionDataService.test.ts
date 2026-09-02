/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import { AH_META_CHAT_BACKING_DB_KEY, buildChatUri, buildSubagentSessionUri } from '../../common/state/sessionState.js';
import { SessionDataService } from '../../node/sessionDataService.js';

suite('SessionDataService', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let service: SessionDataService;
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		service = new SessionDataService(basePath, fileService, new NullLogService(), () => ':memory:');
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getSessionDataDir returns correct URI', () => {
		const session = AgentSession.uri('copilot', 'abc-123');
		const dir = service.getSessionDataDir(session);
		assert.strictEqual(dir.toString(), URI.joinPath(basePath, 'agentSessionData', 'abc-123').toString());
	});

	test('getSessionDataDir sanitizes unsafe characters', () => {
		const session = AgentSession.uri('copilot', 'foo/bar:baz\\qux');
		const dir = service.getSessionDataDir(session);
		assert.strictEqual(dir.toString(), URI.joinPath(basePath, 'agentSessionData', 'foo-bar-baz-qux').toString());
	});

	test('getSessionDataDir gives each peer chat of a session its own directory', () => {
		const session = AgentSession.uri('copilotcli', 'session-1');
		const chatA = URI.parse(buildChatUri(session, 'chat-a'));
		const chatB = URI.parse(buildChatUri(session, 'chat-b'));
		const dirA = service.getSessionDataDir(chatA);
		const dirB = service.getSessionDataDir(chatB);
		assert.notStrictEqual(dirA.toString(), dirB.toString());
		// The plain session URI keeps its authority-free directory.
		assert.strictEqual(service.getSessionDataDir(session).toString(), URI.joinPath(basePath, 'agentSessionData', 'session-1').toString());
	});

	test('deleteSessionData removes directory', async () => {
		const session = AgentSession.uri('copilot', 'session-1');
		const dir = service.getSessionDataDir(session);
		await fileService.createFolder(dir);
		await fileService.writeFile(URI.joinPath(dir, 'snapshot.json'), VSBuffer.fromString('{}'));

		assert.ok(await fileService.exists(dir));
		await service.deleteSessionData(session);
		assert.ok(!(await fileService.exists(dir)));
	});

	test('deleteSessionData is a no-op when directory does not exist', async () => {
		const session = AgentSession.uri('copilot', 'nonexistent');
		// Should not throw
		await service.deleteSessionData(session);
	});

	test('cleanupOrphanedData deletes orphans but keeps known sessions and the data they own', async () => {
		const known = AgentSession.uri('copilot', 'keep-1');
		const orphan = AgentSession.uri('copilot', 'orphan-1');
		const dirs = {
			known: service.getSessionDataDir(known),
			knownChat: service.getSessionDataDir(URI.parse(buildChatUri(known, 'chat-a'))),
			knownSubagent: service.getSessionDataDir(URI.parse(buildSubagentSessionUri(known, 'call-1'))),
			orphan: service.getSessionDataDir(orphan),
			orphanChat: service.getSessionDataDir(URI.parse(buildChatUri(orphan, 'chat-b'))),
			detachedWorktree: URI.joinPath(basePath, 'agentSessionData', 'devcontainer-worktree-detached'),
		};
		for (const dir of Object.values(dirs)) {
			await fileService.createFolder(dir);
		}

		await service.cleanupOrphanedData([known]);

		const remaining: Record<string, boolean> = {};
		for (const [name, dir] of Object.entries(dirs)) {
			remaining[name] = await fileService.exists(dir);
		}
		assert.deepStrictEqual({ remaining, listedDetached: await service.listSessionDataIds('devcontainer-worktree-') }, {
			remaining: {
				known: true,
				knownChat: true,
				knownSubagent: true,
				orphan: false,
				orphanChat: false,
				detachedWorktree: true,
			},
			listedDetached: ['devcontainer-worktree-detached'],
		});
	});

	test('cleanupOrphanedData keeps the backing session of a chat', async () => {
		const known = AgentSession.uri('copilot', 'known');
		const backing = AgentSession.uri('claude', 'backing-sdk-session');
		const unmarked = AgentSession.uri('claude', 'unmarked-sdk-session');
		for (const session of [known, backing, unmarked]) {
			await fileService.createFile(URI.joinPath(service.getSessionDataDir(session), SESSION_DB_FILENAME), VSBuffer.alloc(0));
		}
		const backingRef = disposables.add(service.openDatabase(backing));
		await backingRef.object.setMetadata(AH_META_CHAT_BACKING_DB_KEY, buildChatUri(known, 'chat-a'));
		const unmarkedRef = disposables.add(service.openDatabase(unmarked));
		await unmarkedRef.object.setMetadata('customTitle', 'not a chat backing');

		await service.cleanupOrphanedData([known]);
		await Promise.all([backingRef.object.close(), unmarkedRef.object.close()]);

		assert.deepStrictEqual({
			known: await fileService.exists(service.getSessionDataDir(known)),
			backing: await fileService.exists(service.getSessionDataDir(backing)),
			unmarked: await fileService.exists(service.getSessionDataDir(unmarked)),
		}, { known: true, backing: true, unmarked: false });
	});

	test('cleanupOrphanedData is a no-op when base directory does not exist', async () => {
		// Should not throw
		await service.cleanupOrphanedData([]);
	});
});

suite('SessionDataService — openDatabase ref-counting', () => {

	const disposables = new DisposableStore();
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });
	let service: SessionDataService;

	setup(() => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		service = new SessionDataService(basePath, fileService, new NullLogService(), () => ':memory:');
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns a functional database reference', async () => {
		const session = AgentSession.uri('copilot', 'ref-test');
		const ref = service.openDatabase(session);
		disposables.add(ref);

		await ref.object.createTurn('turn-1');
		const edits = await ref.object.getFileEdits([]);
		assert.deepStrictEqual(edits, []);
		await ref.object.close();
	});

	test('multiple references share the same database', async () => {
		const session = AgentSession.uri('copilot', 'shared-test');
		const ref1 = service.openDatabase(session);
		const ref2 = service.openDatabase(session);

		assert.strictEqual(ref1.object, ref2.object);

		ref1.dispose();
		ref2.dispose();
		await ref1.object.close();
	});

	test('database remains usable until last reference is disposed', async () => {
		const session = AgentSession.uri('copilot', 'refcount-test');
		const ref1 = service.openDatabase(session);
		const ref2 = service.openDatabase(session);

		ref1.dispose();

		// ref2 still works
		await ref2.object.createTurn('turn-1');

		ref2.dispose();

		await ref1.object.close();
	});

	test('new reference after all disposed gets a fresh database', async () => {
		const session = AgentSession.uri('copilot', 'reopen-test');
		const ref1 = service.openDatabase(session);
		const db1 = ref1.object;
		ref1.dispose();

		const ref2 = service.openDatabase(session);
		disposables.add(ref2);
		// New reference — may or may not be the same object, but must be functional
		await ref2.object.createTurn('turn-1');
		assert.notStrictEqual(ref2.object, db1);

		await ref2.object.close();
	});
});
