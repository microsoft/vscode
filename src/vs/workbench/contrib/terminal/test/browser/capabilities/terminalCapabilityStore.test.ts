/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCapability, type ICommandDetectionCapability, type ICwdDetectionCapability, type INaiveCwdDetectionCapability, type ITerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';

suite('TerminalCapabilityStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let capabilityStore: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		capabilityStore = store.add(new TerminalCapabilityStore());
		store.add(capabilityStore.onDidAddCapability(e => addEvents.push(e.id)));
		store.add(capabilityStore.onDidRemoveCapability(e => removeEvents.push(e.id)));
		addEvents = [];
		removeEvents = [];
	});

	test('should fire events when capabilities are added', () => {
		assertEvents(addEvents, []);
		capabilityStore.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
	});
	test('should fire events when capabilities are removed', async () => {
		assertEvents(removeEvents, []);
		capabilityStore.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		assertEvents(removeEvents, []);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), false);
		capabilityStore.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), true);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), false);
	});
	test('items should reflect current state', () => {
		deepStrictEqual(Array.from(capabilityStore.items), []);
		capabilityStore.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.CwdDetection]);
		capabilityStore.add(TerminalCapability.NaiveCwdDetection, {} as unknown as INaiveCwdDetectionCapability);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.NaiveCwdDetection]);
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

	let multiplexer: TerminalCapabilityStoreMultiplexer;
	let store1: TerminalCapabilityStore;
	let store2: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

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
		store1.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as unknown as INaiveCwdDetectionCapability);
		assertEvents(addEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when capabilities are disabled', async () => {
		assertEvents(removeEvents, []);
		multiplexer.add(store1);
		multiplexer.add(store2);
		store1.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as unknown as INaiveCwdDetectionCapability);
		assertEvents(removeEvents, []);
		store1.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
		store2.remove(TerminalCapability.NaiveCwdDetection);
		assertEvents(removeEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when stores are added', async () => {
		assertEvents(addEvents, []);
		store1.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		assertEvents(addEvents, []);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as unknown as INaiveCwdDetectionCapability);
		multiplexer.add(store1);
		multiplexer.add(store2);
		assertEvents(addEvents, [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
	});
	test('items should return items from all stores', () => {
		deepStrictEqual(Array.from(multiplexer.items).sort(), [].sort());
		multiplexer.add(store1);
		multiplexer.add(store2);
		store1.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection].sort());
		store1.add(TerminalCapability.CommandDetection, {} as unknown as ICommandDetectionCapability);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as unknown as INaiveCwdDetectionCapability);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection, TerminalCapability.NaiveCwdDetection].sort());
		store2.remove(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection].sort());
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
		multiplexer.add(store1);
		store1.add(TerminalCapability.CwdDetection, {} as unknown as ICwdDetectionCapability);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), true);
		store1.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
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

function assertEvents(actual: TerminalCapability[], expected: TerminalCapability[]) {
	deepStrictEqual(actual, expected);
	actual.length = 0;
}

function getDerivedEventGetters(capabilityStore: ITerminalCapabilityStore) {
	return [
		() => capabilityStore.onDidChangeCapabilities,
		() => capabilityStore.onDidAddCommandDetectionCapability,
		() => capabilityStore.onDidRemoveCommandDetectionCapability,
		() => capabilityStore.onDidAddCwdDetectionCapability,
		() => capabilityStore.onDidRemoveCwdDetectionCapability,
	];
}
