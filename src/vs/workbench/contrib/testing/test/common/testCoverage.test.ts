/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SinonSandbox, createSandbox } from 'sinon';
import { Iterable } from 'vs/base/common/iterator';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { onObservableChange } from 'vs/workbench/contrib/testing/common/observableUtils';
import { ICoverageAccessor, TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { IFileCoverage } from 'vs/workbench/contrib/testing/common/testTypes';

suite('TestCoverage', () => {
	let sandbox: SinonSandbox;
	let coverageAccessor: ICoverageAccessor;
	let testCoverage: TestCoverage;

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		sandbox = createSandbox();
		coverageAccessor = {
			getCoverageDetails: sandbox.stub().resolves([]),
		};
		testCoverage = new TestCoverage({} as LiveTestResult, 'taskId', { extUri: { ignorePathCasing: () => true } } as any, coverageAccessor);
	});

	teardown(() => {
		sandbox.restore();
	});

	function addTests() {
		const raw1: IFileCoverage = {
			id: '1',
			uri: URI.file('/path/to/file'),
			statement: { covered: 10, total: 20 },
			branch: { covered: 5, total: 10 },
			declaration: { covered: 2, total: 5 },
		};

		testCoverage.append(raw1, undefined);

		const raw2: IFileCoverage = {
			id: '1',
			uri: URI.file('/path/to/file2'),
			statement: { covered: 5, total: 10 },
			branch: { covered: 1, total: 5 },
		};

		testCoverage.append(raw2, undefined);

		return { raw1, raw2 };
	}

	test('should look up file coverage', async () => {
		const { raw1 } = addTests();

		const fileCoverage = testCoverage.getUri(raw1.uri);
		assert.equal(fileCoverage?.id, raw1.id);
		assert.deepEqual(fileCoverage?.statement, raw1.statement);
		assert.deepEqual(fileCoverage?.branch, raw1.branch);
		assert.deepEqual(fileCoverage?.declaration, raw1.declaration);

		assert.strictEqual(testCoverage.getComputedForUri(raw1.uri), testCoverage.getUri(raw1.uri));
		assert.strictEqual(testCoverage.getComputedForUri(URI.file('/path/to/x')), undefined);
		assert.strictEqual(testCoverage.getUri(URI.file('/path/to/x')), undefined);
	});

	test('should compute coverage for directories', async () => {
		const { raw1 } = addTests();
		const dirCoverage = testCoverage.getComputedForUri(URI.file('/path/to'));
		assert.deepEqual(dirCoverage?.statement, { covered: 15, total: 30 });
		assert.deepEqual(dirCoverage?.branch, { covered: 6, total: 15 });
		assert.deepEqual(dirCoverage?.declaration, raw1.declaration);
	});

	test('should incrementally diff updates to existing files', async () => {
		addTests();

		const raw3: IFileCoverage = {
			id: '1',
			uri: URI.file('/path/to/file'),
			statement: { covered: 12, total: 24 },
			branch: { covered: 7, total: 10 },
			declaration: { covered: 2, total: 5 },
		};

		testCoverage.append(raw3, undefined);

		const fileCoverage = testCoverage.getUri(raw3.uri);
		assert.deepEqual(fileCoverage?.statement, raw3.statement);
		assert.deepEqual(fileCoverage?.branch, raw3.branch);
		assert.deepEqual(fileCoverage?.declaration, raw3.declaration);

		const dirCoverage = testCoverage.getComputedForUri(URI.file('/path/to'));
		assert.deepEqual(dirCoverage?.statement, { covered: 17, total: 34 });
		assert.deepEqual(dirCoverage?.branch, { covered: 8, total: 15 });
		assert.deepEqual(dirCoverage?.declaration, raw3.declaration);
	});

	test('should emit changes', async () => {
		const changes: string[][] = [];
		ds.add(onObservableChange(testCoverage.didAddCoverage, value =>
			changes.push(value.map(v => v.value!.uri.toString()))));

		addTests();

		assert.deepStrictEqual(changes, [
			[
				"file:///",
				"file:///",
				"file:///",
				"file:///path",
				"file:///path/to",
				"file:///path/to/file",
			],
			[
				"file:///",
				"file:///",
				"file:///",
				"file:///path",
				"file:///path/to",
				"file:///path/to/file2",
			],
		]);
	});

	test('adds per-test data to files', async () => {
		const { raw1 } = addTests();

		const raw3: IFileCoverage = {
			id: '1',
			testId: TestId.fromString('my-test'),
			uri: URI.file('/path/to/file'),
			statement: { covered: 12, total: 24 },
			branch: { covered: 7, total: 10 },
			declaration: { covered: 2, total: 5 },
		};
		testCoverage.append(raw3, undefined);

		const fileCoverage = testCoverage.getUri(raw1.uri);
		assert.strictEqual(fileCoverage?.perTestData?.size, 1);

		const perTestCoverage = Iterable.first(fileCoverage!.perTestData!.values());
		assert.deepStrictEqual(perTestCoverage?.statement, raw3.statement);
		assert.deepStrictEqual(perTestCoverage?.branch, raw3.branch);
		assert.deepStrictEqual(perTestCoverage?.declaration, raw3.declaration);

		// should be unchanged:
		assert.deepEqual(fileCoverage?.statement, { covered: 10, total: 20 });
		const dirCoverage = testCoverage.getComputedForUri(URI.file('/path/to'));
		assert.deepEqual(dirCoverage?.statement, { covered: 15, total: 30 });
	});

	test('works if per-test data is added first', async () => {
		const raw3: IFileCoverage = {
			id: '1',
			testId: TestId.fromString('my-test'),
			uri: URI.file('/path/to/file'),
			statement: { covered: 12, total: 24 },
			branch: { covered: 7, total: 10 },
			declaration: { covered: 2, total: 5 },
		};
		testCoverage.append(raw3, undefined);

		const fileCoverage = testCoverage.getUri(raw3.uri);

		addTests();

		assert.strictEqual(fileCoverage?.perTestData?.size, 1);
		const perTestCoverage = Iterable.first(fileCoverage!.perTestData!.values());
		assert.deepStrictEqual(perTestCoverage?.statement, raw3.statement);
		assert.deepStrictEqual(perTestCoverage?.branch, raw3.branch);
		assert.deepStrictEqual(perTestCoverage?.declaration, raw3.declaration);

		// should be the expected values:
		assert.deepEqual(fileCoverage?.statement, { covered: 10, total: 20 });
		const dirCoverage = testCoverage.getComputedForUri(URI.file('/path/to'));
		assert.deepEqual(dirCoverage?.statement, { covered: 15, total: 30 });
	});
});
