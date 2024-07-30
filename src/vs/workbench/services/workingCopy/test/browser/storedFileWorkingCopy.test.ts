/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { StoredFileWorkingCopy, StoredFileWorkingCopyState, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelContentChangedEvent, IStoredFileWorkingCopyModelFactory, isStoredFileWorkingCopySaveEvent, IStoredFileWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { bufferToStream, newWriteableBufferStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getLastResolvedFileStat, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { basename } from 'vs/base/common/resources';
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult, IFileStatWithMetadata, IWriteFileOptions, NotModifiedSinceFileOperationError } from 'vs/platform/files/common/files';
import { SaveReason, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { Promises, timeout } from 'vs/base/common/async';
import { consumeReadable, consumeStream, isReadableStream } from 'vs/base/common/stream';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { SnapshotContext } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { assertIsDefined } from 'vs/base/common/types';

export class TestStoredFileWorkingCopyModel extends Disposable implements IStoredFileWorkingCopyModel {

	private readonly _onDidChangeContent = this._register(new Emitter<IStoredFileWorkingCopyModelContentChangedEvent>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(readonly resource: URI, public contents: string) {
		super();
	}

	fireContentChangeEvent(event: IStoredFileWorkingCopyModelContentChangedEvent): void {
		this._onDidChangeContent.fire(event);
	}

	updateContents(newContents: string): void {
		this.doUpdate(newContents);
	}

	private throwOnSnapshot = false;
	setThrowOnSnapshot(): void {
		this.throwOnSnapshot = true;
	}

	async snapshot(context: SnapshotContext, token: CancellationToken): Promise<VSBufferReadableStream> {
		if (this.throwOnSnapshot) {
			throw new Error('Fail');
		}

		const stream = newWriteableBufferStream();
		stream.end(VSBuffer.fromString(this.contents));

		return stream;
	}

	async update(contents: VSBufferReadableStream, token: CancellationToken): Promise<void> {
		this.doUpdate((await streamToBuffer(contents)).toString());
	}

	private doUpdate(newContents: string): void {
		this.contents = newContents;

		this.versionId++;

		this._onDidChangeContent.fire({ isRedoing: false, isUndoing: false });
	}

	versionId = 0;

	pushedStackElement = false;

	pushStackElement(): void {
		this.pushedStackElement = true;
	}

	override dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}

export class TestStoredFileWorkingCopyModelWithCustomSave extends TestStoredFileWorkingCopyModel {

	saveCounter = 0;
	throwOnSave = false;
	saveOperation: Promise<void> | undefined = undefined;

	async save(options: IWriteFileOptions, token: CancellationToken): Promise<IFileStatWithMetadata> {
		if (this.throwOnSave) {
			throw new Error('Fail');
		}

		if (this.saveOperation) {
			await this.saveOperation;
		}

		if (token.isCancellationRequested) {
			throw new Error('Canceled');
		}

		this.saveCounter++;

		return {
			resource: this.resource,
			ctime: 0,
			etag: '',
			isDirectory: false,
			isFile: true,
			mtime: 0,
			name: 'resource2',
			size: 0,
			isSymbolicLink: false,
			readonly: false,
			locked: false,
			children: undefined
		};
	}
}

export class TestStoredFileWorkingCopyModelFactory implements IStoredFileWorkingCopyModelFactory<TestStoredFileWorkingCopyModel> {

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TestStoredFileWorkingCopyModel> {
		return new TestStoredFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
	}
}

export class TestStoredFileWorkingCopyModelWithCustomSaveFactory implements IStoredFileWorkingCopyModelFactory<TestStoredFileWorkingCopyModelWithCustomSave> {

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TestStoredFileWorkingCopyModelWithCustomSave> {
		return new TestStoredFileWorkingCopyModelWithCustomSave(resource, (await streamToBuffer(contents)).toString());
	}
}

suite('StoredFileWorkingCopy (with custom save)', function () {

	const factory = new TestStoredFileWorkingCopyModelWithCustomSaveFactory();

	const disposables = new DisposableStore();

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	let workingCopy: StoredFileWorkingCopy<TestStoredFileWorkingCopyModelWithCustomSave>;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		const resource = URI.file('test/resource');
		workingCopy = disposables.add(new StoredFileWorkingCopy<TestStoredFileWorkingCopyModelWithCustomSave>('testStoredFileWorkingCopyType', resource, basename(resource), factory, options => workingCopy.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService));
	});

	teardown(() => {
		disposables.clear();
	});

	test('save (custom implemented)', async () => {
		let savedCounter = 0;
		let lastSaveEvent: IStoredFileWorkingCopySaveEvent | undefined = undefined;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
			lastSaveEvent = e;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// unresolved
		await workingCopy.save();
		assert.strictEqual(savedCounter, 0);
		assert.strictEqual(saveErrorCounter, 0);

		// simple
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello save');
		await workingCopy.save();

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(lastSaveEvent!.reason, SaveReason.EXPLICIT);
		assert.ok(lastSaveEvent!.stat);
		assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent!));
		assert.strictEqual(workingCopy.model?.pushedStackElement, true);
		assert.strictEqual((workingCopy.model as TestStoredFileWorkingCopyModelWithCustomSave).saveCounter, 1);

		// error
		workingCopy.model?.updateContents('hello save error');
		(workingCopy.model as TestStoredFileWorkingCopyModelWithCustomSave).throwOnSave = true;
		await workingCopy.save();

		assert.strictEqual(saveErrorCounter, 1);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
	});

	test('save cancelled (custom implemented)', async () => {
		let savedCounter = 0;
		let lastSaveEvent: IStoredFileWorkingCopySaveEvent | undefined = undefined;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
			lastSaveEvent = e;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		await workingCopy.resolve();
		let resolve: () => void;
		(workingCopy.model as TestStoredFileWorkingCopyModelWithCustomSave).saveOperation = new Promise(r => resolve = r);

		workingCopy.model?.updateContents('first');
		const firstSave = workingCopy.save();
		// cancel the first save by requesting a second while it is still mid operation
		workingCopy.model?.updateContents('second');
		const secondSave = workingCopy.save();
		resolve!();
		await firstSave;
		await secondSave;

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(lastSaveEvent!.reason, SaveReason.EXPLICIT);
		assert.ok(lastSaveEvent!.stat);
		assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent!));
		assert.strictEqual(workingCopy.model?.pushedStackElement, true);
		assert.strictEqual((workingCopy.model as TestStoredFileWorkingCopyModelWithCustomSave).saveCounter, 1);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('StoredFileWorkingCopy', function () {

	const factory = new TestStoredFileWorkingCopyModelFactory();

	const disposables = new DisposableStore();
	const resource = URI.file('test/resource');
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	let workingCopy: StoredFileWorkingCopy<TestStoredFileWorkingCopyModel>;

	function createWorkingCopy(uri: URI = resource) {
		const workingCopy: StoredFileWorkingCopy<TestStoredFileWorkingCopyModel> = new StoredFileWorkingCopy<TestStoredFileWorkingCopyModel>('testStoredFileWorkingCopyType', uri, basename(uri), factory, options => workingCopy.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService);

		return workingCopy;
	}

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		workingCopy = disposables.add(createWorkingCopy());
	});

	teardown(() => {
		workingCopy.dispose();

		for (const workingCopy of accessor.workingCopyService.workingCopies) {
			(workingCopy as StoredFileWorkingCopy<TestStoredFileWorkingCopyModel>).dispose();
		}

		disposables.clear();
	});

	test('registers with working copy service', async () => {
		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);

		workingCopy.dispose();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
	});

	test('orphaned tracking', async () => {
		return runWithFakedTimers({}, async () => {
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);

			let onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
			accessor.fileService.notExistsSet.set(resource, true);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));

			await onDidChangeOrphanedPromise;
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);

			onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
			accessor.fileService.notExistsSet.delete(resource);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.ADDED }], false));

			await onDidChangeOrphanedPromise;
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
		});
	});

	test('dirty / modified', async () => {
		assert.strictEqual(workingCopy.isModified(), false);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);

		await workingCopy.resolve();
		assert.strictEqual(workingCopy.isResolved(), true);

		let changeDirtyCounter = 0;
		disposables.add(workingCopy.onDidChangeDirty(() => {
			changeDirtyCounter++;
		}));

		let contentChangeCounter = 0;
		disposables.add(workingCopy.onDidChangeContent(() => {
			contentChangeCounter++;
		}));

		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(() => {
			savedCounter++;
		}));

		// Dirty from: Model content change
		workingCopy.model?.updateContents('hello dirty');
		assert.strictEqual(contentChangeCounter, 1);

		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
		assert.strictEqual(changeDirtyCounter, 1);

		await workingCopy.save();

		assert.strictEqual(workingCopy.isModified(), false);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
		assert.strictEqual(changeDirtyCounter, 2);
		assert.strictEqual(savedCounter, 1);

		// Dirty from: Initial contents
		await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello dirty stream')) });

		assert.strictEqual(contentChangeCounter, 2); // content of model did not change
		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
		assert.strictEqual(changeDirtyCounter, 3);

		await workingCopy.revert({ soft: true });

		assert.strictEqual(workingCopy.isModified(), false);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
		assert.strictEqual(changeDirtyCounter, 4);

		// Modified from: API
		workingCopy.markModified();

		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
		assert.strictEqual(changeDirtyCounter, 5);

		await workingCopy.revert();

		assert.strictEqual(workingCopy.isModified(), false);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
		assert.strictEqual(changeDirtyCounter, 6);
	});

	test('dirty - working copy marks non-dirty when undo reaches saved version ID', async () => {
		await workingCopy.resolve();

		workingCopy.model?.updateContents('hello saved state');
		await workingCopy.save();
		assert.strictEqual(workingCopy.isDirty(), false);

		workingCopy.model?.updateContents('changing content once');
		assert.strictEqual(workingCopy.isDirty(), true);

		// Simulate an undo that goes back to the last (saved) version ID
		workingCopy.model!.versionId--;

		workingCopy.model?.fireContentChangeEvent({ isRedoing: false, isUndoing: true });
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('resolve (without backup)', async () => {
		let onDidResolveCounter = 0;
		disposables.add(workingCopy.onDidResolve(() => {
			onDidResolveCounter++;
		}));

		// resolve from file
		await workingCopy.resolve();
		assert.strictEqual(workingCopy.isResolved(), true);
		assert.strictEqual(onDidResolveCounter, 1);
		assert.strictEqual(workingCopy.model?.contents, 'Hello Html');

		// dirty resolve returns early
		workingCopy.model?.updateContents('hello resolve');
		assert.strictEqual(workingCopy.isDirty(), true);
		await workingCopy.resolve();
		assert.strictEqual(onDidResolveCounter, 1);
		assert.strictEqual(workingCopy.model?.contents, 'hello resolve');

		// dirty resolve with contents updates contents
		await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello initial contents')) });
		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.model?.contents, 'hello initial contents');
		assert.strictEqual(onDidResolveCounter, 2);

		// resolve with pending save returns directly
		const pendingSave = workingCopy.save();
		await workingCopy.resolve();
		await pendingSave;
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.model?.contents, 'hello initial contents');
		assert.strictEqual(onDidResolveCounter, 2);

		// disposed resolve is not throwing an error
		workingCopy.dispose();
		await workingCopy.resolve();
		assert.strictEqual(workingCopy.isDisposed(), true);
		assert.strictEqual(onDidResolveCounter, 2);
	});

	test('resolve (with backup)', async () => {
		await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello backup')) });

		const backup = await workingCopy.backup(CancellationToken.None);
		await accessor.workingCopyBackupService.backup(workingCopy, backup.content, undefined, backup.meta);

		assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);

		workingCopy.dispose();

		// first resolve loads from backup
		workingCopy = createWorkingCopy();
		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.isReadonly(), false);
		assert.strictEqual(workingCopy.model?.contents, 'hello backup');

		workingCopy.model.updateContents('hello updated');
		await workingCopy.save();

		// subsequent resolve ignores any backups
		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.model?.contents, 'Hello Html');
	});

	test('resolve (with backup, preserves metadata and orphaned state)', async () => {
		return runWithFakedTimers({}, async () => {
			await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello backup')) });

			const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);

			accessor.fileService.notExistsSet.set(resource, true);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));

			await orphanedPromise;
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);

			const backup = await workingCopy.backup(CancellationToken.None);
			await accessor.workingCopyBackupService.backup(workingCopy, backup.content, undefined, backup.meta);

			assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);

			workingCopy.dispose();

			workingCopy = createWorkingCopy();
			await workingCopy.resolve();

			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);

			const backup2 = await workingCopy.backup(CancellationToken.None);
			assert.deepStrictEqual(backup.meta, backup2.meta);
		});
	});

	test('resolve (updates orphaned state accordingly)', async () => {
		return runWithFakedTimers({}, async () => {
			await workingCopy.resolve();

			const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);

			accessor.fileService.notExistsSet.set(resource, true);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));

			await orphanedPromise;
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);

			// resolving clears orphaned state when successful
			accessor.fileService.notExistsSet.delete(resource);
			await workingCopy.resolve({ forceReadFromFile: true });
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);

			// resolving adds orphaned state when fail to read
			try {
				accessor.fileService.readShouldThrowError = new FileOperationError('file not found', FileOperationResult.FILE_NOT_FOUND);
				await workingCopy.resolve();
				assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
			} finally {
				accessor.fileService.readShouldThrowError = undefined;
			}
		});
	});

	test('stat.readonly and stat.locked can change when decreased mtime is ignored', async function () {

		await workingCopy.resolve();

		const stat = assertIsDefined(getLastResolvedFileStat(workingCopy));
		try {
			accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('error', { ...stat, mtime: stat.mtime - 1, readonly: !stat.readonly, locked: !stat.locked });
			await workingCopy.resolve();
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(getLastResolvedFileStat(workingCopy)?.mtime, stat.mtime, 'mtime should not decrease');
		assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.readonly, stat.readonly, 'readonly should have changed despite simultaneous attempt to decrease mtime');
		assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.locked, stat.locked, 'locked should have changed despite simultaneous attempt to decrease mtime');
	});

	test('resolve (FILE_NOT_MODIFIED_SINCE can be handled for resolved working copies)', async () => {
		await workingCopy.resolve();

		try {
			accessor.fileService.readShouldThrowError = new FileOperationError('file not modified since', FileOperationResult.FILE_NOT_MODIFIED_SINCE);
			await workingCopy.resolve();
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(workingCopy.model?.contents, 'Hello Html');
	});

	test('resolve (FILE_NOT_MODIFIED_SINCE still updates readonly state)', async () => {
		let readonlyChangeCounter = 0;
		disposables.add(workingCopy.onDidChangeReadonly(() => readonlyChangeCounter++));

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isReadonly(), false);

		const stat = await accessor.fileService.resolve(workingCopy.resource, { resolveMetadata: true });

		try {
			accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('file not modified since', { ...stat, readonly: true });
			await workingCopy.resolve();
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(!!workingCopy.isReadonly(), true);
		assert.strictEqual(readonlyChangeCounter, 1);

		try {
			accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('file not modified since', { ...stat, readonly: false });
			await workingCopy.resolve();
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(workingCopy.isReadonly(), false);
		assert.strictEqual(readonlyChangeCounter, 2);
	});

	test('resolve does not alter content when model content changed in parallel', async () => {
		await workingCopy.resolve();

		const resolvePromise = workingCopy.resolve();

		workingCopy.model?.updateContents('changed content');

		await resolvePromise;

		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(workingCopy.model?.contents, 'changed content');
	});

	test('backup', async () => {
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello backup');

		const backup = await workingCopy.backup(CancellationToken.None);

		assert.ok(backup.meta);

		let backupContents: string | undefined = undefined;
		if (backup.content instanceof VSBuffer) {
			backupContents = backup.content.toString();
		} else if (isReadableStream(backup.content)) {
			backupContents = (await consumeStream(backup.content, chunks => VSBuffer.concat(chunks))).toString();
		} else if (backup.content) {
			backupContents = consumeReadable(backup.content, chunks => VSBuffer.concat(chunks)).toString();
		}

		assert.strictEqual(backupContents, 'hello backup');
	});

	test('save (no errors) - simple', async () => {
		let savedCounter = 0;
		let lastSaveEvent: IStoredFileWorkingCopySaveEvent | undefined = undefined;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
			lastSaveEvent = e;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// unresolved
		await workingCopy.save();
		assert.strictEqual(savedCounter, 0);
		assert.strictEqual(saveErrorCounter, 0);

		// simple
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello save');
		await workingCopy.save();

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(lastSaveEvent!.reason, SaveReason.EXPLICIT);
		assert.ok(lastSaveEvent!.stat);
		assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent!));
		assert.strictEqual(workingCopy.model?.pushedStackElement, true);
	});

	test('save (no errors) - save reason', async () => {
		let savedCounter = 0;
		let lastSaveEvent: IStoredFileWorkingCopySaveEvent | undefined = undefined;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
			lastSaveEvent = e;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// save reason
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello save');

		const source = SaveSourceRegistry.registerSource('testSource', 'Hello Save');
		await workingCopy.save({ reason: SaveReason.AUTO, source });

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(lastSaveEvent!.reason, SaveReason.AUTO);
		assert.strictEqual(lastSaveEvent!.source, source);
	});

	test('save (no errors) - multiple', async () => {
		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// multiple saves in parallel are fine and result
		// in a single save when content does not change
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello save');
		await Promises.settled([
			workingCopy.save({ reason: SaveReason.AUTO }),
			workingCopy.save({ reason: SaveReason.EXPLICIT }),
			workingCopy.save({ reason: SaveReason.WINDOW_CHANGE })
		]);

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('save (no errors) - multiple, cancellation', async () => {
		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// multiple saves in parallel are fine and result
		// in just one save operation (the second one
		// cancels the first)
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello save');
		const firstSave = workingCopy.save();
		workingCopy.model?.updateContents('hello save more');
		const secondSave = workingCopy.save();

		await Promises.settled([firstSave, secondSave]);
		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('save (no errors) - not forced but not dirty', async () => {
		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// no save when not forced and not dirty
		await workingCopy.resolve();
		await workingCopy.save();
		assert.strictEqual(savedCounter, 0);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('save (no errors) - forced but not dirty', async () => {
		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(e => {
			savedCounter++;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		// save when forced even when not dirty
		await workingCopy.resolve();
		await workingCopy.save({ force: true });
		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 0);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('save (no errors) - save clears orphaned', async () => {
		return runWithFakedTimers({}, async () => {
			let savedCounter = 0;
			disposables.add(workingCopy.onDidSave(e => {
				savedCounter++;
			}));

			let saveErrorCounter = 0;
			disposables.add(workingCopy.onDidSaveError(() => {
				saveErrorCounter++;
			}));

			await workingCopy.resolve();

			// save clears orphaned
			const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);

			accessor.fileService.notExistsSet.set(resource, true);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));

			await orphanedPromise;
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);

			await workingCopy.save({ force: true });
			assert.strictEqual(savedCounter, 1);
			assert.strictEqual(saveErrorCounter, 0);
			assert.strictEqual(workingCopy.isDirty(), false);
			assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
		});
	});

	test('save (errors)', async () => {
		let savedCounter = 0;
		disposables.add(workingCopy.onDidSave(reason => {
			savedCounter++;
		}));

		let saveErrorCounter = 0;
		disposables.add(workingCopy.onDidSaveError(() => {
			saveErrorCounter++;
		}));

		await workingCopy.resolve();

		// save error: any error marks working copy dirty
		try {
			accessor.fileService.writeShouldThrowError = new FileOperationError('write error', FileOperationResult.FILE_PERMISSION_DENIED);

			await workingCopy.save({ force: true });
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		assert.strictEqual(savedCounter, 0);
		assert.strictEqual(saveErrorCounter, 1);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
		assert.strictEqual(workingCopy.isDirty(), true);

		// save is a no-op unless forced when in error case
		await workingCopy.save({ reason: SaveReason.AUTO });
		assert.strictEqual(savedCounter, 0);
		assert.strictEqual(saveErrorCounter, 1);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
		assert.strictEqual(workingCopy.isDirty(), true);

		// save clears error flags when successful
		await workingCopy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 1);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
		assert.strictEqual(workingCopy.isDirty(), false);

		// save error: conflict
		try {
			accessor.fileService.writeShouldThrowError = new FileOperationError('write error conflict', FileOperationResult.FILE_MODIFIED_SINCE);

			await workingCopy.save({ force: true });
		} catch (error) {
			// error is expected
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(saveErrorCounter, 2);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), true);
		assert.strictEqual(workingCopy.isDirty(), true);

		// save clears error flags when successful
		await workingCopy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(savedCounter, 2);
		assert.strictEqual(saveErrorCounter, 2);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('save (errors, bubbles up with `ignoreErrorHandler`)', async () => {
		await workingCopy.resolve();

		let error: Error | undefined = undefined;
		try {
			accessor.fileService.writeShouldThrowError = new FileOperationError('write error', FileOperationResult.FILE_PERMISSION_DENIED);

			await workingCopy.save({ force: true, ignoreErrorHandler: true });
		} catch (e) {
			error = e;
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		assert.ok(error);
	});

	test('save - returns false when save fails', async function () {
		await workingCopy.resolve();

		try {
			accessor.fileService.writeShouldThrowError = new FileOperationError('write error', FileOperationResult.FILE_PERMISSION_DENIED);

			const res = await workingCopy.save({ force: true });
			assert.strictEqual(res, false);
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		const res = await workingCopy.save({ force: true });
		assert.strictEqual(res, true);
	});

	test('save participant', async () => {
		await workingCopy.resolve();

		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);

		let participationCounter = 0;
		const disposable = accessor.workingCopyFileService.addSaveParticipant({
			participate: async (wc) => {
				if (workingCopy === wc) {
					participationCounter++;
				}
			}
		});

		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);

		await workingCopy.save({ force: true });
		assert.strictEqual(participationCounter, 1);

		await workingCopy.save({ force: true, skipSaveParticipants: true });
		assert.strictEqual(participationCounter, 1);

		disposable.dispose();
		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);

		await workingCopy.save({ force: true });
		assert.strictEqual(participationCounter, 1);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (sync save)', async function () {
		await workingCopy.resolve();

		await testSaveFromSaveParticipant(workingCopy, false);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (async save)', async function () {
		await workingCopy.resolve();

		await testSaveFromSaveParticipant(workingCopy, true);
	});

	async function testSaveFromSaveParticipant(workingCopy: StoredFileWorkingCopy<TestStoredFileWorkingCopyModel>, async: boolean): Promise<void> {
		const from = URI.file('testFrom');
		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);

		const disposable = accessor.workingCopyFileService.addSaveParticipant({
			participate: async (wc, context) => {

				if (async) {
					await timeout(10);
				}

				await workingCopy.save({ force: true });
			}
		});

		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);

		await workingCopy.save({ force: true, from });

		disposable.dispose();
	}

	test('Save Participant carries context', async function () {
		await workingCopy.resolve();

		const from = URI.file('testFrom');
		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);

		let e: Error | undefined = undefined;
		const disposable = accessor.workingCopyFileService.addSaveParticipant({
			participate: async (wc, context) => {
				try {
					assert.strictEqual(context.reason, SaveReason.EXPLICIT);
					assert.strictEqual(context.savedFrom?.toString(), from.toString());
				} catch (error) {
					e = error;
				}
			}
		});

		assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);

		await workingCopy.save({ force: true, from });

		if (e) {
			throw e;
		}

		disposable.dispose();
	});

	test('revert', async () => {
		await workingCopy.resolve();
		workingCopy.model?.updateContents('hello revert');

		let revertedCounter = 0;
		disposables.add(workingCopy.onDidRevert(() => {
			revertedCounter++;
		}));

		// revert: soft
		await workingCopy.revert({ soft: true });

		assert.strictEqual(revertedCounter, 1);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.model?.contents, 'hello revert');

		// revert: not forced
		await workingCopy.revert();
		assert.strictEqual(revertedCounter, 1);
		assert.strictEqual(workingCopy.model?.contents, 'hello revert');

		// revert: forced
		await workingCopy.revert({ force: true });
		assert.strictEqual(revertedCounter, 2);
		assert.strictEqual(workingCopy.model?.contents, 'Hello Html');

		// revert: forced, error
		try {
			workingCopy.model?.updateContents('hello revert');
			accessor.fileService.readShouldThrowError = new FileOperationError('error', FileOperationResult.FILE_PERMISSION_DENIED);

			await workingCopy.revert({ force: true });
		} catch (error) {
			// expected (our error)
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(revertedCounter, 2);
		assert.strictEqual(workingCopy.isDirty(), true);

		// revert: forced, file not found error is ignored
		try {
			workingCopy.model?.updateContents('hello revert');
			accessor.fileService.readShouldThrowError = new FileOperationError('error', FileOperationResult.FILE_NOT_FOUND);

			await workingCopy.revert({ force: true });
		} catch (error) {
			// expected (our error)
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}

		assert.strictEqual(revertedCounter, 3);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('state', async () => {
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);

		await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello state')) });
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);

		const savePromise = workingCopy.save();
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), true);

		await savePromise;

		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
	});

	test('joinState', async () => {
		await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello state')) });

		workingCopy.save();
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), true);

		await workingCopy.joinState(StoredFileWorkingCopyState.PENDING_SAVE);

		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
		assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
	});

	test('isReadonly, isResolved, dispose, isDisposed', async () => {
		assert.strictEqual(workingCopy.isResolved(), false);
		assert.strictEqual(workingCopy.isReadonly(), false);
		assert.strictEqual(workingCopy.isDisposed(), false);

		await workingCopy.resolve();

		assert.ok(workingCopy.model);
		assert.strictEqual(workingCopy.isResolved(), true);
		assert.strictEqual(workingCopy.isReadonly(), false);
		assert.strictEqual(workingCopy.isDisposed(), false);

		let disposedEvent = false;
		disposables.add(workingCopy.onWillDispose(() => {
			disposedEvent = true;
		}));

		let disposedModelEvent = false;
		disposables.add(workingCopy.model.onWillDispose(() => {
			disposedModelEvent = true;
		}));

		workingCopy.dispose();

		assert.strictEqual(workingCopy.isDisposed(), true);
		assert.strictEqual(disposedEvent, true);
		assert.strictEqual(disposedModelEvent, true);
	});

	test('readonly change event', async () => {
		accessor.fileService.readonly = true;

		await workingCopy.resolve();

		assert.strictEqual(!!workingCopy.isReadonly(), true);

		accessor.fileService.readonly = false;

		let readonlyEvent = false;
		disposables.add(workingCopy.onDidChangeReadonly(() => {
			readonlyEvent = true;
		}));

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isReadonly(), false);
		assert.strictEqual(readonlyEvent, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
