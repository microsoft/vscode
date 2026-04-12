/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { StoredFileWorkingCopy, isStoredFileWorkingCopySaveEvent } from '../../common/storedFileWorkingCopy.js';
import { bufferToStream, newWriteableBufferStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { getLastResolvedFileStat, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { basename } from '../../../../../base/common/resources.js';
import { FileChangesEvent, FileOperationError, NotModifiedSinceFileOperationError } from '../../../../../platform/files/common/files.js';
import { SaveSourceRegistry } from '../../../../common/editor.js';
import { Promises, timeout } from '../../../../../base/common/async.js';
import { consumeReadable, consumeStream, isReadableStream } from '../../../../../base/common/stream.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
export class TestStoredFileWorkingCopyModel extends Disposable {
    constructor(resource, contents) {
        super();
        this.resource = resource;
        this.contents = contents;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this.throwOnSnapshot = false;
        this.versionId = 0;
        this.pushedStackElement = false;
    }
    fireContentChangeEvent(event) {
        this._onDidChangeContent.fire(event);
    }
    updateContents(newContents) {
        this.doUpdate(newContents);
    }
    setThrowOnSnapshot() {
        this.throwOnSnapshot = true;
    }
    async snapshot(context, token) {
        if (this.throwOnSnapshot) {
            throw new Error('Fail');
        }
        const stream = newWriteableBufferStream();
        stream.end(VSBuffer.fromString(this.contents));
        return stream;
    }
    async update(contents, token) {
        this.doUpdate((await streamToBuffer(contents)).toString());
    }
    doUpdate(newContents) {
        this.contents = newContents;
        this.versionId++;
        this._onDidChangeContent.fire({ isRedoing: false, isUndoing: false });
    }
    pushStackElement() {
        this.pushedStackElement = true;
    }
    dispose() {
        this._onWillDispose.fire();
        super.dispose();
    }
}
export class TestStoredFileWorkingCopyModelWithCustomSave extends TestStoredFileWorkingCopyModel {
    constructor() {
        super(...arguments);
        this.saveCounter = 0;
        this.throwOnSave = false;
        this.saveOperation = undefined;
    }
    async save(options, token) {
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
            executable: false,
            children: undefined
        };
    }
}
export class TestStoredFileWorkingCopyModelFactory {
    async createModel(resource, contents, token) {
        return new TestStoredFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
    }
}
export class TestStoredFileWorkingCopyModelWithCustomSaveFactory {
    async createModel(resource, contents, token) {
        return new TestStoredFileWorkingCopyModelWithCustomSave(resource, (await streamToBuffer(contents)).toString());
    }
}
suite('StoredFileWorkingCopy (with custom save)', function () {
    const factory = new TestStoredFileWorkingCopyModelWithCustomSaveFactory();
    const disposables = new DisposableStore();
    let instantiationService;
    let accessor;
    let workingCopy;
    setup(() => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
        const resource = URI.file('test/resource');
        workingCopy = disposables.add(new StoredFileWorkingCopy('testStoredFileWorkingCopyType', resource, basename(resource), factory, options => workingCopy.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService));
    });
    teardown(() => {
        disposables.clear();
    });
    test('save (custom implemented)', async () => {
        let savedCounter = 0;
        let lastSaveEvent = undefined;
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
        assert.strictEqual(lastSaveEvent.reason, 1 /* SaveReason.EXPLICIT */);
        assert.ok(lastSaveEvent.stat);
        assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
        assert.strictEqual(workingCopy.model?.pushedStackElement, true);
        assert.strictEqual(workingCopy.model.saveCounter, 1);
        // error
        workingCopy.model?.updateContents('hello save error');
        workingCopy.model.throwOnSave = true;
        await workingCopy.save();
        assert.strictEqual(saveErrorCounter, 1);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), true);
    });
    test('save cancelled (custom implemented)', async () => {
        let savedCounter = 0;
        let lastSaveEvent = undefined;
        disposables.add(workingCopy.onDidSave(e => {
            savedCounter++;
            lastSaveEvent = e;
        }));
        let saveErrorCounter = 0;
        disposables.add(workingCopy.onDidSaveError(() => {
            saveErrorCounter++;
        }));
        await workingCopy.resolve();
        let resolve;
        workingCopy.model.saveOperation = new Promise(r => resolve = r);
        workingCopy.model?.updateContents('first');
        const firstSave = workingCopy.save();
        // cancel the first save by requesting a second while it is still mid operation
        workingCopy.model?.updateContents('second');
        const secondSave = workingCopy.save();
        resolve();
        await firstSave;
        await secondSave;
        assert.strictEqual(savedCounter, 1);
        assert.strictEqual(saveErrorCounter, 0);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(lastSaveEvent.reason, 1 /* SaveReason.EXPLICIT */);
        assert.ok(lastSaveEvent.stat);
        assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
        assert.strictEqual(workingCopy.model?.pushedStackElement, true);
        assert.strictEqual(workingCopy.model.saveCounter, 1);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
suite('StoredFileWorkingCopy', function () {
    const factory = new TestStoredFileWorkingCopyModelFactory();
    const disposables = new DisposableStore();
    const resource = URI.file('test/resource');
    let instantiationService;
    let accessor;
    let workingCopy;
    function createWorkingCopy(uri = resource) {
        const workingCopy = new StoredFileWorkingCopy('testStoredFileWorkingCopyType', uri, basename(uri), factory, options => workingCopy.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService);
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
            workingCopy.dispose();
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
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), false);
            let onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
            accessor.fileService.notExistsSet.set(resource, true);
            accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: 2 /* FileChangeType.DELETED */ }], false));
            await onDidChangeOrphanedPromise;
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
            accessor.fileService.notExistsSet.delete(resource);
            accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: 1 /* FileChangeType.ADDED */ }], false));
            await onDidChangeOrphanedPromise;
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), false);
        });
    });
    test('dirty / modified', async () => {
        assert.strictEqual(workingCopy.isModified(), false);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
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
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), true);
        assert.strictEqual(changeDirtyCounter, 1);
        await workingCopy.save();
        assert.strictEqual(workingCopy.isModified(), false);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
        assert.strictEqual(changeDirtyCounter, 2);
        assert.strictEqual(savedCounter, 1);
        // Dirty from: Initial contents
        await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello dirty stream')) });
        assert.strictEqual(contentChangeCounter, 2); // content of model did not change
        assert.strictEqual(workingCopy.isModified(), true);
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), true);
        assert.strictEqual(changeDirtyCounter, 3);
        await workingCopy.revert({ soft: true });
        assert.strictEqual(workingCopy.isModified(), false);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
        assert.strictEqual(changeDirtyCounter, 4);
        // Modified from: API
        workingCopy.markModified();
        assert.strictEqual(workingCopy.isModified(), true);
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), true);
        assert.strictEqual(changeDirtyCounter, 5);
        await workingCopy.revert();
        assert.strictEqual(workingCopy.isModified(), false);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
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
        workingCopy.model.versionId--;
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
            accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: 2 /* FileChangeType.DELETED */ }], false));
            await orphanedPromise;
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            const backup = await workingCopy.backup(CancellationToken.None);
            await accessor.workingCopyBackupService.backup(workingCopy, backup.content, undefined, backup.meta);
            assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);
            workingCopy.dispose();
            workingCopy = createWorkingCopy();
            await workingCopy.resolve();
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            const backup2 = await workingCopy.backup(CancellationToken.None);
            assert.deepStrictEqual(backup.meta, backup2.meta);
        });
    });
    test('resolve (updates orphaned state accordingly)', async () => {
        return runWithFakedTimers({}, async () => {
            await workingCopy.resolve();
            const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
            accessor.fileService.notExistsSet.set(resource, true);
            accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: 2 /* FileChangeType.DELETED */ }], false));
            await orphanedPromise;
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            // resolving clears orphaned state when successful
            accessor.fileService.notExistsSet.delete(resource);
            await workingCopy.resolve({ forceReadFromFile: true });
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), false);
            // resolving adds orphaned state when fail to read
            try {
                accessor.fileService.readShouldThrowError = new FileOperationError('file not found', 1 /* FileOperationResult.FILE_NOT_FOUND */);
                await workingCopy.resolve();
                assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            }
            finally {
                accessor.fileService.readShouldThrowError = undefined;
            }
        });
    });
    test('stat.readonly and stat.locked can change when decreased mtime is ignored', async function () {
        await workingCopy.resolve();
        const stat = assertReturnsDefined(getLastResolvedFileStat(workingCopy));
        try {
            accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('error', { ...stat, mtime: stat.mtime - 1, readonly: !stat.readonly, locked: !stat.locked });
            await workingCopy.resolve();
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(getLastResolvedFileStat(workingCopy)?.mtime, stat.mtime, 'mtime should not decrease');
        assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.readonly, stat.readonly, 'readonly should have changed despite simultaneous attempt to decrease mtime');
        assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.locked, stat.locked, 'locked should have changed despite simultaneous attempt to decrease mtime');
    });
    test('resolve (FILE_NOT_MODIFIED_SINCE can be handled for resolved working copies)', async () => {
        await workingCopy.resolve();
        try {
            accessor.fileService.readShouldThrowError = new FileOperationError('file not modified since', 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */);
            await workingCopy.resolve();
        }
        finally {
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
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(!!workingCopy.isReadonly(), true);
        assert.strictEqual(readonlyChangeCounter, 1);
        try {
            accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('file not modified since', { ...stat, readonly: false });
            await workingCopy.resolve();
        }
        finally {
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
        let backupContents = undefined;
        if (backup.content instanceof VSBuffer) {
            backupContents = backup.content.toString();
        }
        else if (isReadableStream(backup.content)) {
            backupContents = (await consumeStream(backup.content, chunks => VSBuffer.concat(chunks))).toString();
        }
        else if (backup.content) {
            backupContents = consumeReadable(backup.content, chunks => VSBuffer.concat(chunks)).toString();
        }
        assert.strictEqual(backupContents, 'hello backup');
    });
    test('save (no errors) - simple', async () => {
        let savedCounter = 0;
        let lastSaveEvent = undefined;
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
        assert.strictEqual(lastSaveEvent.reason, 1 /* SaveReason.EXPLICIT */);
        assert.ok(lastSaveEvent.stat);
        assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
        assert.strictEqual(workingCopy.model?.pushedStackElement, true);
    });
    test('save (no errors) - save reason', async () => {
        let savedCounter = 0;
        let lastSaveEvent = undefined;
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
        await workingCopy.save({ reason: 2 /* SaveReason.AUTO */, source });
        assert.strictEqual(savedCounter, 1);
        assert.strictEqual(saveErrorCounter, 0);
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(lastSaveEvent.reason, 2 /* SaveReason.AUTO */);
        assert.strictEqual(lastSaveEvent.source, source);
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
            workingCopy.save({ reason: 2 /* SaveReason.AUTO */ }),
            workingCopy.save({ reason: 1 /* SaveReason.EXPLICIT */ }),
            workingCopy.save({ reason: 4 /* SaveReason.WINDOW_CHANGE */ })
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
            accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: 2 /* FileChangeType.DELETED */ }], false));
            await orphanedPromise;
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), true);
            await workingCopy.save({ force: true });
            assert.strictEqual(savedCounter, 1);
            assert.strictEqual(saveErrorCounter, 0);
            assert.strictEqual(workingCopy.isDirty(), false);
            assert.strictEqual(workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */), false);
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
            accessor.fileService.writeShouldThrowError = new FileOperationError('write error', 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
            await workingCopy.save({ force: true });
        }
        finally {
            accessor.fileService.writeShouldThrowError = undefined;
        }
        assert.strictEqual(savedCounter, 0);
        assert.strictEqual(saveErrorCounter, 1);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), true);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), false);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
        assert.strictEqual(workingCopy.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */), false);
        assert.strictEqual(workingCopy.isDirty(), true);
        // save is a no-op unless forced when in error case
        await workingCopy.save({ reason: 2 /* SaveReason.AUTO */ });
        assert.strictEqual(savedCounter, 0);
        assert.strictEqual(saveErrorCounter, 1);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), true);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), false);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
        assert.strictEqual(workingCopy.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */), false);
        assert.strictEqual(workingCopy.isDirty(), true);
        // save clears error flags when successful
        await workingCopy.save({ reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(savedCounter, 1);
        assert.strictEqual(saveErrorCounter, 1);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), false);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), true);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
        assert.strictEqual(workingCopy.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */), false);
        assert.strictEqual(workingCopy.isDirty(), false);
        // save error: conflict
        try {
            accessor.fileService.writeShouldThrowError = new FileOperationError('write error conflict', 3 /* FileOperationResult.FILE_MODIFIED_SINCE */);
            await workingCopy.save({ force: true });
        }
        catch (error) {
            // error is expected
        }
        finally {
            accessor.fileService.writeShouldThrowError = undefined;
        }
        assert.strictEqual(savedCounter, 1);
        assert.strictEqual(saveErrorCounter, 2);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), true);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), false);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
        assert.strictEqual(workingCopy.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */), true);
        assert.strictEqual(workingCopy.isDirty(), true);
        // save clears error flags when successful
        await workingCopy.save({ reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(savedCounter, 2);
        assert.strictEqual(saveErrorCounter, 2);
        assert.strictEqual(workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */), false);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), true);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
        assert.strictEqual(workingCopy.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */), false);
        assert.strictEqual(workingCopy.isDirty(), false);
    });
    test('save (errors, bubbles up with `ignoreErrorHandler`)', async () => {
        await workingCopy.resolve();
        let error = undefined;
        try {
            accessor.fileService.writeShouldThrowError = new FileOperationError('write error', 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
            await workingCopy.save({ force: true, ignoreErrorHandler: true });
        }
        catch (e) {
            error = e;
        }
        finally {
            accessor.fileService.writeShouldThrowError = undefined;
        }
        assert.ok(error);
    });
    test('save - returns false when save fails', async function () {
        await workingCopy.resolve();
        try {
            accessor.fileService.writeShouldThrowError = new FileOperationError('write error', 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
            const res = await workingCopy.save({ force: true });
            assert.strictEqual(res, false);
        }
        finally {
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
    async function testSaveFromSaveParticipant(workingCopy, async) {
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
        let e = undefined;
        const disposable = accessor.workingCopyFileService.addSaveParticipant({
            participate: async (wc, context) => {
                try {
                    assert.strictEqual(context.reason, 1 /* SaveReason.EXPLICIT */);
                    assert.strictEqual(context.savedFrom?.toString(), from.toString());
                }
                catch (error) {
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
            accessor.fileService.readShouldThrowError = new FileOperationError('error', 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
            await workingCopy.revert({ force: true });
        }
        catch (error) {
            // expected (our error)
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(revertedCounter, 2);
        assert.strictEqual(workingCopy.isDirty(), true);
        // revert: forced, file not found error is ignored
        try {
            workingCopy.model?.updateContents('hello revert');
            accessor.fileService.readShouldThrowError = new FileOperationError('error', 1 /* FileOperationResult.FILE_NOT_FOUND */);
            await workingCopy.revert({ force: true });
        }
        catch (error) {
            // expected (our error)
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(revertedCounter, 3);
        assert.strictEqual(workingCopy.isDirty(), false);
    });
    test('state', async () => {
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), true);
        await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello state')) });
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), true);
        const savePromise = workingCopy.save();
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), true);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), false);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), true);
        await savePromise;
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), true);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
    });
    test('joinState', async () => {
        await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString('hello state')) });
        workingCopy.save();
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), true);
        await workingCopy.joinState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */);
        assert.strictEqual(workingCopy.hasState(1 /* StoredFileWorkingCopyState.DIRTY */), false);
        assert.strictEqual(workingCopy.hasState(0 /* StoredFileWorkingCopyState.SAVED */), true);
        assert.strictEqual(workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */), false);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmVkRmlsZVdvcmtpbmdDb3B5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya2luZ0NvcHkvdGVzdC9icm93c2VyL3N0b3JlZEZpbGVXb3JraW5nQ29weS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUscUJBQXFCLEVBQStJLGdDQUFnQyxFQUFtQyxNQUFNLHVDQUF1QyxDQUFDO0FBQzlSLE9BQU8sRUFBRSxjQUFjLEVBQUUsd0JBQXdCLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBMEIsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsSixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWhKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQWtCLGtCQUFrQixFQUFpRSxrQ0FBa0MsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hOLE9BQU8sRUFBYyxrQkFBa0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFB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