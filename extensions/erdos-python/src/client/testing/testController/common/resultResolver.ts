// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    TestController,
    TestItem,
    Uri,
    TestMessage,
    Location,
    TestRun,
    MarkdownString,
    TestCoverageCount,
    FileCoverage,
    FileCoverageDetail,
    StatementCoverage,
    Range,
} from 'vscode';
import * as util from 'util';
import {
    CoveragePayload,
    DiscoveredTestPayload,
    ExecutionTestPayload,
    FileCoverageMetrics,
    ITestResultResolver,
} from './types';
import { TestProvider } from '../../types';
import { traceError, traceVerbose } from '../../../logging';
import { Testing } from '../../../common/utils/localize';
import { clearAllChildren, createErrorTestItem, getTestCaseNodes } from './testItemUtilities';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { splitLines } from '../../../common/stringUtils';
import { buildErrorNodeOptions, populateTestTree, splitTestNameWithRegex } from './utils';

export class PythonResultResolver implements ITestResultResolver {
    testController: TestController;

    testProvider: TestProvider;

    public runIdToTestItem: Map<string, TestItem>;

    public runIdToVSid: Map<string, string>;

    public vsIdToRunId: Map<string, string>;

    public subTestStats: Map<string, { passed: number; failed: number }> = new Map();

    public detailedCoverageMap = new Map<string, FileCoverageDetail[]>();

    constructor(testController: TestController, testProvider: TestProvider, private workspaceUri: Uri) {
        this.testController = testController;
        this.testProvider = testProvider;

        this.runIdToTestItem = new Map<string, TestItem>();
        this.runIdToVSid = new Map<string, string>();
        this.vsIdToRunId = new Map<string, string>();
    }

    public resolveDiscovery(payload: DiscoveredTestPayload, token?: CancellationToken): void {
        if (!payload) {
            // No test data is available
        } else {
            this._resolveDiscovery(payload as DiscoveredTestPayload, token);
        }
    }

