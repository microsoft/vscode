/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, isAbsolute } from '../../../../base/common/path.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILanguageModelToolsService, ToolDataSource, } from '../../chat/common/tools/languageModelToolsService.js';
import { TestId } from './testId.js';
import { getTotalCoveragePercent } from './testCoverage.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { collectTestStateCounts, getTestProgressText } from './testingProgressMessages.js';
import { isFailedState } from './testingStates.js';
import { ITestResultService } from './testResultService.js';
import { ITestService, testsInFile, waitForTestToBeIdle } from './testService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { ITestProfileService } from './testProfileService.js';
let TestingChatAgentToolContribution = class TestingChatAgentToolContribution extends Disposable {
    static { this.ID = 'workbench.contrib.testing.chatAgentTool'; }
    constructor(instantiationService, toolsService, contextKeyService) {
        super();
        const runTestsTool = instantiationService.createInstance(RunTestTool);
        this._register(toolsService.registerTool(RunTestTool.DEFINITION, runTestsTool));
        this._register(toolsService.executeToolSet.addTool(RunTestTool.DEFINITION));
        // todo@connor4312: temporary for 1.103 release during changeover
        contextKeyService.createKey('chat.coreTestFailureToolEnabled', true).set(true);
    }
};
TestingChatAgentToolContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILanguageModelToolsService),
    __param(2, IContextKeyService)
], TestingChatAgentToolContribution);
export { TestingChatAgentToolContribution };
let RunTestTool = class RunTestTool {
    static { this.ID = 'runTests'; }
    static { this.DEFINITION = {
        id: this.ID,
        toolReferenceName: 'runTests',
        legacyToolReferenceFullNames: ['runTests'],
        when: TestingContextKeys.hasRunnableTests,
        displayName: 'Run tests',
        modelDescription: 'Runs unit tests in files. Use this tool if the user asks to run tests or when you want to validate changes using unit tests, and prefer using this tool instead of the terminal tool. When possible, always try to provide `files` paths containing the relevant unit tests in order to avoid unnecessarily long test runs. This tool outputs detailed information about the results of the test run. Set mode="coverage" to also collect coverage and optionally provide coverageFiles for focused reporting.',
        icon: Codicon.beaker,
        inputSchema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Absolute paths to the test files to run. If not provided, all test files will be run.',
                },
                testNames: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'An array of test names to run. Depending on the context, test names defined in code may be strings or the names of functions or classes containing the test cases. If not provided, all tests in the files will be run.',
                },
                mode: {
                    type: 'string',
                    enum: ['run', 'coverage'],
                    description: 'Execution mode: "run" (default) runs tests normally, "coverage" collects coverage.',
                },
                coverageFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'When mode="coverage": absolute file paths to include detailed coverage info for. If not provided, a file-level summary of all files with incomplete coverage is shown.'
                }
            },
        },
        userDescription: localize('runTestTool.userDescription', 'Run unit tests (optionally with coverage)'),
        source: ToolDataSource.Internal,
        tags: [
            'vscode_editing_with_tests',
            'enable_other_tool_copilot_readFile',
            'enable_other_tool_copilot_listDirectory',
            'enable_other_tool_copilot_findFiles',
            'enable_other_tool_copilot_runTests',
            'enable_other_tool_copilot_runTestsWithCoverage',
            'enable_other_tool_copilot_testFailure',
        ],
    }; }
    constructor(_testService, _uriIdentityService, _workspaceContextService, _testResultService, _testProfileService) {
        this._testService = _testService;
        this._uriIdentityService = _uriIdentityService;
        this._workspaceContextService = _workspaceContextService;
        this._testResultService = _testResultService;
        this._testProfileService = _testProfileService;
    }
    async invoke(invocation, countTokens, progress, token) {
        const params = invocation.parameters;
        const mode = (params.mode === 'coverage' ? 'coverage' : 'run');
        let group = (mode === 'coverage' ? 8 /* TestRunProfileBitset.Coverage */ : 2 /* TestRunProfileBitset.Run */);
        const coverageFiles = (mode === 'coverage' ? (params.coverageFiles && params.coverageFiles.length ? params.coverageFiles : undefined) : undefined);
        const testFiles = await this._getFileTestsToRun(params, progress);
        const testCases = await this._getTestCasesToRun(params, testFiles, progress);
        if (!testCases.length) {
            return {
                content: [{ kind: 'text', value: 'No tests found in the files. Ensure the correct absolute paths are passed to the tool.' }],
                toolResultError: localize('runTestTool.noTests', 'No tests found in the files'),
            };
        }
        progress.report({ message: localize('runTestTool.invoke.progress', 'Starting test run...') });
        // If the model asks for coverage but the test provider doesn't support it, use normal 'run' mode
        if (group === 8 /* TestRunProfileBitset.Coverage */) {
            if (!testCases.some(tc => this._testProfileService.capabilitiesForTest(tc.item) & 8 /* TestRunProfileBitset.Coverage */)) {
                group = 2 /* TestRunProfileBitset.Run */;
            }
        }
        const result = await this._captureTestResult(testCases, group, token);
        if (!result) {
            return {
                content: [{ kind: 'text', value: 'No test run was started. Instruct the user to ensure their test runner is correctly configured' }],
                toolResultError: localize('runTestTool.noRunStarted', 'No test run was started. This may be an issue with your test runner or extension.'),
            };
        }
        await this._monitorRunProgress(result, progress, token);
        if (token.isCancellationRequested) {
            this._testService.cancelTestRun(result.id);
            return {
                content: [{ kind: 'text', value: localize('runTestTool.invoke.cancelled', 'Test run was cancelled.') }],
                toolResultMessage: localize('runTestTool.invoke.cancelled', 'Test run was cancelled.'),
            };
        }
        const summary = await buildTestRunSummary(result, mode, coverageFiles);
        const content = [{ kind: 'text', value: summary }];
        return {
            content: content,
            toolResultMessage: getTestProgressText(collectTestStateCounts(false, [result])),
        };
    }
    /** Updates the UI progress as the test runs, resolving when the run is finished. */
    async _monitorRunProgress(result, progress, token) {
        const store = new DisposableStore();
        const update = () => {
            const counts = collectTestStateCounts(!result.completedAt, [result]);
            const text = getTestProgressText(counts);
            progress.report({ message: text, progress: counts.runSoFar / counts.totalWillBeRun });
        };
        const throttler = store.add(new RunOnceScheduler(update, 500));
        return new Promise(resolve => {
            store.add(result.onChange(() => {
                if (!throttler.isScheduled) {
                    throttler.schedule();
                }
            }));
            store.add(token.onCancellationRequested(() => {
                this._testService.cancelTestRun(result.id);
                resolve();
            }));
            store.add(result.onComplete(() => {
                update();
                resolve();
            }));
        }).finally(() => store.dispose());
    }
    /**
     * Captures the test result. This is a little tricky because some extensions
     * trigger an 'out of bound' test run, so we actually wait for the first
     * test run to come in that contains one or more tasks and treat that as the
     * one we're looking for.
     */
    async _captureTestResult(testCases, group, token) {
        const store = new DisposableStore();
        const onDidTimeout = store.add(new Emitter());
        return new Promise(resolve => {
            store.add(onDidTimeout.event(() => {
                resolve(undefined);
            }));
            store.add(this._testResultService.onResultsChanged(ev => {
                if ('started' in ev) {
                    store.add(ev.started.onNewTask(() => {
                        store.dispose();
                        resolve(ev.started);
                    }));
                }
            }));
            this._testService.runTests({
                group,
                tests: testCases,
                preserveFocus: true,
            }, token).then(() => {
                if (!store.isDisposed) {
                    store.add(disposableTimeout(() => onDidTimeout.fire(), 5_000));
                }
            });
        }).finally(() => store.dispose());
    }
    /** Filters the test files to individual test cases based on the provided parameters. */
    async _getTestCasesToRun(params, tests, progress) {
        if (!params.testNames?.length) {
            return tests;
        }
        progress.report({ message: localize('runTestTool.invoke.filterProgress', 'Filtering tests...') });
        const testNames = params.testNames.map(t => t.toLowerCase().trim());
        const filtered = [];
        const doFilter = async (test) => {
            const name = test.item.label.toLowerCase().trim();
            if (testNames.some(tn => name.includes(tn))) {
                filtered.push(test);
                return;
            }
            if (test.expand === 1 /* TestItemExpandState.Expandable */) {
                await this._testService.collection.expand(test.item.extId, 1);
            }
            await waitForTestToBeIdle(this._testService, test);
            await Promise.all([...test.children].map(async (id) => {
                const item = this._testService.collection.getNodeById(id);
                if (item) {
                    await doFilter(item);
                }
            }));
        };
        await Promise.all(tests.map(doFilter));
        return filtered;
    }
    /** Gets the file tests to run based on the provided parameters. */
    async _getFileTestsToRun(params, progress) {
        if (!params.files?.length) {
            return [...this._testService.collection.rootItems];
        }
        progress.report({ message: localize('runTestTool.invoke.filesProgress', 'Discovering tests...') });
        const firstWorkspaceFolder = this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
        const uris = params.files.map(f => {
            if (isAbsolute(f)) {
                return URI.file(f);
            }
            else if (firstWorkspaceFolder) {
                return URI.joinPath(firstWorkspaceFolder, f);
            }
            else {
                return undefined;
            }
        }).filter(isDefined);
        const tests = [];
        for (const uri of uris) {
            for await (const files of testsInFile(this._testService, this._uriIdentityService, uri, undefined, false)) {
                for (const file of files) {
                    tests.push(file);
                }
            }
        }
        return tests;
    }
    prepareToolInvocation(context, token) {
        const params = context.parameters;
        const title = localize('runTestTool.confirm.title', 'Allow test run?');
        const inFiles = params.files?.map((f) => '`' + basename(f) + '`');
        return Promise.resolve({
            invocationMessage: localize('runTestTool.confirm.invocation', 'Running tests...'),
            confirmationMessages: {
                title,
                message: inFiles?.length
                    ? new MarkdownString().appendMarkdown(localize('runTestTool.confirm.message', 'The model wants to run tests in {0}.', inFiles.join(', ')))
                    : localize('runTestTool.confirm.all', 'The model wants to run all tests.'),
                allowAutoConfirm: true,
            },
        });
    }
};
RunTestTool = __decorate([
    __param(0, ITestService),
    __param(1, IUriIdentityService),
    __param(2, IWorkspaceContextService),
    __param(3, ITestResultService),
    __param(4, ITestProfileService)
], RunTestTool);
export { RunTestTool };
/** Builds the full summary string for a completed test run. */
export async function buildTestRunSummary(result, mode, coverageFiles) {
    const failures = result.counts[6 /* TestResultState.Errored */] + result.counts[4 /* TestResultState.Failed */];
    let str = `<summary passed=${result.counts[3 /* TestResultState.Passed */]} failed=${failures} />\n`;
    if (failures !== 0) {
        str += await getFailureDetails(result);
    }
    if (mode === 'coverage') {
        str += await getCoverageSummary(result, coverageFiles);
    }
    return str;
}
/** Gets a coverage summary from a test result, either overall or per-file. */
export async function getCoverageSummary(result, coverageFiles) {
    let str = '';
    for (const task of result.tasks) {
        const coverage = task.coverage.get();
        if (!coverage) {
            continue;
        }
        if (!coverageFiles || !coverageFiles.length) {
            str += getOverallCoverageSummary(coverage);
            continue;
        }
        const normalized = coverageFiles.map(file => URI.file(file).fsPath);
        const coveredFilesMap = new Map();
        for (const file of coverage.getAllFiles().values()) {
            coveredFilesMap.set(file.uri.fsPath, file);
        }
        for (const path of normalized) {
            const file = coveredFilesMap.get(path);
            if (!file) {
                continue;
            }
            str += await getFileCoverageDetails(file, path);
        }
    }
    return str;
}
/** Gets a file-level coverage overview sorted by lowest coverage first. */
export function getOverallCoverageSummary(coverage) {
    const files = [...coverage.getAllFiles().values()]
        .map(f => ({ path: f.uri.fsPath, pct: getTotalCoveragePercent(f.statement, f.branch, f.declaration) * 100 }))
        .filter(f => f.pct < 100)
        .sort((a, b) => a.pct - b.pct);
    if (!files.length) {
        return '<coverageSummary>All files have 100% coverage.</coverageSummary>\n';
    }
    let str = '<coverageSummary>\n';
    for (const f of files) {
        str += `<file path="${f.path}" percent=${f.pct.toFixed(1)} />\n`;
    }
    str += '</coverageSummary>\n';
    return str;
}
/** Gets detailed coverage information for a single file including uncovered items. */
export async function getFileCoverageDetails(file, path) {
    const pct = getTotalCoveragePercent(file.statement, file.branch, file.declaration) * 100;
    let str = `<coverage path="${path}" percent=${pct.toFixed(1)} statements=${file.statement.covered}/${file.statement.total}`;
    if (file.branch) {
        str += ` branches=${file.branch.covered}/${file.branch.total}`;
    }
    if (file.declaration) {
        str += ` declarations=${file.declaration.covered}/${file.declaration.total}`;
    }
    str += '>\n';
    try {
        const details = await file.details();
        const uncoveredDeclarations = [];
        const uncoveredBranches = [];
        const uncoveredLines = [];
        for (const detail of details) {
            if (detail.type === 0 /* DetailType.Declaration */) {
                if (!detail.count) {
                    const line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
                    uncoveredDeclarations.push({ name: detail.name, line });
                }
            }
            else {
                if (!detail.count) {
                    const startLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
                    const endLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.endLineNumber;
                    uncoveredLines.push([startLine, endLine]);
                }
                if (detail.branches) {
                    for (const branch of detail.branches) {
                        if (!branch.count) {
                            let line;
                            if (branch.location) {
                                line = Position.isIPosition(branch.location) ? branch.location.lineNumber : branch.location.startLineNumber;
                            }
                            else {
                                line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
                            }
                            uncoveredBranches.push({ line, label: branch.label });
                        }
                    }
                }
            }
        }
        if (uncoveredDeclarations.length) {
            str += 'uncovered functions: ' + uncoveredDeclarations.map(d => `${d.name}(L${d.line})`).join(', ') + '\n';
        }
        if (uncoveredBranches.length) {
            str += 'uncovered branches: ' + uncoveredBranches.map(b => b.label ? `L${b.line}(${b.label})` : `L${b.line}`).join(', ') + '\n';
        }
        if (uncoveredLines.length) {
            str += 'uncovered lines: ' + mergeLineRanges(uncoveredLines) + '\n';
        }
    }
    catch { /* ignore - details not available */ }
    str += '</coverage>\n';
    return str;
}
/** Merges overlapping/contiguous line ranges and formats them compactly. */
export function mergeLineRanges(ranges) {
    if (!ranges.length) {
        return '';
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1];
        const [start, end] = ranges[i];
        if (start <= last[1] + 1) {
            last[1] = Math.max(last[1], end);
        }
        else {
            merged.push([start, end]);
        }
    }
    return merged.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(', ');
}
/** Formats failure details from a test result into an XML-like string. */
export async function getFailureDetails(result) {
    let str = '';
    let hadMessages = false;
    for (const failure of result.tests) {
        if (!isFailedState(failure.ownComputedState)) {
            continue;
        }
        const [, ...testPath] = TestId.split(failure.item.extId);
        const testName = testPath.pop();
        str += `<testFailure name=${JSON.stringify(testName)} path=${JSON.stringify(testPath.join(' > '))}>\n`;
        for (const task of failure.tasks) {
            for (const message of task.messages.filter(m => m.type === 0 /* TestMessageType.Error */)) {
                hadMessages = true;
                if (message.expected !== undefined && message.actual !== undefined) {
                    str += `<expectedOutput>\n${message.expected}\n</expectedOutput>\n`;
                    str += `<actualOutput>\n${message.actual}\n</actualOutput>\n`;
                }
                else {
                    const messageText = typeof message.message === 'string' ? message.message : message.message.value;
                    str += `<message>\n${messageText}\n</message>\n`;
                }
                if (message.stackTrace && message.stackTrace.length > 0) {
                    for (const frame of message.stackTrace.slice(0, 10)) {
                        if (frame.uri && frame.position) {
                            str += `<stackFrame path="${frame.uri.fsPath}" line="${frame.position.lineNumber}" col="${frame.position.column}" />\n`;
                        }
                        else if (frame.uri) {
                            str += `<stackFrame path="${frame.uri.fsPath}">${frame.label}</stackFrame>\n`;
                        }
                        else {
                            str += `<stackFrame>${frame.label}</stackFrame>\n`;
                        }
                    }
                }
                if (message.location) {
                    str += `<location path="${message.location.uri.fsPath}" line="${message.location.range.startLineNumber}" col="${message.location.range.startColumn}" />\n`;
                }
            }
        }
        str += `</testFailure>\n`;
    }
    if (!hadMessages) {
        const output = result.tasks.map(t => t.output.getRange(0, t.output.length).toString().trim()).join('\n');
        if (output) {
            str += `<output>\n${output}\n</output>\n`;
        }
    }
    return str;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0NoYXRBZ2VudFRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0aW5nQ2hhdEFnZW50VG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV2RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFNBQVMsRUFBVyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFOUYsT0FBTyxFQUVOLDBCQUEwQixFQU8xQixjQUFjLEdBRWQsTUFBTSxzREFBc0QsQ0FBQztBQUM5RCxPQUFPLEVBQUUsTUFBTSxF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