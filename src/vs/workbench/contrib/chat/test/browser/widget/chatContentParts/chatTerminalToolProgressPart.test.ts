/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { TerminalToolAutoExpand, NO_DATA_TIMEOUT_MS, DATA_EVENT_TIMEOUT_MS } from '../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js';
import type { ICommandDetectionCapability } from '../../../../../../../platform/terminal/common/capabilities/capabilities.js';

/**
 * These tests verify the auto-expand logic for terminal tool progress parts.
 *
 * The algorithm is:
 * 1. When command executes, kick off 500ms timeout - if hit without data events, expand only if there's real output
 * 2. On first data event, wait 50ms and expand if command not yet finished
 * 3. Fast commands (finishing quickly) should NOT auto-expand to prevent flickering
 */
suite('ChatTerminalToolProgressPart Auto-Expand Logic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Mocked events
	let onCommandExecuted: Emitter<unknown>;
	let onCommandFinished: Emitter<unknown>;
	let onWillData: Emitter<string>;

	// State tracking
	let isExpanded: boolean;
	let userToggledOutput: boolean;
	let hasRealOutputValue: boolean;

	// Simulated toggle function
	function toggleOutput(expanded: boolean): void {
		isExpanded = expanded;
	}

	function shouldAutoExpand(): boolean {
		return !isExpanded && !userToggledOutput;
	}

	function hasRealOutput(): boolean {
		return hasRealOutputValue;
	}

	function setupAutoExpandLogic(localStore: DisposableStore): void {
		// Create a mock command detection capability
		const mockCommandDetection = {
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
		} as Pick<ICommandDetectionCapability, 'onCommandExecuted' | 'onCommandFinished'> as ICommandDetectionCapability;

		// Use the real TerminalToolAutoExpand class
		localStore.add(new TerminalToolAutoExpand({
			commandDetection: mockCommandDetection,
			onWillData: onWillData.event,
			shouldAutoExpand,
			hasRealOutput,
			toggleOutput,
		}));
	}

	setup(() => {
		onCommandExecuted = store.add(new Emitter<unknown>());
		onCommandFinished = store.add(new Emitter<unknown>());
		onWillData = store.add(new Emitter<string>());

		isExpanded = false;
		userToggledOutput = false;
		hasRealOutputValue = false;
	});

	test('fast command without data should not auto-expand (finishes before 500ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Command finishes quickly (before 500ms timeout)
		await timeout(100);
		onCommandFinished.fire(undefined);

		// Wait past the 500ms mark
		await timeout(NO_DATA_TIMEOUT_MS);

		assert.strictEqual(isExpanded, false, 'Should NOT expand for fast command without data');
	});

	test('fast command with quick data should not auto-expand (data + finish before 50ms)', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Command finishes quickly (before 50ms timeout)
		await timeout(10);
		onCommandFinished.fire(undefined);

		// Wait past all timeouts
		await timeout(100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when command finishes within 50ms of first data');
	});

	test('long-running command with data should auto-expand (data received, command still running after 50ms)', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait for 50ms timeout to trigger
		await timeout(DATA_EVENT_TIMEOUT_MS + 50);

		assert.strictEqual(isExpanded, true, 'Should expand when command still running 50ms after first data');


		onCommandFinished.fire(undefined);
	});

	test('long-running command with data but no real output should NOT auto-expand (like sleep with shell sequences)', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = false; // Shell integration sequences, not real output
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Shell integration data arrives (not real output)
		onWillData.fire('shell-sequence');

		// Wait for 50ms timeout to trigger
		await timeout(DATA_EVENT_TIMEOUT_MS + 50);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data is shell sequences, not real output');


		onCommandFinished.fire(undefined);
	});

	test('long-running command without data should NOT auto-expand if no real output (like sleep)', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = false; // No real output like `sleep 1`
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for 500ms timeout
		await timeout(NO_DATA_TIMEOUT_MS + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when no real output even after 500ms');


		onCommandFinished.fire(undefined);
	});

	test('long-running command without data SHOULD auto-expand if real output exists', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = true; // Has real output in buffer
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for 500ms timeout
		await timeout(NO_DATA_TIMEOUT_MS + 100);

		assert.strictEqual(isExpanded, true, 'Should expand when real output exists after 500ms');


		onCommandFinished.fire(undefined);
	});

	test('data arriving after command finish should not trigger expand', async () => {
		const localStore = store.add(new DisposableStore());
		setupAutoExpandLogic(localStore);

		// Command executes and finishes immediately
		onCommandExecuted.fire(undefined);
		onCommandFinished.fire(undefined);

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
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts
		await timeout(NO_DATA_TIMEOUT_MS + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when user has manually toggled output');
		onCommandFinished.fire(undefined);
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
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts
		await timeout(NO_DATA_TIMEOUT_MS + 100);

		assert.strictEqual(toggleCalled, false, 'Should NOT call toggle when already expanded');
		onCommandFinished.fire(undefined);
	});

	test('data arriving cancels 500ms no-data timeout', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = true; // Would have expanded if 500ms fired
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives at 200ms (before 500ms timeout)
		await timeout(200);
		onWillData.fire('output');

		// Command finishes at 230ms (before 50ms data timeout would fire at 250ms)
		await timeout(30);
		onCommandFinished.fire(undefined);

		// Wait past 500ms mark - should NOT have expanded because data arrived
		// and then command finished before the 50ms data timeout
		await timeout(400);
		assert.strictEqual(isExpanded, false, '500ms timeout should be cancelled when data arrives');
	});

	test('multiple data events only trigger one timeout', async () => {
		const localStore = store.add(new DisposableStore());
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic(localStore);

		// Command executes
		onCommandExecuted.fire(undefined);

		// Multiple data events
		onWillData.fire('output 1');
		onWillData.fire('output 2');
		onWillData.fire('output 3');

		// Wait for timeout
		await timeout(DATA_EVENT_TIMEOUT_MS + 50);
		assert.strictEqual(isExpanded, true, 'Should expand exactly once after first data');
		onCommandFinished.fire(undefined);
	});
});
