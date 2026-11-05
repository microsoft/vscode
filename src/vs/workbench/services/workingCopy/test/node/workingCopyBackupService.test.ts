/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { bufferToReadable, newWriteableBufferStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, extUriBiasedIgnorePathCase, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { WORKING_COPY_BACKUP_TEMP_FILE_SUFFIX } from '../../../../../platform/backup/common/backup.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileDeleteOptions, IFileOpenOptions } from '../../../../../platform/files/common/files.js';
import { DiskFileSystemProvider } from '../../../../../platform/files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { WorkingCopyBackupService } from '../../common/workingCopyBackupService.js';
import { IWorkingCopyIdentifier } from '../../common/workingCopy.js';

class TestBackupService extends WorkingCopyBackupService { }

function snapshotIdentifiers(identifiers: readonly IWorkingCopyIdentifier[]) {
	return identifiers.map(identifier => ({
		resource: extUriBiasedIgnorePathCase.getComparisonKey(identifier.resource),
		typeId: identifier.typeId,
	}));
}

class TestBackupFileSystemProvider extends DiskFileSystemProvider {
	onWrite: (() => void) | undefined;
	renameError: Error | undefined;
	deleteError: Error | undefined;
	bytesWritten = 0;
	largestWrite = 0;
	opens = 0;
	renames = 0;
	bufferedWrites = false;
	atomicRenames = true;

	override get capabilities(): FileSystemProviderCapabilities {
		let capabilities = super.capabilities;
		if (this.bufferedWrites) {
			capabilities &= ~FileSystemProviderCapabilities.FileReadWrite;
		}
		if (!this.atomicRenames) {
			capabilities &= ~FileSystemProviderCapabilities.FileAtomicRename;
		}
		return capabilities;
	}

	override async open(resource: URI, options: IFileOpenOptions, disableWriteLock?: boolean): Promise<number> {
		this.opens++;
		return super.open(resource, options, disableWriteLock);
	}

	override async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const written = await super.write(fd, pos, data, offset, length);
		this.bytesWritten += written;
		this.largestWrite = Math.max(this.largestWrite, length);
		this.onWrite?.();
		return written;
	}

	override async renameFileAtomic(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
		this.renames++;
		if (this.renameError) {
			throw this.renameError;
		}
		return super.renameFileAtomic(from, to, options);
	}

	override async delete(resource: URI, options: IFileDeleteOptions): Promise<void> {
		if (this.deleteError) {
			throw this.deleteError;
		}
		return super.delete(resource, options);
	}
}

