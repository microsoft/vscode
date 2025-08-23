// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as util from 'util';
import { CancellationToken, TestController, TestItem, TestRun, TestRunProfileKind, Uri } from 'vscode';
import { createDeferred, Deferred } from '../../common/utils/async';
import { Testing } from '../../common/utils/localize';
import { traceError } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { TestProvider } from '../types';
import { createErrorTestItem, getTestCaseNodes } from './common/testItemUtilities';
import { ITestDiscoveryAdapter, ITestExecutionAdapter, ITestResultResolver } from './common/types';
import { IPythonExecutionFactory } from '../../common/process/types';
import { ITestDebugLauncher } from '../common/types';
import { buildErrorNodeOptions } from './common/utils';
import { PythonEnvironment } from '../../pythonEnvironments/info';

/**
 * This class exposes a test-provider-agnostic way of discovering tests.
 *
 * It gets instantiated by the `PythonTestController` class in charge of reflecting test data in the UI,
 * and then instantiates provider-specific adapters under the hood depending on settings.
 *
 * This class formats the JSON test data returned by the `[Unittest|Pytest]TestDiscoveryAdapter` into test UI elements,
 * and uses them to insert/update/remove items in the `TestController` instance behind the testing UI whenever the `PythonTestController` requests a refresh.
 */
export class WorkspaceTestAdapter {
    private discovering: Deferred<void> | undefined;

    private executing: Deferred<void> | undefined;

    constructor(
        private testProvider: TestProvider,
        private discoveryAdapter: ITestDiscoveryAdapter,
        private executionAdapter: ITestExecutionAdapter,
        private workspaceUri: Uri,
        public resultResolver: ITestResultResolver,
    ) {}

    public async executeTests(
        testController: TestController,
        runInstance: TestRun,
        includes: TestItem[],
        token?: CancellationToken,
        profileKind?: boolean | TestRunProfileKind,
        executionFactory?: IPythonExecutionFactory,
        debugLauncher?: ITestDebugLauncher,
        interpreter?: PythonEnvironment,
    ): Promise<void> {
        if (this.executing) {
            traceError('Test execution already in progress, not starting a new one.');
            return this.executing.promise;
        }

        const deferred = createDeferred<void>();
        this.executing = deferred;

        const testCaseNodes: TestItem[] = [];
        const testCaseIdsSet = new Set<string>();
        try {
            // first fetch all the individual test Items that we necessarily want
            includes.forEach((t) => {
                const nodes = getTestCaseNodes(t);
                testCaseNodes.push(...nodes);
            });
            // iterate through testItems nodes and fetch their unittest runID to pass in as argument
            testCaseNodes.forEach((node) => {
                runInstance.started(node); // do the vscode ui test item start here before runtest
                const runId = this.resultResolver.vsIdToRunId.get(node.id);
                if (runId) {
                    testCaseIdsSet.add(runId);
                }
            });
            const testCaseIds = Array.from(testCaseIdsSet);
            // ** execution factory only defined for new rewrite way
            if (executionFactory !== undefined) {
                await this.executionAdapter.runTests(
                    this.workspaceUri,
                    testCaseIds,
                    profileKind,
                    runInstance,
                    executionFactory,
                    debugLauncher,
                    interpreter,
                );
            } else {
                await this.executionAdapter.runTests(this.workspaceUri, testCaseIds, profileKind);
            }
            deferred.resolve();
        } catch (ex) {
            // handle token and telemetry here
            sendTelemetryEvent(EventName.UNITTEST_RUN_ALL_FAILED, undefined);

            let cancel = token?.isCancellationRequested
                ? Testing.cancelUnittestExecution
                : Testing.errorUnittestExecution;
            if (this.testProvider === 'pytest') {
                cancel = token?.isCancellationRequested ? Testing.cancelPytestExecution : Testing.errorPytestExecution;
            }
            traceError(`${cancel}\r\n`, ex);

            // Also report on the test view
            const message = util.format(`${cancel} ${Testing.seePythonOutput}\r\n`, ex);
            const options = buildErrorNodeOptions(this.workspaceUri, message, this.testProvider);
            const errorNode = createErrorTestItem(testController, options);
            testController.items.add(errorNode);

            deferred.reject(ex as Error);
        } finally {
            this.executing = undefined;
        }

        return Promise.resolve();
    }

    public async discoverTests(
        testController: TestController,
        token?: CancellationToken,
        executionFactory?: IPythonExecutionFactory,
        interpreter?: PythonEnvironment,
    ): Promise<void> {
        sendTelemetryEvent(EventName.UNITTEST_DISCOVERING, undefined, { tool: this.testProvider });

        // Discovery is expensive. If it is already running, use the existing promise.
        if (this.discovering) {
            traceError('Test discovery already in progress, not starting a new one.');
            return this.discovering.promise;
        }

        const deferred = createDeferred<void>();
        this.discovering = deferred;

        try {
            // ** execution factory only defined for new rewrite way
            if (executionFactory !== undefined) {
                await this.discoveryAdapter.discoverTests(this.workspaceUri, executionFactory, token, interpreter);
            } else {
                await this.discoveryAdapter.discoverTests(this.workspaceUri);
            }
            deferred.resolve();
        } catch (ex) {
            sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_DONE, undefined, { tool: this.testProvider, failed: true });

            let cancel = token?.isCancellationRequested
                ? Testing.cancelUnittestDiscovery
                : Testing.errorUnittestDiscovery;
            if (this.testProvider === 'pytest') {
                cancel = token?.isCancellationRequested ? Testing.cancelPytestDiscovery : Testing.errorPytestDiscovery;
            }

            traceError(`${cancel} for workspace: ${this.workspaceUri} \r\n`, ex);

            // Report also on the test view.
            const message = util.format(`${cancel} ${Testing.seePythonOutput}\r\n`, ex);
            const options = buildErrorNodeOptions(this.workspaceUri, message, this.testProvider);
            const errorNode = createErrorTestItem(testController, options);
            testController.items.add(errorNode);

            return deferred.reject(ex as Error);
        } finally {
            // Discovery has finished running, we have the data,
            // we don't need the deferred promise anymore.
            this.discovering = undefined;
        }

        sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_DONE, undefined, { tool: this.testProvider, failed: false });
        return Promise.resolve();
    }

    /**
     * Retrieves the current test provider instance.
     *
     * @returns {TestProvider} The instance of the test provider.
     */
    public getTestProvider(): TestProvider {
        return this.testProvider;
    }
}
