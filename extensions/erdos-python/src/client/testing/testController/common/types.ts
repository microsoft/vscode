// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    Event,
    FileCoverageDetail,
    OutputChannel,
    TestController,
    TestItem,
    TestRun,
    TestRunProfileKind,
    Uri,
    WorkspaceFolder,
} from 'vscode';
import { ITestDebugLauncher } from '../../common/types';
import { IPythonExecutionFactory } from '../../../common/process/types';
import { PythonEnvironment } from '../../../pythonEnvironments/info';

export enum TestDataKinds {
    Workspace,
    FolderOrFile,
    Collection,
    Case,
}

export interface TestData {
    rawId: string;
    runId: string;
    id: string;
    uri: Uri;
    parentId?: string;
    kind: TestDataKinds;
}

export type TestRefreshOptions = { forceRefresh: boolean };

export const ITestController = Symbol('ITestController');
export interface ITestController {
    refreshTestData(resource?: Uri, options?: TestRefreshOptions): Promise<void>;
    stopRefreshing(): void;
    onRefreshingCompleted: Event<void>;
    onRefreshingStarted: Event<void>;
    onRunWithoutConfiguration: Event<WorkspaceFolder[]>;
}

export const ITestFrameworkController = Symbol('ITestFrameworkController');
export interface ITestFrameworkController {
    resolveChildren(testController: TestController, item: TestItem, token?: CancellationToken): Promise<void>;
}

export const ITestsRunner = Symbol('ITestsRunner');
export interface ITestsRunner {}

// We expose these here as a convenience and to cut down on churn
// elsewhere in the code.
type RawTestNode = {
    id: string;
    name: string;
    parentid: string;
};
export type RawTestParent = RawTestNode & {
    kind: 'folder' | 'file' | 'suite' | 'function' | 'workspace';
};
type RawTestFSNode = RawTestParent & {
    kind: 'folder' | 'file';
    relpath: string;
};
export type RawTestFolder = RawTestFSNode & {
    kind: 'folder';
};
export type RawTestFile = RawTestFSNode & {
    kind: 'file';
};
export type RawTestSuite = RawTestParent & {
    kind: 'suite';
};
// function-as-a-container is for parameterized ("sub") tests.
export type RawTestFunction = RawTestParent & {
    kind: 'function';
};
export type RawTest = RawTestNode & {
    source: string;
};
export type RawDiscoveredTests = {
    rootid: string;
    root: string;
    parents: RawTestParent[];
    tests: RawTest[];
};

// New test discovery adapter types

export type DataReceivedEvent = {
    uuid: string;
    data: string;
};

export type TestDiscoveryCommand = {
    script: string;
    args: string[];
};

export type TestExecutionCommand = {
    script: string;
    args: string[];
};

export type TestCommandOptions = {
    workspaceFolder: Uri;
    cwd: string;
    command: TestDiscoveryCommand | TestExecutionCommand;
    token?: CancellationToken;
    outChannel?: OutputChannel;
    profileKind?: TestRunProfileKind;
    testIds?: string[];
};

// /**
//  * Interface describing the server that will send test commands to the Python side, and process responses.
//  *
//  * Consumers will call sendCommand in order to execute Python-related code,
//  * and will subscribe to the onDataReceived event to wait for the results.
//  */
// export interface ITestServer {
//     readonly onDataReceived: Event<DataReceivedEvent>;
//     readonly onRunDataReceived: Event<DataReceivedEvent>;
//     readonly onDiscoveryDataReceived: Event<DataReceivedEvent>;
//     sendCommand(
//         options: TestCommandOptions,
//         env: EnvironmentVariables,
//         runTestIdsPort?: string,
//         runInstance?: TestRun,
//         testIds?: string[],
//         callback?: () => void,
//         executionFactory?: IPythonExecutionFactory,
//     ): Promise<void>;
//     serverReady(): Promise<void>;
//     getPort(): number;
//     createUUID(cwd: string): string;
//     deleteUUID(uuid: string): void;
//     triggerRunDataReceivedEvent(data: DataReceivedEvent): void;
//     triggerDiscoveryDataReceivedEvent(data: DataReceivedEvent): void;
// }
export interface ITestResultResolver {
    runIdToVSid: Map<string, string>;
    runIdToTestItem: Map<string, TestItem>;
    vsIdToRunId: Map<string, string>;
    detailedCoverageMap: Map<string, FileCoverageDetail[]>;

    resolveDiscovery(payload: DiscoveredTestPayload, token?: CancellationToken): void;
    resolveExecution(payload: ExecutionTestPayload | CoveragePayload, runInstance: TestRun): void;
    _resolveDiscovery(payload: DiscoveredTestPayload, token?: CancellationToken): void;
    _resolveExecution(payload: ExecutionTestPayload, runInstance: TestRun): void;
    _resolveCoverage(payload: CoveragePayload, runInstance: TestRun): void;
}
export interface ITestDiscoveryAdapter {
    // ** first line old method signature, second line new method signature
    discoverTests(uri: Uri): Promise<void>;
    discoverTests(
        uri: Uri,
        executionFactory?: IPythonExecutionFactory,
        token?: CancellationToken,
        interpreter?: PythonEnvironment,
    ): Promise<void>;
}

// interface for execution/runner adapter
export interface ITestExecutionAdapter {
    // ** first line old method signature, second line new method signature
    runTests(uri: Uri, testIds: string[], profileKind?: boolean | TestRunProfileKind): Promise<void>;
    runTests(
        uri: Uri,
        testIds: string[],
        profileKind?: boolean | TestRunProfileKind,
        runInstance?: TestRun,
        executionFactory?: IPythonExecutionFactory,
        debugLauncher?: ITestDebugLauncher,
        interpreter?: PythonEnvironment,
    ): Promise<void>;
}

// Same types as in python_files/unittestadapter/utils.py
export type DiscoveredTestType = 'folder' | 'file' | 'class' | 'test';

export type DiscoveredTestCommon = {
    path: string;
    name: string;
    // Trailing underscore to avoid collision with the 'type' Python keyword.
    type_: DiscoveredTestType;
    id_: string;
};

export type DiscoveredTestItem = DiscoveredTestCommon & {
    lineno: number | string;
    runID: string;
};

export type DiscoveredTestNode = DiscoveredTestCommon & {
    children: (DiscoveredTestNode | DiscoveredTestItem)[];
};

export type DiscoveredTestPayload = {
    cwd: string;
    tests?: DiscoveredTestNode;
    status: 'success' | 'error';
    error?: string[];
};

export type CoveragePayload = {
    coverage: boolean;
    cwd: string;
    result?: {
        [filePathStr: string]: FileCoverageMetrics;
    };
    error: string;
};

// using camel-case for these types to match the python side
export type FileCoverageMetrics = {
    // eslint-disable-next-line camelcase
    lines_covered: number[];
    // eslint-disable-next-line camelcase
    lines_missed: number[];
    executed_branches: number;
    total_branches: number;
};

export type ExecutionTestPayload = {
    cwd: string;
    status: 'success' | 'error';
    result?: {
        [testRunID: string]: {
            test?: string;
            outcome?: string;
            message?: string;
            traceback?: string;
            subtest?: string;
        };
    };
    notFound?: string[];
    error: string;
};
