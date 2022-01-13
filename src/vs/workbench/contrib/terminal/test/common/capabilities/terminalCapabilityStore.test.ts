/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from 'vs/workbench/contrib/terminal/common/capabilities/terminalCapabilityStore';

suite('TerminalCapabilityStore', () => {
	let store: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		store = new TerminalCapabilityStore();
		store.onDidAddCapability(e => addEvents.push(e));
		store.onDidRemoveCapability(e => removeEvents.push(e));
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => store.dispose());

	test('should fire events when capabilities are added', () => {
		assertEvents(addEvents, []);
		store.addCapability(TerminalCapability.CwdDetection);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
	});
	test('should fire events when capabilities are removed', async () => {
		assertEvents(removeEvents, []);
		store.addCapability(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, []);
		store.removeCapability(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), false);
		store.addCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), true);
		store.removeCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(store.has(TerminalCapability.CwdDetection), false);
	});
	test('items should reflect current state', () => {
		deepStrictEqual(store.items, []);
		store.addCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(store.items, [TerminalCapability.CwdDetection]);
		store.addCapability(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(store.items, [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
		store.removeCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(store.items, [TerminalCapability.NaiveCwdDetection]);
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
		multiplexer.onDidAddCapability(e => addEvents.push(e));
		multiplexer.onDidRemoveCapability(e => removeEvents.push(e));
		store1 = new TerminalCapabilityStore();
		store2 = new TerminalCapabilityStore();
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => multiplexer.dispose());

	test('should fire events when capabilities are enabled', async () => {
		assertEvents(addEvents, []);
		multiplexer.addCapabilityStore(store1);
		multiplexer.addCapabilityStore(store2);
		store1.addCapability(TerminalCapability.CwdDetection);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
		store2.addCapability(TerminalCapability.NaiveCwdDetection);
		assertEvents(addEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when capabilities are disabled', async () => {
		assertEvents(removeEvents, []);
		multiplexer.addCapabilityStore(store1);
		multiplexer.addCapabilityStore(store2);
		store1.addCapability(TerminalCapability.CwdDetection);
		store2.addCapability(TerminalCapability.NaiveCwdDetection);
		assertEvents(removeEvents, []);
		store1.removeCapability(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
		store2.removeCapability(TerminalCapability.NaiveCwdDetection);
		assertEvents(removeEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when stores are added', async () => {
		assertEvents(addEvents, []);
		store1.addCapability(TerminalCapability.CwdDetection);
		assertEvents(addEvents, []);
		store2.addCapability(TerminalCapability.NaiveCwdDetection);
		multiplexer.addCapabilityStore(store1);
		multiplexer.addCapabilityStore(store2);
		assertEvents(addEvents, [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
	});
	test('items should return items from all stores', () => {
		deepStrictEqual(multiplexer.items, []);
		multiplexer.addCapabilityStore(store1);
		multiplexer.addCapabilityStore(store2);
		store1.addCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(multiplexer.items, [TerminalCapability.CwdDetection]);
		store1.addCapability(TerminalCapability.CommandDetection);
		store2.addCapability(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(multiplexer.items, [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection, TerminalCapability.NaiveCwdDetection]);
		store2.removeCapability(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(multiplexer.items, [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection]);
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
		multiplexer.addCapabilityStore(store1);
		store1.addCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), true);
		store1.removeCapability(TerminalCapability.CwdDetection);
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
	});
});

function assertEvents(actual: TerminalCapability[], expected: TerminalCapability[]) {
	deepStrictEqual(actual, expected);
	actual.length = 0;
}
