/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { join } from '../../../../base/common/path.js';

suite('SessionDataService', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let service: SessionDataService;
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		service = new SessionDataService(basePath, fileService, new NullLogService());
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

	test('cleanupOrphanedData deletes orphans but keeps known sessions', async () => {
		const baseDir = URI.joinPath(basePath, 'agentSessionData');
		await fileService.createFolder(URI.joinPath(baseDir, 'keep-1'));
		await fileService.createFolder(URI.joinPath(baseDir, 'keep-2'));
		await fileService.createFolder(URI.joinPath(baseDir, 'orphan-1'));
		await fileService.createFolder(URI.joinPath(baseDir, 'orphan-2'));

		await service.cleanupOrphanedData(new Set(['keep-1', 'keep-2']));

		assert.ok(await fileService.exists(URI.joinPath(baseDir, 'keep-1')));
		assert.ok(await fileService.exists(URI.joinPath(baseDir, 'keep-2')));
		assert.ok(!(await fileService.exists(URI.joinPath(baseDir, 'orphan-1'))));
		assert.ok(!(await fileService.exists(URI.joinPath(baseDir, 'orphan-2'))));
	});

	test('cleanupOrphanedData is a no-op when base directory does not exist', async () => {
		// Should not throw
		await service.cleanupOrphanedData(new Set());
	});
});

suite('SessionDataService — openDatabase ref-counting', () => {

	const disposables = new DisposableStore();
	let service: SessionDataService;
	let testDir: string;

	setup(() => {
		testDir = join(tmpdir(), `vscode-session-data-test-${randomUUID()}`);
		mkdirSync(testDir, { recursive: true });

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(new NullLogService()))));
		service = new SessionDataService(URI.file(testDir), fileService, new NullLogService());
	});

	teardown(() => {
		disposables.clear();
		rmSync(testDir, { recursive: true, force: true });
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
