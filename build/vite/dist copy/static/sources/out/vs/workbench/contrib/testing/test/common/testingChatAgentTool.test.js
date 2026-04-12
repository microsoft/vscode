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
import { FileCoverage, TestCoverage } from '../../common/testCoverage.js';
import { LiveTestResult } from '../../common/testResult.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { TestId } from '../../common/testId.js';
import { RunTestTool, buildTestRunSummary, getCoverageSummary, getOverallCoverageSummary, getFileCoverageDetails, mergeLineRanges, getFailureDetails } from '../../common/testingChatAgentTool.js';
suite('Workbench - RunTestTool', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let insertCounter = 0;
    let tool;
    const noopProgress = {
        report: (_update) => { },
    };
    const noopCountTokens = () => Promise.resolve(0);
    function createLiveTestResult(request) {
        const req = request ?? {
            group: 2 /* TestRunProfileBitset.Run */,
            targets: [{ profileId: 0, controllerId: 'ctrlId', testIds: ['id-a'] }],
        };
        return ds.add(new LiveTestResult(`result-${insertCounter++}`, false, req, insertCounter, NullTelemetryService));
    }
    function createTestCoverage(files) {
        const result = createLiveTestResult();
        const accessor = {
            getCoverageDetails: (id, _testId, _token) => {
                const entry = files.find(f => f.uri.toString() === id);
                return Promise.resolve(entry?.details ?? []);
            },
        };
        const uriIdentity = upcastPartial({
            asCanonicalUri: (uri) => uri,
            extUri: upcastPartial({
                isEqual: (a, b) => a.toString() === b.toString(),
                ignorePathCasing: () => false,
            }),
        });
        const coverage = new TestCoverage(result, 'task-1', uriIdentity, accessor);
        for (const f of files) {
            const fileCoverage = {
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
    function makeStatement(line, count, endLine, branches) {
        return {
            type: 1 /* DetailType.Statement */,
            count,
            location: new Range(line, 1, endLine ?? line, 1),
            branches,
        };
    }
    function makeDeclaration(name, line, count) {
        return {
            type: 0 /* DetailType.Declaration */,
            name,
            count,
            location: new Range(line, 1, line, 1),
        };
    }
    function makeBranch(line, count, label) {
        return {
            count,
            label,
            location: new Range(line, 1, line, 1),
        };
    }
    function createResultWithCoverage(coverageData) {
        const result = createLiveTestResult();
        result.addTask({ id: 'task-1', name: 'Test Task', running: true, ctrlId: 'ctrlId' });
        const taskCov = result.tasks[0].coverage;
        taskCov.set(coverageData, undefined);
        return result;
    }
    function createResultWithTests(tests) {
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
                        type: msg.type,
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
    function createFileCov(uri, statement, details, opts) {
        const result = createLiveTestResult();
        const accessor = {
            getCoverageDetails: () => Promise.resolve(details),
        };
        return new FileCoverage({ id: 'file-1', uri, statement, branch: opts?.branch, declaration: opts?.declaration }, result, accessor);
    }
    setup(() => {
        insertCounter = 0;
        const mockTestService = upcastPartial({
            collection: upcastPartial({
                rootItems: [],
                rootIds: [],
                expand: () => Promise.resolve(),
                getNodeById: () => undefined,
                getNodeByUrl: () => [],
            }),
            runTests: () => Promise.resolve(upcastPartial({})),
            cancelTestRun: () => { },
        });
        const mockResultService = upcastPartial({
            onResultsChanged: Event.None,
        });
        const mockProfileService = upcastPartial({
            capabilitiesForTest: () => 2 /* TestRunProfileBitset.Run */ | 8 /* TestRunProfileBitset.Coverage */,
        });
        const mockUriIdentity = upcastPartial({
            asCanonicalUri: (uri) => uri,
            extUri: upcastPartial({ isEqual: (a, b) => a.toString() === b.toString() }),
        });
        const mockWorkspaceContext = upcastPartial({
            getWorkspace: () => upcastPartial({ id: 'test', folders: [upcastPartial({ uri: URI.file('/workspace') })] }),
        });
        tool = new RunTestTool(mockTestService, mockUriIdentity, mockWorkspaceContext, mockResultService, mockProfileService);
    });
    suite('invoke', () => {
        test('returns error when no tests found', async () => {
            const result = await tool.invoke(upcastPartial({ parameters: { files: ['/nonexistent/test.ts'] } }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(result.toolResultError);
            assert.ok(result.content[0].kind === 'text' && result.content[0].value.includes('No tests found'));
        });
    });
    suite('_buildSummary', () => {
        test('includes pass/fail counts', async () => {
            const result = createResultWithTests([
                { extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: 3 /* TestResultState.Passed */ },
                { extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: 4 /* TestResultState.Failed */, messages: [{ type: 0 /* TestMessageType.Error */, message: 'boom' }] },
            ]);
            result.markComplete();
            const summary = await buildTestRunSummary(result, 'run', undefined);
            assert.ok(summary.includes('<summary passed=1 failed=1 />'));
        });
        test('combines errored and failed in failure count', async () => {
            const result = createResultWithTests([
                { extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: 4 /* TestResultState.Failed */, messages: [{ type: 0 /* TestMessageType.Error */, message: 'fail' }] },
                { extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: 6 /* TestResultState.Errored */, messages: [{ type: 0 /* TestMessageType.Error */, message: 'error' }] },
                { extId: new TestId(['ctrlId', 'c']).toString(), label: 'c', state: 3 /* TestResultState.Passed */ },
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
            const fileA = URI.file('/src/a.ts');
            const fileB = URI.file('/src/b.ts');
            const coverageData = createTestCoverage([
                { uri: fileA, statement: { covered: 5, total: 10 } },
                { uri: fileB, statement: { covered: 10, total: 10 } },
            ]);
            const result = createResultWithCoverage(coverageData);
            const summary = await getCoverageSummary(result, undefined);
            assert.ok(summary.includes('<coverageSummary>'));
            assert.ok(summary.includes(fileA.fsPath));
            assert.ok(!summary.includes(fileB.fsPath)); // 100% covered, excluded
        });
        test('returns detailed summary for specified coverageFiles', async () => {
            const fileA = URI.file('/src/a.ts');
            const details = [
                makeDeclaration('uncoveredFn', 10, 0),
                makeStatement(20, 0, 25),
            ];
            const coverageData = createTestCoverage([
                { uri: fileA, statement: { covered: 8, total: 10 }, declaration: { covered: 0, total: 1 }, details },
            ]);
            const result = createResultWithCoverage(coverageData);
            const summary = await getCoverageSummary(result, [fileA.fsPath]);
            assert.ok(summary.includes(`<coverage path="${fileA.fsPath}"`));
            assert.ok(summary.includes('uncovered functions:'));
            assert.ok(summary.includes('uncoveredFn(L10)'));
            assert.ok(summary.includes('uncovered lines:'));
        });
        test('returns empty string when no coverage data exists', async () => {
            const fileA = URI.file('/src/a.ts');
            const result = createLiveTestResult();
            result.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });
            const summary = await getCoverageSummary(result, [fileA.fsPath]);
            assert.strictEqual(summary, '');
        });
        test('handles multiple coverageFiles', async () => {
            const fileA = URI.file('/src/a.ts');
            const fileB = URI.file('/src/b.ts');
            const coverageData = createTestCoverage([
                { uri: fileA, statement: { covered: 8, total: 10 }, details: [makeStatement(5, 0)] },
                { uri: fileB, statement: { covered: 3, total: 10 }, details: [makeDeclaration('fn', 1, 0)] },
            ]);
            const result = createResultWithCoverage(coverageData);
            const summary = await getCoverageSummary(result, [fileA.fsPath, fileB.fsPath]);
            assert.ok(summary.includes(fileA.fsPath));
            assert.ok(summary.includes(fileB.fsPath));
        });
        test('skips non-matching coverageFiles gracefully', async () => {
            const fileA = URI.file('/src/a.ts');
            const nonExistent = URI.file('/src/nonexistent.ts');
            const coverageData = createTestCoverage([
                { uri: fileA, statement: { covered: 8, total: 10 } },
            ]);
            const result = createResultWithCoverage(coverageData);
            const summary = await getCoverageSummary(result, [nonExistent.fsPath]);
            assert.strictEqual(summary, '');
        });
    });
    suite('getOverallCoverageSummary', () => {
        test('returns all-covered message when everything is 100%', () => {
            const coverage = createTestCoverage([
                { uri: URI.file('/src/a.ts'), statement: { covered: 10, total: 10 } },
                { uri: URI.file('/src/b.ts'), statement: { covered: 5, total: 5 } },
            ]);
            assert.strictEqual(getOverallCoverageSummary(coverage), '<coverageSummary>All files have 100% coverage.</coverageSummary>\n');
        });
        test('sorts files by coverage ascending', () => {
            const high = URI.file('/src/high.ts');
            const low = URI.file('/src/low.ts');
            const mid = URI.file('/src/mid.ts');
            const coverage = createTestCoverage([
                { uri: high, statement: { covered: 9, total: 10 } },
                { uri: low, statement: { covered: 3, total: 10 } },
                { uri: mid, statement: { covered: 7, total: 10 } },
            ]);
            const summary = getOverallCoverageSummary(coverage);
            const lowIdx = summary.indexOf(low.fsPath);
            const midIdx = summary.indexOf(mid.fsPath);
            const highIdx = summary.indexOf(high.fsPath);
            assert.ok(lowIdx < midIdx && midIdx < highIdx);
        });
        test('excludes 100% files from listing', () => {
            const partial = URI.file('/src/partial.ts');
            const full = URI.file('/src/full.ts');
            const coverage = createTestCoverage([
                { uri: partial, statement: { covered: 5, total: 10 } },
                { uri: full, statement: { covered: 10, total: 10 } },
            ]);
            const summary = getOverallCoverageSummary(coverage);
            assert.ok(summary.includes(partial.fsPath));
            assert.ok(!summary.includes(full.fsPath));
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
            const uri = URI.file('/src/foo.ts');
            const file = createFileCov(uri, { covered: 8, total: 10 }, []);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('statements=8/10'));
            assert.ok(output.includes('percent=80.0'));
            assert.ok(output.startsWith(`<coverage path="${uri.fsPath}"`));
            assert.ok(output.endsWith('</coverage>\n'));
        });
        test('includes branch counts when available', async () => {
            const uri = URI.file('/src/foo.ts');
            const file = createFileCov(uri, { covered: 8, total: 10 }, [], { branch: { covered: 3, total: 5 } });
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('branches=3/5'));
        });
        test('includes declaration counts when available', async () => {
            const uri = URI.file('/src/foo.ts');
            const file = createFileCov(uri, { covered: 8, total: 10 }, [], { declaration: { covered: 2, total: 4 } });
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('declarations=2/4'));
        });
        test('omits branch/declaration when not available', async () => {
            const uri = URI.file('/src/foo.ts');
            const file = createFileCov(uri, { covered: 8, total: 10 }, []);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(!output.includes('branches='));
            assert.ok(!output.includes('declarations='));
        });
        test('lists uncovered declarations', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeDeclaration('handleError', 89, 0),
                makeDeclaration('processQueue', 120, 0),
                makeDeclaration('coveredFn', 50, 3),
            ];
            const file = createFileCov(uri, { covered: 8, total: 10 }, details, { declaration: { covered: 1, total: 3 } });
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('uncovered functions: handleError(L89), processQueue(L120)'));
            assert.ok(!output.includes('coveredFn'));
        });
        test('lists uncovered branches with labels', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeStatement(34, 5, undefined, [
                    makeBranch(34, 5, 'then'),
                    makeBranch(36, 0, 'else'),
                ]),
                makeStatement(56, 2, undefined, [
                    makeBranch(56, 0, 'case "foo"'),
                    makeBranch(58, 2, 'case "bar"'),
                ]),
            ];
            const file = createFileCov(uri, { covered: 8, total: 10 }, details, { branch: { covered: 2, total: 4 } });
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('uncovered branches: L36(else), L56(case "foo")'));
        });
        test('lists uncovered branches without labels', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeStatement(10, 1, undefined, [makeBranch(10, 0)]),
            ];
            const file = createFileCov(uri, { covered: 8, total: 10 }, details);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('uncovered branches: L10\n'));
        });
        test('uses parent statement location when branch has no location', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeStatement(42, 1, undefined, [{ count: 0, label: 'else' }]),
            ];
            const file = createFileCov(uri, { covered: 8, total: 10 }, details);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('L42(else)'));
        });
        test('lists merged uncovered line ranges', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeStatement(23, 0, 27),
                makeStatement(28, 0, 30),
                makeStatement(45, 0),
                makeStatement(67, 0, 72),
                makeStatement(100, 0, 105),
                makeStatement(50, 5), // covered
            ];
            const file = createFileCov(uri, { covered: 5, total: 11 }, details);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes('uncovered lines: 23-30, 45, 67-72, 100-105'));
        });
        test('omits uncovered sections when all covered', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeDeclaration('fn', 10, 3),
                makeStatement(20, 5),
                makeStatement(30, 1, undefined, [makeBranch(30, 1, 'then'), makeBranch(32, 2, 'else')]),
            ];
            const file = createFileCov(uri, { covered: 10, total: 10 }, details);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(!output.includes('uncovered'));
        });
        test('handles details() throwing gracefully', async () => {
            const uri = URI.file('/src/err.ts');
            const result = createLiveTestResult();
            const accessor = {
                getCoverageDetails: () => Promise.reject(new Error('not available')),
            };
            const file = new FileCoverage({ id: 'err', uri, statement: { covered: 5, total: 10 } }, result, accessor);
            const output = await getFileCoverageDetails(file, uri.fsPath);
            assert.ok(output.includes(`<coverage path="${uri.fsPath}"`));
            assert.ok(output.includes('</coverage>'));
            assert.ok(!output.includes('uncovered'));
        });
        test('full output snapshot', async () => {
            const uri = URI.file('/src/foo.ts');
            const details = [
                makeDeclaration('uncoveredFn', 10, 0),
                makeDeclaration('coveredFn', 20, 3),
                makeStatement(30, 0, 32),
                makeStatement(40, 5, undefined, [
                    makeBranch(40, 5, 'then'),
                    makeBranch(42, 0, 'else'),
                ]),
                makeStatement(50, 3),
            ];
            const file = createFileCov(uri, { covered: 8, total: 10 }, details, { branch: { covered: 1, total: 2 }, declaration: { covered: 1, total: 2 } });
            assert.deepStrictEqual(await getFileCoverageDetails(file, uri.fsPath), `<coverage path="${uri.fsPath}" percent=71.4 statements=8/10 branches=1/2 declarations=1/2>\n` +
                'uncovered functions: uncoveredFn(L10)\n' +
                'uncovered branches: L42(else)\n' +
                'uncovered lines: 30-32\n' +
                '</coverage>\n');
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
                    state: 4 /* TestResultState.Failed */,
                    messages: [{
                            type: 0 /* TestMessageType.Error */,
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
                    state: 4 /* TestResultState.Failed */,
                    messages: [{
                            type: 0 /* TestMessageType.Error */,
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
                    state: 4 /* TestResultState.Failed */,
                    messages: [{ type: 0 /* TestMessageType.Error */, message: 'fail' }],
                }]);
            result.markComplete();
            const output = await getFailureDetails(result);
            assert.ok(output.includes('name="myTest"'));
            assert.ok(output.includes('path="suite1 > suite2"'));
        });
        test('includes stack trace frames', async () => {
            const testUri = URI.file('/src/test.ts');
            const helperUri = URI.file('/src/helper.ts');
            const result = createResultWithTests([{
                    extId: new TestId(['ctrlId', 'myTest']).toString(),
                    label: 'myTest',
                    state: 4 /* TestResultState.Failed */,
                    messages: [{
                            type: 0 /* TestMessageType.Error */,
                            message: 'fail',
                            stackTrace: [
                                { uri: testUri, position: { lineNumber: 10, column: 5 }, label: 'testFn' },
                                { uri: helperUri, position: undefined, label: 'helperFn' },
                                { uri: undefined, position: undefined, label: 'anonymous' },
                            ],
                        }],
                }]);
            result.markComplete();
            const output = await getFailureDetails(result);
            assert.ok(output.includes(`path="${testUri.fsPath}" line="10" col="5"`));
            assert.ok(output.includes(`path="${helperUri.fsPath}">helperFn</stackFrame>`));
            assert.ok(output.includes('>anonymous</stackFrame>'));
        });
        test('includes location information', async () => {
            const testUri = URI.file('/src/test.ts');
            const result = createResultWithTests([{
                    extId: new TestId(['ctrlId', 'myTest']).toString(),
                    label: 'myTest',
                    state: 4 /* TestResultState.Failed */,
                    messages: [{
                            type: 0 /* TestMessageType.Error */,
                            message: 'fail',
                            location: { uri: testUri, range: new Range(42, 8, 42, 20) },
                        }],
                }]);
            result.markComplete();
            const output = await getFailureDetails(result);
            assert.ok(output.includes(`path="${testUri.fsPath}" line="42" col="8"`));
        });
        test('skips passing tests', async () => {
            const result = createResultWithTests([
                { extId: new TestId(['ctrlId', 'pass']).toString(), label: 'pass', state: 3 /* TestResultState.Passed */ },
                { extId: new TestId(['ctrlId', 'fail']).toString(), label: 'fail', state: 4 /* TestResultState.Failed */, messages: [{ type: 0 /* TestMessageType.Error */, message: 'boom' }] },
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
                    state: 4 /* TestResultState.Failed */,
                }]);
            result.appendOutput(VSBuffer.fromString('raw test output'), 't');
            result.markComplete();
            const output = await getFailureDetails(result);
            assert.ok(output.includes('<output>\nraw test output\n</output>'));
        });
    });
    suite('prepareToolInvocation', () => {
        test('shows file names in confirmation', async () => {
            const prepared = await tool.prepareToolInvocation(upcastPartial({ parameters: { files: ['/path/to/test1.ts', '/path/to/test2.ts'] }, toolCallId: 'call-1', chatSessionResource: undefined }), CancellationToken.None);
            assert.ok(prepared);
            const msg = prepared.confirmationMessages?.message;
            assert.ok(msg);
            const msgStr = typeof msg === 'string' ? msg : msg.value;
            assert.ok(msgStr.includes('test1.ts'));
            assert.ok(msgStr.includes('test2.ts'));
        });
        test('shows all-tests message when no files', async () => {
            const prepared = await tool.prepareToolInvocation(upcastPartial({ parameters: {}, toolCallId: 'call-2', chatSessionResource: undefined }), CancellationToken.None);
            assert.ok(prepared);
            const msg = prepared.confirmationMessages?.message;
            assert.ok(msg);
            const msgStr = typeof msg === 'string' ? msg : msg.value;
            assert.ok(msgStr.toLowerCase().includes('all tests'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0NoYXRBZ2VudFRvb2wudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvdGVzdC9jb21tb24vdGVzdGluZ0NoYXRBZ2VudFRvb2wudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUtsRyxPQUFPLEVBQUUsWUFBWSxFQUFxQixZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFNNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNoRCxPQUFPLEVBQUUsV0FBVyxFQUFFLG1CQUFtQixFQUFFLGtCQUFrQixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxD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