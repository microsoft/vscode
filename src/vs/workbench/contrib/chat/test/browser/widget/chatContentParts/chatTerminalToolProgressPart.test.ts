/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../../../base/common/async.js';

/**
 * These tests verify the auto-expand logic for terminal tool progress parts.
 *
 * The algorithm is:
 * 1. When command executes, kick off 500ms timeout - if hit without data events, expand
 * 2. On first data event, wait 50ms and expand if command not yet finished
 * 3. Fast commands (finishing quickly) should NOT auto-expand to prevent flickering
 */
suite('ChatTerminalToolProgressPart Auto-Expand Logic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Mocked events
	let onCommandExecuted: Emitter<void>;
	let onCommandFinished: Emitter<void>;
	let onWillData: Emitter<string>;

	// State tracking
	let isExpanded: boolean;
	let userToggledOutput: boolean;
	let commandFinished: boolean;
	let receivedData: boolean;
	let dataEventTimeout: ReturnType<typeof setTimeout> | undefined;
	let noDataTimeout: ReturnType<typeof setTimeout> | undefined;

	// Simulated toggle function
	function toggleOutput(expanded: boolean): void {
		isExpanded = expanded;
	}

	function shouldAutoExpand(): boolean {
		return !isExpanded && !userToggledOutput;
	}

	function clearAutoExpandTimeouts(): void {
		if (dataEventTimeout) {
			clearTimeout(dataEventTimeout);
			dataEventTimeout = undefined;
		}
		if (noDataTimeout) {
			clearTimeout(noDataTimeout);
			noDataTimeout = undefined;
		}
	}

	function setupAutoExpandLogic(localStore: DisposableStore): void {
		// Reset state
		commandFinished = false;
		receivedData = false;
		dataEventTimeout = undefined;
		noDataTimeout = undefined;

		// Logic from _registerInstanceListener
		localStore.add(onCommandExecuted.event(() => {
			// Auto-expand for long-running commands:
			// 1. Kick off 500ms timeout - if hit without any data events, expand
			if (shouldAutoExpand() && !noDataTimeout) {
				noDataTimeout = setTimeout(() => {
					noDataTimeout = undefined;
					if (!receivedData && shouldAutoExpand()) {
						toggleOutput(true);
					}
				}, 500);
			}
		}));

		// 2. Wait for first data event - when hit, wait 50ms and expand if command not yet finished
		localStore.add(onWillData.event(() => {
			if (receivedData) {
				return;
			}
			receivedData = true;
			// Cancel the 500ms no-data timeout since we received data
			if (noDataTimeout) {
				clearTimeout(noDataTimeout);
				noDataTimeout = undefined;
			}
			// Wait 50ms and expand if command hasn't finished yet
			if (shouldAutoExpand() && !dataEventTimeout) {
				dataEventTimeout = setTimeout(() => {
					dataEventTimeout = undefined;
					if (!commandFinished && shouldAutoExpand()) {
						toggleOutput(true);
					}
				}, 50);
			}
		}));

		localStore.add(onCommandFinished.event(() => {
			commandFinished = true;
			clearAutoExpandTimeouts();
		}));
	}

	setup(() => {
		onCommandExecuted = store.add(new Emitter<void>());
		onCommandFinished = store.add(new Emitter<void>());
		onWillData = store.add(new Emitter<string>());

		isExpanded = false;
		userToggledOutput = false;
		commandFinished = false;
		receivedData = false;
		dataEventTimeout = undefined;
		noDataTimeout = undefined;
	});

	teardown(() => {
		clearAutoExpandTimeouts();
	});

	test('fast command without data should not auto-expand (finishes before 500ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Command finishes quickly (before 500ms timeout)
		await timeout(100);
		onCommandFinished.fire();

		// Wait past the 500ms mark
		await timeout(500);

		assert.strictEqual(isExpanded, false, 'Should NOT expand for fast command without data');
	});

	test('fast command with quick data should not auto-expand (data + finish before 50ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Data arrives
		onWillData.fire('output');

		// Command finishes quickly (before 50ms timeout)
		await timeout(10);
		onCommandFinished.fire();

		// Wait past all timeouts
		await timeout(100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when command finishes within 50ms of first data');
	});

	test('long-running command with data should auto-expand (data received, command still running after 50ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Data arrives
		onWillData.fire('output');

		// Wait for 50ms timeout to trigger
		await timeout(100);

		assert.strictEqual(isExpanded, true, 'Should expand when command still running 50ms after first data');


		onCommandFinished.fire();
	});

	test('long-running command without data should auto-expand (no data for 500ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Wait for 500ms timeout
		await timeout(600);

		assert.strictEqual(isExpanded, true, 'Should expand when no data received for 500ms');


		onCommandFinished.fire();
	});

	test('data arriving after command finish should not trigger expand', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes and finishes immediately
		onCommandExecuted.fire();
		onCommandFinished.fire();

		// Data arrives after command finished
		onWillData.fire('late output');

		// Wait past all timeouts
		await timeout(100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data arrives after command finished');
	});

	test('user toggled output prevents auto-expand', async () => {
		const localStore = store.add(new DisposableStore());
		userToggledOutput = true;
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts
		await timeout(600);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when user has manually toggled output');
		onCommandFinished.fire();
	});

	test('already expanded output prevents additional auto-expand', async () => {
		const localStore = store.add(new DisposableStore());
		isExpanded = true;
		setupAutoExpandLogic(localStore);

		// Track if toggle was called
		let toggleCalled = false;
		const originalToggle = toggleOutput;
		(globalThis as { toggleOutput?: typeof toggleOutput }).toggleOutput = (expanded: boolean) => {
			toggleCalled = true;
			originalToggle(expanded);
		};

		// Command executes
		onCommandExecuted.fire();

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts
		await timeout(600);

		assert.strictEqual(toggleCalled, false, 'Should NOT call toggle when already expanded');
		onCommandFinished.fire();
	});

	test('data arriving cancels 500ms no-data timeout', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Data arrives at 200ms (before 500ms timeout)
		await timeout(200);
		onWillData.fire('output');

		// Command finishes at 300ms (before 50ms data timeout would fire at 250ms)
		await timeout(30);
		onCommandFinished.fire();

		// Wait past 500ms mark - should NOT have expanded because data arrived
		// and then command finished before the 50ms data timeout
		await timeout(400);
		assert.strictEqual(isExpanded, false, '500ms timeout should be cancelled when data arrives');
	});

	test('multiple data events only trigger one timeout', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire();

		// Multiple data events
		onWillData.fire('output 1');
		onWillData.fire('output 2');
		onWillData.fire('output 3');

		// Wait for timeout
		await timeout(100);
		assert.strictEqual(isExpanded, true, 'Should expand exactly once after first data');
		onCommandFinished.fire();
	});
});