suite('Streamed working copy backups', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: URI;
	let fileService: FileService;
	let provider: TestBackupFileSystemProvider;
	let service: TestBackupService;

	setup(async () => {
		root = URI.file(getRandomTestPath(tmpdir(), 'vsctests', 'streamed-backups'));
		await fs.mkdir(root.fsPath, { recursive: true });
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		provider = disposables.add(new TestBackupFileSystemProvider(logService));
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		service = disposables.add(new TestBackupService(joinPath(root, 'backups'), fileService, logService));
	});

	teardown(async () => {
		await fs.rm(root.fsPath, { recursive: true, force: true });
	});

	test('keeps the previous backup readable until the streamed replacement completes', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1);
		const backup = service.toBackupResource(identifier);
		const previous = await fs.readFile(backup.fsPath);
		const firstWrite = new DeferredPromise<void>();
		provider.bufferedWrites = true;
		provider.onWrite = () => firstWrite.complete();
		provider.bytesWritten = provider.largestWrite = provider.opens = provider.renames = 0;

		const chunk = VSBuffer.fromString('x'.repeat(64 * 1024));
		const stream = newWriteableBufferStream();
		const pending = service.backup(identifier, stream, 2);
		for (let i = 0; i < 4; i++) {
			stream.write(chunk);
		}
		await firstWrite.p;
		const whileWriting = await fs.readFile(backup.fsPath);
		stream.end(chunk);
		await pending;
		const written = await fs.readFile(backup.fsPath);

		assert.deepStrictEqual({
			previousPreserved: whileWriting.equals(previous),
			bytesWritten: provider.bytesWritten,
			fileSize: written.byteLength,
			boundedChunks: provider.largestWrite < chunk.byteLength * 5,
			opens: provider.opens,
			renames: provider.renames,
			version: service.hasBackupSync(identifier, 2),
		}, {
			previousPreserved: true,
			bytesWritten: written.byteLength,
			fileSize: written.byteLength,
			boundedChunks: true,
			opens: 1,
			renames: 1,
			version: true,
		});
	});

	test('failed stream preserves previous content and metadata after bytes reach disk', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1, { etag: 'old' });
		const backup = service.toBackupResource(identifier);
		const firstWrite = new DeferredPromise<void>();
		provider.bufferedWrites = true;
		provider.onWrite = () => firstWrite.complete();
		const stream = newWriteableBufferStream();
		const pending = service.backup(identifier, stream, 2, { etag: 'new' });
		const failure = assert.rejects(pending, /interrupted/);
		for (let i = 0; i < 4; i++) {
			stream.write(VSBuffer.fromString('partial'.repeat(1024)));
		}
		await firstWrite.p;
		stream.error(new Error('interrupted'));
		await failure;

		const restored = await service.resolve(identifier);
		assert.ok(restored);
		assert.deepStrictEqual({
			content: (await streamToBuffer(restored.value)).toString(),
			oldVersion: service.hasBackupSync(identifier, 1, { etag: 'old' }),
			newVersion: service.hasBackupSync(identifier, 2, { etag: 'new' }),
			files: await fs.readdir(dirname(backup).fsPath),
		}, {
			content: 'previous',
			oldVersion: true,
			newVersion: false,
			files: [basename(backup)],
		});
	});

	test('failed replacement preserves the previous backup and can be retried', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1);
		const backup = service.toBackupResource(identifier);
		const previous = await fs.readFile(backup.fsPath);
		provider.renameError = new Error('rename failed');
		await assert.rejects(service.backup(identifier, bufferToReadable(VSBuffer.fromString('next')), 2), /rename failed/);
		assert.deepStrictEqual(await fs.readFile(backup.fsPath), previous);

		provider.renameError = undefined;
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('next')), 2);
		const restored = await service.resolve(identifier);
		assert.ok(restored);
		assert.strictEqual((await streamToBuffer(restored.value)).toString(), 'next');
	});

	test('large readable backups remain bounded and unchanged versions perform no writes', async () => {
		const identifier = { resource: joinPath(root, 'large.txt'), typeId: '' };
		const chunk = VSBuffer.fromString('x'.repeat(256 * 1024));
		let remaining = 112;
		await service.backup(identifier, { read: () => remaining-- > 0 ? chunk : null }, 1);
		const size = (await fs.stat(service.toBackupResource(identifier).fsPath)).size;
		const io = { bytes: provider.bytesWritten, opens: provider.opens, renames: provider.renames };
		await service.backup(identifier, { read: () => { throw new Error('Unchanged backup must not consume input'); } }, 1);

		assert.deepStrictEqual({
			payloadSize: chunk.byteLength * 112,
			writtenOnce: io.bytes === size,
			boundedChunks: provider.largestWrite < 1024 * 1024,
			io,
			afterUnchanged: { bytes: provider.bytesWritten, opens: provider.opens, renames: provider.renames },
		}, {
			payloadSize: 28 * 1024 * 1024,
			writtenOnce: true,
			boundedChunks: true,
			io: { bytes: size, opens: 1, renames: 1 },
			afterUnchanged: { bytes: size, opens: 1, renames: 1 },
		});
	});

	test('providers without atomic support retain the existing write path', async () => {
		provider.atomicRenames = false;
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('fallback')), 1);
		const restored = await service.resolve(identifier);
		assert.ok(restored);
		assert.deepStrictEqual({
			content: (await streamToBuffer(restored.value)).toString(),
			renames: provider.renames,
		}, { content: 'fallback', renames: 0 });
	});

	test('recovery ignores abandoned temporary files with or without a previous backup', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1);
		const backup = service.toBackupResource(identifier);
		await fs.writeFile(`${backup.fsPath}${WORKING_COPY_BACKUP_TEMP_FILE_SUFFIX}`, 'partial');
		await fs.writeFile(joinPath(dirname(backup), `orphan${WORKING_COPY_BACKUP_TEMP_FILE_SUFFIX}`).fsPath, 'partial');
		const restarted = disposables.add(new TestBackupService(joinPath(root, 'backups'), fileService, new NullLogService()));
		assert.deepStrictEqual(snapshotIdentifiers(await restarted.getBackups()), snapshotIdentifiers([identifier]));

		await service.discardBackup(identifier);
		const onlyTemporaryFiles = disposables.add(new TestBackupService(joinPath(root, 'backups'), fileService, new NullLogService()));
		assert.deepStrictEqual(await onlyTemporaryFiles.getBackups(), []);
	});

	test('joining a failed backup still drains later queued work without rejecting', async () => {
		const identifier = { resource: joinPath(root, 'failed.txt'), typeId: '' };
		const laterIdentifier = { resource: joinPath(root, 'later.txt'), typeId: '' };
		provider.bufferedWrites = true;
		const firstWrite = new DeferredPromise<void>();
		provider.onWrite = () => firstWrite.complete();
		const stream = newWriteableBufferStream();
		const failed = assert.rejects(service.backup(identifier, stream, 1), /interrupted/);
		stream.write(VSBuffer.fromString('partial'));
		await firstWrite.p;

		let joinSettled = false;
		const joined = service.joinBackups().then(
			() => { joinSettled = true; return 'fulfilled'; },
			() => { joinSettled = true; return 'rejected'; },
		);
		const laterWrite = new DeferredPromise<void>();
		provider.onWrite = () => laterWrite.complete();
		const laterStream = newWriteableBufferStream();
		const laterBackup = service.backup(laterIdentifier, laterStream, 1);
		laterStream.write(VSBuffer.fromString('later'));
		await laterWrite.p;

		stream.error(new Error('interrupted'));
		await failed;
		await timeout(0);
		const settledBeforeDrain = joinSettled;
		laterStream.end();
		await laterBackup;
		const outcome = await joined;

		assert.deepStrictEqual({ settledBeforeDrain, outcome }, { settledBeforeDrain: false, outcome: 'fulfilled' });
	});

	for (const all of [false, true]) {
		test(`joining failed ${all ? 'discardBackups' : 'discardBackup'} does not rethrow the operation error`, async () => {
			const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1);
			provider.deleteError = new Error('discard failed');
			const discarded = all ? service.discardBackups() : service.discardBackup(identifier);
			await Promise.all([
				assert.rejects(discarded, /discard failed/),
				service.joinBackups(),
			]);
			assert.strictEqual(service.hasBackupSync(identifier, 1), true);
		});
	}

	test('migration drains writes and resumes queued backups and discards at the new location', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		const secondIdentifier = { resource: joinPath(root, 'other.txt'), typeId: '' };
		const firstWrite = new DeferredPromise<void>();
		provider.bufferedWrites = true;
		provider.onWrite = () => firstWrite.complete();
		const stream = newWriteableBufferStream();
		const writing = service.backup(identifier, stream, 1);
		stream.write(VSBuffer.fromString('first'));
		await firstWrite.p;

		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const newHome = joinPath(root, 'migrated');
		const migrating = service.withBackupPathTransition(async () => {
			await fs.rename(joinPath(root, 'backups').fsPath, newHome.fsPath);
			service.reinitialize(newHome);
			entered.complete();
			await release.p;
			return 'migrated';
		});
		let joinedAfterQueuedBackup = false;
		const joined = service.joinBackups().then(() => {
			joinedAfterQueuedBackup = service.hasBackupSync(secondIdentifier, 1);
		});
		const queued = service.backup(secondIdentifier, bufferToReadable(VSBuffer.fromString('second')), 1);
		const discarded = service.discardBackup(identifier);
		const waitingForWrite = !entered.isSettled;
		stream.end();
		await writing;
		await entered.p;
		const whilePaused = {
			firstExists: await fileService.exists(service.toBackupResource(identifier)),
			secondExists: await fileService.exists(service.toBackupResource(secondIdentifier)),
		};
		release.complete();
		const result = await migrating;
		await Promise.all([queued, discarded, joined]);

		assert.deepStrictEqual({
			waitingForWrite, whilePaused, result, joinedAfterQueuedBackup,
			backups: snapshotIdentifiers(await service.getBackups()),
			oldHomeExists: await fileService.exists(joinPath(root, 'backups')),
		}, {
			waitingForWrite: true,
			whilePaused: { firstExists: true, secondExists: false },
			result: 'migrated',
			joinedAfterQueuedBackup: true,
			backups: snapshotIdentifiers([secondIdentifier]),
			oldHomeExists: false,
		});
	});

	test('a failed in-flight backup releases the migration gate and permits retry', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		const firstWrite = new DeferredPromise<void>();
		provider.bufferedWrites = true;
		provider.onWrite = () => firstWrite.complete();
		const stream = newWriteableBufferStream();
		const failedWrite = assert.rejects(service.backup(identifier, stream, 1), /interrupted/);
		stream.write(VSBuffer.fromString('partial'));
		await firstWrite.p;
		let entered = false;
		const failedMigration = assert.rejects(service.withBackupPathTransition(async () => {
			entered = true;
		}), /interrupted/);
		const queued = service.backup(identifier, bufferToReadable(VSBuffer.fromString('retry')), 2);
		stream.error(new Error('interrupted'));
		await Promise.all([failedWrite, failedMigration, queued]);
		const retry = await service.withBackupPathTransition(async () => 'ready');
		const restored = await service.resolve(identifier);
		assert.ok(restored);
		assert.deepStrictEqual({
			entered, retry,
			content: (await streamToBuffer(restored.value)).toString(),
		}, { entered: false, retry: 'ready', content: 'retry' });
	});

	test('a failed migration callback resumes queued mutations', async () => {
		const identifier = { resource: joinPath(root, 'document.txt'), typeId: '' };
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('previous')), 1);
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const failedMigration = assert.rejects(service.withBackupPathTransition(async () => {
			entered.complete();
			await release.p;
			throw new Error('migration failed');
		}), /migration failed/);
		await entered.p;
		const discarded = service.discardBackups();
		release.complete();
		await Promise.all([failedMigration, discarded]);
		await service.backup(identifier, bufferToReadable(VSBuffer.fromString('after failure')), 2);
		const result = await service.withBackupPathTransition(async () => 'ready');
		assert.deepStrictEqual({
			result, backups: snapshotIdentifiers(await service.getBackups()),
		}, { result: 'ready', backups: snapshotIdentifiers([identifier]) });
	});
});
