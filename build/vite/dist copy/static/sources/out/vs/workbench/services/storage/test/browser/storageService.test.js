/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Storage } from '../../../../../base/parts/storage/common/storage.js';
import { flakySuite } from '../../../../../base/test/common/testUtils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createSuite } from '../../../../../platform/storage/test/common/storageService.test.js';
import { BrowserStorageService, IndexedDBStorageDatabase } from '../../browser/storageService.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
async function createStorageService() {
    const disposables = new DisposableStore();
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.vscodeUserData, userDataProvider));
    const profilesRoot = URI.file('/profiles').with({ scheme: Schemas.inMemory });
    const inMemoryExtraProfileRoot = joinPath(profilesRoot, 'extra');
    const inMemoryExtraProfile = {
        id: 'id',
        name: 'inMemory',
        isDefault: false,
        location: inMemoryExtraProfileRoot,
        globalStorageHome: joinPath(inMemoryExtraProfileRoot, 'globalStorageHome'),
        settingsResource: joinPath(inMemoryExtraProfileRoot, 'settingsResource'),
        keybindingsResource: joinPath(inMemoryExtraProfileRoot, 'keybindingsResource'),
        tasksResource: joinPath(inMemoryExtraProfileRoot, 'tasksResource'),
        mcpResource: joinPath(inMemoryExtraProfileRoot, 'mcp.json'),
        snippetsHome: joinPath(inMemoryExtraProfileRoot, 'snippetsHome'),
        promptsHome: joinPath(inMemoryExtraProfileRoot, 'promptsHome'),
        extensionsResource: joinPath(inMemoryExtraProfileRoot, 'extensionsResource'),
        cacheHome: joinPath(inMemoryExtraProfileRoot, 'cache')
    };
    const storageService = disposables.add(new BrowserStorageService({ id: 'workspace-storage-test' }, disposables.add(new UserDataProfileService(inMemoryExtraProfile)), logService));
    await storageService.initialize();
    return [disposables, storageService];
}
flakySuite('StorageService (browser)', function () {
    const disposables = new DisposableStore();
    let storageService;
    createSuite({
        setup: async () => {
            const res = await createStorageService();
            disposables.add(res[0]);
            storageService = res[1];
            return storageService;
        },
        teardown: async () => {
            await storageService.clear();
            disposables.clear();
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
flakySuite('StorageService (browser specific)', () => {
    const disposables = new DisposableStore();
    let storageService;
    setup(async () => {
        const res = await createStorageService();
        disposables.add(res[0]);
        storageService = res[1];
    });
    teardown(async () => {
        await storageService.clear();
        disposables.clear();
    });
    test.skip('clear', () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            storageService.store('bar', 'foo', -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            storageService.store('bar', 3, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            storageService.store('bar', 'foo', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            storageService.store('bar', 3, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            storageService.store('bar', 'foo', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            storageService.store('bar', 3, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
            await storageService.clear();
            for (const scope of [-1 /* StorageScope.APPLICATION */, 0 /* StorageScope.PROFILE */, 1 /* StorageScope.WORKSPACE */]) {
                for (const target of [0 /* StorageTarget.USER */, 1 /* StorageTarget.MACHINE */]) {
                    strictEqual(storageService.get('bar', scope), undefined);
                    strictEqual(storageService.keys(scope, target).length, 0);
                }
            }
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
flakySuite('IndexDBStorageDatabase (browser)', () => {
    const id = 'workspace-storage-db-test';
    const logService = new NullLogService();
    const disposables = new DisposableStore();
    teardown(async () => {
        const storage = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
        await storage.clear();
        disposables.clear();
    });
    test('Basics', async () => {
        let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        // Insert initial data
        storage.set('bar', 'foo');
        storage.set('barNumber', 55);
        storage.set('barBoolean', true);
        storage.set('barUndefined', undefined);
        storage.set('barNull', null);
        strictEqual(storage.get('bar'), 'foo');
        strictEqual(storage.get('barNumber'), '55');
        strictEqual(storage.get('barBoolean'), 'true');
        strictEqual(storage.get('barUndefined'), undefined);
        strictEqual(storage.get('barNull'), undefined);
        strictEqual(storage.size, 3);
        strictEqual(storage.items.size, 3);
        await storage.close();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        // Check initial data still there
        strictEqual(storage.get('bar'), 'foo');
        strictEqual(storage.get('barNumber'), '55');
        strictEqual(storage.get('barBoolean'), 'true');
        strictEqual(storage.get('barUndefined'), undefined);
        strictEqual(storage.get('barNull'), undefined);
        strictEqual(storage.size, 3);
        strictEqual(storage.items.size, 3);
        // Update data
        storage.set('bar', 'foo2');
        storage.set('barNumber', 552);
        strictEqual(storage.get('bar'), 'foo2');
        strictEqual(storage.get('barNumber'), '552');
        await storage.close();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        // Check initial data still there
        strictEqual(storage.get('bar'), 'foo2');
        strictEqual(storage.get('barNumber'), '552');
        strictEqual(storage.get('barBoolean'), 'true');
        strictEqual(storage.get('barUndefined'), undefined);
        strictEqual(storage.get('barNull'), undefined);
        strictEqual(storage.size, 3);
        strictEqual(storage.items.size, 3);
        // Delete data
        storage.delete('bar');
        storage.delete('barNumber');
        storage.delete('barBoolean');
        strictEqual(storage.get('bar', 'undefined'), 'undefined');
        strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
        strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');
        strictEqual(storage.size, 0);
        strictEqual(storage.items.size, 0);
        await storage.close();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        strictEqual(storage.get('bar', 'undefined'), 'undefined');
        strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
        strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');
        strictEqual(storage.size, 0);
        strictEqual(storage.items.size, 0);
    });
    test('Clear', async () => {
        let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        storage.set('bar', 'foo');
        storage.set('barNumber', 55);
        storage.set('barBoolean', true);
        await storage.close();
        const db = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
        storage = disposables.add(new Storage(db));
        await storage.init();
        await db.clear();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        strictEqual(storage.get('bar'), undefined);
        strictEqual(storage.get('barNumber'), undefined);
        strictEqual(storage.get('barBoolean'), undefined);
        strictEqual(storage.size, 0);
        strictEqual(storage.items.size, 0);
    });
    test('Inserts and Deletes at the same time', async () => {
        let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        storage.set('bar', 'foo');
        storage.set('barNumber', 55);
        storage.set('barBoolean', true);
        await storage.close();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        storage.set('bar', 'foobar');
        const largeItem = JSON.stringify({ largeItem: 'Hello World'.repeat(1000) });
        storage.set('largeItem', largeItem);
        storage.delete('barNumber');
        storage.delete('barBoolean');
        await storage.close();
        storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        await storage.init();
        strictEqual(storage.get('bar'), 'foobar');
        strictEqual(storage.get('largeItem'), largeItem);
        strictEqual(storage.get('barNumber'), undefined);
        strictEqual(storage.get('barBoolean'), undefined);
    });
    test('Storage change event', async () => {
        const storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
        let storageChangeEvents = [];
        disposables.add(storage.onDidChangeStorage(e => storageChangeEvents.push(e)));
        await storage.init();
        storage.set('notExternal', 42);
        let storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'notExternal');
        strictEqual(storageValueChangeEvent?.external, false);
        storageChangeEvents = [];
        storage.set('isExternal', 42, true);
        storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'isExternal');
        strictEqual(storageValueChangeEvent?.external, true);
        storage.delete('notExternal');
        storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'notExternal');
        strictEqual(storageValueChangeEvent?.external, false);
        storage.delete('isExternal', true);
        storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'isExternal');
        strictEqual(storageValueChangeEvent?.external, true);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zdG9yYWdlL3Rlc3QvYnJvd3Nlci9zdG9yYWdlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBdUIsT0FBTyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBRWpHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRW5HLEtBQUssVUFBVSxv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