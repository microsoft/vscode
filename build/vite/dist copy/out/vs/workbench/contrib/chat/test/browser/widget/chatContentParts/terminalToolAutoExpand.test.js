/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { TerminalToolAutoExpand } from '../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js';
suite('TerminalToolAutoExpand', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    // Mocked events
    let onCommandExecuted;
    let onCommandFinished;
    let onWillData;
    // State tracking
    let isExpanded;
    let userToggledOutput;
    let hasRealOutputValue;
    function shouldAutoExpand() {
        return !isExpanded && !userToggledOutput;
    }
    function hasRealOutput() {
        return hasRealOutputValue;
    }
    function setupAutoExpandLogic() {
        // Create a mock command detection capability
        const mockCommandDetection = {
            onCommandExecuted: onCommandExecuted.event,
            onCommandFinished: onCommandFinished.event,
        };
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
        onCommandExecuted = store.add(new Emitter());
        onCommandFinished = store.add(new Emitter());
        onWillData = store.add(new Emitter());
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
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
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
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 100);
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
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 100);
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
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 100);
        assert.strictEqual(isExpanded, false, 'Should NOT expand when data is shell sequences, not real output');
        onCommandFinished.fire(undefined);
    }));
    test('long-running command without data should NOT auto-expand if no real output (like sleep)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        hasRealOutputValue = false; // No real output like `sleep 1`
        setupAutoExpandLogic();
        // Command executes
        onCommandExecuted.fire(undefined);
        // Wait for timeout to fire (faked timers advance instantly)
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
        assert.strictEqual(isExpanded, false, 'Should NOT expand when no real output even after timeout');
        onCommandFinished.fire(undefined);
    }));
    test('long-running command without data SHOULD auto-expand if real output exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        hasRealOutputValue = true; // Has real output in buffer
        setupAutoExpandLogic();
        // Command executes
        onCommandExecuted.fire(undefined);
        // Wait for timeout to fire (faked timers advance instantly)
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
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
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
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
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
        assert.strictEqual(isExpanded, false, 'Should NOT expand when user has manually toggled output');
        onCommandFinished.fire(undefined);
    }));
    test('already expanded output prevents additional auto-expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        isExpanded = true;
        // Create a mock command detection capability
        const mockCommandDetection = {
            onCommandExecuted: onCommandExecuted.event,
            onCommandFinished: onCommandFinished.event,
        };
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
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
        assert.strictEqual(eventFired, false, 'Should NOT fire expand event when already expanded');
        onCommandFinished.fire(undefined);
    }));
    test('data arriving with real output cancels no-data timeout (DataEvent path succeeds)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        hasRealOutputValue = true; // Real output exists
        setupAutoExpandLogic();
        // Command executes
        onCommandExecuted.fire(undefined);
        // Data arrives with real output
        onWillData.fire('output');
        // Wait for DataEvent timeout to fire (50ms)
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 10);
        // Should have expanded via DataEvent path
        assert.strictEqual(isExpanded, true, 'Should expand via DataEvent path when real output exists');
        // Command finishes later
        onCommandFinished.fire(undefined);
    }));
    test('data arriving without real output does NOT cancel no-data timeout (NoData path can still expand)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        hasRealOutputValue = false; // No real output initially (shell sequences)
        setupAutoExpandLogic();
        // Command executes
        onCommandExecuted.fire(undefined);
        // Data arrives (shell integration sequences, not real output)
        onWillData.fire('shell-sequence');
        // Wait for DataEvent timeout to fire - should NOT expand since no real output
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 10);
        assert.strictEqual(isExpanded, false, 'Should NOT expand when DataEvent fires without real output');
        // Now real output appears during the NoData timeout window (after DataEvent timeout but before NoData timeout completes)
        hasRealOutputValue = true;
        // Wait for NoData timeout to fire (500ms from command executed)
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ - 50 /* TerminalToolAutoExpandTimeout.DataEvent */);
        // Should have expanded via NoData path
        assert.strictEqual(isExpanded, true, 'NoData path should still expand when real output appears later');
        onCommandFinished.fire(undefined);
    }));
    test('quick finish after data prevents expansion even with real output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        hasRealOutputValue = true;
        setupAutoExpandLogic();
        // Command executes
        onCommandExecuted.fire(undefined);
        // Data arrives
        onWillData.fire('output');
        // Command finishes immediately after data (before any timeout fires)
        onCommandFinished.fire(undefined);
        // Wait past all timeouts
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */ + 100);
        assert.strictEqual(isExpanded, false, 'Should NOT expand when command finishes before timeouts');
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
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 100);
        assert.strictEqual(isExpanded, true, 'Should expand exactly once after first data');
        onCommandFinished.fire(undefined);
    }));
    test('progress bar output detected via multiple data events (receivedDataCount > 1)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // Simulates progress bars that update on the same line - cursor doesn't move past marker
        // but multiple data events indicate real output
        let dataEventCount = 0;
        // Create a mock command detection capability
        const mockCommandDetection = {
            onCommandExecuted: onCommandExecuted.event,
            onCommandFinished: onCommandFinished.event,
        };
        // Track data events to simulate receivedDataCount logic
        store.add(onWillData.event(() => {
            dataEventCount++;
        }));
        const autoExpand = store.add(new TerminalToolAutoExpand({
            commandDetection: mockCommandDetection,
            onWillData: onWillData.event,
            shouldAutoExpand: () => !isExpanded && !userToggledOutput,
            // Simulate: cursor hasn't moved past marker, but multiple data events = real output
            hasRealOutput: () => dataEventCount > 1,
        }));
        store.add(autoExpand.onDidRequestExpand(() => {
            isExpanded = true;
        }));
        // Command executes
        onCommandExecuted.fire(undefined);
        // First data event (shell sequence) - hasRealOutput returns false (dataEventCount = 1)
        onWillData.fire('shell-sequence');
        // Wait for DataEvent timeout - should NOT expand yet (hasRealOutput = false)
        await timeout(50 /* TerminalToolAutoExpandTimeout.DataEvent */ + 10);
        assert.strictEqual(isExpanded, false, 'Should NOT expand after first data event');
        // Second data event (progress bar update) - hasRealOutput returns true (dataEventCount = 2)
        onWillData.fire('progress');
        // Wait for NoData timeout - should expand via NoData path
        await timeout(500 /* TerminalToolAutoExpandTimeout.NoData */);
        assert.strictEqual(isExpanded, true, 'Should expand when multiple data events detected as real output');
        onCommandFinished.fire(undefined);
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUb29sQXV0b0V4cGFuZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdGVybWluYWxUb29sQXV0b0V4cGFuZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxzQkFBc0IsRUFBaUMsTUFBTSwyRkFBMkYsQ0FBQztBQUdsSyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsZ0JBQWdCO0lBQ2hCLElBQUksaUJBQW1DLENBQUM7SUFDeEMsSUFBSSxpQkFBbUMsQ0FBQztJQUN4QyxJQUFJLFVBQTJCLENBQUM7SUFFaEMsaUJBQWlCO0lBQ2pCLElBQUksVUFBbUIsQ0FBQztJQUN4QixJQUFJLGlCQUEwQixDQUFDO0lBQy9CLElBQUksa0JBQTJCLENBQUM7SUFFaEMsU0FBUyxnQkFBZ0I7UUFDeEIsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDLGlCQUFpQixDQUFDO0lBQzFDLENBQUM7SUFFRCxTQUFTLGFBQWE7UUFDckIsT0FBTyxrQkFBa0IsQ0FBQztJQUMzQixDQUFDO0lBRUQsU0FBUyxvQkFBb0I7UUFDNUIsNkNBQTZDO1FBQzdD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