    public _resolveDiscovery(payload: DiscoveredTestPayload, token?: CancellationToken): void {
        const workspacePath = this.workspaceUri.fsPath;
        const rawTestData = payload as DiscoveredTestPayload;
        // Check if there were any errors in the discovery process.
        if (rawTestData.status === 'error') {
            const testingErrorConst =
                this.testProvider === 'pytest' ? Testing.errorPytestDiscovery : Testing.errorUnittestDiscovery;
            const { error } = rawTestData;
            traceError(testingErrorConst, 'for workspace: ', workspacePath, '\r\n', error?.join('\r\n\r\n') ?? '');

            let errorNode = this.testController.items.get(`DiscoveryError:${workspacePath}`);
            const message = util.format(
                `${testingErrorConst} ${Testing.seePythonOutput}\r\n`,
                error?.join('\r\n\r\n') ?? '',
            );

            if (errorNode === undefined) {
                const options = buildErrorNodeOptions(this.workspaceUri, message, this.testProvider);
                errorNode = createErrorTestItem(this.testController, options);
                this.testController.items.add(errorNode);
            }
            const errorNodeLabel: MarkdownString = new MarkdownString(
                `[Show output](command:python.viewOutput) to view error logs`,
            );
            errorNodeLabel.isTrusted = true;
            errorNode.error = errorNodeLabel;
        } else {
            // remove error node only if no errors exist.
            this.testController.items.delete(`DiscoveryError:${workspacePath}`);
        }
        if (rawTestData.tests || rawTestData.tests === null) {
            // if any tests exist, they should be populated in the test tree, regardless of whether there were errors or not.
            // parse and insert test data.

            // If the test root for this folder exists: Workspace refresh, update its children.
            // Otherwise, it is a freshly discovered workspace, and we need to create a new test root and populate the test tree.
            populateTestTree(this.testController, rawTestData.tests, undefined, this, token);
        }

        sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_DONE, undefined, {
            tool: this.testProvider,
            failed: false,
        });
    }

    public resolveExecution(payload: ExecutionTestPayload | CoveragePayload, runInstance: TestRun): void {
        if ('coverage' in payload) {
            // coverage data is sent once per connection
            traceVerbose('Coverage data received.');
            this._resolveCoverage(payload as CoveragePayload, runInstance);
        } else {
            this._resolveExecution(payload as ExecutionTestPayload, runInstance);
        }
    }

    public _resolveCoverage(payload: CoveragePayload, runInstance: TestRun): void {
        if (payload.result === undefined) {
            return;
        }
        for (const [key, value] of Object.entries(payload.result)) {
            const fileNameStr = key;
            const fileCoverageMetrics: FileCoverageMetrics = value;
            const linesCovered = fileCoverageMetrics.lines_covered ? fileCoverageMetrics.lines_covered : []; // undefined if no lines covered
            const linesMissed = fileCoverageMetrics.lines_missed ? fileCoverageMetrics.lines_missed : []; // undefined if no lines missed
            const executedBranches = fileCoverageMetrics.executed_branches;
            const totalBranches = fileCoverageMetrics.total_branches;

            const lineCoverageCount = new TestCoverageCount(
                linesCovered.length,
                linesCovered.length + linesMissed.length,
            );
            let fileCoverage: FileCoverage;
            const uri = Uri.file(fileNameStr);
            if (totalBranches === -1) {
                // branch coverage was not enabled and should not be displayed
                fileCoverage = new FileCoverage(uri, lineCoverageCount);
            } else {
                const branchCoverageCount = new TestCoverageCount(executedBranches, totalBranches);
                fileCoverage = new FileCoverage(uri, lineCoverageCount, branchCoverageCount);
            }
            runInstance.addCoverage(fileCoverage);

            // create detailed coverage array for each file (only line coverage on detailed, not branch)
            const detailedCoverageArray: FileCoverageDetail[] = [];
            // go through all covered lines, create new StatementCoverage, and add to detailedCoverageArray
            for (const line of linesCovered) {
                // line is 1-indexed, so we need to subtract 1 to get the 0-indexed line number
                // true value means line is covered
                const statementCoverage = new StatementCoverage(
                    true,
                    new Range(line - 1, 0, line - 1, Number.MAX_SAFE_INTEGER),
                );
                detailedCoverageArray.push(statementCoverage);
            }
            for (const line of linesMissed) {
                // line is 1-indexed, so we need to subtract 1 to get the 0-indexed line number
                // false value means line is NOT covered
                const statementCoverage = new StatementCoverage(
                    false,
                    new Range(line - 1, 0, line - 1, Number.MAX_SAFE_INTEGER),
                );
                detailedCoverageArray.push(statementCoverage);
            }

            this.detailedCoverageMap.set(uri.fsPath, detailedCoverageArray);
        }
    }

    public _resolveExecution(payload: ExecutionTestPayload, runInstance: TestRun): void {
        const rawTestExecData = payload as ExecutionTestPayload;
        if (rawTestExecData !== undefined && rawTestExecData.result !== undefined) {
            // Map which holds the subtest information for each test item.

            // iterate through payload and update the UI accordingly.
            for (const keyTemp of Object.keys(rawTestExecData.result)) {
                const testCases: TestItem[] = [];

                // grab leaf level test items
                this.testController.items.forEach((i) => {
                    const tempArr: TestItem[] = getTestCaseNodes(i);
                    testCases.push(...tempArr);
                });
                const testItem = rawTestExecData.result[keyTemp];

                if (testItem.outcome === 'error') {
                    const rawTraceback = testItem.traceback ?? '';
                    const traceback = splitLines(rawTraceback, {
                        trim: false,
                        removeEmptyEntries: true,
                    }).join('\r\n');
                    const text = `${testItem.test} failed with error: ${
                        testItem.message ?? testItem.outcome
                    }\r\n${traceback}`;
                    const message = new TestMessage(text);

                    const grabVSid = this.runIdToVSid.get(keyTemp);
                    // search through freshly built array of testItem to find the failed test and update UI.
                    testCases.forEach((indiItem) => {
                        if (indiItem.id === grabVSid) {
                            if (indiItem.uri) {
                                if (indiItem.range) {
                                    message.location = new Location(indiItem.uri, indiItem.range);
                                }
                                runInstance.errored(indiItem, message);
                            }
                        }
                    });
                } else if (testItem.outcome === 'failure' || testItem.outcome === 'passed-unexpected') {
                    const rawTraceback = testItem.traceback ?? '';
                    const traceback = splitLines(rawTraceback, {
                        trim: false,
                        removeEmptyEntries: true,
                    }).join('\r\n');

                    const text = `${testItem.test} failed: ${testItem.message ?? testItem.outcome}\r\n${traceback}`;
                    const message = new TestMessage(text);

                    // note that keyTemp is a runId for unittest library...
                    const grabVSid = this.runIdToVSid.get(keyTemp);
                    // search through freshly built array of testItem to find the failed test and update UI.
                    testCases.forEach((indiItem) => {
                        if (indiItem.id === grabVSid) {
                            if (indiItem.uri) {
                                if (indiItem.range) {
                                    message.location = new Location(indiItem.uri, indiItem.range);
                                }
                                runInstance.failed(indiItem, message);
                            }
                        }
                    });
                } else if (testItem.outcome === 'success' || testItem.outcome === 'expected-failure') {
                    const grabTestItem = this.runIdToTestItem.get(keyTemp);
                    const grabVSid = this.runIdToVSid.get(keyTemp);
                    if (grabTestItem !== undefined) {
                        testCases.forEach((indiItem) => {
                            if (indiItem.id === grabVSid) {
                                if (indiItem.uri) {
                                    runInstance.passed(grabTestItem);
                                }
                            }
                        });
                    }
                } else if (testItem.outcome === 'skipped') {
                    const grabTestItem = this.runIdToTestItem.get(keyTemp);
                    const grabVSid = this.runIdToVSid.get(keyTemp);
                    if (grabTestItem !== undefined) {
                        testCases.forEach((indiItem) => {
                            if (indiItem.id === grabVSid) {
                                if (indiItem.uri) {
                                    runInstance.skipped(grabTestItem);
                                }
                            }
                        });
                    }
                } else if (testItem.outcome === 'subtest-failure') {
                    // split on [] or () based on how the subtest is setup.
                    const [parentTestCaseId, subtestId] = splitTestNameWithRegex(keyTemp);
                    const parentTestItem = this.runIdToTestItem.get(parentTestCaseId);
                    const data = testItem;
                    // find the subtest's parent test item
                    if (parentTestItem) {
                        const subtestStats = this.subTestStats.get(parentTestCaseId);
                        if (subtestStats) {
                            subtestStats.failed += 1;
                        } else {
                            this.subTestStats.set(parentTestCaseId, {
                                failed: 1,
                                passed: 0,
                            });
                            // clear since subtest items don't persist between runs
                            clearAllChildren(parentTestItem);
                        }
                        const subTestItem = this.testController?.createTestItem(
                            subtestId,
                            subtestId,
                            parentTestItem.uri,
                        );
                        // create a new test item for the subtest
                        if (subTestItem) {
                            const traceback = data.traceback ?? '';
                            const text = `${data.subtest} failed: ${
                                testItem.message ?? testItem.outcome
                            }\r\n${traceback}`;
                            parentTestItem.children.add(subTestItem);
                            runInstance.started(subTestItem);
                            const message = new TestMessage(text);
                            if (parentTestItem.uri && parentTestItem.range) {
                                message.location = new Location(parentTestItem.uri, parentTestItem.range);
                            }
                            runInstance.failed(subTestItem, message);
                        } else {
                            throw new Error('Unable to create new child node for subtest');
                        }
                    } else {
                        throw new Error('Parent test item not found');
                    }
                } else if (testItem.outcome === 'subtest-success') {
                    // split on [] or () based on how the subtest is setup.
                    const [parentTestCaseId, subtestId] = splitTestNameWithRegex(keyTemp);
                    const parentTestItem = this.runIdToTestItem.get(parentTestCaseId);

                    // find the subtest's parent test item
                    if (parentTestItem) {
                        const subtestStats = this.subTestStats.get(parentTestCaseId);
                        if (subtestStats) {
                            subtestStats.passed += 1;
                        } else {
                            this.subTestStats.set(parentTestCaseId, { failed: 0, passed: 1 });
                            // clear since subtest items don't persist between runs
                            clearAllChildren(parentTestItem);
                        }
                        const subTestItem = this.testController?.createTestItem(
                            subtestId,
                            subtestId,
                            parentTestItem.uri,
                        );
                        // create a new test item for the subtest
                        if (subTestItem) {
                            parentTestItem.children.add(subTestItem);
                            runInstance.started(subTestItem);
                            runInstance.passed(subTestItem);
                        } else {
                            throw new Error('Unable to create new child node for subtest');
                        }
                    } else {
                        throw new Error('Parent test item not found');
                    }
                }
            }
        }
    }
}
