/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChildProcessMonitor } from '../../node/childProcessMonitor.js';

suite('ChildProcessMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function withMonitor(run: (monitor: ChildProcessMonitor, clock: sinon.SinonFakeTimers) => void): void {
		const clock = sinon.useFakeTimers();
		const logService = store.add(new NullLogService());
		const monitor = store.add(new ChildProcessMonitor(1, logService));
		try {
			run(monitor, clock);
		} finally {
			monitor.dispose();
			clock.restore();
		}
	}

	test('cancels the pending input refresh on disposal', () => withMonitor((monitor, clock) => {
		monitor.handleInput();
		const beforeDispose = clock.countTimers();

		monitor.dispose();

		assert.deepStrictEqual({ beforeDispose, afterDispose: clock.countTimers() }, { beforeDispose: 1, afterDispose: 0 });
	}));

	test('cancels both pending output refreshes on disposal', () => withMonitor((monitor, clock) => {
		monitor.handleOutput();
		monitor.handleOutput();
		const beforeDispose = clock.countTimers();

		monitor.dispose();

		assert.deepStrictEqual({ beforeDispose, afterDispose: clock.countTimers() }, { beforeDispose: 2, afterDispose: 0 });
	}));

	test('does not schedule refreshes after disposal', () => withMonitor((monitor, clock) => {
		monitor.dispose();

		monitor.handleInput();
		monitor.handleOutput();
		monitor.handleOutput();

		assert.strictEqual(clock.countTimers(), 0);
	}));

	test('coalesces repeated input and output until disposal', () => withMonitor((monitor, clock) => {
		for (let i = 0; i < 17; i++) {
			monitor.handleInput();
			monitor.handleOutput();
		}
		const beforeDispose = clock.countTimers();

		monitor.dispose();
		clock.tick(7000);

		assert.deepStrictEqual({ beforeDispose, afterDispose: clock.countTimers() }, { beforeDispose: 2, afterDispose: 0 });
	}));
});
