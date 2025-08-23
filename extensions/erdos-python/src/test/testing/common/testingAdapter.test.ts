/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { TestController, TestRun, TestRunProfileKind, Uri } from 'vscode';
import * as typeMoq from 'typemoq';
import * as path from 'path';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as sinon from 'sinon';
import { PytestTestDiscoveryAdapter } from '../../../client/testing/testController/pytest/pytestDiscoveryAdapter';
import { ITestController, ITestResultResolver } from '../../../client/testing/testController/common/types';
import { IPythonExecutionFactory } from '../../../client/common/process/types';
import { IConfigurationService } from '../../../client/common/types';
import { IServiceContainer } from '../../../client/ioc/types';
import { EXTENSION_ROOT_DIR_FOR_TESTS, initialize } from '../../initialize';
import { traceError, traceLog } from '../../../client/logging';
import { PytestTestExecutionAdapter } from '../../../client/testing/testController/pytest/pytestExecutionAdapter';
import { UnittestTestDiscoveryAdapter } from '../../../client/testing/testController/unittest/testDiscoveryAdapter';
import { UnittestTestExecutionAdapter } from '../../../client/testing/testController/unittest/testExecutionAdapter';
import { PythonResultResolver } from '../../../client/testing/testController/common/resultResolver';
import { TestProvider } from '../../../client/testing/types';
import { PYTEST_PROVIDER, UNITTEST_PROVIDER } from '../../../client/testing/common/constants';
import { IEnvironmentVariablesProvider } from '../../../client/common/variables/types';
import * as pixi from '../../../client/pythonEnvironments/common/environmentManagers/pixi';

