/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { InMemoryStorageDatabase, Storage } from '../../../../base/parts/storage/common/storage.js';
import { AbstractUserDataProfileStorageService } from '../../common/userDataProfileStorageService.js';
import { InMemoryStorageService, loadKeyTargets, TARGET_KEY } from '../../../storage/common/storage.js';
import { toUserDataProfile } from '../../common/userDataProfile.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
class TestStorageDatabase extends InMemoryStorageDatabase {
    constructor() {
        super(...arguments);
        this._onDidChangeItemsExternal = new Emitter();
        this.onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;
    }
    async updateItems(request) {
        await super.updateItems(request);
        if (request.insert || request.delete) {
            this._onDidChangeItemsExternal.fire({ changed: request.insert, deleted: request.delete });
        }
    }
}
export class TestUserDataProfileStorageService extends AbstractUserDataProfileStorageService {
    constructor() {
        super(...arguments);
        this.onDidChange = Event.None;
        this.databases = new Map();
    }
    async createStorageDatabase(profile) {
        let database = this.databases.get(profile.id);
        if (!database) {
            this.databases.set(profile.id, database = new TestStorageDatabase());
        }
        return database;
    }
    setupStorageDatabase(profile) {
        return this.createStorageDatabase(profile);
    }
}
suite('ProfileStorageService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const profile = toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache'));
    let testObject;
    let storage;
    setup(async () => {
        testObject = disposables.add(new TestUserDataProfileStorageService(false, disposables.add(new InMemoryStorageService())));
        storage = disposables.add(new Storage(await testObject.setupStorageDatabase(profile)));
        await storage.init();
    });
    test('read empty storage', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const actual = await testObject.readStorageData(profile);
        assert.strictEqual(actual.size, 0);
    }));
    test('read storage with data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storage.set('foo', 'bar');
        storage.set(TARGET_KEY, JSON.stringify({ foo: 0 /* StorageTarget.USER */ }));
        await storage.flush();
        const actual = await testObject.readStorageData(profile);
        assert.strictEqual(actual.size, 1);
        assert.deepStrictEqual(actual.get('foo'), { 'value': 'bar', 'target': 0 /* StorageTarget.USER */ });
    }));
    test('write in empty storage', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const data = new Map();
        data.set('foo', 'bar');
        await testObject.updateStorageData(profile, data, 0 /* StorageTarget.USER */);
        assert.strictEqual(storage.items.size, 2);
        assert.deepStrictEqual(loadKeyTargets(storage), { foo: 0 /* StorageTarget.USER */ });
        assert.strictEqual(storage.get('foo'), 'bar');
    }));
    test('write in storage with data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storage.set('foo', 'bar');
        storage.set(TARGET_KEY, JSON.stringify({ foo: 0 /* StorageTarget.USER */ }));
        await storage.flush();
        const data = new Map();
        data.set('abc', 'xyz');
        await testObject.updateStorageData(profile, data, 1 /* StorageTarget.MACHINE */);
        assert.strictEqual(storage.items.size, 3);
        assert.deepStrictEqual(loadKeyTargets(storage), { foo: 0 /* StorageTarget.USER */, abc: 1 /* StorageTarget.MACHINE */ });
        assert.strictEqual(storage.get('foo'), 'bar');
        assert.strictEqual(storage.get('abc'), 'xyz');
    }));
    test('write in storage with data (insert, update, remove)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storage.set('foo', 'bar');
        storage.set('abc', 'xyz');
        storage.set(TARGET_KEY, JSON.stringify({ foo: 0 /* StorageTarget.USER */, abc: 1 /* StorageTarget.MACHINE */ }));
        await storage.flush();
        const data = new Map();
        data.set('foo', undefined);
        data.set('abc', 'def');
        data.set('var', 'const');
        await testObject.updateStorageData(profile, data, 0 /* StorageTarget.USER */);
        assert.strictEqual(storage.items.size, 3);
        assert.deepStrictEqual(loadKeyTargets(storage), { abc: 0 /* StorageTarget.USER */, var: 0 /* StorageTarget.USER */ });
        assert.strictEqual(storage.get('abc'), 'def');
        assert.strictEqual(storage.get('var'), 'const');
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS90ZXN0L2NvbW1vbi91c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUJBQXVCLEVBQTRDLE9BQU8sRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlJLE9BQU8sRUFBRSxxQ0FBcUMsRUFBa0MsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0SSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsY0FBYyxFQUFpQixVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2SCxPQUFPLEVBQW9CLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsTUFBTSxtQkFBb0IsU0FBUSx1QkFBdUI7SUFBekQ7O1FBRWtCLDhCQUF5QixHQUFHLElBQUksT0FBTyxFQUE0QixDQUFDO1FBQ25FLDZCQUF3QixHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUM7SUFRbkYsQ0FBQztJQU5TLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBdUI7UUFDakQsTUFBTSxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2pDLElBQUks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