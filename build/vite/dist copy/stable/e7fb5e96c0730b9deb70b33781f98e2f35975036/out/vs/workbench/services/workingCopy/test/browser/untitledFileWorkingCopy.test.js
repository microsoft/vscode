/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { newWriteableBufferStream, VSBuffer, streamToBuffer, bufferToStream, readableToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { consumeReadable, consumeStream, isReadable, isReadableStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UntitledFileWorkingCopy } from '../../common/untitledFileWorkingCopy.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
export class TestUntitledFileWorkingCopyModel extends Disposable {
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
        this._onDidChangeContent.fire({ isInitial: newContents.length === 0 });
    }
    pushStackElement() {
        this.pushedStackElement = true;
    }
    dispose() {
        this._onWillDispose.fire();
        super.dispose();
    }
}
export class TestUntitledFileWorkingCopyModelFactory {
    async createModel(resource, contents, token) {
        return new TestUntitledFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
    }
}
suite('UntitledFileWorkingCopy', () => {
    const factory = new TestUntitledFileWorkingCopyModelFactory();
    const disposables = new DisposableStore();
    const resource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
    let instantiationService;
    let accessor;
    let workingCopy;
    function createWorkingCopy(uri = resource, hasAssociatedFilePath = false, initialValue = '') {
        return disposables.add(new UntitledFileWorkingCopy('testUntitledWorkingCopyType', uri, basename(uri), hasAssociatedFilePath, false, initialValue.length > 0 ? { value: bufferToStream(VSBuffer.fromString(initialValue)) } : undefined, factory, async (workingCopy) => { await workingCopy.revert(); return true; }, accessor.workingCopyService, accessor.workingCopyBackupService, accessor.logService));
    }
    setup(() => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
        workingCopy = disposables.add(createWorkingCopy());
    });
    teardown(() => {
        disposables.clear();
    });
    test('registers with working copy service', async () => {
        assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
        workingCopy.dispose();
        assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    });
    test('dirty', async () => {
        assert.strictEqual(workingCopy.isDirty(), false);
        let changeDirtyCounter = 0;
        disposables.add(workingCopy.onDidChangeDirty(() => {
            changeDirtyCounter++;
        }));
        let contentChangeCounter = 0;
        disposables.add(workingCopy.onDidChangeContent(() => {
            contentChangeCounter++;
        }));
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.isResolved(), true);
        // Dirty from: Model content change
        workingCopy.model?.updateContents('hello dirty');
        assert.strictEqual(contentChangeCounter, 1);
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(changeDirtyCounter, 1);
        await workingCopy.save();
        assert.strictEqual(workingCopy.isDirty(), false);
        assert.strictEqual(changeDirtyCounter, 2);
    });
    test('dirty - cleared when content event signals isEmpty', async () => {
        assert.strictEqual(workingCopy.isDirty(), false);
        await workingCopy.resolve();
        workingCopy.model?.updateContents('hello dirty');
        assert.strictEqual(workingCopy.isDirty(), true);
        workingCopy.model?.fireContentChangeEvent({ isInitial: true });
        assert.strictEqual(workingCopy.isDirty(), false);
    });
    test('dirty - not cleared when content event signals isEmpty when associated resource', async () => {
        workingCopy.dispose();
        workingCopy = createWorkingCopy(resource, true);
        await workingCopy.resolve();
        workingCopy.model?.updateContents('hello dirty');
        assert.strictEqual(workingCopy.isDirty(), true);
        workingCopy.model?.fireContentChangeEvent({ isInitial: true });
        assert.strictEqual(workingCopy.isDirty(), true);
    });
    test('revert', async () => {
        let revertCounter = 0;
        disposables.add(workingCopy.onDidRevert(() => {
            revertCounter++;
        }));
        let disposeCounter = 0;
        disposables.add(workingCopy.onWillDispose(() => {
            disposeCounter++;
        }));
        await workingCopy.resolve();
        workingCopy.model?.updateContents('hello dirty');
        assert.strictEqual(workingCopy.isDirty(), true);
        await workingCopy.revert();
        assert.strictEqual(revertCounter, 1);
        assert.strictEqual(disposeCounter, 1);
        assert.strictEqual(workingCopy.isDirty(), false);
    });
    test('dispose', async () => {
        let disposeCounter = 0;
        disposables.add(workingCopy.onWillDispose(() => {
            disposeCounter++;
        }));
        await workingCopy.resolve();
        workingCopy.dispose();
        assert.strictEqual(disposeCounter, 1);
    });
    test('backup', async () => {
        assert.strictEqual((await workingCopy.backup(CancellationToken.None)).content, undefined);
        await workingCopy.resolve();
        workingCopy.model?.updateContents('Hello Backup');
        const backup = await workingCopy.backup(CancellationToken.None);
        let backupContents = undefined;
        if (isReadableStream(backup.content)) {
            backupContents = (await consumeStream(backup.content, chunks => VSBuffer.concat(chunks))).toString();
        }
        else if (backup.content) {
            backupContents = consumeReadable(backup.content, chunks => VSBuffer.concat(chunks)).toString();
        }
        assert.strictEqual(backupContents, 'Hello Backup');
    });
    test('resolve - without contents', async () => {
        assert.strictEqual(workingCopy.isResolved(), false);
        assert.strictEqual(workingCopy.hasAssociatedFilePath, false);
        assert.strictEqual(workingCopy.model, undefined);
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.isResolved(), true);
        assert.ok(workingCopy.model);
    });
    test('resolve - with initial contents', async () => {
        workingCopy.dispose();
        workingCopy = createWorkingCopy(resource, false, 'Hello Initial');
        let contentChangeCounter = 0;
        disposables.add(workingCopy.onDidChangeContent(() => {
            contentChangeCounter++;
        }));
        assert.strictEqual(workingCopy.isDirty(), true);
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(workingCopy.model?.contents, 'Hello Initial');
        assert.strictEqual(contentChangeCounter, 1);
        workingCopy.model.updateContents('Changed contents');
        await workingCopy.resolve(); // second resolve should be ignored
        assert.strictEqual(workingCopy.model?.contents, 'Changed contents');
    });
    test('backup - with initial contents uses those even if unresolved', async () => {
        workingCopy.dispose();
        workingCopy = createWorkingCopy(resource, false, 'Hello Initial');
        assert.strictEqual(workingCopy.isDirty(), true);
        const backup = (await workingCopy.backup(CancellationToken.None)).content;
        if (isReadableStream(backup)) {
            const value = await streamToBuffer(backup);
            assert.strictEqual(value.toString(), 'Hello Initial');
        }
        else if (isReadable(backup)) {
            const value = readableToBuffer(backup);
            assert.strictEqual(value.toString(), 'Hello Initial');
        }
        else {
            assert.fail('Missing untitled backup');
        }
    });
    test('resolve - with associated resource', async () => {
        workingCopy.dispose();
        workingCopy = createWorkingCopy(resource, true);
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(workingCopy.hasAssociatedFilePath, true);
    });
    test('resolve - with backup', async () => {
        await workingCopy.resolve();
        workingCopy.model?.updateContents('Hello Backup');
        const backup = await workingCopy.backup(CancellationToken.None);
        await accessor.workingCopyBackupService.backup(workingCopy, backup.content, undefined, backup.meta);
        assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);
        workingCopy.dispose();
        workingCopy = createWorkingCopy();
        let contentChangeCounter = 0;
        disposables.add(workingCopy.onDidChangeContent(() => {
            contentChangeCounter++;
        }));
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.isDirty(), true);
        assert.strictEqual(workingCopy.model?.contents, 'Hello Backup');
        assert.strictEqual(contentChangeCounter, 1);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRGaWxlV29ya2luZ0NvcHkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS90ZXN0L2Jyb3dzZXIvdW50aXRsZWRGaWxlV29ya2luZ0NvcHkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUEwQix3QkFBd0IsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0TCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUduRyxPQUFPLEVBQXlILHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDek0sT0FBTyxFQUFFLG1CQUFtQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFdkgsTUFBTSxPQUFPLGdDQUFpQyxTQUFRLFVBQVU7SUFRL0QsWUFBcUIsUUFBYSxFQUFTLFFBQWdCO1FBQzFELEtBQUssRUFBRSxDQUFDO1FBRFksYUFBUSxHQUFSLFFBQVEsQ0FBSztRQUFTLGFBQVEsR0FBUixRQUFRLENBQVE7UUFOMUMsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0QsQ0FBQyxDQUFDO1FBQzlHLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFNUMsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUM3RCxrQkFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDO1FBYzNDLG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBNEJoQyxjQUFTLEdBQUcsQ0FBQyxDQUFDO1FBRWQsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO0lBeEMzQixDQUFDO0lBRUQsc0JBQXNCLENBQUMsS0FBdUQ7UUFDN0UsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsY0FBYyxDQUFDLFdBQW1CO1FBQ2pDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUdELGtCQUFrQjtRQUNqQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUM3QixDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUF3QixFQUFFLEtBQXdCO1FBQ2hFLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLHdCQUF3QixFQUFFLENBQUM7UUFDMUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBRS9DLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBZ0MsRUFBRSxLQUF3QjtRQUN0RSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFTyxRQUFRLENBQUMsV0FBbUI7UUFDbkMsSUFBSSxDQUFDLFFBQVEsR0FBRyxXQUFXLENBQUM7UUFFNUIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRWpCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFNRCxnQkFBZ0I7UUFDZixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO0lBQ2hDLENBQUM7SUFFUSxPQUFPO1FBQ2YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUUzQixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHVDQUF1QztJQUVuRCxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQWEsRUFBRSxRQUFnQyxFQUFFLEtBQXdCO1FBQzFGLE9BQU8sSUFBSSxnQ0FBZ0MsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDcEcsQ0FBQztDQUNEO0FBRUQsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUVyQyxNQUFNLE9BQU8sR0FBRyxJQUFJLHVDQUF1QyxFQUFFLENBQUM7SUFFOUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7SUFDNUUsSUFBSSxvQkFBMkMsQ0FBQztJQUNoRCxJQUFJLFFBQTZCLENBQUM7SUFDbEMsSUFBSSxXQUFzRSxDQUFDO0lBRTNFLFNBQVMsaUJBQWlCLENBQUMsTUFBVyxRQUFRLEVBQUUscUJBQXFCLEdBQUcsS0FBSyxFQUFFLFlBQVksR0FBRyxFQUFFO1FBQy9GLE9BQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixDQUNqRCw2QkFBNkIsRUFDN0IsR0FBRyxFQUNILFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFDYixxQkFBcUIsRUFDckIsS0FBSyxFQUNMLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFDbEcsT0FBTyxFQUNQLEtBQUssRUFBQyxXQUFXLEVBQUMsRUFBRSxHQUFHLE1BQU0sV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQ2pFLFFBQVEsQ0FBQyxrQkFBa0IsRUFDM0IsUUFBUSxDQUFDLHdCQUF3QixFQUNqQyxRQUFRLENBQUMsVUFBVSxDQUNuQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLG9CQUFvQixHQUFHLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM3RSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFcEUsV0FBVyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXhFLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUV0QixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRCxJQUFJLGtCQUFrQixHQUFHLENBQUMsQ0FBQztRQUMzQixXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUU7WUFDakQsa0JBQWtCLEVBQUUsQ0FBQztRQUN0QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxvQkFBb0IsR0FBRyxDQUFDLENBQUM7UUFDN0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQ25ELG9CQUFvQixFQUFFLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRW5ELG1DQUFtQztRQUNuQyxXQUFXLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsTUFBTSxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRCxNQUFNLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUU1QixXQUFXLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVoRCxXQUFXLENBQUMsS0FBSyxFQUFFLHNCQUFzQixDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFL0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUZBQWlGLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEcsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RCLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEQsTUFBTSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFNUIsV0FBVyxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEQsV0FBVyxDQUFDLEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRS9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2pELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDdEIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUM1QyxhQUFhLEVBQUUsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUU7WUFDOUMsY0FBYyxFQUFFLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTVCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWhELE1BQU0sV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRTNCLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxQixJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFDdkIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUM5QyxjQUFjLEVBQUUsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXRCLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6QixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsTUFBTSxXQUFXLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTFGLE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTVCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sTUFBTSxHQUFHLE1BQU0sV0FBVyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVoRSxJQUFJLGNBQWMsR0FBdUIsU0FBUyxDQUFDO1FBQ25ELElBQUksZ0JBQWdCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdEMsY0FBYyxHQUFHLENBQUMsTUFBTSxhQUFhLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RHLENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMzQixjQUFjLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEcsQ0FBQztRQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVqRCxNQUFNLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUU1QixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsRCxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFdEIsV0FBVyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFbEUsSUFBSSxvQkFBb0IsR0FBRyxDQUFDLENBQUM7UUFDN0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQ25ELG9CQUFvQixFQUFFLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWhELE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTVCLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1QyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRXJELE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsbUNBQW1DO1FBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUNyRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4REFBOEQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFdEIsV0FBVyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxNQUFNLFdBQVcsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDMUUsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzlCLE1BQU0sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDLE1BQWdDLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN2RCxDQUFDO2FBQU0sSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUMvQixNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxNQUEwQixDQUFDLENBQUM7WUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDdkQsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBR0gsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JELFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN0QixXQUFXLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWhELE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTVCLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hDLE1BQU0sV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRWxELE1BQU0sTUFBTSxHQUFHLE1BQU0sV0FBVyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRSxNQUFNLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVwRyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFdkYsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXRCLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1FBRWxDLElBQUksb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO1FBQzdCLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtZQUNuRCxvQkFBb0IsRUFBRSxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUU1QixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0FBQzNDLENBQUMsQ0FBQyxDQUFDIn0=