suite('End to End Tests: test adapters', () => {
    let resultResolver: ITestResultResolver;
    let pythonExecFactory: IPythonExecutionFactory;
    let configService: IConfigurationService;
    let serviceContainer: IServiceContainer;
    let envVarsService: IEnvironmentVariablesProvider;
    let workspaceUri: Uri;
    let testController: TestController;
    let getPixiStub: sinon.SinonStub;
    const unittestProvider: TestProvider = UNITTEST_PROVIDER;
    const pytestProvider: TestProvider = PYTEST_PROVIDER;
    const rootPathSmallWorkspace = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'smallWorkspace',
    );
    const rootPathLargeWorkspace = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'largeWorkspace',
    );
    const rootPathErrorWorkspace = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'errorWorkspace',
    );
    const rootPathDiscoveryErrorWorkspace = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'discoveryErrorWorkspace',
    );
    const rootPathDiscoverySymlink = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'symlinkWorkspace',
    );
    const nestedTarget = path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testTestingRootWkspc', 'target workspace');
    const nestedSymlink = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'symlink_parent-folder',
    );
    const rootPathCoverageWorkspace = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'testTestingRootWkspc',
        'coverageWorkspace',
    );
    suiteSetup(async () => {
        // create symlink for specific symlink test
        const target = rootPathSmallWorkspace;
        const dest = rootPathDiscoverySymlink;
        try {
            fs.symlink(target, dest, 'dir', (err) => {
                if (err) {
                    traceError(err);
                } else {
                    traceLog('Symlink created successfully for regular symlink end to end tests.');
                }
            });
            fs.symlink(nestedTarget, nestedSymlink, 'dir', (err) => {
                if (err) {
                    traceError(err);
                } else {
                    traceLog('Symlink created successfully for nested symlink end to end tests.');
                }
            });
        } catch (err) {
            traceError(err);
        }
    });

    setup(async () => {
        serviceContainer = (await initialize()).serviceContainer;
        getPixiStub = sinon.stub(pixi, 'getPixi');
        getPixiStub.resolves(undefined);

        // create objects that were injected
        configService = serviceContainer.get<IConfigurationService>(IConfigurationService);
        pythonExecFactory = serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);
        testController = serviceContainer.get<TestController>(ITestController);
        envVarsService = serviceContainer.get<IEnvironmentVariablesProvider>(IEnvironmentVariablesProvider);

        // create objects that were not injected
    });
    teardown(() => {
        sinon.restore();
    });
    suiteTeardown(async () => {
        // remove symlink
        const dest = rootPathDiscoverySymlink;
        if (fs.existsSync(dest)) {
            fs.unlink(dest, (err) => {
                if (err) {
                    traceError(err);
                } else {
                    traceLog('Symlink removed successfully after tests, rootPathDiscoverySymlink.');
                }
            });
        } else {
            traceLog('Symlink was not found to remove after tests, exiting successfully, rootPathDiscoverySymlink.');
        }

        if (fs.existsSync(nestedSymlink)) {
            fs.unlink(nestedSymlink, (err) => {
                if (err) {
                    traceError(err);
                } else {
                    traceLog('Symlink removed successfully after tests, nestedSymlink.');
                }
            });
        } else {
            traceLog('Symlink was not found to remove after tests, exiting successfully, nestedSymlink.');
        }
    });
    test('unittest discovery adapter small workspace', async () => {
        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        workspaceUri = Uri.parse(rootPathSmallWorkspace);
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        let callCount = 0;
        // const deferredTillEOT = createTestingDeferred();
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };

        // set workspace to test workspace folder and set up settings

        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];

        // run unittest discovery
        const discoveryAdapter = new UnittestTestDiscoveryAdapter(configService, resultResolver, envVarsService);

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete

            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            );
            // 2. Confirm no errors
            assert.strictEqual(actualData.error, undefined, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');

            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('unittest discovery adapter large workspace', async () => {
        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        let callCount = 0;
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };

        // set settings to work for the given workspace
        workspaceUri = Uri.parse(rootPathLargeWorkspace);
        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];
        // run discovery
        const discoveryAdapter = new UnittestTestDiscoveryAdapter(configService, resultResolver, envVarsService);

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            );
            // 2. Confirm no errors
            assert.strictEqual(actualData.error, undefined, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');

            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('pytest discovery adapter small workspace', async () => {
        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathSmallWorkspace);
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };
        // run pytest discovery
        const discoveryAdapter = new PytestTestDiscoveryAdapter(configService, resultResolver, envVarsService);

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete

            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            ); // 2. Confirm no errors
            assert.strictEqual(actualData.error?.length, 0, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');

            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('pytest discovery adapter nested symlink', async () => {
        if (os.platform() === 'win32') {
            console.log('Skipping test for windows');
            return;
        }

        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        // set workspace to test workspace folder
        const workspacePath = path.join(nestedSymlink, 'custom_sub_folder');
        const workspacePathParent = nestedSymlink;
        workspaceUri = Uri.parse(workspacePath);
        const filePath = path.join(workspacePath, 'test_simple.py');
        const stats = fs.lstatSync(workspacePathParent);

        // confirm that the path is a symbolic link
        assert.ok(stats.isSymbolicLink(), 'The PARENT path is not a symbolic link but must be for this test.');

        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };
        // run pytest discovery
        const discoveryAdapter = new PytestTestDiscoveryAdapter(configService, resultResolver, envVarsService);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete

            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            ); // 2. Confirm no errors
            assert.strictEqual(actualData.error?.length, 0, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');
            // 4. Confirm that the cwd returned is the symlink path and the test's path is also using the symlink as the root
            if (process.platform === 'win32') {
                // covert string to lowercase for windows as the path is case insensitive
                traceLog('windows machine detected, converting path to lowercase for comparison');
                const a = actualData.cwd.toLowerCase();
                const b = filePath.toLowerCase();
                const testSimpleActual = (actualData.tests as {
                    children: {
                        path: string;
                    }[];
                }).children[0].path.toLowerCase();
                const testSimpleExpected = filePath.toLowerCase();
                assert.strictEqual(a, b, `Expected cwd to be the symlink path actual: ${a} expected: ${b}`);
                assert.strictEqual(
                    testSimpleActual,
                    testSimpleExpected,
                    `Expected test path to be the symlink path actual: ${testSimpleActual} expected: ${testSimpleExpected}`,
                );
            } else {
                assert.strictEqual(
                    path.join(actualData.cwd),
                    path.join(workspacePath),
                    'Expected cwd to be the symlink path, check for non-windows machines',
                );
                assert.strictEqual(
                    (actualData.tests as {
                        children: {
                            path: string;
                        }[];
                    }).children[0].path,
                    filePath,
                    'Expected test path to be the symlink path, check for non windows machines',
                );
            }

            // 5. Confirm that resolveDiscovery was called once
            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('pytest discovery adapter small workspace with symlink', async () => {
        if (os.platform() === 'win32') {
            console.log('Skipping test for windows');
            return;
        }

        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        // set workspace to test workspace folder
        const testSimpleSymlinkPath = path.join(rootPathDiscoverySymlink, 'test_simple.py');
        workspaceUri = Uri.parse(rootPathDiscoverySymlink);
        const stats = fs.lstatSync(rootPathDiscoverySymlink);

        // confirm that the path is a symbolic link
        assert.ok(stats.isSymbolicLink(), 'The path is not a symbolic link but must be for this test.');

        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };
        // run pytest discovery
        const discoveryAdapter = new PytestTestDiscoveryAdapter(configService, resultResolver, envVarsService);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete

            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            ); // 2. Confirm no errors
            assert.strictEqual(actualData.error?.length, 0, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');
            // 4. Confirm that the cwd returned is the symlink path and the test's path is also using the symlink as the root
            if (process.platform === 'win32') {
                // covert string to lowercase for windows as the path is case insensitive
                traceLog('windows machine detected, converting path to lowercase for comparison');
                const a = actualData.cwd.toLowerCase();
                const b = rootPathDiscoverySymlink.toLowerCase();
                const testSimpleActual = (actualData.tests as {
                    children: {
                        path: string;
                    }[];
                }).children[0].path.toLowerCase();
                const testSimpleExpected = testSimpleSymlinkPath.toLowerCase();
                assert.strictEqual(a, b, `Expected cwd to be the symlink path actual: ${a} expected: ${b}`);
                assert.strictEqual(
                    testSimpleActual,
                    testSimpleExpected,
                    `Expected test path to be the symlink path actual: ${testSimpleActual} expected: ${testSimpleExpected}`,
                );
            } else {
                assert.strictEqual(
                    path.join(actualData.cwd),
                    path.join(rootPathDiscoverySymlink),
                    'Expected cwd to be the symlink path, check for non-windows machines',
                );
                assert.strictEqual(
                    (actualData.tests as {
                        children: {
                            path: string;
                        }[];
                    }).children[0].path,
                    testSimpleSymlinkPath,
                    'Expected test path to be the symlink path, check for non windows machines',
                );
            }

            // 5. Confirm that resolveDiscovery was called once
            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('pytest discovery adapter large workspace', async () => {
        // result resolver and saved data for assertions
        let actualData: {
            cwd: string;
            tests?: unknown;
            status: 'success' | 'error';
            error?: string[];
        };
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        resultResolver._resolveDiscovery = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            actualData = payload;
            return Promise.resolve();
        };
        // run pytest discovery
        const discoveryAdapter = new PytestTestDiscoveryAdapter(configService, resultResolver, envVarsService);

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathLargeWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete
            // 1. Check the status is "success"
            assert.strictEqual(
                actualData.status,
                'success',
                `Expected status to be 'success' instead status is ${actualData.status}`,
            ); // 2. Confirm no errors
            assert.strictEqual(actualData.error?.length, 0, "Expected no errors in 'error' field");
            // 3. Confirm tests are found
            assert.ok(actualData.tests, 'Expected tests to be present');

            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
        });
    });
    test('unittest execution adapter small workspace with correct output', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveExecution = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            // the payloads that get to the _resolveExecution are all data and should be successful.
            try {
                assert.strictEqual(
                    payload.status,
                    'success',
                    `Expected status to be 'success', instead status is ${payload.status}`,
                );
                assert.ok(payload.result, 'Expected results to be present');
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathSmallWorkspace);
        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];
        // run execution
        const executionAdapter = new UnittestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(
                workspaceUri,
                ['test_simple.SimpleClass.test_simple_unit'],
                TestRunProfileKind.Run,
                testRun.object,
                pythonExecFactory,
            )
            .finally(() => {
                // verify that the _resolveExecution was called once per test
                assert.strictEqual(callCount, 1, 'Expected _resolveExecution to be called once');
                assert.strictEqual(failureOccurred, false, failureMsg);

                // verify output works for stdout and stderr as well as unittest output
                assert.ok(
                    collectedOutput.includes('expected printed output, stdout'),
                    'The test string does not contain the expected stdout output.',
                );
                assert.ok(
                    collectedOutput.includes('expected printed output, stderr'),
                    'The test string does not contain the expected stderr output.',
                );
                assert.ok(
                    collectedOutput.includes('Ran 1 test in'),
                    'The test string does not contain the expected unittest output.',
                );
            });
    });
    test('unittest execution adapter large workspace', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveExecution = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            // the payloads that get to the _resolveExecution are all data and should be successful.
            try {
                const validStatuses = ['subtest-success', 'subtest-failure'];
                assert.ok(
                    validStatuses.includes(payload.status),
                    `Expected status to be one of ${validStatuses.join(', ')}, but instead status is ${payload.status}`,
                );
                assert.ok(payload.result, 'Expected results to be present');
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathLargeWorkspace);
        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];

        // run unittest execution
        const executionAdapter = new UnittestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(
                workspaceUri,
                ['test_parameterized_subtest.NumbersTest.test_even'],
                TestRunProfileKind.Run,
                testRun.object,
                pythonExecFactory,
            )
            .then(() => {
                // verify that the _resolveExecution was called once per test
                assert.strictEqual(callCount, 2000, 'Expected _resolveExecution to be called once');
                assert.strictEqual(failureOccurred, false, failureMsg);

                // verify output
                assert.ok(
                    collectedOutput.includes('test_parameterized_subtest.py'),
                    'The test string does not contain the correct test name which should be printed',
                );
                assert.ok(
                    collectedOutput.includes('FAILED (failures=1000)'),
                    'The test string does not contain the last of the unittest output',
                );
            });
    });
    test('pytest execution adapter small workspace with correct output', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveExecution = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            // the payloads that get to the _resolveExecution are all data and should be successful.
            try {
                assert.strictEqual(
                    payload.status,
                    'success',
                    `Expected status to be 'success', instead status is ${payload.status}`,
                );
                assert.ok(payload.result, 'Expected results to be present');
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };
        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathSmallWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        // run pytest execution
        const executionAdapter = new PytestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(
                workspaceUri,
                [`${rootPathSmallWorkspace}/test_simple.py::test_a`],
                TestRunProfileKind.Run,
                testRun.object,
                pythonExecFactory,
            )
            .then(() => {
                // verify that the _resolveExecution was called once per test
                assert.strictEqual(callCount, 1, 'Expected _resolveExecution to be called once');
                assert.strictEqual(failureOccurred, false, failureMsg);

                // verify output works for stdout and stderr as well as pytest output
                assert.ok(
                    collectedOutput.includes('test session starts'),
                    'The test string does not contain the expected stdout output.',
                );
                assert.ok(
                    collectedOutput.includes('Captured log call'),
                    'The test string does not contain the expected log section.',
                );
                const searchStrings = [
                    'This is a warning message.',
                    'This is an error message.',
                    'This is a critical message.',
                ];
                let searchString: string;
                for (searchString of searchStrings) {
                    const count: number = (collectedOutput.match(new RegExp(searchString, 'g')) || []).length;
                    assert.strictEqual(
                        count,
                        2,
                        `The test string does not contain two instances of ${searchString}. Should appear twice from logging output and stack trace`,
                    );
                }
            });
    });

    test('Unittest execution with coverage, small workspace', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        resultResolver._resolveCoverage = async (payload, _token?) => {
            assert.strictEqual(payload.cwd, rootPathCoverageWorkspace, 'Expected cwd to be the workspace folder');
            assert.ok(payload.result, 'Expected results to be present');
            const simpleFileCov = payload.result[`${rootPathCoverageWorkspace}/even.py`];
            assert.ok(simpleFileCov, 'Expected test_simple.py coverage to be present');
            // since only one test was run, the other test in the same file will have missed coverage lines
            assert.strictEqual(simpleFileCov.lines_covered.length, 3, 'Expected 1 line to be covered in even.py');
            assert.strictEqual(simpleFileCov.lines_missed.length, 1, 'Expected 3 lines to be missed in even.py');
            assert.strictEqual(simpleFileCov.executed_branches, 1, 'Expected 1 branch to be executed in even.py');
            assert.strictEqual(simpleFileCov.total_branches, 2, 'Expected 2 branches in even.py');
            return Promise.resolve();
        };

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathCoverageWorkspace);
        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];
        // run execution
        const executionAdapter = new UnittestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(
                workspaceUri,
                ['test_even.TestNumbers.test_odd'],
                TestRunProfileKind.Coverage,
                testRun.object,
                pythonExecFactory,
            )
            .finally(() => {
                assert.ok(collectedOutput, 'expect output to be collected');
            });
    });
    test('pytest coverage execution, small workspace', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        resultResolver._resolveCoverage = async (payload, _runInstance?) => {
            assert.strictEqual(payload.cwd, rootPathCoverageWorkspace, 'Expected cwd to be the workspace folder');
            assert.ok(payload.result, 'Expected results to be present');
            const simpleFileCov = payload.result[`${rootPathCoverageWorkspace}/even.py`];
            assert.ok(simpleFileCov, 'Expected test_simple.py coverage to be present');
            // since only one test was run, the other test in the same file will have missed coverage lines
            assert.strictEqual(simpleFileCov.lines_covered.length, 3, 'Expected 1 line to be covered in even.py');
            assert.strictEqual(simpleFileCov.lines_missed.length, 1, 'Expected 3 lines to be missed in even.py');
            assert.strictEqual(simpleFileCov.executed_branches, 1, 'Expected 1 branch to be executed in even.py');
            assert.strictEqual(simpleFileCov.total_branches, 2, 'Expected 2 branches in even.py');

            return Promise.resolve();
        };
        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathCoverageWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        // run pytest execution
        const executionAdapter = new PytestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(
                workspaceUri,
                [`${rootPathCoverageWorkspace}/test_even.py::TestNumbers::test_odd`],
                TestRunProfileKind.Coverage,
                testRun.object,
                pythonExecFactory,
            )
            .then(() => {
                assert.ok(collectedOutput, 'expect output to be collected');
            });
    });
    test('pytest execution adapter large workspace', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveExecution = async (payload, _token?) => {
            traceLog(`resolveDiscovery ${payload}`);
            callCount = callCount + 1;
            // the payloads that get to the _resolveExecution are all data and should be successful.
            try {
                assert.strictEqual(
                    payload.status,
                    'success',
                    `Expected status to be 'success', instead status is ${payload.status}`,
                );
                assert.ok(payload.result, 'Expected results to be present');
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathLargeWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        // generate list of test_ids
        const testIds: string[] = [];
        for (let i = 0; i < 2000; i = i + 1) {
            const testId = `${rootPathLargeWorkspace}/test_parameterized_subtest.py::test_odd_even[${i}]`;
            testIds.push(testId);
        }

        // run pytest execution
        const executionAdapter = new PytestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        let collectedOutput = '';
        testRun
            .setup((t) => t.appendOutput(typeMoq.It.isAny()))
            .callback((output: string) => {
                collectedOutput += output;
                traceLog('appendOutput was called with:', output);
            })
            .returns(() => false);
        await executionAdapter
            .runTests(workspaceUri, testIds, TestRunProfileKind.Run, testRun.object, pythonExecFactory)
            .then(() => {
                // verify that the _resolveExecution was called once per test
                assert.strictEqual(callCount, 2000, 'Expected _resolveExecution to be called once');
                assert.strictEqual(failureOccurred, false, failureMsg);

                // verify output works for large repo
                assert.ok(
                    collectedOutput.includes('test session starts'),
                    'The test string does not contain the expected stdout output from pytest.',
                );
            });
    });
    test('unittest discovery adapter seg fault error handling', async () => {
        resultResolver = new PythonResultResolver(testController, unittestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveDiscovery = async (data, _token?) => {
            // do the following asserts for each time resolveExecution is called, should be called once per test.
            callCount = callCount + 1;
            traceLog(`unittest discovery adapter seg fault error handling \n  ${JSON.stringify(data)}`);
            try {
                if (data.status === 'error') {
                    if (data.error === undefined) {
                        // Dereference a NULL pointer
                        const indexOfTest = JSON.stringify(data).search('Dereference a NULL pointer');
                        assert.notDeepEqual(indexOfTest, -1, 'Expected test to have a null pointer');
                    } else {
                        assert.ok(data.error, "Expected errors in 'error' field");
                    }
                } else {
                    const indexOfTest = JSON.stringify(data.tests).search('error');
                    assert.notDeepEqual(
                        indexOfTest,
                        -1,
                        'If payload status is not error then the individual tests should be marked as errors. This should occur on windows machines.',
                    );
                }
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathDiscoveryErrorWorkspace);
        configService.getSettings(workspaceUri).testing.unittestArgs = ['-s', '.', '-p', '*test*.py'];

        const discoveryAdapter = new UnittestTestDiscoveryAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            assert.strictEqual(callCount, 1, 'Expected _resolveDiscovery to be called once');
            assert.strictEqual(failureOccurred, false, failureMsg);
        });
    });
    test('pytest discovery seg fault error handling', async () => {
        // result resolver and saved data for assertions
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveDiscovery = async (data, _token?) => {
            // do the following asserts for each time resolveExecution is called, should be called once per test.
            callCount = callCount + 1;
            traceLog(`add one to call count, is now ${callCount}`);
            traceLog(`pytest discovery adapter seg fault error handling \n  ${JSON.stringify(data)}`);
            try {
                if (data.status === 'error') {
                    if (data.error === undefined) {
                        // Dereference a NULL pointer
                        const indexOfTest = JSON.stringify(data).search('Dereference a NULL pointer');
                        if (indexOfTest === -1) {
                            failureOccurred = true;
                            failureMsg = 'Expected test to have a null pointer';
                        }
                    } else if (data.error.length === 0) {
                        failureOccurred = true;
                        failureMsg = "Expected errors in 'error' field";
                    }
                } else {
                    const indexOfTest = JSON.stringify(data.tests).search('error');
                    if (indexOfTest === -1) {
                        failureOccurred = true;
                        failureMsg =
                            'If payload status is not error then the individual tests should be marked as errors. This should occur on windows machines.';
                    }
                }
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };
        // run pytest discovery
        const discoveryAdapter = new PytestTestDiscoveryAdapter(configService, resultResolver, envVarsService);

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathDiscoveryErrorWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        await discoveryAdapter.discoverTests(workspaceUri, pythonExecFactory).finally(() => {
            // verification after discovery is complete
            assert.ok(
                callCount >= 1,
                `Expected _resolveDiscovery to be called at least once, call count was instead ${callCount}`,
            );
            assert.strictEqual(failureOccurred, false, failureMsg);
        });
    });
    test('pytest execution adapter seg fault error handling', async () => {
        resultResolver = new PythonResultResolver(testController, pytestProvider, workspaceUri);
        let callCount = 0;
        let failureOccurred = false;
        let failureMsg = '';
        resultResolver._resolveExecution = async (data, _token?) => {
            // do the following asserts for each time resolveExecution is called, should be called once per test.
            console.log(`pytest execution adapter seg fault error handling \n  ${JSON.stringify(data)}`);
            callCount = callCount + 1;
            try {
                if (data.status === 'error') {
                    assert.ok(data.error, "Expected errors in 'error' field");
                } else {
                    const indexOfTest = JSON.stringify(data.result).search('error');
                    assert.notDeepEqual(
                        indexOfTest,
                        -1,
                        'If payload status is not error then the individual tests should be marked as errors. This should occur on windows machines.',
                    );
                }
                assert.ok(data.result, 'Expected results to be present');
                // make sure the testID is found in the results
                const indexOfTest = JSON.stringify(data).search(
                    'test_seg_fault.py::TestSegmentationFault::test_segfault',
                );
                assert.notDeepEqual(indexOfTest, -1, 'Expected testId to be present');
            } catch (err) {
                failureMsg = err ? (err as Error).toString() : '';
                failureOccurred = true;
            }
            return Promise.resolve();
        };

        const testId = `${rootPathErrorWorkspace}/test_seg_fault.py::TestSegmentationFault::test_segfault`;
        const testIds: string[] = [testId];

        // set workspace to test workspace folder
        workspaceUri = Uri.parse(rootPathErrorWorkspace);
        configService.getSettings(workspaceUri).testing.pytestArgs = [];

        // run pytest execution
        const executionAdapter = new PytestTestExecutionAdapter(configService, resultResolver, envVarsService);
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        await executionAdapter
            .runTests(workspaceUri, testIds, TestRunProfileKind.Run, testRun.object, pythonExecFactory)
            .finally(() => {
                assert.strictEqual(callCount, 1, 'Expected _resolveExecution to be called once');
                assert.strictEqual(failureOccurred, false, failureMsg);
            });
    });
});
