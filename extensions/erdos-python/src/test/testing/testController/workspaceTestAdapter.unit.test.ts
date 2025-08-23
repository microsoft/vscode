// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';

import { TestController, TestItem, TestItemCollection, TestRun, Uri } from 'vscode';
import { IConfigurationService } from '../../../client/common/types';
import { UnittestTestDiscoveryAdapter } from '../../../client/testing/testController/unittest/testDiscoveryAdapter';
import { UnittestTestExecutionAdapter } from '../../../client/testing/testController/unittest/testExecutionAdapter'; // 7/7
import { WorkspaceTestAdapter } from '../../../client/testing/testController/workspaceTestAdapter';
import * as Telemetry from '../../../client/telemetry';
import { EventName } from '../../../client/telemetry/constants';
import { ITestResultResolver } from '../../../client/testing/testController/common/types';
import * as testItemUtilities from '../../../client/testing/testController/common/testItemUtilities';
import * as util from '../../../client/testing/testController/common/utils';
import * as ResultResolver from '../../../client/testing/testController/common/resultResolver';
import { IPythonExecutionFactory } from '../../../client/common/process/types';

suite('Workspace test adapter', () => {
    suite('Test discovery', () => {
        let stubConfigSettings: IConfigurationService;
        let stubResultResolver: ITestResultResolver;

        let discoverTestsStub: sinon.SinonStub;
        let sendTelemetryStub: sinon.SinonStub;

        let telemetryEvent: { eventName: EventName; properties: Record<string, unknown> }[] = [];
        let execFactory: typemoq.IMock<IPythonExecutionFactory>;

        // Stubbed test controller (see comment around L.40)
        let testController: TestController;
        let log: string[] = [];

        setup(() => {
            stubConfigSettings = ({
                getSettings: () => ({
                    testing: { unittestArgs: ['--foo'] },
                }),
            } as unknown) as IConfigurationService;

            stubResultResolver = ({
                resolveDiscovery: () => {
                    // no body
                },
                resolveExecution: () => {
                    // no body
                },
            } as unknown) as ITestResultResolver;

            // const vsIdToRunIdGetStub = sinon.stub(stubResultResolver.vsIdToRunId, 'get');
            // const expectedRunId = 'expectedRunId';
            // vsIdToRunIdGetStub.withArgs(sinon.match.any).returns(expectedRunId);

            // For some reason the 'tests' namespace in vscode returns undefined.
            // While I figure out how to expose to the tests, they will run
            // against a stub test controller and stub test items.
            const testItem = ({
                canResolveChildren: false,
                tags: [],
                children: {
                    add: () => {
                        // empty
                    },
                },
            } as unknown) as TestItem;

            testController = ({
                items: {
                    get: () => {
                        log.push('get');
                    },
                    add: () => {
                        log.push('add');
                    },
                    replace: () => {
                        log.push('replace');
                    },
                    delete: () => {
                        log.push('delete');
                    },
                },
                createTestItem: () => {
                    log.push('createTestItem');
                    return testItem;
                },
                dispose: () => {
                    // empty
                },
            } as unknown) as TestController;

            // testController = tests.createTestController('mock-python-tests', 'Mock Python Tests');

            const mockSendTelemetryEvent = (
                eventName: EventName,
                _: number | Record<string, number> | undefined,
                properties: unknown,
            ) => {
                telemetryEvent.push({
                    eventName,
                    properties: properties as Record<string, unknown>,
                });
            };

            discoverTestsStub = sinon.stub(UnittestTestDiscoveryAdapter.prototype, 'discoverTests');
            sendTelemetryStub = sinon.stub(Telemetry, 'sendTelemetryEvent').callsFake(mockSendTelemetryEvent);
        });

        teardown(() => {
            telemetryEvent = [];
            log = [];
            testController.dispose();
            sinon.restore();
        });

        test('If discovery failed correctly create error node', async () => {
            discoverTestsStub.rejects(new Error('foo'));

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const uriFoo = Uri.parse('foo');
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                uriFoo,
                stubResultResolver,
            );

            const blankTestItem = ({
                canResolveChildren: false,
                tags: [],
                children: {
                    add: () => {
                        // empty
                    },
                },
            } as unknown) as TestItem;
            const errorTestItemOptions: testItemUtilities.ErrorTestItemOptions = {
                id: 'id',
                label: 'label',
                error: 'error',
            };
            const createErrorTestItemStub = sinon.stub(testItemUtilities, 'createErrorTestItem').returns(blankTestItem);
            const buildErrorNodeOptionsStub = sinon.stub(util, 'buildErrorNodeOptions').returns(errorTestItemOptions);
            const testProvider = 'unittest';

            execFactory = typemoq.Mock.ofType<IPythonExecutionFactory>();
            await workspaceTestAdapter.discoverTests(testController, undefined, execFactory.object);

            sinon.assert.calledWithMatch(createErrorTestItemStub, sinon.match.any, sinon.match.any);
            sinon.assert.calledWithMatch(buildErrorNodeOptionsStub, uriFoo, sinon.match.any, testProvider);
        });

        test("When discovering tests, the workspace test adapter should call the test discovery adapter's discoverTest method", async () => {
            discoverTestsStub.resolves();

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            await workspaceTestAdapter.discoverTests(testController, undefined, execFactory.object);

            sinon.assert.calledOnce(discoverTestsStub);
        });

        test('If discovery is already running, do not call discoveryAdapter.discoverTests again', async () => {
            discoverTestsStub.callsFake(
                async () =>
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            // Simulate time taken by discovery.
                            resolve();
                        }, 2000);
                    }),
            );

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            // Try running discovery twice
            const one = workspaceTestAdapter.discoverTests(testController);
            const two = workspaceTestAdapter.discoverTests(testController);

            Promise.all([one, two]);

            sinon.assert.calledOnce(discoverTestsStub);
        });

        test('If discovery succeeds, send a telemetry event with the "failed" key set to false', async () => {
            discoverTestsStub.resolves({ status: 'success' });

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);

            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            await workspaceTestAdapter.discoverTests(testController, undefined, execFactory.object);

            sinon.assert.calledWith(sendTelemetryStub, EventName.UNITTEST_DISCOVERY_DONE);
            assert.strictEqual(telemetryEvent.length, 2);

            const lastEvent = telemetryEvent[1];
            assert.strictEqual(lastEvent.properties.failed, false);
        });

        test('If discovery failed, send a telemetry event with the "failed" key set to true, and add an error node to the test controller', async () => {
            discoverTestsStub.rejects(new Error('foo'));

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);

            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            await workspaceTestAdapter.discoverTests(testController);

            sinon.assert.calledWith(sendTelemetryStub, EventName.UNITTEST_DISCOVERY_DONE);
            assert.strictEqual(telemetryEvent.length, 2);

            const lastEvent = telemetryEvent[1];
            assert.ok(lastEvent.properties.failed);
        });
    });
    suite('Test execution workspace test adapter', () => {
        let stubConfigSettings: IConfigurationService;
        let stubResultResolver: ITestResultResolver;
        let executionTestsStub: sinon.SinonStub;
        let sendTelemetryStub: sinon.SinonStub;
        let runInstance: typemoq.IMock<TestRun>;
        let testControllerMock: typemoq.IMock<TestController>;
        let telemetryEvent: { eventName: EventName; properties: Record<string, unknown> }[] = [];
        let resultResolver: ResultResolver.PythonResultResolver;

        // Stubbed test controller (see comment around L.40)
        let testController: TestController;
        let log: string[] = [];

        const sandbox = sinon.createSandbox();

        setup(() => {
            stubConfigSettings = ({
                getSettings: () => ({
                    testing: { unittestArgs: ['--foo'] },
                }),
            } as unknown) as IConfigurationService;

            stubResultResolver = ({
                resolveDiscovery: () => {
                    // no body
                },
                resolveExecution: () => {
                    // no body
                },
                vsIdToRunId: {
                    get: sinon.stub().returns('expectedRunId'),
                },
            } as unknown) as ITestResultResolver;
            const testItem = ({
                canResolveChildren: false,
                tags: [],
                children: {
                    add: () => {
                        // empty
                    },
                },
            } as unknown) as TestItem;

            testController = ({
                items: {
                    get: () => {
                        log.push('get');
                    },
                    add: () => {
                        log.push('add');
                    },
                    replace: () => {
                        log.push('replace');
                    },
                    delete: () => {
                        log.push('delete');
                    },
                },
                createTestItem: () => {
                    log.push('createTestItem');
                    return testItem;
                },
                dispose: () => {
                    // empty
                },
            } as unknown) as TestController;

            const mockSendTelemetryEvent = (
                eventName: EventName,
                _: number | Record<string, number> | undefined,
                properties: unknown,
            ) => {
                telemetryEvent.push({
                    eventName,
                    properties: properties as Record<string, unknown>,
                });
            };

            executionTestsStub = sandbox.stub(UnittestTestExecutionAdapter.prototype, 'runTests');
            sendTelemetryStub = sandbox.stub(Telemetry, 'sendTelemetryEvent').callsFake(mockSendTelemetryEvent);
            runInstance = typemoq.Mock.ofType<TestRun>();

            const testProvider = 'pytest';
            const workspaceUri = Uri.file('foo');
            resultResolver = new ResultResolver.PythonResultResolver(testController, testProvider, workspaceUri);
        });

        teardown(() => {
            telemetryEvent = [];
            log = [];
            testController.dispose();
            sandbox.restore();
        });
        test('When executing tests, the right tests should be sent to be executed', async () => {
            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                resultResolver,
            );
            resultResolver.runIdToVSid.set('mockTestItem1', 'mockTestItem1');

            sinon.stub(testItemUtilities, 'getTestCaseNodes').callsFake((testNode: TestItem) =>
                // Custom implementation logic here based on the provided testNode and collection

                // Example implementation: returning a predefined array of TestItem objects
                [testNode],
            );

            const mockTestItem1 = createMockTestItem('mockTestItem1');
            const mockTestItem2 = createMockTestItem('mockTestItem2');
            const mockTestItems: [string, TestItem][] = [
                ['1', mockTestItem1],
                ['2', mockTestItem2],
                // Add as many mock TestItems as needed
            ];
            const iterableMock = mockTestItems[Symbol.iterator]();

            const testItemCollectionMock = typemoq.Mock.ofType<TestItemCollection>();

            testItemCollectionMock
                .setup((x) => x.forEach(typemoq.It.isAny()))
                .callback((callback) => {
                    let result = iterableMock.next();
                    while (!result.done) {
                        callback(result.value[1]);
                        result = iterableMock.next();
                    }
                })
                .returns(() => mockTestItem1);
            testControllerMock = typemoq.Mock.ofType<TestController>();
            testControllerMock.setup((t) => t.items).returns(() => testItemCollectionMock.object);

            await workspaceTestAdapter.executeTests(testController, runInstance.object, [mockTestItem1, mockTestItem2]);

            runInstance.verify((r) => r.started(typemoq.It.isAny()), typemoq.Times.exactly(2));
        });

        test("When executing tests, the workspace test adapter should call the test execute adapter's executionTest method", async () => {
            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            await workspaceTestAdapter.executeTests(testController, runInstance.object, []);

            sinon.assert.calledOnce(executionTestsStub);
        });

        test('If execution is already running, do not call executionAdapter.runTests again', async () => {
            executionTestsStub.callsFake(
                async () =>
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            // Simulate time taken by discovery.
                            resolve();
                        }, 2000);
                    }),
            );

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);
            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            // Try running discovery twice
            const one = workspaceTestAdapter.executeTests(testController, runInstance.object, []);
            const two = workspaceTestAdapter.executeTests(testController, runInstance.object, []);

            Promise.all([one, two]);

            sinon.assert.calledOnce(executionTestsStub);
        });

        test('If execution failed correctly create error node', async () => {
            executionTestsStub.rejects(new Error('foo'));

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);

            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            const blankTestItem = ({
                canResolveChildren: false,
                tags: [],
                children: {
                    add: () => {
                        // empty
                    },
                },
            } as unknown) as TestItem;
            const errorTestItemOptions: testItemUtilities.ErrorTestItemOptions = {
                id: 'id',
                label: 'label',
                error: 'error',
            };
            const createErrorTestItemStub = sinon.stub(testItemUtilities, 'createErrorTestItem').returns(blankTestItem);
            const buildErrorNodeOptionsStub = sinon.stub(util, 'buildErrorNodeOptions').returns(errorTestItemOptions);
            const testProvider = 'unittest';

            await workspaceTestAdapter.executeTests(testController, runInstance.object, []);

            sinon.assert.calledWithMatch(createErrorTestItemStub, sinon.match.any, sinon.match.any);
            sinon.assert.calledWithMatch(buildErrorNodeOptionsStub, Uri.parse('foo'), sinon.match.any, testProvider);
        });

        test('If execution failed, send a telemetry event with the "failed" key set to true, and add an error node to the test controller', async () => {
            executionTestsStub.rejects(new Error('foo'));

            const testDiscoveryAdapter = new UnittestTestDiscoveryAdapter(stubConfigSettings);
            const testExecutionAdapter = new UnittestTestExecutionAdapter(stubConfigSettings);

            const workspaceTestAdapter = new WorkspaceTestAdapter(
                'unittest',
                testDiscoveryAdapter,
                testExecutionAdapter,
                Uri.parse('foo'),
                stubResultResolver,
            );

            await workspaceTestAdapter.executeTests(testController, runInstance.object, []);

            sinon.assert.calledWith(sendTelemetryStub, EventName.UNITTEST_RUN_ALL_FAILED);
            assert.strictEqual(telemetryEvent.length, 1);
        });
    });
});

function createMockTestItem(id: string): TestItem {
    const range = typemoq.Mock.ofType<Range>();
    const mockTestItem = ({
        id,
        canResolveChildren: false,
        tags: [],
        children: {
            add: () => {
                // empty
            },
        },
        range,
        uri: Uri.file('/foo/bar'),
    } as unknown) as TestItem;

    return mockTestItem;
}
