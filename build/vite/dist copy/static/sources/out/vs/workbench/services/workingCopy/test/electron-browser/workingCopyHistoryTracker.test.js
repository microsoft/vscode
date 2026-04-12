/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { TestContextService, TestWorkingCopy } from '../../../../test/common/workbenchTestServices.js';
import { randomPath } from '../../../../../base/common/extpath.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { WorkingCopyHistoryTracker } from '../../common/workingCopyHistoryTracker.js';
import { WorkingCopyService } from '../../common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestFileService, TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestWorkingCopyHistoryService } from './workingCopyHistoryService.test.js';
suite('WorkingCopyHistoryTracker', () => {
    let testDir;
    let historyHome;
    let workHome;
    let workingCopyHistoryService;
    let workingCopyService;
    let fileService;
    let configurationService;
    let tracker;
    let testFile1Path;
    let testFile2Path;
    const disposables = new DisposableStore();
    const testFile1PathContents = 'Hello Foo';
    const testFile2PathContents = [
        'Lorem ipsum ',
        'dolor öäü sit amet ',
        'adipiscing ßß elit',
        'consectetur '
    ].join('').repeat(1000);
    let increasingTimestampCounter = 1;
    async function addEntry(descriptor, token) {
        const entry = await workingCopyHistoryService.addEntry({
            ...descriptor,
            timestamp: increasingTimestampCounter++ // very important to get tests to not be flaky with stable sort order
        }, token);
        return assertReturnsDefined(entry);
    }
    setup(async () => {
        testDir = URI.file(randomPath(join('vsctests', 'workingcopyhistorytracker'))).with({ scheme: Schemas.inMemory });
        historyHome = joinPath(testDir, 'User', 'History');
        workHome = joinPath(testDir, 'work');
        workingCopyHistoryService = disposables.add(new TestWorkingCopyHistoryService(disposables));
        workingCopyService = disposables.add(new WorkingCopyService());
        fileService = workingCopyHistoryService._fileService;
        configurationService = workingCopyHistoryService._configurationService;
        tracker = disposables.add(createTracker());
        await fileService.createFolder(historyHome);
        await fileService.createFolder(workHome);
        testFile1Path = joinPath(workHome, 'foo.txt');
        testFile2Path = joinPath(workHome, 'bar.txt');
        await fileService.writeFile(testFile1Path, VSBuffer.fromString(testFile1PathContents));
        await fileService.writeFile(testFile2Path, VSBuffer.fromString(testFile2PathContents));
    });
    function createTracker() {
        return new WorkingCopyHistoryTracker(workingCopyService, workingCopyHistoryService, disposables.add(new UriIdentityService(disposables.add(new TestFileService()))), new TestPathService(undefined, Schemas.file), configurationService, new UndoRedoService(new TestDialogService(), new TestNotificationService()), new TestContextService(), workingCopyHistoryService._fileService);
    }
    teardown(async () => {
        await fileService.del(testDir, { recursive: true });
        disposables.clear();
    });
    test('history entry added on save', async () => {
        const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
        const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));
        const stat1 = await fileService.resolve(workingCopy1.resource, { resolveMetadata: true });
        const stat2 = await fileService.resolve(workingCopy2.resource, { resolveMetadata: true });
        disposables.add(workingCopyService.registerWorkingCopy(workingCopy1));
        disposables.add(workingCopyService.registerWorkingCopy(workingCopy2));
        const saveResult = new DeferredPromise();
        let addedCounter = 0;
        disposables.add(workingCopyHistoryService.onDidAddEntry(e => {
            if (isEqual(e.entry.workingCopy.resource, workingCopy1.resource) || isEqual(e.entry.workingCopy.resource, workingCopy2.resource)) {
                addedCounter++;
                if (addedCounter === 2) {
                    saveResult.complete();
                }
            }
        }));
        await workingCopy1.save(undefined, stat1);
        await workingCopy2.save(undefined, stat2);
        await saveResult.p;
    });
    test('history entry skipped when setting disabled (globally)', async () => {
        configurationService.setUserConfiguration('workbench.localHistory.enabled', false, testFile1Path);
        return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
    });
    test('history entry skipped when setting disabled (exclude)', () => {
        configurationService.setUserConfiguration('workbench.localHistory.exclude', { '**/foo.txt': true });
        // Recreate to apply settings
        tracker.dispose();
        tracker = disposables.add(createTracker());
        return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
    });
    test('history entry skipped when too large', async () => {
        configurationService.setUserConfiguration('workbench.localHistory.maxFileSize', 0, testFile1Path);
        return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
    });
    async function assertNoLocalHistoryEntryAddedWithSettingsConfigured() {
        const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
        const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));
        const stat1 = await fileService.resolve(workingCopy1.resource, { resolveMetadata: true });
        const stat2 = await fileService.resolve(workingCopy2.resource, { resolveMetadata: true });
        disposables.add(workingCopyService.registerWorkingCopy(workingCopy1));
        disposables.add(workingCopyService.registerWorkingCopy(workingCopy2));
        const saveResult = new DeferredPromise();
        disposables.add(workingCopyHistoryService.onDidAddEntry(e => {
            if (isEqual(e.entry.workingCopy.resource, workingCopy1.resource)) {
                assert.fail('Unexpected working copy history entry: ' + e.entry.workingCopy.resource.toString());
            }
            if (isEqual(e.entry.workingCopy.resource, workingCopy2.resource)) {
                saveResult.complete();
            }
        }));
        await workingCopy1.save(undefined, stat1);
        await workingCopy2.save(undefined, stat2);
        await saveResult.p;
    }
    test('entries moved (file rename)', async () => {
        const entriesMoved = Event.toPromise(workingCopyHistoryService.onDidMoveEntries);
        const workingCopy = disposables.add(new TestWorkingCopy(testFile1Path));
        const entry1 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
        const entry2 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
        const entry3 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
        let entries = await workingCopyHistoryService.getEntries(workingCopy.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 3);
        const renamedWorkingCopyResource = joinPath(dirname(workingCopy.resource), 'renamed.txt');
        await workingCopyHistoryService._fileService.move(workingCopy.resource, renamedWorkingCopyResource);
        await entriesMoved;
        entries = await workingCopyHistoryService.getEntries(workingCopy.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 0);
        entries = await workingCopyHistoryService.getEntries(renamedWorkingCopyResource, CancellationToken.None);
        assert.strictEqual(entries.length, 4);
        assert.strictEqual(entries[0].id, entry1.id);
        assert.strictEqual(entries[0].timestamp, entry1.timestamp);
        assert.strictEqual(entries[0].source, entry1.source);
        assert.notStrictEqual(entries[0].location, entry1.location);
        assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());
        assert.strictEqual(entries[1].id, entry2.id);
        assert.strictEqual(entries[1].timestamp, entry2.timestamp);
        assert.strictEqual(entries[1].source, entry2.source);
        assert.notStrictEqual(entries[1].location, entry2.location);
        assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());
        assert.strictEqual(entries[2].id, entry3.id);
        assert.strictEqual(entries[2].timestamp, entry3.timestamp);
        assert.strictEqual(entries[2].source, entry3.source);
        assert.notStrictEqual(entries[2].location, entry3.location);
        assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());
        const all = await workingCopyHistoryService.getAll(CancellationToken.None);
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].toString(), renamedWorkingCopyResource.toString());
    });
    test('entries moved (folder rename)', async () => {
        const entriesMoved = Event.toPromise(workingCopyHistoryService.onDidMoveEntries);
        const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
        const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));
        const entry1A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
        const entry2A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
        const entry3A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
        const entry1B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
        const entry2B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
        const entry3B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
        let entries = await workingCopyHistoryService.getEntries(workingCopy1.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 3);
        entries = await workingCopyHistoryService.getEntries(workingCopy2.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 3);
        const renamedWorkHome = joinPath(dirname(testDir), 'renamed');
        await workingCopyHistoryService._fileService.move(workHome, renamedWorkHome);
        const renamedWorkingCopy1Resource = joinPath(renamedWorkHome, basename(workingCopy1.resource));
        const renamedWorkingCopy2Resource = joinPath(renamedWorkHome, basename(workingCopy2.resource));
        await entriesMoved;
        entries = await workingCopyHistoryService.getEntries(workingCopy1.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 0);
        entries = await workingCopyHistoryService.getEntries(workingCopy2.resource, CancellationToken.None);
        assert.strictEqual(entries.length, 0);
        entries = await workingCopyHistoryService.getEntries(renamedWorkingCopy1Resource, CancellationToken.None);
        assert.strictEqual(entries.length, 4);
        assert.strictEqual(entries[0].id, entry1A.id);
        assert.strictEqual(entries[0].timestamp, entry1A.timestamp);
        assert.strictEqual(entries[0].source, entry1A.source);
        assert.notStrictEqual(entries[0].location, entry1A.location);
        assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());
        assert.strictEqual(entries[1].id, entry2A.id);
        assert.strictEqual(entries[1].timestamp, entry2A.timestamp);
        assert.strictEqual(entries[1].source, entry2A.source);
        assert.notStrictEqual(entries[1].location, entry2A.location);
        assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());
        assert.strictEqual(entries[2].id, entry3A.id);
        assert.strictEqual(entries[2].timestamp, entry3A.timestamp);
        assert.strictEqual(entries[2].source, entry3A.source);
        assert.notStrictEqual(entries[2].location, entry3A.location);
        assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());
        entries = await workingCopyHistoryService.getEntries(renamedWorkingCopy2Resource, CancellationToken.None);
        assert.strictEqual(entries.length, 4);
        assert.strictEqual(entries[0].id, entry1B.id);
        assert.strictEqual(entries[0].timestamp, entry1B.timestamp);
        assert.strictEqual(entries[0].source, entry1B.source);
        assert.notStrictEqual(entries[0].location, entry1B.location);
        assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());
        assert.strictEqual(entries[1].id, entry2B.id);
        assert.strictEqual(entries[1].timestamp, entry2B.timestamp);
        assert.strictEqual(entries[1].source, entry2B.source);
        assert.notStrictEqual(entries[1].location, entry2B.location);
        assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());
        assert.strictEqual(entries[2].id, entry3B.id);
        assert.strictEqual(entries[2].timestamp, entry3B.timestamp);
        assert.strictEqual(entries[2].source, entry3B.source);
        assert.notStrictEqual(entries[2].location, entry3B.location);
        assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());
        const all = await workingCopyHistoryService.getAll(CancellationToken.None);
        assert.strictEqual(all.length, 2);
        for (const resource of all) {
            if (resource.toString() !== renamedWorkingCopy1Resource.toString() && resource.toString() !== renamedWorkingCopy2Resource.toString()) {
                assert.fail(`Unexpected history resource: ${resource.toString()}`);
            }
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci93b3JraW5nQ29weUhpc3RvcnlUcmFja2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdkcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUvRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7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QUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLDJCQUEyQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFdkcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLDJCQUEyQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFdkcsT0FBTyxHQUFHLE1BQU0seUJBQXlCLENBQUMsVUFBVSxDQUFDLDJCQUEyQixFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsMkJBQTJCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUV2RyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsMkJBQTJCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUV2RyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsMkJBQTJCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUV2RyxNQUFNLEdBQUcsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEMsS0FBSyxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM1QixJQUFJLFFBQVEsQ0FBQyxRQUFRLEVBQUUsS0FBSywyQkFBMkIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFLEtBQUssMkJBQTJCLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztnQkFDdEksTUFBTSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNwRSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9