/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { TerminalToolAutoExpand, TerminalToolAutoExpandTimeout } from '../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js';
import type { ICommandDetectionCapability } from '../../../../../../../platform/terminal/common/capabilities/capabilities.js';

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

	function shouldAutoExpand(): boolean {
		return !isExpanded && !userToggledOutput;
	}

	function hasRealOutput(): boolean {
		return hasRealOutputValue;
	}

	function setupAutoExpandLogic(): void {
		// Create a mock command detection capability
		const mockCommandDetection = {
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
		} as Pick<ICommandDetectionCapability, 'onCommandExecuted' | 'onCommandFinished'> as ICommandDetectionCapability;

		// Use the real TerminalToolAutoExpand class
		const autoExpand = store.add(new TerminalToolAutoExpand({
			commandDetection: mockCommandDetection,
			onWillData: onWillData.event,
			shouldAutoExpand,
			hasRealOutput,
		}));
		store.add(autoExpand.onDidRequestExpand(() => {
			isExpanded = true;
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

	test('fast command without data should not auto-expand (finishes before timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Command finishes quickly (before timeout)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand for fast command without data');
	}));

	test('fast command with quick data should not auto-expand (data + finish before timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Command finishes quickly (before timeout)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when command finishes within timeout of first data');
	}));

	test('long-running command with data should auto-expand (data received, command still running after timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, true, 'Should expand when command still running after first data timeout');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command with data but no real output should NOT auto-expand (like sleep with shell sequences)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = false; // Shell integration sequences, not real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Shell integration data arrives (not real output)
		onWillData.fire('shell-sequence');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data is shell sequences, not real output');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command without data should NOT auto-expand if no real output (like sleep)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = false; // No real output like `sleep 1`
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when no real output even after timeout');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command without data SHOULD auto-expand if real output exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output in buffer
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, true, 'Should expand when real output exists after timeout');

		onCommandFinished.fire(undefined);
	}));

	test('data arriving after command finish should not trigger expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes and finishes immediately
		onCommandExecuted.fire(undefined);
		onCommandFinished.fire(undefined);

		// Data arrives after command finished
		onWillData.fire('late output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data arrives after command finished');
	}));

	test('user toggled output prevents auto-expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		userToggledOutput = true;
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when user has manually toggled output');
		onCommandFinished.fire(undefined);
	}));

	test('already expanded output prevents additional auto-expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		isExpanded = true;

		// Create a mock command detection capability
		const mockCommandDetection = {
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
		} as Pick<ICommandDetectionCapability, 'onCommandExecuted' | 'onCommandFinished'> as ICommandDetectionCapability;

		// Track if event was fired
		let eventFired = false;
		const autoExpand = store.add(new TerminalToolAutoExpand({
			commandDetection: mockCommandDetection,
			onWillData: onWillData.event,
			shouldAutoExpand: () => !isExpanded && !userToggledOutput,
			hasRealOutput: () => hasRealOutputValue,
		}));
		store.add(autoExpand.onDidRequestExpand(() => {
			eventFired = true;
		}));

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(eventFired, false, 'Should NOT fire expand event when already expanded');
		onCommandFinished.fire(undefined);
	}));

	test('data arriving cancels no-data timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Would have expanded if no-data timeout fired
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives (cancels no-data timeout)
		onWillData.fire('output');

		// Command finishes immediately after data (before data timeout would fire)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'No-data timeout should be cancelled when data arrives');
	}));

	test('multiple data events only trigger one timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Multiple data events
		onWillData.fire('output 1');
		onWillData.fire('output 2');
		onWillData.fire('output 3');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, true, 'Should expand exactly once after first data');
		onCommandFinished.fire(undefined);
	}));
});
