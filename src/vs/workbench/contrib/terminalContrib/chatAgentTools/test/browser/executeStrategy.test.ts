/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { waitForIdleWithChildProcessMonitoring } from '../../browser/executeStrategy/executeStrategy.js';

interface MockTerminalInstance {
	hasChildProcesses: boolean;
	onData: Emitter<string>['event'];
	onDidChangeHasChildProcesses: Emitter<boolean>['event'];
}

function createMockTerminalInstance(): { instance: MockTerminalInstance; dataEmitter: Emitter<string>; childProcessEmitter: Emitter<boolean> } {
	const dataEmitter = new Emitter<string>();
	const childProcessEmitter = new Emitter<boolean>();
	
	const instance: MockTerminalInstance = {
		hasChildProcesses: false,
		onData: dataEmitter.event,
		onDidChangeHasChildProcesses: childProcessEmitter.event,
	};
	
	return { instance, dataEmitter, childProcessEmitter };
}

suite('Execute Strategy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('waitForIdleWithChildProcessMonitoring - completes when idle and no child processes', async () => {
		const { instance, dataEmitter } = createMockTerminalInstance();
		
		// Set up the test - instance has no child processes
		instance.hasChildProcesses = false;
		
		const startTime = Date.now();
		const promise = waitForIdleWithChildProcessMonitoring(instance as any, 100, 5000);
		
		// Should complete after ~100ms since no child processes and no data
		await promise;
		const elapsed = Date.now() - startTime;
		
		// Should complete around idle duration (100ms), with some tolerance
		ok(elapsed >= 90 && elapsed < 1000, `Expected ~100ms, got ${elapsed}ms`);
		
		store.add(dataEmitter);
	});

	test('waitForIdleWithChildProcessMonitoring - waits longer when child processes present', async () => {
		const { instance, dataEmitter, childProcessEmitter } = createMockTerminalInstance();
		
		// Set up the test - instance has child processes initially
		instance.hasChildProcesses = true;
		
		const startTime = Date.now();
		const promise = waitForIdleWithChildProcessMonitoring(instance as any, 100, 5000);
		
		// After 200ms, simulate child processes finishing
		setTimeout(() => {
			instance.hasChildProcesses = false;
			childProcessEmitter.fire(false);
		}, 200);
		
		await promise;
		const elapsed = Date.now() - startTime;
		
		// Should take longer than base idle duration due to child processes
		ok(elapsed >= 200, `Expected >= 200ms due to child processes, got ${elapsed}ms`);
		ok(elapsed < 1000, `Expected < 1000ms, got ${elapsed}ms`);
		
		store.add(dataEmitter);
		store.add(childProcessEmitter);
	});

	test('waitForIdleWithChildProcessMonitoring - respects maximum timeout', async () => {
		const { instance, dataEmitter } = createMockTerminalInstance();
		
		// Set up the test - instance always has child processes (never completes naturally)
		instance.hasChildProcesses = true;
		
		const startTime = Date.now();
		const promise = waitForIdleWithChildProcessMonitoring(instance as any, 100, 300); // 300ms max
		
		await promise;
		const elapsed = Date.now() - startTime;
		
		// Should complete due to max timeout
		ok(elapsed >= 290 && elapsed < 400, `Expected ~300ms due to timeout, got ${elapsed}ms`);
		
		store.add(dataEmitter);
	});

	test('waitForIdleWithChildProcessMonitoring - resets on data events', async () => {
		const { instance, dataEmitter } = createMockTerminalInstance();
		
		// Set up the test - no child processes
		instance.hasChildProcesses = false;
		
		const startTime = Date.now();
		const promise = waitForIdleWithChildProcessMonitoring(instance as any, 200, 5000);
		
		// Send data after 100ms to reset the idle timer
		setTimeout(() => {
			dataEmitter.fire('some data');
		}, 100);
		
		await promise;
		const elapsed = Date.now() - startTime;
		
		// Should take longer than initial idle duration due to data reset
		ok(elapsed >= 290, `Expected >= 290ms due to data reset, got ${elapsed}ms`);
		ok(elapsed < 400, `Expected < 400ms, got ${elapsed}ms`);
		
		store.add(dataEmitter);
	});
});