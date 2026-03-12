/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtUri } from '../../../../../base/common/resources.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IToolInvocation, IToolInvocationPreparationContext, IToolProgressStep } from '../../../chat/common/tools/languageModelToolsService.js';
import { FileCoverage, ICoverageAccessor, TestCoverage } from '../../common/testCoverage.js';
import { LiveTestResult } from '../../common/testResult.js';
import { ITestResultService } from '../../common/testResultService.js';
import { IMainThreadTestCollection, ITestService } from '../../common/testService.js';
import { CoverageDetails, DetailType, IBranchCoverage, IDeclarationCoverage, IFileCoverage, IStatementCoverage, ResolvedTestRunRequest, TestMessageType, TestResultState, TestRunProfileBitset } from '../../common/testTypes.js';
import { ITestProfileService } from '../../common/testProfileService.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { TestId } from '../../common/testId.js';
import { RunTestTool, buildTestRunSummary, getCoverageSummary, getOverallCoverageSummary, getFileCoverageDetails, mergeLineRanges, getFailureDetails } from '../../common/testingChatAgentTool.js';

suite('Workbench - RunTestTool', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let insertCounter = 0;
	let tool: RunTestTool;

	const noopProgress = {
		report: (_update: IToolProgressStep) => { },
	};
	const noopCountTokens = () => Promise.resolve(0);

	function createLiveTestResult(request?: ResolvedTestRunRequest): LiveTestResult {
		const req = request ?? {
			group: TestRunProfileBitset.Run,
			targets: [{ profileId: 0, controllerId: 'ctrlId', testIds: ['id-a'] }],
		};
		return ds.add(new LiveTestResult(
			`result-${insertCounter++}`,
			false,
			req,
			insertCounter,
			NullTelemetryService,
		));
	}

	function createTestCoverage(files: { uri: URI; statement: { covered: number; total: number }; branch?: { covered: number; total: number }; declaration?: { covered: number; total: number }; details?: CoverageDetails[] }[]): TestCoverage {
		const result = createLiveTestResult();
		const accessor: ICoverageAccessor = {
			getCoverageDetails: (id, _testId, _token) => {
				const entry = files.find(f => f.uri.toString() === id);
				return Promise.resolve(entry?.details ?? []);
			},
		};
		const uriIdentity = upcastPartial<IUriIdentityService>({
			asCanonicalUri: (uri: URI) => uri,
			extUri: upcastPartial<IExtUri>({
				isEqual: (a: URI, b: URI) => a.toString() === b.toString(),
				ignorePathCasing: () => false,
			}),
		});
		const coverage = new TestCoverage(result, 'task-1', uriIdentity, accessor);
		for (const f of files) {
			const fileCoverage: IFileCoverage = {
				id: f.uri.toString(),
				uri: f.uri,
				statement: f.statement,
				branch: f.branch,
				declaration: f.declaration,
			};
			coverage.append(fileCoverage, undefined);
		}
		return coverage;
	}

	function makeStatement(line: number, count: number, endLine?: number, branches?: IBranchCoverage[]): IStatementCoverage {
		return {
			type: DetailType.Statement,
			count,
			location: new Range(line, 1, endLine ?? line, 1),
			branches,
		};
	}

	function makeDeclaration(name: string, line: number, count: number): IDeclarationCoverage {
		return {
			type: DetailType.Declaration,
			name,
			count,
			location: new Range(line, 1, line, 1),
		};
	}

	function makeBranch(line: number, count: number, label?: string): IBranchCoverage {
		return {
			count,
			label,
			location: new Range(line, 1, line, 1),
		};
	}

	function createResultWithCoverage(coverageData: TestCoverage): LiveTestResult {
		const result = createLiveTestResult();
		result.addTask({ id: 'task-1', name: 'Test Task', running: true, ctrlId: 'ctrlId' });
		const taskCov = result.tasks[0].coverage as ReturnType<typeof observableValue<TestCoverage | undefined>>;
		taskCov.set(coverageData, undefined);
		return result;
	}

	function createResultWithTests(tests: { extId: string; label: string; state: TestResultState; messages?: { type: TestMessageType; message: string; expected?: string; actual?: string; location?: { uri: URI; range: Range }; stackTrace?: { uri?: URI; position?: { lineNumber: number; column: number }; label: string }[] }[] }[]): LiveTestResult {
		const result = createLiveTestResult();
		result.addTask({ id: 't', name: 'Test Task', running: true, ctrlId: 'ctrlId' });

		for (const t of tests) {
			const chain = TestId.split(t.extId);
			const items = chain.map((segment, i) => ({
				extId: new TestId(chain.slice(0, i + 1)).toString(),
				label: i === chain.length - 1 ? t.label : segment,
				busy: false,
				description: null,
				error: null,
				range: null,
				sortText: null,
				tags: [],
				uri: undefined,
			}));
			result.addTestChainToRun('ctrlId', items);
		}

		for (const t of tests) {
			result.updateState(t.extId, 't', t.state);
			if (t.messages) {
				for (const msg of t.messages) {
					result.appendMessage(t.extId, 't', {
						type: msg.type as TestMessageType.Error,
						message: msg.message,
						expected: msg.expected,
						actual: msg.actual,
						contextValue: undefined,
						location: msg.location ? { uri: msg.location.uri, range: msg.location.range } : undefined,
						stackTrace: msg.stackTrace?.map(f => ({
							uri: f.uri,
							position: f.position ? new Position(f.position.lineNumber, f.position.column) : undefined,
							label: f.label,
						})),
					});
				}
			}
		}

		return result;
	}

	function createFileCov(uri: URI, statement: { covered: number; total: number }, details: CoverageDetails[], opts?: { branch?: { covered: number; total: number }; declaration?: { covered: number; total: number } }): FileCoverage {
		const result = createLiveTestResult();
		const accessor: ICoverageAccessor = {
			getCoverageDetails: () => Promise.resolve(details),
		};
		return new FileCoverage({ id: 'file-1', uri, statement, branch: opts?.branch, declaration: opts?.declaration }, result, accessor);
	}

	setup(() => {
		insertCounter = 0;

		const mockTestService = upcastPartial<ITestService>({
			collection: upcastPartial<IMainThreadTestCollection>({
				rootItems: [],
				rootIds: [],
				expand: () => Promise.resolve(),
				getNodeById: () => undefined,
				getNodeByUrl: () => [],
			}),
			runTests: () => Promise.resolve(upcastPartial({})),
			cancelTestRun: () => { },
		});

		const mockResultService = upcastPartial<ITestResultService>({
			onResultsChanged: Event.None,
		});

		const mockProfileService = upcastPartial<ITestProfileService>({
			capabilitiesForTest: () => TestRunProfileBitset.Run | TestRunProfileBitset.Coverage,
		});

		const mockUriIdentity = upcastPartial<IUriIdentityService>({
			asCanonicalUri: (uri: URI) => uri,
			extUri: upcastPartial<IExtUri>({ isEqual: (a: URI, b: URI) => a.toString() === b.toString() }),
		});

		const mockWorkspaceContext = upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ id: 'test', folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/workspace') })] }),
		});

		tool = new RunTestTool(
			mockTestService,
			mockUriIdentity,
			mockWorkspaceContext,
			mockResultService,
			mockProfileService,
		);
	});

	suite('invoke', () => {
		test('returns error when no tests found', async () => {
			const result = await tool.invoke(
				upcastPartial<IToolInvocation>({ parameters: { files: ['/nonexistent/test.ts'] } }),
				noopCountTokens, noopProgress, CancellationToken.None,
			);
			assert.ok(result.toolResultError);
			assert.ok(result.content[0].kind === 'text' && result.content[0].value.includes('No tests found'));
		});
	});

	suite('_buildSummary', () => {
		test('includes pass/fail counts', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Passed },
				{ extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'boom' }] },
			]);
			result.markComplete();

			const summary = await buildTestRunSummary(result, 'run', undefined);
			assert.ok(summary.includes('<summary passed=1 failed=1 />'));
		});

		test('combines errored and failed in failure count', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'fail' }] },
				{ extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: TestResultState.Errored, messages: [{ type: TestMessageType.Error, message: 'error' }] },
				{ extId: new TestId(['ctrlId', 'c']).toString(), label: 'c', state: TestResultState.Passed },
			]);
			result.markComplete();

			const summary = await buildTestRunSummary(result, 'run', undefined);
			assert.ok(summary.includes('failed=2'));
		});

		test('includes coverage when mode is coverage', async () => {
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);
			result.markComplete();

			const summary = await buildTestRunSummary(result, 'coverage', undefined);
			assert.ok(summary.includes('<coverageSummary>'));
		});

		test('omits coverage when mode is run', async () => {
			const result = createLiveTestResult();
			result.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });
			result.markComplete();

			const summary = await buildTestRunSummary(result, 'run', undefined);
			assert.ok(!summary.includes('<coverage'));
		});
	});

	suite('getCoverageSummary', () => {
		test('returns overall summary when no coverageFiles specified', async () => {
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 5, total: 10 } },
				{ uri: URI.file('/src/b.ts'), statement: { covered: 10, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, undefined);
			assert.ok(summary.includes('<coverageSummary>'));
			assert.ok(summary.includes('/src/a.ts'));
			assert.ok(!summary.includes('/src/b.ts')); // 100% covered, excluded
		});

		test('returns detailed summary for specified coverageFiles', async () => {
			const details: CoverageDetails[] = [
				makeDeclaration('uncoveredFn', 10, 0),
				makeStatement(20, 0, 25),
			];
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 }, declaration: { covered: 0, total: 1 }, details },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, ['/src/a.ts']);
			assert.ok(summary.includes('<coverage path="/src/a.ts"'));
			assert.ok(summary.includes('uncovered functions:'));
			assert.ok(summary.includes('uncoveredFn(L10)'));
			assert.ok(summary.includes('uncovered lines:'));
		});

		test('returns empty string when no coverage data exists', async () => {
			const result = createLiveTestResult();
			result.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });

			const summary = await getCoverageSummary(result, ['/src/a.ts']);
			assert.strictEqual(summary, '');
		});

		test('handles multiple coverageFiles', async () => {
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 }, details: [makeStatement(5, 0)] },
				{ uri: URI.file('/src/b.ts'), statement: { covered: 3, total: 10 }, details: [makeDeclaration('fn', 1, 0)] },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, ['/src/a.ts', '/src/b.ts']);
			assert.ok(summary.includes('/src/a.ts'));
			assert.ok(summary.includes('/src/b.ts'));
		});

		test('skips non-matching coverageFiles gracefully', async () => {
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, ['/src/nonexistent.ts']);
			assert.strictEqual(summary, '');
		});
	});

	suite('getOverallCoverageSummary', () => {
		test('returns all-covered message when everything is 100%', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 10, total: 10 } },
				{ uri: URI.file('/src/b.ts'), statement: { covered: 5, total: 5 } },
			]);
			assert.strictEqual(
				getOverallCoverageSummary(coverage),
				'<coverageSummary>All files have 100% coverage.</coverageSummary>\n',
			);
		});

		test('sorts files by coverage ascending', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/high.ts'), statement: { covered: 9, total: 10 } },
				{ uri: URI.file('/src/low.ts'), statement: { covered: 3, total: 10 } },
				{ uri: URI.file('/src/mid.ts'), statement: { covered: 7, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			const lowIdx = summary.indexOf('/src/low.ts');
			const midIdx = summary.indexOf('/src/mid.ts');
			const highIdx = summary.indexOf('/src/high.ts');
			assert.ok(lowIdx < midIdx && midIdx < highIdx);
		});

		test('excludes 100% files from listing', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/partial.ts'), statement: { covered: 5, total: 10 } },
				{ uri: URI.file('/src/full.ts'), statement: { covered: 10, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			assert.ok(summary.includes('/src/partial.ts'));
			assert.ok(!summary.includes('/src/full.ts'));
		});

		test('includes percentage in output', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 7, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			assert.ok(summary.includes('percent=70.0'));
		});
	});

	suite('getFileCoverageDetails', () => {
		test('shows header with statement counts', async () => {
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, []);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('statements=8/10'));
			assert.ok(output.includes('percent=80.0'));
			assert.ok(output.startsWith('<coverage path="/src/foo.ts"'));
			assert.ok(output.endsWith('</coverage>\n'));
		});

		test('includes branch counts when available', async () => {
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, [], { branch: { covered: 3, total: 5 } });
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('branches=3/5'));
		});

		test('includes declaration counts when available', async () => {
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, [], { declaration: { covered: 2, total: 4 } });
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('declarations=2/4'));
		});

		test('omits branch/declaration when not available', async () => {
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, []);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(!output.includes('branches='));
			assert.ok(!output.includes('declarations='));
		});

		test('lists uncovered declarations', async () => {
			const details: CoverageDetails[] = [
				makeDeclaration('handleError', 89, 0),
				makeDeclaration('processQueue', 120, 0),
				makeDeclaration('coveredFn', 50, 3),
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, details, { declaration: { covered: 1, total: 3 } });
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('uncovered functions: handleError(L89), processQueue(L120)'));
			assert.ok(!output.includes('coveredFn'));
		});

		test('lists uncovered branches with labels', async () => {
			const details: CoverageDetails[] = [
				makeStatement(34, 5, undefined, [
					makeBranch(34, 5, 'then'),
					makeBranch(36, 0, 'else'),
				]),
				makeStatement(56, 2, undefined, [
					makeBranch(56, 0, 'case "foo"'),
					makeBranch(58, 2, 'case "bar"'),
				]),
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, details, { branch: { covered: 2, total: 4 } });
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('uncovered branches: L36(else), L56(case "foo")'));
		});

		test('lists uncovered branches without labels', async () => {
			const details: CoverageDetails[] = [
				makeStatement(10, 1, undefined, [makeBranch(10, 0)]),
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, details);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('uncovered branches: L10\n'));
		});

		test('uses parent statement location when branch has no location', async () => {
			const details: CoverageDetails[] = [
				makeStatement(42, 1, undefined, [{ count: 0, label: 'else' }]),
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 8, total: 10 }, details);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('L42(else)'));
		});

		test('lists merged uncovered line ranges', async () => {
			const details: CoverageDetails[] = [
				makeStatement(23, 0, 27),
				makeStatement(28, 0, 30),
				makeStatement(45, 0),
				makeStatement(67, 0, 72),
				makeStatement(100, 0, 105),
				makeStatement(50, 5), // covered
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 5, total: 11 }, details);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(output.includes('uncovered lines: 23-30, 45, 67-72, 100-105'));
		});

		test('omits uncovered sections when all covered', async () => {
			const details: CoverageDetails[] = [
				makeDeclaration('fn', 10, 3),
				makeStatement(20, 5),
				makeStatement(30, 1, undefined, [makeBranch(30, 1, 'then'), makeBranch(32, 2, 'else')]),
			];
			const file = createFileCov(URI.file('/src/foo.ts'), { covered: 10, total: 10 }, details);
			const output = await getFileCoverageDetails(file, '/src/foo.ts');
			assert.ok(!output.includes('uncovered'));
		});

		test('handles details() throwing gracefully', async () => {
			const result = createLiveTestResult();
			const accessor: ICoverageAccessor = {
				getCoverageDetails: () => Promise.reject(new Error('not available')),
			};
			const file = new FileCoverage({ id: 'err', uri: URI.file('/src/err.ts'), statement: { covered: 5, total: 10 } }, result, accessor);
			const output = await getFileCoverageDetails(file, '/src/err.ts');
			assert.ok(output.includes('<coverage path="/src/err.ts"'));
			assert.ok(output.includes('</coverage>'));
			assert.ok(!output.includes('uncovered'));
		});

		test('full output snapshot', async () => {
			const details: CoverageDetails[] = [
				makeDeclaration('uncoveredFn', 10, 0),
				makeDeclaration('coveredFn', 20, 3),
				makeStatement(30, 0, 32),
				makeStatement(40, 5, undefined, [
					makeBranch(40, 5, 'then'),
					makeBranch(42, 0, 'else'),
				]),
				makeStatement(50, 3),
			];
			const file = createFileCov(
				URI.file('/src/foo.ts'),
				{ covered: 8, total: 10 },
				details,
				{ branch: { covered: 1, total: 2 }, declaration: { covered: 1, total: 2 } },
			);
			assert.deepStrictEqual(
				await getFileCoverageDetails(file, '/src/foo.ts'),
				'<coverage path="/src/foo.ts" percent=71.4 statements=8/10 branches=1/2 declarations=1/2>\n' +
				'uncovered functions: uncoveredFn(L10)\n' +
				'uncovered branches: L42(else)\n' +
				'uncovered lines: 30-32\n' +
				'</coverage>\n',
			);
		});
	});

	suite('mergeLineRanges', () => {
		test('returns empty for empty input', () => {
			assert.strictEqual(mergeLineRanges([]), '');
		});

		test('single range', () => {
			assert.strictEqual(mergeLineRanges([[5, 10]]), '5-10');
		});

		test('single line', () => {
			assert.strictEqual(mergeLineRanges([[5, 5]]), '5');
		});

		test('merges contiguous ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 3], [4, 6]]), '1-6');
		});

		test('keeps non-contiguous ranges separate', () => {
			assert.strictEqual(mergeLineRanges([[1, 3], [10, 12]]), '1-3, 10-12');
		});

		test('merges overlapping ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 5], [3, 8]]), '1-8');
		});

		test('merges adjacent single-line ranges', () => {
			assert.strictEqual(mergeLineRanges([[5, 5], [6, 6], [10, 10]]), '5-6, 10');
		});

		test('handles unsorted input', () => {
			assert.strictEqual(mergeLineRanges([[10, 12], [1, 3], [4, 6]]), '1-6, 10-12');
		});

		test('handles complex mixed ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 1], [3, 5], [2, 2], [7, 9], [10, 10]]), '1-5, 7-10');
		});
	});

	suite('getFailureDetails', () => {
		test('formats expected/actual outputs', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'suite', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'Assertion failed',
					expected: 'hello',
					actual: 'world',
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<expectedOutput>\nhello\n</expectedOutput>'));
			assert.ok(output.includes('<actualOutput>\nworld\n</actualOutput>'));
		});

		test('formats plain message when no expected/actual', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'Something went wrong',
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<message>\nSomething went wrong\n</message>'));
		});

		test('includes test name and path', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'suite1', 'suite2', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{ type: TestMessageType.Error, message: 'fail' }],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('name="myTest"'));
			assert.ok(output.includes('path="suite1 > suite2"'));
		});

		test('includes stack trace frames', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'fail',
					stackTrace: [
						{ uri: URI.file('/src/test.ts'), position: { lineNumber: 10, column: 5 }, label: 'testFn' },
						{ uri: URI.file('/src/helper.ts'), position: undefined, label: 'helperFn' },
						{ uri: undefined, position: undefined, label: 'anonymous' },
					],
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('path="/src/test.ts" line="10" col="5"'));
			assert.ok(output.includes('path="/src/helper.ts">helperFn</stackFrame>'));
			assert.ok(output.includes('>anonymous</stackFrame>'));
		});

		test('includes location information', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'fail',
					location: { uri: URI.file('/src/test.ts'), range: new Range(42, 8, 42, 20) },
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('path="/src/test.ts" line="42" col="8"'));
		});

		test('skips passing tests', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'pass']).toString(), label: 'pass', state: TestResultState.Passed },
				{ extId: new TestId(['ctrlId', 'fail']).toString(), label: 'fail', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'boom' }] },
			]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(!output.includes('name="pass"'));
			assert.ok(output.includes('name="fail"'));
		});

		test('shows task output when no per-test messages', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
			}]);
			result.appendOutput(VSBuffer.fromString('raw test output'), 't');
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<output>\nraw test output\n</output>'));
		});
	});

	suite('prepareToolInvocation', () => {
		test('shows file names in confirmation', async () => {
			const prepared = await tool.prepareToolInvocation(
				upcastPartial<IToolInvocationPreparationContext>({ parameters: { files: ['/path/to/test1.ts', '/path/to/test2.ts'] }, toolCallId: 'call-1', chatSessionResource: undefined }),
				CancellationToken.None,
			);
			assert.ok(prepared);
			const msg = prepared.confirmationMessages?.message;
			assert.ok(msg);
			const msgStr = typeof msg === 'string' ? msg : msg.value;
			assert.ok(msgStr.includes('test1.ts'));
			assert.ok(msgStr.includes('test2.ts'));
		});

		test('shows all-tests message when no files', async () => {
			const prepared = await tool.prepareToolInvocation(
				upcastPartial<IToolInvocationPreparationContext>({ parameters: {}, toolCallId: 'call-2', chatSessionResource: undefined }),
				CancellationToken.None,
			);
			assert.ok(prepared);
			const msg = prepared.confirmationMessages?.message;
			assert.ok(msg);
			const msgStr = typeof msg === 'string' ? msg : msg.value;
			assert.ok(msgStr.toLowerCase().includes('all tests'));
		});
	});
});
