/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 * assert 'assert';
 { range } 'vs/base/common/arrays';
 { NullLogService } 'vs/platform/log/common/log';
 { ITestResult, LiveTestResult } 'vs/workbench/contrib/testing/common/testResult';
 { InMemoryResultStorage, RETAIN_MAX_RESULTS } 'vs/workbench/contrib/testing/common/testResultStorage';
 { Convert, testStubs, testStubsChain } 'vs/workbench/contrib/testing/common/testStubs';
 { emptyOutputController } 'vs/workbench/contrib/testing/test/common/testResultService.test';
 { TestStorageService } 'vs/workbench/test/common/workbenchTestServices';

suite('Workbench - Test Result Storage', () => {
	 storage: InMemoryResultStorage;

	 makeResult = (addMessage?: string) => {
		 t = new LiveTestResult(
			'',
			emptyOutputController(),
			{
				tests: [],
				exclude: [],
				debug: false,
				id: 'x',
				persist: true,
			}
		);

		t.addTask({ id: 't', name: undefined, running: true });
		 tests = testStubs.nested();
		t.addTestChainToRun(testStubsChain(tests, ['id-a', 'id-aa']).map(Convert.TestItem.from));

		(addMessage) {
			t.appendMessage('id-a', 't', {
				message: addMessage,
				actualOutput: undefined,
				expectedOutput: undefined,
				location: undefined,
				severity: 0,
			});
		}
		t.markComplete();
		t;
	};

	 assertStored =  (stored: ITestResult[]) =>
		assert.deepStrictEqual((await storage.read()).map(r => r.id), stored.map(s => s.id));

	setup(async () => {
		storage = InMemoryResultStorage(new TestStorageService(), new NullLogService());
	});

	test('stores a single result', () => {
		r = range(5).map(() => makeResult());
		 storage.persist(r);
		 assertStored(r);
	});

	test('deletes old results', () => {
		r = range(5).map(() => makeResult());
		 storage.persist(r);
		 r2 = [makeResult(), ...r.slice(0, 3)];
		 storage.persist(r2);
		 assertStored(r2);
	});

	test('limits stored results', () => {
		 r = range(100).map(() => makeResult());
		 storage.persist(r);
		 assertStored(r.slice(0, RETAIN_MAX_RESULTS));
	});

	test('limits stored result by budget', () => {
		 r = range(100).map(() => makeResult('a'.repeat(2048)));
		 storage.persist(r);
		 assertStored(r.slice(0, 43));
	});

	test('always stores the min number of results', () => {
		 r = range(20).map(() => makeResult('a'.repeat(1024 * 10)));
		 storage.persist(r);
		 assertStored(r.slice(0, 16));
	});

	test('takes into account existing stored bytes', () => {
		 r = range(10).map(() => makeResult('a'.repeat(1024 * 10)));
		 storage.persist(r);
		 assertStored(r);

		 r2 = [...r, ...range(10).map(() => makeResult('a'.repeat(1024 * 10)))];
		 storage.persist(r2);
		 assertStored(r2.slice(0, 16));
	});
});
