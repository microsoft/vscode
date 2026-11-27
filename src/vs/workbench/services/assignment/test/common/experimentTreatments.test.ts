/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../common/assignmentService.js';
import { registerExperimentTreatments } from '../../common/experimentTreatments.js';

suite('registerExperimentTreatments', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestAssignmentService implements Partial<IWorkbenchAssignmentService> {
		private readonly _onDidRefetchAssignments = disposables.add(new Emitter<void>());
		readonly onDidRefetchAssignments = this._onDidRefetchAssignments.event;

		values: Record<string, string | number | boolean | undefined> = {};
		/** When set, the next N calls to getTreatment reject instead of resolving. */
		failNextCalls = 0;
		/** When set, getTreatment returns a promise that only resolves once released. */
		gate?: { promise: Promise<void>; release: () => void };

		async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
			// Snapshot the value synchronously, as a real request would capture it when sent,
			// so a gated call still "returns" what was current when it was made, not whatever
			// is current when it happens to resume.
			const snapshot = this.values[name] as T | undefined;
			if (this.gate) {
				await this.gate.promise;
			}
			if (this.failNextCalls > 0) {
				this.failNextCalls--;
				throw new Error('simulated getTreatment failure');
			}
			return snapshot;
		}

		refetch(): void {
			this._onDidRefetchAssignments.fire();
		}
	}

	function createGate(): { promise: Promise<void>; release: () => void } {
		let release!: () => void;
		const promise = new Promise<void>(resolve => { release = resolve; });
		return { promise, release };
	}

	test('does not call onChange again when a refetch resolves the same values', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';

		let changeCount = 0;
		let lastValues: readonly (string | undefined)[] = [];

		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			values => { changeCount++; lastValues = values; },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));

		// initial resolution
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(changeCount, 1);
		assert.deepStrictEqual(lastValues, ['a']);

		// refetch with the exact same value should not call onChange again
		assignmentService.refetch();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(changeCount, 1, 'onChange should not be called again when the treatment value is unchanged');

		// refetch with a different value should call onChange
		assignmentService.values.foo = 'b';
		assignmentService.refetch();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(changeCount, 2);
		assert.deepStrictEqual(lastValues, ['b']);
	});

	test('calls onChange when only one of several treatments changes, with all current values', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';
		assignmentService.values.bar = 1;

		const calls: (readonly (string | number | undefined)[])[] = [];

		disposables.add(registerExperimentTreatments<string | number>(
			['foo', 'bar'],
			'test',
			values => { calls.push(values); },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
			value => typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number',
		));

		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a', 1]]);

		// change only 'bar'; 'foo' stays the same
		assignmentService.values.bar = 2;
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();

		assert.deepStrictEqual(calls, [['a', 1], ['a', 2]], 'onChange should fire with both current values when any one treatment changes');

		// refetch with nothing changed
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();

		assert.strictEqual(calls.length, 2, 'an unchanged refetch across multiple treatments should not call onChange');
	});

	test('a value becoming undefined, and then returning, are each treated as changes', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';

		const calls: (readonly (string | undefined)[])[] = [];
		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			values => calls.push(values),
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a']]);

		assignmentService.values.foo = undefined;
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a'], [undefined]]);

		// refetching the same undefined value again should not re-fire
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(calls.length, 2);

		assignmentService.values.foo = 'a';
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a'], [undefined], ['a']]);
	});

	test('an invalid value is treated as undefined, and repeating the same invalid value does not re-fire', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'not-a-number';

		const calls: (readonly (number | undefined)[])[] = [];
		disposables.add(registerExperimentTreatments<number>(
			['foo'],
			'test',
			values => calls.push(values),
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
			value => typeof value === 'number',
		));
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [[undefined]], 'an invalid value should resolve to undefined, not the raw value');

		// a different, still-invalid value: getTreatmentValue still produces undefined, so this
		// should NOT be seen as a change even though the underlying raw value is different.
		assignmentService.values.foo = 'still-not-a-number';
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(calls.length, 1, 'two different invalid values both resolve to undefined and should not count as a change');
	});

	test('onPendingChange still fires on every refetch, even when onChange is suppressed', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';

		let changeCount = 0;
		const pendingTransitions: boolean[] = [];

		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			() => { changeCount++; },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
			undefined,
			pending => pendingTransitions.push(pending),
		));
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(changeCount, 1);
		assert.deepStrictEqual(pendingTransitions, [true, false]);

		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();

		assert.strictEqual(changeCount, 1, 'onChange is suppressed for the unchanged refetch');
		assert.deepStrictEqual(pendingTransitions, [true, false, true, false], 'onPendingChange still reports the lookup regardless of whether onChange fired');
	});

	test('a failed refetch after a successful resolution keeps the last values and does not call onChange', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';

		let changeCount = 0;
		let lastValues: readonly (string | undefined)[] = [];
		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			values => { changeCount++; lastValues = values; },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(changeCount, 1);
		assert.deepStrictEqual(lastValues, ['a']);

		// a refetch that fails outright (hasResolved is already true) bails out before onChange
		assignmentService.failNextCalls = 1;
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();

		assert.strictEqual(changeCount, 1, 'a failed refetch after a prior success must not call onChange at all');
		assert.deepStrictEqual(lastValues, ['a']);

		// a subsequent successful refetch with the same value as before the failure should still
		// correctly be recognised as unchanged (failure must not have reset the tracked last values)
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(changeCount, 1, 'recovering to the same value after a transient failure should not call onChange');
	});

	test('the very first resolution failing resolves treatments to undefined and calls onChange once', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.failNextCalls = 1;

		let changeCount = 0;
		let lastValues: readonly (string | undefined)[] = [];
		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			values => { changeCount++; lastValues = values; },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));
		await Promise.resolve(); await Promise.resolve();

		assert.strictEqual(changeCount, 1);
		assert.deepStrictEqual(lastValues, [undefined]);

		// a later refetch that legitimately resolves to undefined (e.g. still no assignment) must
		// not be treated as a change from the undefined fallback above.
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.strictEqual(changeCount, 1, 'resolving to undefined again after an undefined fallback should not call onChange');
	});

	test('a superseded (stale) in-flight request does not affect onChange or the tracked last values', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';

		const calls: (readonly (string | undefined)[])[] = [];
		disposables.add(registerExperimentTreatments(
			['foo'],
			'test',
			values => calls.push(values),
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a']]);

		// start a refetch and gate its getTreatment call so it doesn't resolve yet
		const gate = createGate();
		assignmentService.gate = gate;
		assignmentService.values.foo = 'b';
		assignmentService.refetch();
		await Promise.resolve();

		// a second refetch supersedes the first before it resolves; let it resolve immediately
		assignmentService.gate = undefined;
		assignmentService.values.foo = 'c';
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();

		assert.deepStrictEqual(calls, [['a'], ['c']], 'the superseded "b" response should never reach onChange');

		// now release the stale "b" request; it must be dropped entirely, not just suppressed as unchanged
		gate.release();
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a'], ['c']], 'the stale request resolving late must not call onChange or disturb the tracked values');

		// a refetch resolving to the stale "b" value again now correctly counts as a change from "c"
		assignmentService.values.foo = 'b';
		assignmentService.refetch();
		await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(calls, [['a'], ['c'], ['b']]);
	});

	test('disposing before the initial resolution completes prevents onChange from ever firing', async () => {
		const assignmentService = new TestAssignmentService();
		assignmentService.values.foo = 'a';
		const gate = createGate();
		assignmentService.gate = gate;

		let changeCount = 0;
		const localStore = new DisposableStore();
		localStore.add(registerExperimentTreatments(
			['foo'],
			'test',
			() => { changeCount++; },
			assignmentService as unknown as IWorkbenchAssignmentService,
			new NullLogService(),
		));

		localStore.dispose();
		gate.release();
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

		assert.strictEqual(changeCount, 0, 'onChange must not fire once the returned store has been disposed');
	});
});
