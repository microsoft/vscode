/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';

suite('TerminalCapabilityStore', () => {
	let store: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		store = new TerminalCapabilityStore();
		store.onDidAddCapabilityType(e => addEvents.push(e));
		store.onDidRemoveCapabilityType(e => removeEvents.push(e));
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => store.dispose());

	test('should fire events when capabilities are added', () => {
		assertEvents(addEvents, []);
		store.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
	});
	test('should fire events when capabilities are removed', async () => {
		assertEvents(removeEvents, []);
		store.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(removeEvents, []);
		store.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), false);
		store.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), true);
		store.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), false);
	});
	test('items should reflect current state', () => {
		deepStrictEqual(Array.from(store.items), []);
		store.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(Array.from(store.items), [TerminalCapability.CwdDetection]);
		store.add(TerminalCapability.NaiveCwdDetection, {} as any);
		deepStrictEqual(Array.from(store.items), [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
		store.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(Array.from(store.items), [TerminalCapability.NaiveCwdDetection]);
	});
});

suite('TerminalCapabilityStoreMultiplexer', () => {
	let multiplexer: TerminalCapabilityStoreMultiplexer;
	let store1: TerminalCapabilityStore;
	let store2: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		multiplexer = new TerminalCapabilityStoreMultiplexer();
		multiplexer.onDidAddCapabilityType(e => addEvents.push(e));
		multiplexer.onDidRemoveCapabilityType(e => removeEvents.push(e));
		store1 = new TerminalCapabilityStore();
		store2 = new TerminalCapabilityStore();
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => multiplexer.dispose());

	test('should fire events when capabilities are enabled', async () => {
		assertEvents(addEvents, []);
		multiplexer.add(store1);
		multiplexer.add(store2);
		store1.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when capabilities are disabled', async () => {
		assertEvents(removeEvents, []);
		multiplexer.add(store1);
		multiplexer.add(store2);
		store1.add(TerminalCapability.CwdDetection, {} as any);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		assertEvents(removeEvents, []);
		store1.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
		store2.remove(TerminalCapability.NaiveCwdDetection);
		assertEvents(removeEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when stores are added', async () => {
		assertEvents(addEvents, []);
		store1.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, []);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		multiplexer.add(store1);
		multiplexer.add(store2);
		assertEvents(addEvents, [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
	});
	test('items should return items from all stores', () => {
		deepStrictEqual(Array.from(multiplexer.items).sort(), [].sort());
		multiplexer.add(store1);
		multiplexer.add(store2);
		store1.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection].sort());
		store1.add(TerminalCapability.CommandDetection, {} as any);
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection, TerminalCapability.NaiveCwdDetection].sort());
		store2.remove(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection].sort());
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
		multiplexer.add(store1);
		store1.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), true);
		store1.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
	});
});

function assertEvents(actual: TerminalCapability[], expected: TerminalCapability[]) {
	deepStrictEqual(actual, expected);
	actual.length = 0;
}
