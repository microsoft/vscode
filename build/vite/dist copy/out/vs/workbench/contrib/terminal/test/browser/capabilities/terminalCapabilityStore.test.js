/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
suite('TerminalCapabilityStore', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let capabilityStore;
    let addEvents;
    let removeEvents;
    setup(() => {
        capabilityStore = store.add(new TerminalCapabilityStore());
        store.add(capabilityStore.onDidAddCapability(e => addEvents.push(e.id)));
        store.add(capabilityStore.onDidRemoveCapability(e => removeEvents.push(e.id)));
        addEvents = [];
        removeEvents = [];
    });
    test('should fire events when capabilities are added', () => {
        assertEvents(addEvents, []);
        capabilityStore.add(0 /* TerminalCapability.CwdDetection */, {});
        assertEvents(addEvents, [0 /* TerminalCapability.CwdDetection */]);
    });
    test('should fire events when capabilities are removed', async () => {
        assertEvents(removeEvents, []);
        capabilityStore.add(0 /* TerminalCapability.CwdDetection */, {});
        assertEvents(removeEvents, []);
        capabilityStore.remove(0 /* TerminalCapability.CwdDetection */);
        assertEvents(removeEvents, [0 /* TerminalCapability.CwdDetection */]);
    });
    test('has should return whether a capability is present', () => {
        deepStrictEqual(capabilityStore.has(0 /* TerminalCapability.CwdDetection */), false);
        capabilityStore.add(0 /* TerminalCapability.CwdDetection */, {});
        deepStrictEqual(capabilityStore.has(0 /* TerminalCapability.CwdDetection */), true);
        capabilityStore.remove(0 /* TerminalCapability.CwdDetection */);
        deepStrictEqual(capabilityStore.has(0 /* TerminalCapability.CwdDetection */), false);
    });
    test('items should reflect current state', () => {
        deepStrictEqual(Array.from(capabilityStore.items), []);
        capabilityStore.add(0 /* TerminalCapability.CwdDetection */, {});
        deepStrictEqual(Array.from(capabilityStore.items), [0 /* TerminalCapability.CwdDetection */]);
        capabilityStore.add(1 /* TerminalCapability.NaiveCwdDetection */, {});
        deepStrictEqual(Array.from(capabilityStore.items), [0 /* TerminalCapability.CwdDetection */, 1 /* TerminalCapability.NaiveCwdDetection */]);
        capabilityStore.remove(0 /* TerminalCapability.CwdDetection */);
        deepStrictEqual(Array.from(capabilityStore.items), [1 /* TerminalCapability.NaiveCwdDetection */]);
    });
    test('ensure events are memoized', () => {
        for (const getEvent of getDerivedEventGetters(capabilityStore)) {
            strictEqual(getEvent(), getEvent());
        }
    });
    test('ensure events are cleaned up', () => {
        for (const getEvent of getDerivedEventGetters(capabilityStore)) {
            store.add(getEvent()(() => { }));
        }
    });
});
suite('TerminalCapabilityStoreMultiplexer', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let multiplexer;
    let store1;
    let store2;
    let addEvents;
    let removeEvents;
    setup(() => {
        multiplexer = store.add(new TerminalCapabilityStoreMultiplexer());
        store.add(multiplexer.onDidAddCapability(e => addEvents.push(e.id)));
        store.add(multiplexer.onDidRemoveCapability(e => removeEvents.push(e.id)));
        store1 = store.add(new TerminalCapabilityStore());
        store2 = store.add(new TerminalCapabilityStore());
        addEvents = [];
        removeEvents = [];
    });
    test('should fire events when capabilities are enabled', async () => {
        assertEvents(addEvents, []);
        multiplexer.add(store1);
        multiplexer.add(store2);
        store1.add(0 /* TerminalCapability.CwdDetection */, {});
        assertEvents(addEvents, [0 /* TerminalCapability.CwdDetection */]);
        store2.add(1 /* TerminalCapability.NaiveCwdDetection */, {});
        assertEvents(addEvents, [1 /* TerminalCapability.NaiveCwdDetection */]);
    });
    test('should fire events when capabilities are disabled', async () => {
        assertEvents(removeEvents, []);
        multiplexer.add(store1);
        multiplexer.add(store2);
        store1.add(0 /* TerminalCapability.CwdDetection */, {});
        store2.add(1 /* TerminalCapability.NaiveCwdDetection */, {});
        assertEvents(removeEvents, []);
        store1.remove(0 /* TerminalCapability.CwdDetection */);
        assertEvents(removeEvents, [0 /* TerminalCapability.CwdDetection */]);
        store2.remove(1 /* TerminalCapability.NaiveCwdDetection */);
        assertEvents(removeEvents, [1 /* TerminalCapability.NaiveCwdDetection */]);
    });
    test('should fire events when stores are added', async () => {
        assertEvents(addEvents, []);
        store1.add(0 /* TerminalCapability.CwdDetection */, {});
        assertEvents(addEvents, []);
        store2.add(1 /* TerminalCapability.NaiveCwdDetection */, {});
        multiplexer.add(store1);
        multiplexer.add(store2);
        assertEvents(addEvents, [0 /* TerminalCapability.CwdDetection */, 1 /* TerminalCapability.NaiveCwdDetection */]);
    });
    test('items should return items from all stores', () => {
        deepStrictEqual(Array.from(multiplexer.items).sort(), [].sort());
        multiplexer.add(store1);
        multiplexer.add(store2);
        store1.add(0 /* TerminalCapability.CwdDetection */, {});
        deepStrictEqual(Array.from(multiplexer.items).sort(), [0 /* TerminalCapability.CwdDetection */].sort());
        store1.add(2 /* TerminalCapability.CommandDetection */, {});
        store2.add(1 /* TerminalCapability.NaiveCwdDetection */, {});
        deepStrictEqual(Array.from(multiplexer.items).sort(), [0 /* TerminalCapability.CwdDetection */, 2 /* TerminalCapability.CommandDetection */, 1 /* TerminalCapability.NaiveCwdDetection */].sort());
        store2.remove(1 /* TerminalCapability.NaiveCwdDetection */);
        deepStrictEqual(Array.from(multiplexer.items).sort(), [0 /* TerminalCapability.CwdDetection */, 2 /* TerminalCapability.CommandDetection */].sort());
    });
    test('has should return whether a capability is present', () => {
        deepStrictEqual(multiplexer.has(0 /* TerminalCapability.CwdDetection */), false);
        multiplexer.add(store1);
        store1.add(0 /* TerminalCapability.CwdDetection */, {});
        deepStrictEqual(multiplexer.has(0 /* TerminalCapability.CwdDetection */), true);
        store1.remove(0 /* TerminalCapability.CwdDetection */);
        deepStrictEqual(multiplexer.has(0 /* TerminalCapability.CwdDetection */), false);
    });
    test('ensure events are memoized', () => {
        for (const getEvent of getDerivedEventGetters(multiplexer)) {
            strictEqual(getEvent(), getEvent());
        }
    });
    test('ensure events are cleaned up', () => {
        for (const getEvent of getDerivedEventGetters(multiplexer)) {
            store.add(getEvent()(() => { }));
        }
    });
});
function assertEvents(actual, expected) {
    deepStrictEqual(actual, expected);
    actual.length = 0;
}
function getDerivedEventGetters(capabilityStore) {
    return [
        () => capabilityStore.onDidChangeCapabilities,
        () => capabilityStore.onDidAddCommandDetectionCapability,
        () => capabilityStore.onDidRemoveCommandDetectionCapability,
        () => capabilityStore.onDidAddCwdDetectionCapability,
        () => capabilityStore.onDidRemoveCwdDetectionCapability,
    ];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDYXBhYmlsaXR5U3RvcmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxvRkFBb0YsQ0FBQztBQUVqSyxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxlQUF3QyxDQUFDO0lBQzdDLElBQUksU0FBK0IsQ0FBQztJQUNwQyxJQUFJLFlBQWtDLENBQUM7SUFFdkMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLGVBQWUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQzNELEtBQUssQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLEtBQUssQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9FLFNBQVMsR0FBRyxFQUFFLENB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