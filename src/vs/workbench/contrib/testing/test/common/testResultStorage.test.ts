/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { range } from '../../../../../base/common/arrays.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITestResult, LiveTestResult } from '../../common/testResult.js';
import { InMemoryResultStorage, RETAIN_MAX_RESULTS } from '../../common/testResultStorage.js';
import { TestRunProfileBitset } from '../../common/testTypes.js';
import { testStubs } from './testStubs.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('Workbench - Test Result Storage', () => {
	let storage: InMemoryResultStorage;
	let ds: DisposableStore;

	const makeResult = (taskName = 't') => {
		const t = ds.add(new LiveTestResult(
			'',
			true,
			{ targets: [], group: TestRunProfileBitset.Run },
			NullTelemetryService,
		));

		t.addTask({ id: taskName, name: 'n', running: true, ctrlId: 'ctrlId' });
		const tests = ds.add(testStubs.nested());
		tests.expand(tests.root.id, Infinity);
		t.addTestChainToRun('ctrlId', [
			tests.root.toTestItem(),
			tests.root.children.get('id-a')!.toTestItem(),
			tests.root.children.get('id-a')!.children.get('id-aa')!.toTestItem(),
		]);

		t.markComplete();
		return t;
	};

	const assertStored = async (stored: ITestResult[]) =>
		assert.deepStrictEqual((await storage.read()).map(r => r.id), stored.map(s => s.id));

	setup(async () => {
		ds = new DisposableStore();
		storage = ds.add(new InMemoryResultStorage({
			asCanonicalUri(uri) {
				return uri;
			},
		} as IUriIdentityService, ds.add(new TestStorageService()), new NullLogService()));
	});

	teardown(() => ds.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('stores a single result', async () => {
		const r = range(5).map(() => makeResult());
		await storage.persist(r);
		await assertStored(r);
	});

	test('deletes old results', async () => {
		const r = range(5).map(() => makeResult());
		await storage.persist(r);
		const r2 = [makeResult(), ...r.slice(0, 3)];
		await storage.persist(r2);
		await assertStored(r2);
	});

	test('limits stored results', async () => {
		const r = range(100).map(() => makeResult());
		await storage.persist(r);
		await assertStored(r.slice(0, RETAIN_MAX_RESULTS));
	});

	test('limits stored result by budget', async () => {
		const r = range(100).map(() => makeResult('a'.repeat(2048)));
		await storage.persist(r);
		const length = (await storage.read()).length;
		assert.strictEqual(true, length < 50);
	});

	test('always stores the min number of results', async () => {
		const r = range(20).map(() => makeResult('a'.repeat(1024 * 10)));
		await storage.persist(r);
		await assertStored(r.slice(0, 16));
	});

	test('takes into account existing stored bytes', async () => {
		const r = range(10).map(() => makeResult('a'.repeat(1024 * 10)));
		await storage.persist(r);
		await assertStored(r);

		const r2 = [...r, ...range(10).map(() => makeResult('a'.repeat(1024 * 10)))];
		await storage.persist(r2);
		await assertStored(r2.slice(0, 16));
	});
});
