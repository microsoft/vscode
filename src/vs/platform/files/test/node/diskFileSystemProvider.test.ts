/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile, spawn } from 'child_process';
import { once } from 'events';
import { constants, promises } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { stub } from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { consumeStream } from '../../../../base/common/stream.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { BufferReader, BufferWriter, deserialize, serialize } from '../../../../base/parts/ipc/common/ipc.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, FileType, toFileSystemProviderErrorCode } from '../../common/files.js';
import { Event } from '../../../../base/common/event.js';
import { DefaultURITransformer, IURITransformer } from '../../../../base/common/uriIpc.js';
import { DiskFileSystemProviderClient } from '../../common/diskFileSystemProviderClient.js';
import { FileService } from '../../common/fileService.js';
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

	function readWithProvider(method: string, resource: URI, token = CancellationToken.None): Promise<Uint8Array | undefined> {
		return method === 'readFile' ?
			provider.readFile(resource, undefined, token) :
			consumeStream(provider.readFileStream(resource, {}, token), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).buffer);
	}

	function createIpcClient(): DiskFileSystemProviderClient {
		const server = store.add(new TestDiskFileSystemProviderChannel(provider, new NullLogService()));

		return store.add(new DiskFileSystemProviderClient({
			call: (command, args, token) => server.call(undefined, command, args, token),
			// Events go through the same serialization as over real IPC
			listen: <T>(event: string, args?: unknown[]) => event !== 'readFileStream' ? Event.None : Event.map(server.listen<unknown>(undefined, event, args ?? []), payload => {
				const writer = new BufferWriter();
				serialize(writer, payload);
				return deserialize(new BufferReader(writer.buffer)) as T;
			}),
		}, {}));
	}

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

	(isLinux ? test : test.skip)('realpath returns the unresolved path of a readable link it cannot resolve, unless strict', async () => {
		// A link to the descriptor of an open, deleted file cannot be resolved, but reading it succeeds.
		const deletedPath = join(testDir, 'deleted.txt');
		await promises.writeFile(deletedPath, 'contents');
		const handle = await promises.open(deletedPath, 'r');
		try {
			await promises.unlink(deletedPath);
			const link = URI.file(join(testDir, 'fd-link.txt'));
			await promises.symlink(`/proc/self/fd/${handle.fd}`, link.fsPath);

			assert.deepStrictEqual({
				realpath: await provider.realpath(link),
				strictRealpath: await provider.realpath(link, { strict: true }).catch(error => toFileSystemProviderErrorCode(error)),
				isSymbolicLink: ((await provider.stat(link)).type & FileType.SymbolicLink) !== 0,
				contents: Buffer.from(await provider.readFile(link)).toString(),
			}, {
				realpath: link.fsPath,
				strictRealpath: FileSystemProviderErrorCode.FileNotFound,
				isSymbolicLink: true,
				contents: 'contents',
			});
		} finally {
			await handle.close();
		}
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

	for (const method of ['open', 'readFile', 'readFileStream', 'writeFile']) {
		(isWindows ? test.skip : test)(`${method} rejects named pipes without a ${method === 'writeFile' ? 'reader' : 'writer'}`, async function () {
			this.timeout(10000);

			const fifoPath = join(testDir, 'named-pipe');
			await execFileAsync('mkfifo', [fifoPath]);

			// Isolate blocking reads and writes so a regression cannot leave the test runner's worker pool stuck.
			await execFileAsync(process.execPath, [
				FileAccess.asFileUri('vs/platform/files/test/node/fixtures/unconnectedNamedPipe.js').fsPath,
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

	for (const method of ['readFile', 'readFileStream']) {
		(isWindows ? test.skip : test)(`${method} reads named pipes once their writer provides data`, async () => {
			const fifoPath = join(testDir, 'named-pipe');
			await execFileAsync('mkfifo', [fifoPath]);

			// A reader that never reads lets the writer open the pipe without blocking
			const idleReader = await promises.open(fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
			const writer = await promises.open(fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
			try {
				const contents = readWithProvider(method, URI.file(fifoPath));

				// Give the provider time to find the pipe empty before writing
				await timeout(50);
				await writer.write('A=1\n');
				await writer.close();

				assert.strictEqual(Buffer.from((await contents) ?? []).toString(), 'A=1\n');
			} finally {
				await writer.close();
				await idleReader.close();
			}
		});
	}

	for (const method of ['readFile', 'readFileStream']) {
		for (const closeBeforeRead of [true, false]) {
			(isWindows ? test.skip : test)(`${method} rejects named pipes whose writer closes without data ${closeBeforeRead ? 'before' : 'after'} the first read`, async () => {
				const fifoPath = join(testDir, 'named-pipe');
				await execFileAsync('mkfifo', [fifoPath]);

				// A reader that never reads lets the writer open the pipe without blocking
				const idleReader = await promises.open(fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
				const writer = await promises.open(fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
				try {
					if (closeBeforeRead) {
						await writer.close();
					}

					const contents = readWithProvider(method, URI.file(fifoPath));

					if (!closeBeforeRead) {
						// Give the provider time to find the pipe empty before closing
						await timeout(50);
						await writer.close();
					}

					await assert.rejects(contents, error => error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.Unavailable);
				} finally {
					await writer.close();
					await idleReader.close();
				}
			});
		}
	}

	const cancellableReads: [string, (resource: URI, token: CancellationToken) => Promise<unknown>][] = [
		['readFile through the file service', (resource, token) => {
			const fileService = store.add(new FileService(new NullLogService()));
			store.add(fileService.registerProvider(Schemas.file, createIpcClient()));

			return fileService.readFile(resource, undefined, token);
		}],
		['readFileStream', (resource, token) => readWithProvider('readFileStream', resource, token)],
	];

	for (const [name, read] of cancellableReads) {
		(isWindows ? test.skip : test)(`${name} stops waiting for a named pipe when cancelled`, async () => {
			const fifoPath = join(testDir, 'named-pipe');
			await execFileAsync('mkfifo', [fifoPath]);

			// A writer that never writes keeps reads waiting
			const idleReader = await promises.open(fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
			const idleWriter = await promises.open(fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
			const cts = new CancellationTokenSource();
			try {
				const contents = read(URI.file(fifoPath), cts.token);

				await timeout(50);
				cts.cancel();
				await assert.rejects(contents, error => isCancellationError(error));

				// Without the idle reader, writing only fails once the provider closed its end of the pipe
				await idleReader.close();
				await assert.rejects(idleWriter.write('A=1\n'), { code: 'EPIPE' });
			} finally {
				cts.dispose();
				await idleWriter.close();
				await idleReader.close();
			}
		});
	}

	(isWindows ? test.skip : test)('writeFile writes to named pipes while their reader catches up', async () => {
		const fifoPath = join(testDir, 'named-pipe');
		await execFileAsync('mkfifo', [fifoPath]);

		// More than fits into the pipe, so writing has to wait for the reader
		const content = 'A=1\n'.repeat(64 * 1024);

		// A reader that never reads lets the provider open the pipe right away
		const idleReader = await promises.open(fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
		try {
			const reader = spawn('cat', [fifoPath]);
			const chunks: Buffer[] = [];
			reader.stdout.on('data', chunk => chunks.push(chunk));

			await provider.writeFile(URI.file(fifoPath), VSBuffer.fromString(content).buffer, { create: false, overwrite: true, unlock: false, atomic: false });
			await once(reader, 'close');

			assert.strictEqual(Buffer.concat(chunks).toString(), content);
		} finally {
			await idleReader.close();
		}
	});

	(isWindows ? test.skip : test)('readFileStream errors keep their message across IPC', async () => {
		const client = createIpcClient();

		await assert.rejects(
			consumeStream(client.readFileStream(URI.file('/dev/null'), {}, CancellationToken.None), () => undefined),
			error => error instanceof Error && error.message === 'File is not a regular file' && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.Unavailable
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
