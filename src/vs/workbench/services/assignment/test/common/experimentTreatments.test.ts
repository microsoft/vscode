/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { registerExperimentTreatments } from '../../common/experimentTreatments.js';
import { NullWorkbenchAssignmentService } from './nullAssignmentService.js';

type TreatmentValue = string | number | boolean;
/** A call of `onPendingChange` (`'pending'` or `'done'`) or the values passed to `onChange`. */
type Call = 'pending' | 'done' | readonly (TreatmentValue | undefined)[];

class TestAssignmentService extends NullWorkbenchAssignmentService {
	private readonly refetched = new Emitter<void>();
	override readonly onDidRefetchAssignments = this.refetched.event;
	readonly values = new Map<string, TreatmentValue>();
	fail = false;

	override async getTreatment<T extends TreatmentValue>(name: string): Promise<T | undefined> {
		if (this.fail) {
			throw new Error('offline');
		}
		return this.values.get(name) as T | undefined;
	}

	async refetch(): Promise<void> {
		this.refetched.fire();
		await timeout(0);
	}

	dispose(): void {
		this.refetched.dispose();
	}
}

suite('registerExperimentTreatments', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function register(service: TestAssignmentService, isValid?: (value: TreatmentValue, name: string) => boolean): Call[] {
		const calls: Call[] = [];
		store.add(service);
		store.add(registerExperimentTreatments<TreatmentValue>(['a', 'b'], 'Test', values => calls.push(values), service, new NullLogService(), isValid, pending => calls.push(pending ? 'pending' : 'done')));
		return calls;
	}

	test('calls onChange with the first values, then only when a refetch changes them', async () => {
		const service = new TestAssignmentService();
		const calls = register(service, () => true);
		await timeout(0);

		await service.refetch();
		service.values.set('a', '1');
		await service.refetch();
		service.values.set('a', 1);
		await service.refetch();
		service.values.set('b', false);
		await service.refetch();
		await service.refetch();
		service.values.delete('b');
		await service.refetch();

		assert.deepStrictEqual(calls, [
			'pending', [undefined, undefined], 'done',
			'pending', 'done',
			'pending', ['1', undefined], 'done',
			'pending', [1, undefined], 'done',
			'pending', [1, false], 'done',
			'pending', 'done',
			'pending', [1, undefined], 'done',
		]);
	});

	test('compares values after validation', async () => {
		const service = new TestAssignmentService();
		service.values.set('a', ' ');
		const calls = register(service);
		await timeout(0);

		service.values.set('a', '');
		await service.refetch();
		service.values.set('a', 'x');
		await service.refetch();

		assert.deepStrictEqual(calls, [
			'pending', [undefined, undefined], 'done',
			'pending', 'done',
			'pending', ['x', undefined], 'done',
		]);
	});

	test('does not call onChange again when a lookup after a failed first lookup resolves to no values', async () => {
		const service = new TestAssignmentService();
		service.fail = true;
		const calls = register(service);
		await timeout(0);

		service.fail = false;
		await service.refetch();

		assert.deepStrictEqual(calls, [
			'pending', [undefined, undefined], 'done',
			'pending', 'done',
		]);
	});
});
