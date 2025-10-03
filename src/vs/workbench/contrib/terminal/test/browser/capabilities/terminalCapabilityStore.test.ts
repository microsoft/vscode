/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';

suite('TerminalCapabilityStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let capabilityStore: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		capabilityStore = store.add(new TerminalCapabilityStore());
		store.add(capabilityStore.onDidAddCapabilityType(e => addEvents.push(e)));
		store.add(capabilityStore.onDidRemoveCapabilityType(e => removeEvents.push(e)));
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => capabilityStore.dispose());

	test('should fire events when capabilities are added', () => {
		assertEvents(addEvents, []);
		// eslint-disable-next-line local/code-no-any-casts
		capabilityStore.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
	});
	test('should fire events when capabilities are removed', async () => {
		assertEvents(removeEvents, []);
		// eslint-disable-next-line local/code-no-any-casts
		capabilityStore.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(removeEvents, []);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), false);
		// eslint-disable-next-line local/code-no-any-casts
		capabilityStore.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), true);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(capabilityStore.has(TerminalCapability.CwdDetection), false);
	});
	test('items should reflect current state', () => {
		deepStrictEqual(Array.from(capabilityStore.items), []);
		// eslint-disable-next-line local/code-no-any-casts
		capabilityStore.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.CwdDetection]);
		// eslint-disable-next-line local/code-no-any-casts
		capabilityStore.add(TerminalCapability.NaiveCwdDetection, {} as any);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
		capabilityStore.remove(TerminalCapability.CwdDetection);
		deepStrictEqual(Array.from(capabilityStore.items), [TerminalCapability.NaiveCwdDetection]);
	});
});

suite('TerminalCapabilityStoreMultiplexer', () => {
	let store: DisposableStore;
	let multiplexer: TerminalCapabilityStoreMultiplexer;
	let store1: TerminalCapabilityStore;
	let store2: TerminalCapabilityStore;
	let addEvents: TerminalCapability[];
	let removeEvents: TerminalCapability[];

	setup(() => {
		store = new DisposableStore();
		multiplexer = store.add(new TerminalCapabilityStoreMultiplexer());
		multiplexer.onDidAddCapabilityType(e => addEvents.push(e));
		multiplexer.onDidRemoveCapabilityType(e => removeEvents.push(e));
		store1 = store.add(new TerminalCapabilityStore());
		store2 = store.add(new TerminalCapabilityStore());
		addEvents = [];
		removeEvents = [];
	});

	teardown(() => store.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should fire events when capabilities are enabled', async () => {
		assertEvents(addEvents, []);
		multiplexer.add(store1);
		multiplexer.add(store2);
		// eslint-disable-next-line local/code-no-any-casts
		store1.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.CwdDetection]);
		// eslint-disable-next-line local/code-no-any-casts
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		assertEvents(addEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when capabilities are disabled', async () => {
		assertEvents(removeEvents, []);
		multiplexer.add(store1);
		multiplexer.add(store2);
		// eslint-disable-next-line local/code-no-any-casts
		store1.add(TerminalCapability.CwdDetection, {} as any);
		// eslint-disable-next-line local/code-no-any-casts
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		assertEvents(removeEvents, []);
		store1.remove(TerminalCapability.CwdDetection);
		assertEvents(removeEvents, [TerminalCapability.CwdDetection]);
		store2.remove(TerminalCapability.NaiveCwdDetection);
		assertEvents(removeEvents, [TerminalCapability.NaiveCwdDetection]);
	});
	test('should fire events when stores are added', async () => {
		assertEvents(addEvents, []);
		// eslint-disable-next-line local/code-no-any-casts
		store1.add(TerminalCapability.CwdDetection, {} as any);
		assertEvents(addEvents, []);
		// eslint-disable-next-line local/code-no-any-casts
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		multiplexer.add(store1);
		multiplexer.add(store2);
		assertEvents(addEvents, [TerminalCapability.CwdDetection, TerminalCapability.NaiveCwdDetection]);
	});
	test('items should return items from all stores', () => {
		deepStrictEqual(Array.from(multiplexer.items).sort(), [].sort());
		multiplexer.add(store1);
		multiplexer.add(store2);
		// eslint-disable-next-line local/code-no-any-casts
		store1.add(TerminalCapability.CwdDetection, {} as any);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection].sort());
		// eslint-disable-next-line local/code-no-any-casts
		store1.add(TerminalCapability.CommandDetection, {} as any);
		// eslint-disable-next-line local/code-no-any-casts
		store2.add(TerminalCapability.NaiveCwdDetection, {} as any);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection, TerminalCapability.NaiveCwdDetection].sort());
		store2.remove(TerminalCapability.NaiveCwdDetection);
		deepStrictEqual(Array.from(multiplexer.items).sort(), [TerminalCapability.CwdDetection, TerminalCapability.CommandDetection].sort());
	});
	test('has should return whether a capability is present', () => {
		deepStrictEqual(multiplexer.has(TerminalCapability.CwdDetection), false);
		multiplexer.add(store1);
		// eslint-disable-next-line local/code-no-any-casts
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
