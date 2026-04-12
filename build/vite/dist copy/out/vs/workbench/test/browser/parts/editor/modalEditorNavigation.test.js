/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
/**
 * Simple test harness that mimics the ModalEditorPartImpl navigation behavior
 * without requiring the full editor part infrastructure.
 */
class TestModalEditorNavigationHost {
    constructor() {
        this._onDidChangeNavigation = new Emitter();
        this.onDidChangeNavigation = this._onDidChangeNavigation.event;
    }
    get navigation() { return this._navigation; }
    updateOptions(options) {
        this._navigation = options.navigation;
        this._onDidChangeNavigation.fire(options.navigation);
    }
    dispose() {
        this._onDidChangeNavigation.dispose();
    }
}
suite('Modal Editor Navigation', () => {
    const disposables = new DisposableStore();
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('updateOptions sets navigation and fires event', () => {
        const host = new TestModalEditorNavigationHost();
        disposables.add({ dispose: () => host.dispose() });
        const events = [];
        disposables.add(host.onDidChangeNavigation(ctx => events.push(ctx)));
        const nav = {
            total: 10,
            current: 3,
            navigate: () => { }
        };
        host.updateOptions({ navigation: nav });
        assert.strictEqual(host.navigation, nav);
        assert.deepStrictEqual(events, [nav]);
    });
    test('updateOptions with undefined navigation clears navigation', () => {
        const host = new TestModalEditorNavigationHost();
        disposables.add({ dispose: () => host.dispose() });
        const events = [];
        disposables.add(host.onDidChangeNavigation(ctx => events.push(ctx)));
        const nav = {
            total: 5,
            current: 0,
            navigate: () => { }
        };
        host.updateOptions({ navigation: nav });
        host.updateOptions({ navigation: undefined });
        assert.strictEqual(host.navigation, undefined);
        assert.deepStrictEqual(events, [nav, undefined]);
    });
    test('navigate callback updates context', () => {
        const host = new TestModalEditorNavigationHost();
        disposables.add({ dispose: () => host.dispose() });
        const navigatedIndices = [];
        const navigate = (index) => {
            navigatedIndices.push(index);
            // Simulates what real navigation does: update the context with new index
            host.updateOptions({ navigation: { total: 10, current: index, navigate } });
        };
        host.updateOptions({ navigation: { total: 10, current: 0, navigate } });
        // Navigate forward
        host.navigation.navigate(1);
        assert.strictEqual(host.navigation.current, 1);
        host.navigation.navigate(5);
        assert.strictEqual(host.navigation.current, 5);
        assert.deepStrictEqual(navigatedIndices, [1, 5]);
    });
    test('navigation boundary conditions', () => {
        const host = new TestModalEditorNavigationHost();
        disposables.add({ dispose: () => host.dispose() });
        const navigate = (index) => {
            if (index >= 0 && index < 3) {
                host.updateOptions({ navigation: { total: 3, current: index, navigate } });
            }
        };
        host.updateOptions({ navigation: { total: 3, current: 0, navigate } });
        // At first item
        assert.strictEqual(host.navigation.current, 0);
        assert.ok(host.navigation.current <= 0); // previous disabled
        // Navigate to last
        host.navigation.navigate(2);
        assert.strictEqual(host.navigation.current, 2);
        assert.ok(host.navigation.current >= host.navigation.total - 1); // next disabled
        // Navigate back to middle
        host.navigation.navigate(1);
        assert.strictEqual(host.navigation.current, 1);
    });
    test('navigation context fires multiple events', () => {
        const host = new TestModalEditorNavigationHost();
        disposables.add({ dispose: () => host.dispose() });
        let eventCount = 0;
        disposables.add(host.onDidChangeNavigation(() => eventCount++));
        const navigate = (index) => {
            host.updateOptions({ navigation: { total: 5, current: index, navigate } });
        };
        host.updateOptions({ navigation: { total: 5, current: 0, navigate } });
        host.navigation.navigate(1);
        host.navigation.navigate(2);
        host.updateOptions({ navigation: undefined });
        assert.strictEqual(eventCount, 4); // initial + 2 navigates + clear
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kYWxFZGl0b3JOYXZpZ2F0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3BhcnRzL2VkaXRvci9tb2RhbEVkaXRvck5hdmlnYXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUduRzs7O0dBR0c7QUFDSCxNQUFNLDZCQUE2QjtJQUFuQztRQUVrQiwyQkFBc0IsR0FBRyxJQUFJLE9BQU8sRUFBc0MsQ0FBQztRQUNuRiwwQkFBcUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO0lBYXBFLENBQUM7SUFWQSxJQUFJLFVBQVUsS0FBeUMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUVqRixhQUFhLENBQUMsT0FBZ0M7UUFDN0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDO1FBQ3RDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7SUFFckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMs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