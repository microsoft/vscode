/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionTaskRunner, SessionTaskRunnerRegistry } from '../../browser/sessionTaskRunner.js';

function makeRunner(id: string, priority: number, canRun: (session: ISession) => boolean = () => true): ISessionTaskRunner {
	return {
		id,
		priority,
		canRun,
		runTask: async () => { /* no-op */ },
	};
}

suite('SessionTaskRunnerRegistry', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	const fakeSession = {} as ISession;

	test('returns undefined when no runners are registered', () => {
		const registry = new SessionTaskRunnerRegistry();
		assert.strictEqual(registry.getRunner(fakeSession), undefined);
	});

	test('returns the single registered runner', () => {
		const registry = new SessionTaskRunnerRegistry();
		const runner = makeRunner('a', 0);
		store.add(registry.register(runner));
		assert.strictEqual(registry.getRunner(fakeSession), runner);
	});

	test('higher priority wins', () => {
		const registry = new SessionTaskRunnerRegistry();
		store.add(registry.register(makeRunner('low', 0)));
		const high = makeRunner('high', 100);
		store.add(registry.register(high));
		assert.strictEqual(registry.getRunner(fakeSession), high);
	});

	test('priority order is independent of registration order', () => {
		const registry = new SessionTaskRunnerRegistry();
		const high = makeRunner('high', 100);
		// Register high first.
		store.add(registry.register(high));
		store.add(registry.register(makeRunner('low', 0)));
		assert.strictEqual(registry.getRunner(fakeSession), high);
	});

	test('later registration wins at equal priority', () => {
		const registry = new SessionTaskRunnerRegistry();
		store.add(registry.register(makeRunner('first', 50)));
		const second = makeRunner('second', 50);
		store.add(registry.register(second));
		assert.strictEqual(registry.getRunner(fakeSession), second);
	});

	test('runners that decline are skipped', () => {
		const registry = new SessionTaskRunnerRegistry();
		store.add(registry.register(makeRunner('declining', 100, () => false)));
		const accepting = makeRunner('accepting', 0, () => true);
		store.add(registry.register(accepting));
		assert.strictEqual(registry.getRunner(fakeSession), accepting);
	});

	test('returns undefined when all registered runners decline', () => {
		const registry = new SessionTaskRunnerRegistry();
		store.add(registry.register(makeRunner('a', 0, () => false)));
		store.add(registry.register(makeRunner('b', 100, () => false)));
		assert.strictEqual(registry.getRunner(fakeSession), undefined);
	});

	test('disposing a registration removes the runner', () => {
		const registry = new SessionTaskRunnerRegistry();
		const runner = makeRunner('a', 0);
		const disposable = registry.register(runner);
		assert.strictEqual(registry.getRunner(fakeSession), runner);
		disposable.dispose();
		assert.strictEqual(registry.getRunner(fakeSession), undefined);
	});
});
