/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile, spawn } from 'child_process';
import { once } from 'events';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { stub } from 'sinon';
import { FileAccess } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../common/files.js';
import { Event } from '../../../../base/common/event.js';
import { DefaultURITransformer, IURITransformer } from '../../../../base/common/uriIpc.js';
import { DiskFileSystemProviderClient } from '../../common/diskFileSystemProviderClient.js';
import { AbstractDiskFileSystemProviderChannel } from '../../node/diskFileSystemProviderServer.js';
import { DiskFileSystemProvider } from '../../node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';

const execFileAsync = promisify(execFile);

class TestDiskFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<void> {
	protected override getUriTransformer(): IURITransformer {
		return DefaultURITransformer;
	}
	protected override transformIncoming(_transformer: IURITransformer, resource: UriComponents): URI {
		return URI.revive(resource);
	}
	protected override createSessionFileWatcher(): never {
		throw new Error('Watching is not used by this test channel');
	}
}

suite('DiskFileSystemProvider', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let provider: DiskFileSystemProvider;
	let testDir: string;

	setup(async () => {
		provider = store.add(new DiskFileSystemProvider(new NullLogService()));
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'diskfilesystemprovider');
		await promises.mkdir(testDir, { recursive: true });
	});

	teardown(async () => {
		await promises.rm(testDir, { recursive: true, force: true });
	});

	test('readFile reads regular files', async () => {
		const filePath = join(testDir, 'file.txt');
		await promises.writeFile(filePath, 'contents');

		assert.strictEqual(Buffer.from(await provider.readFile(URI.file(filePath))).toString(), 'contents');
	});

	test('realpath reports missing paths as a filesystem error', async () => {
		await assert.rejects(
			provider.realpath(URI.file(join(testDir, 'removed-checkout'))),
			error => error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound
		);
	});

	test('atomic rename is forwarded through the disk provider channel', async () => {
		const server = store.add(new TestDiskFileSystemProviderChannel(provider, new NullLogService()));
		const commands: string[] = [];
		const client = store.add(new DiskFileSystemProviderClient({
			call: (command, args) => {
				commands.push(command);
				return server.call(undefined, command, args);
			},
			listen: () => Event.None,
		}, {}));
		const source = join(testDir, 'source');
		const target = join(testDir, 'target');
		await promises.writeFile(source, 'new');
		await promises.writeFile(target, 'old');
		await client.renameFileAtomic(URI.file(source), URI.file(target), { overwrite: true });
		assert.deepStrictEqual({
			commands,
			sourceExists: await promises.stat(source).then(() => true, () => false),
			target: await promises.readFile(target, 'utf8'),
		}, { commands: ['renameFileAtomic'], sourceExists: false, target: 'new' });
	});

	test('atomic rename errors cross IPC without falling back to ordinary rename', async () => {
		const server = store.add(new TestDiskFileSystemProviderChannel(provider, new NullLogService()));
		const commands: string[] = [];
		const client = store.add(new DiskFileSystemProviderClient({
			call: (command, args) => {
				commands.push(command);
				return server.call(undefined, command, args);
			},
			listen: () => Event.None,
		}, {}));
		const source = join(testDir, 'source');
		const target = join(testDir, 'target');
		await promises.writeFile(source, 'new');
		await promises.writeFile(target, 'old');
		const failure = new Error('EXDEV');
		const rename = stub(provider, 'renameFileAtomic').rejects(failure);
		try {
			await assert.rejects(client.renameFileAtomic(URI.file(source), URI.file(target), { overwrite: true }), error => error === failure);
		} finally {
			rename.restore();
		}
		assert.deepStrictEqual({
			commands,
			source: await promises.readFile(source, 'utf8'),
			target: await promises.readFile(target, 'utf8'),
		}, { commands: ['renameFileAtomic'], source: 'new', target: 'old' });
	});

	for (const sourceDirectory of [true, false]) {
		test(`atomic rename rejects ${sourceDirectory ? 'source' : 'target'} directories without deleting them`, async () => {
			const source = join(testDir, 'source');
			const target = join(testDir, 'target');
			await promises.mkdir(sourceDirectory ? source : target);
			await promises.writeFile(sourceDirectory ? target : source, 'preserved');
			await assert.rejects(provider.renameFileAtomic(URI.file(source), URI.file(target), { overwrite: true }), /only support/);
			assert.deepStrictEqual({
				sourceDirectory: (await promises.stat(source)).isDirectory(),
				targetDirectory: (await promises.stat(target)).isDirectory(),
				content: await promises.readFile(sourceDirectory ? target : source, 'utf8'),
			}, { sourceDirectory, targetDirectory: !sourceDirectory, content: 'preserved' });
		});
	}

	for (const method of ['open', 'readFile', 'readFileStream']) {
		(isWindows ? test.skip : test)(`${method} rejects named pipes without a writer`, async function () {
			this.timeout(10000);

			const fifoPath = join(testDir, 'named-pipe');
			await execFileAsync('mkfifo', [fifoPath]);

			// Isolate blocking reads so a regression cannot leave the test runner's worker pool stuck.
			await execFileAsync(process.execPath, [
				FileAccess.asFileUri('vs/platform/files/test/node/fixtures/readNamedPipe.js').fsPath,
				method,
				fifoPath
			], {
				env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
				timeout: 5000,
				killSignal: 'SIGKILL'
			});
		});
	}

	(isWindows ? test.skip : test)('readFile rejects non-regular files', async () => {
		await assert.rejects(
			provider.readFile(URI.file('/dev/null')),
			error => error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.Unavailable
		);
	});

	(isWindows ? test : test.skip)('rename fails quickly when a folder is in use by another process', async function () {
		this.timeout(30000);

		const folderPath = join(testDir, 'folder');
		await promises.mkdir(folderPath);

		// On Windows, a process whose working directory is the folder prevents renaming it.
		// The child exits when its IPC channel closes so it cannot outlive the test runner.
		const child = spawn(process.execPath, ['-e', 'process.on(\'disconnect\', () => process.exit()); process.send(\'ready\'); setInterval(() => { }, 1000)'], {
			cwd: folderPath,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['ignore', 'ignore', 'ignore', 'ipc']
		});

		try {
			// The 'spawn' event fires before the child has finished initializing and
			// holds its working directory, so wait until the child reports it is running
			await new Promise<void>((resolve, reject) => {
				child.once('message', () => resolve());
				child.once('error', reject);
				child.once('exit', (code, signal) => reject(new Error(`Child process exited before it was ready (code: ${code}, signal: ${signal})`)));
			});

			// The retry logs an error when it gives up
			const consoleError = stub(console, 'error');
			const start = Date.now();
			try {
				await assert.rejects(provider.rename(URI.file(folderPath), URI.file(join(testDir, 'renamed')), { overwrite: false }), /in use by another application/);
			} finally {
				consoleError.restore();
			}
			assert.ok(Date.now() - start < 10000, 'renaming a folder that is in use should not retry for a long time');
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				const exit = once(child, 'exit');
				child.kill();
				await exit;
			}
		}
	});
});
