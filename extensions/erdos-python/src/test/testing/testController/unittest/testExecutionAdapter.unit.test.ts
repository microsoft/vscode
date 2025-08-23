/* eslint-disable @typescript-eslint/no-explicit-any */
//  Copyright (c) Microsoft Corporation. All rights reserved.
//  Licensed under the MIT License.
import * as assert from 'assert';
import { DebugSessionOptions, TestRun, TestRunProfileKind, Uri } from 'vscode';
import * as typeMoq from 'typemoq';
import * as sinon from 'sinon';
import * as path from 'path';
import { Observable } from 'rxjs/Observable';
import { IConfigurationService } from '../../../../client/common/types';
import {
    IPythonExecutionFactory,
    IPythonExecutionService,
    Output,
    SpawnOptions,
} from '../../../../client/common/process/types';
import { createDeferred, Deferred } from '../../../../client/common/utils/async';
import { ITestDebugLauncher, LaunchOptions } from '../../../../client/testing/common/types';
import * as util from '../../../../client/testing/testController/common/utils';
import { EXTENSION_ROOT_DIR } from '../../../../client/constants';
import { MockChildProcess } from '../../../mocks/mockChildProcess';
import { traceInfo } from '../../../../client/logging';
import { UnittestTestExecutionAdapter } from '../../../../client/testing/testController/unittest/testExecutionAdapter';
import * as extapi from '../../../../client/envExt/api.internal';

