/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, ok, strictEqual } from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../common/storage.js';
export function createSuite(params) {
    let storageService;
    const disposables = new DisposableStore();
    setup(async () => {
        storageService = await params.setup();
    });
    teardown(() => {
        disposables.clear();
        return params.teardown(storageService);
    });
    test('Get Data, Integer, Boolean (application)', () => {
        storeData(-1 /* StorageScope.APPLICATION */);
    });
    test('Get Data, Integer, Boolean (profile)', () => {
        storeData(0 /* StorageScope.PROFILE */);
    });
    test('Get Data, Integer, Boolean, Object (workspace)', () => {
        storeData(1 /* StorageScope.WORKSPACE */);
    });
    test('Storage change source', () => {
        const storageValueChangeEvents = [];
        storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, undefined, disposables)(e => storageValueChangeEvents.push(e), undefined, disposables);
        // Explicit external source
        storageService.storeAll([{ key: 'testExternalChange', value: 'foobar', scope: 1 /* StorageScope.WORKSPACE */, target: 1 /* StorageTarget.MACHINE */ }], true);
        let storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'testExternalChange');
        strictEqual(storageValueChangeEvent?.external, true);
        // Default source
        storageService.storeAll([{ key: 'testChange', value: 'barfoo', scope: 1 /* StorageScope.WORKSPACE */, target: 1 /* StorageTarget.MACHINE */ }], false);
        storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'testChange');
        strictEqual(storageValueChangeEvent?.external, false);
        storageService.store('testChange', 'foobar', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'testChange');
        strictEqual(storageValueChangeEvent?.external, false);
    });
    test('Storage change event scope (all keys)', () => {
        const storageValueChangeEvents = [];
        storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, undefined, disposables)(e => storageValueChangeEvents.push(e), undefined, disposables);
        storageService.store('testChange', 'foobar', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange2', 'foobar', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange', 'foobar', -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange', 'foobar', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange2', 'foobar', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageValueChangeEvents.length, 2);
    });
    test('Storage change event scope (specific key)', () => {
        const storageValueChangeEvents = [];
        storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, 'testChange', disposables)(e => storageValueChangeEvents.push(e), undefined, disposables);
        storageService.store('testChange', 'foobar', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange', 'foobar', 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        storageService.store('testChange', 'foobar', -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        storageService.store('testChange2', 'foobar', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        const storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'testChange');
        ok(storageValueChangeEvent);
        strictEqual(storageValueChangeEvents.length, 1);
    });
    function storeData(scope) {
        let storageValueChangeEvents = [];
        storageService.onDidChangeValue(scope, undefined, disposables)(e => storageValueChangeEvents.push(e), undefined, disposables);
        strictEqual(storageService.get('test.get', scope, 'foobar'), 'foobar');
        strictEqual(storageService.get('test.get', scope, ''), '');
        strictEqual(storageService.getNumber('test.getNumber', scope, 5), 5);
        strictEqual(storageService.getNumber('test.getNumber', scope, 0), 0);
        strictEqual(storageService.getBoolean('test.getBoolean', scope, true), true);
        strictEqual(storageService.getBoolean('test.getBoolean', scope, false), false);
        deepStrictEqual(storageService.getObject('test.getObject', scope, { 'foo': 'bar' }), { 'foo': 'bar' });
        deepStrictEqual(storageService.getObject('test.getObject', scope, {}), {});
        deepStrictEqual(storageService.getObject('test.getObject', scope, []), []);
        storageService.store('test.get', 'foobar', scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.get('test.get', scope, (undefined)), 'foobar');
        let storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'test.get');
        strictEqual(storageValueChangeEvent?.scope, scope);
        strictEqual(storageValueChangeEvent?.key, 'test.get');
        storageValueChangeEvents = [];
        storageService.store('test.get', '', scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.get('test.get', scope, (undefined)), '');
        storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'test.get');
        strictEqual(storageValueChangeEvent.scope, scope);
        strictEqual(storageValueChangeEvent.key, 'test.get');
        storageService.store('test.getNumber', 5, scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.getNumber('test.getNumber', scope, (undefined)), 5);
        storageService.store('test.getNumber', 0, scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.getNumber('test.getNumber', scope, (undefined)), 0);
        storageService.store('test.getBoolean', true, scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.getBoolean('test.getBoolean', scope, (undefined)), true);
        storageService.store('test.getBoolean', false, scope, 1 /* StorageTarget.MACHINE */);
        strictEqual(storageService.getBoolean('test.getBoolean', scope, (undefined)), false);
        storageService.store('test.getObject', {}, scope, 1 /* StorageTarget.MACHINE */);
        deepStrictEqual(storageService.getObject('test.getObject', scope, (undefined)), {});
        storageService.store('test.getObject', [42], scope, 1 /* StorageTarget.MACHINE */);
        deepStrictEqual(storageService.getObject('test.getObject', scope, (undefined)), [42]);
        storageService.store('test.getObject', { 'foo': {} }, scope, 1 /* StorageTarget.MACHINE */);
        deepStrictEqual(storageService.getObject('test.getObject', scope, (undefined)), { 'foo': {} });
        strictEqual(storageService.get('test.getDefault', scope, 'getDefault'), 'getDefault');
        strictEqual(storageService.getNumber('test.getNumberDefault', scope, 5), 5);
        strictEqual(storageService.getBoolean('test.getBooleanDefault', scope, true), true);
        deepStrictEqual(storageService.getObject('test.getObjectDefault', scope, { 'foo': 42 }), { 'foo': 42 });
        storageService.storeAll([
            { key: 'test.storeAll1', value: 'foobar', scope, target: 1 /* StorageTarget.MACHINE */ },
            { key: 'test.storeAll2', value: 4, scope, target: 1 /* StorageTarget.MACHINE */ },
            { key: 'test.storeAll3', value: null, scope, target: 1 /* StorageTarget.MACHINE */ }
        ], false);
        strictEqual(storageService.get('test.storeAll1', scope, 'foobar'), 'foobar');
        strictEqual(storageService.get('test.storeAll2', scope, '4'), '4');
        strictEqual(storageService.get('test.storeAll3', scope, 'null'), 'null');
    }
    test('Remove Data (application)', () => {
        removeData(-1 /* StorageScope.APPLICATION */);
    });
    test('Remove Data (profile)', () => {
        removeData(0 /* StorageScope.PROFILE */);
    });
    test('Remove Data (workspace)', () => {
        removeData(1 /* StorageScope.WORKSPACE */);
    });
    function removeData(scope) {
        const storageValueChangeEvents = [];
        storageService.onDidChangeValue(scope, undefined, disposables)(e => storageValueChangeEvents.push(e), undefined, disposables);
        storageService.store('test.remove', 'foobar', scope, 1 /* StorageTarget.MACHINE */);
        strictEqual('foobar', storageService.get('test.remove', scope, (undefined)));
        storageService.remove('test.remove', scope);
        ok(!storageService.get('test.remove', scope, (undefined)));
        const storageValueChangeEvent = storageValueChangeEvents.find(e => e.key === 'test.remove');
        strictEqual(storageValueChangeEvent?.scope, scope);
        strictEqual(storageValueChangeEvent?.key, 'test.remove');
    }
    test('Keys (in-memory)', () => {
        let storageTargetEvent = undefined;
        storageService.onDidChangeTarget(e => storageTargetEvent = e, undefined, disposables);
        // Empty
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                strictEqual(storageService.keys(scope, target).length, 0);
            }
        }
        let storageValueChangeEvent = undefined;
        // Add values
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            storageService.onDidChangeValue(scope, undefined, disposables)(e => storageValueChangeEvent = e, undefined, disposables);
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                storageTargetEvent = Object.create(null);
                storageValueChangeEvent = Object.create(null);
                storageService.store('test.target1', 'value1', scope, target);
                strictEqual(storageService.keys(scope, target).length, 1);
                strictEqual(storageTargetEvent?.scope, scope);
                strictEqual(storageValueChangeEvent?.key, 'test.target1');
                strictEqual(storageValueChangeEvent?.scope, scope);
                strictEqual(storageValueChangeEvent?.target, target);
                storageTargetEvent = undefined;
                storageValueChangeEvent = Object.create(null);
                storageService.store('test.target1', 'otherValue1', scope, target);
                strictEqual(storageService.keys(scope, target).length, 1);
                strictEqual(storageTargetEvent, undefined);
                strictEqual(storageValueChangeEvent?.key, 'test.target1');
                strictEqual(storageValueChangeEvent?.scope, scope);
                strictEqual(storageValueChangeEvent?.target, target);
                storageService.store('test.target2', 'value2', scope, target);
                storageService.store('test.target3', 'value3', scope, target);
                strictEqual(storageService.keys(scope, target).length, 3);
            }
        }
        // Remove values
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                const keysLength = storageService.keys(scope, target).length;
                storageService.store('test.target4', 'value1', scope, target);
                strictEqual(storageService.keys(scope, target).length, keysLength + 1);
                storageTargetEvent = Object.create(null);
                storageValueChangeEvent = Object.create(null);
                storageService.remove('test.target4', scope);
                strictEqual(storageService.keys(scope, target).length, keysLength);
                strictEqual(storageTargetEvent?.scope, scope);
                strictEqual(storageValueChangeEvent?.key, 'test.target4');
                strictEqual(storageValueChangeEvent?.scope, scope);
            }
        }
        // Remove all
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                const keys = storageService.keys(scope, target);
                for (const key of keys) {
                    storageService.remove(key, scope);
                }
                strictEqual(storageService.keys(scope, target).length, 0);
            }
        }
        // Adding undefined or null removes value
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                storageService.store('test.target1', 'value1', scope, target);
                strictEqual(storageService.keys(scope, target).length, 1);
                storageTargetEvent = Object.create(null);
                storageService.store('test.target1', undefined, scope, target);
                strictEqual(storageService.keys(scope, target).length, 0);
                strictEqual(storageTargetEvent?.scope, scope);
                storageService.store('test.target1', '', scope, target);
                strictEqual(storageService.keys(scope, target).length, 1);
                storageService.store('test.target1', null, scope, target);
                strictEqual(storageService.keys(scope, target).length, 0);
            }
        }
        // Target change
        for (const scope of [1 /* StorageScope.WORKSPACE */, 0 /* StorageScope.PROFILE */, -1 /* StorageScope.APPLICATION */]) {
            storageTargetEvent = undefined;
            storageService.store('test.target5', 'value1', scope, 1 /* StorageTarget.MACHINE */);
            ok(storageTargetEvent);
            storageTargetEvent = undefined;
            storageService.store('test.target5', 'value1', scope, 0 /* StorageTarget.USER */);
            ok(storageTargetEvent);
            storageTargetEvent = undefined;
            storageService.store('test.target5', 'value1', scope, 1 /* StorageTarget.MACHINE */);
            ok(storageTargetEvent);
            storageTargetEvent = undefined;
            storageService.store('test.target5', 'value1', scope, 1 /* StorageTarget.MACHINE */);
            ok(!storageTargetEvent); // no change in target
        }
    });
}
suite('StorageService (in-memory)', function () {
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    createSuite({
        setup: async () => disposables.add(new InMemoryStorageService()),
        teardown: async () => { }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3N0b3JhZ2UvdGVzdC9jb21tb24vc3RvcmFnZVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBcUcsTUFBTSx5QkFBeUIsQ0FBQztBQUVwSyxNQUFNLFVBQVUsV0FBVyxDQUE0QixNQUE0RTtJQUVsSSxJQUFJLGNBQWlCLENBQUM7SUFFdEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsY0FBYyxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDeEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1FBQ3JELFNBQVMsbUNBQTBCLENBQUM7SUFDckMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2pELFNBQVMsOEJBQXNCLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0RBQWdE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