suite('Unittest test execution adapter', () => {
    let configService: IConfigurationService;
    let execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
    let adapter: UnittestTestExecutionAdapter;
    let execService: typeMoq.IMock<IPythonExecutionService>;
    let deferred: Deferred<void>;
    let deferred4: Deferred<void>;
    let debugLauncher: typeMoq.IMock<ITestDebugLauncher>;
    (global as any).EXTENSION_ROOT_DIR = EXTENSION_ROOT_DIR;
    let myTestPath: string;
    let mockProc: MockChildProcess;
    let utilsWriteTestIdsFileStub: sinon.SinonStub;
    let utilsStartRunResultNamedPipeStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;
    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);
        configService = ({
            getSettings: () => ({
                testing: { unittestArgs: ['.'] },
            }),
            isTestExecution: () => false,
        } as unknown) as IConfigurationService;

        // set up exec service with child process
        mockProc = new MockChildProcess('', ['']);
        const output = new Observable<Output<string>>(() => {
            /* no op */
        });
        deferred4 = createDeferred();
        execService = typeMoq.Mock.ofType<IPythonExecutionService>();
        execService
            .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => {
                deferred4.resolve();
                return {
                    proc: mockProc as any,
                    out: output,
                    dispose: () => {
                        /* no-body */
                    },
                };
            });
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();

        // added
        utilsWriteTestIdsFileStub = sinon.stub(util, 'writeTestIdsFile');
        debugLauncher = typeMoq.Mock.ofType<ITestDebugLauncher>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => Promise.resolve(execService.object));
        deferred = createDeferred();
        execService
            .setup((x) => x.exec(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve({ stdout: '{}' });
            });
        execFactory.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        execService.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        debugLauncher.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        myTestPath = path.join('/', 'my', 'test', 'path', '/');

        utilsStartRunResultNamedPipeStub = sinon.stub(util, 'startRunResultNamedPipe');
        utilsStartRunResultNamedPipeStub.callsFake(() => Promise.resolve('runResultPipe-mockName'));

        execService.setup((x) => x.getExecutablePath()).returns(() => Promise.resolve('/mock/path/to/python'));
    });
    teardown(() => {
        sinon.restore();
    });
    test('startTestIdServer called with correct testIds', async () => {
        const deferred2 = createDeferred();
        const deferred3 = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred2.resolve();
                return Promise.resolve(execService.object);
            });
        utilsWriteTestIdsFileStub.callsFake(() => {
            deferred3.resolve();
            return Promise.resolve({
                name: 'mockName',
                dispose: () => {
                    /* no-op */
                },
            });
        });
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun.setup((t) => t.token).returns(() => ({ onCancellationRequested: () => undefined } as any));
        const uri = Uri.file(myTestPath);
        adapter = new UnittestTestExecutionAdapter(configService);
        const testIds = ['test1id', 'test2id'];

        adapter.runTests(uri, testIds, TestRunProfileKind.Run, testRun.object, execFactory.object);

        // add in await and trigger
        await deferred2.promise;
        await deferred3.promise;
        mockProc.trigger('close');

        // assert
        sinon.assert.calledWithExactly(utilsWriteTestIdsFileStub, testIds);
    });
    test('unittest execution called with correct args', async () => {
        const deferred2 = createDeferred();
        const deferred3 = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred2.resolve();
                return Promise.resolve(execService.object);
            });
        utilsWriteTestIdsFileStub.callsFake(() => {
            deferred3.resolve();
            return Promise.resolve('testIdPipe-mockName');
        });
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun.setup((t) => t.token).returns(() => ({ onCancellationRequested: () => undefined } as any));
        const uri = Uri.file(myTestPath);
        adapter = new UnittestTestExecutionAdapter(configService);
        adapter.runTests(uri, [], TestRunProfileKind.Run, testRun.object, execFactory.object);

        await deferred2.promise;
        await deferred3.promise;
        await deferred4.promise;
        mockProc.trigger('close');

        const pathToPythonFiles = path.join(EXTENSION_ROOT_DIR, 'python_files');
        const pathToExecutionScript = path.join(pathToPythonFiles, 'unittestadapter', 'execution.py');
        const expectedArgs = [pathToExecutionScript, '--udiscovery', '.'];
        const expectedExtraVariables = {
            PYTHONPATH: myTestPath,
            TEST_RUN_PIPE: 'runResultPipe-mockName',
            RUN_TEST_IDS_PIPE: 'testIdPipe-mockName',
        };
        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.equal(options.env?.PYTHONPATH, expectedExtraVariables.PYTHONPATH);
                        assert.equal(options.env?.TEST_RUN_PIPE, expectedExtraVariables.TEST_RUN_PIPE);
                        assert.equal(options.env?.RUN_TEST_IDS_PIPE, expectedExtraVariables.RUN_TEST_IDS_PIPE);
                        assert.equal(options.env?.COVERAGE_ENABLED, undefined); // coverage not enabled
                        assert.equal(options.cwd, uri.fsPath);
                        assert.equal(options.throwOnStdErr, true);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('unittest execution respects settings.testing.cwd when present', async () => {
        const deferred2 = createDeferred();
        const deferred3 = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred2.resolve();
                return Promise.resolve(execService.object);
            });
        utilsWriteTestIdsFileStub.callsFake(() => {
            deferred3.resolve();
            return Promise.resolve('testIdPipe-mockName');
        });
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun.setup((t) => t.token).returns(() => ({ onCancellationRequested: () => undefined } as any));
        const newCwd = path.join('new', 'path');
        configService = ({
            getSettings: () => ({
                testing: { unittestArgs: ['.'], cwd: newCwd },
            }),
            isTestExecution: () => false,
        } as unknown) as IConfigurationService;
        const uri = Uri.file(myTestPath);
        adapter = new UnittestTestExecutionAdapter(configService);
        adapter.runTests(uri, [], TestRunProfileKind.Run, testRun.object, execFactory.object);

        await deferred2.promise;
        await deferred3.promise;
        await deferred4.promise;
        mockProc.trigger('close');

        const pathToPythonFiles = path.join(EXTENSION_ROOT_DIR, 'python_files');
        const pathToExecutionScript = path.join(pathToPythonFiles, 'unittestadapter', 'execution.py');
        const expectedArgs = [pathToExecutionScript, '--udiscovery', '.'];
        const expectedExtraVariables = {
            PYTHONPATH: newCwd,
            TEST_RUN_PIPE: 'runResultPipe-mockName',
            RUN_TEST_IDS_PIPE: 'testIdPipe-mockName',
        };

        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.equal(options.env?.PYTHONPATH, expectedExtraVariables.PYTHONPATH);
                        assert.equal(options.env?.TEST_RUN_PIPE, expectedExtraVariables.TEST_RUN_PIPE);
                        assert.equal(options.env?.RUN_TEST_IDS_PIPE, expectedExtraVariables.RUN_TEST_IDS_PIPE);
                        assert.equal(options.cwd, newCwd);
                        assert.equal(options.throwOnStdErr, true);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('Debug launched correctly for unittest', async () => {
        const deferred3 = createDeferred();
        utilsWriteTestIdsFileStub.callsFake(() => Promise.resolve('testIdPipe-mockName'));
        debugLauncher
            .setup((dl) => dl.launchDebugger(typeMoq.It.isAny(), typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(async (_opts, callback) => {
                traceInfo('stubs launch debugger');
                if (typeof callback === 'function') {
                    deferred3.resolve();
                    callback();
                }
            });
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun
            .setup((t) => t.token)
            .returns(
                () =>
                    ({
                        onCancellationRequested: () => undefined,
                    } as any),
            );
        const uri = Uri.file(myTestPath);
        adapter = new UnittestTestExecutionAdapter(configService);
        adapter.runTests(uri, [], TestRunProfileKind.Debug, testRun.object, execFactory.object, debugLauncher.object);
        await deferred3.promise;
        debugLauncher.verify(
            (x) =>
                x.launchDebugger(
                    typeMoq.It.is<LaunchOptions>((launchOptions) => {
                        assert.equal(launchOptions.cwd, uri.fsPath);
                        assert.equal(launchOptions.testProvider, 'unittest');
                        assert.equal(launchOptions.pytestPort, 'runResultPipe-mockName');
                        assert.strictEqual(launchOptions.runTestIdsPort, 'testIdPipe-mockName');
                        assert.notEqual(launchOptions.token, undefined);
                        return true;
                    }),
                    typeMoq.It.isAny(),
                    typeMoq.It.is<DebugSessionOptions>((sessionOptions) => {
                        assert.equal(sessionOptions.testRun, testRun.object);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('unittest execution with coverage turned on correctly', async () => {
        const deferred2 = createDeferred();
        const deferred3 = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred2.resolve();
                return Promise.resolve(execService.object);
            });
        utilsWriteTestIdsFileStub.callsFake(() => {
            deferred3.resolve();
            return Promise.resolve('testIdPipe-mockName');
        });
        const testRun = typeMoq.Mock.ofType<TestRun>();
        testRun.setup((t) => t.token).returns(() => ({ onCancellationRequested: () => undefined } as any));
        const uri = Uri.file(myTestPath);
        adapter = new UnittestTestExecutionAdapter(configService);
        adapter.runTests(uri, [], TestRunProfileKind.Coverage, testRun.object, execFactory.object);

        await deferred2.promise;
        await deferred3.promise;
        await deferred4.promise;
        mockProc.trigger('close');

        const pathToPythonFiles = path.join(EXTENSION_ROOT_DIR, 'python_files');
        const pathToExecutionScript = path.join(pathToPythonFiles, 'unittestadapter', 'execution.py');
        const expectedArgs = [pathToExecutionScript, '--udiscovery', '.'];
        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.equal(options.env?.COVERAGE_ENABLED, uri.fsPath);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
});
