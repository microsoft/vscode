/* eslint-disable @typescript-eslint/no-explicit-any */
//  Copyright (c) Microsoft Corporation. All rights reserved.
//  Licensed under the MIT License.
import { CancellationTokenSource, TestRun, TestRunProfileKind, Uri } from 'vscode';
import * as typeMoq from 'typemoq';
import * as sinon from 'sinon';
import * as path from 'path';
import { Observable } from 'rxjs';
import { IPythonExecutionFactory, IPythonExecutionService, Output } from '../../../client/common/process/types';
import { IConfigurationService } from '../../../client/common/types';
import { Deferred, createDeferred } from '../../../client/common/utils/async';
import { EXTENSION_ROOT_DIR } from '../../../client/constants';
import { ITestDebugLauncher } from '../../../client/testing/common/types';
import { PytestTestExecutionAdapter } from '../../../client/testing/testController/pytest/pytestExecutionAdapter';
import { UnittestTestExecutionAdapter } from '../../../client/testing/testController/unittest/testExecutionAdapter';
import { MockChildProcess } from '../../mocks/mockChildProcess';
import * as util from '../../../client/testing/testController/common/utils';
import * as extapi from '../../../client/envExt/api.internal';
import { noop } from '../../core';

const adapters: Array<string> = ['pytest', 'unittest'];

suite('Execution Flow Run Adapters', () => {
    // define suit level variables
    let configService: IConfigurationService;
    let execFactoryStub = typeMoq.Mock.ofType<IPythonExecutionFactory>();
    let execServiceStub: typeMoq.IMock<IPythonExecutionService>;
    // let deferred: Deferred<void>;
    let debugLauncher: typeMoq.IMock<ITestDebugLauncher>;
    (global as any).EXTENSION_ROOT_DIR = EXTENSION_ROOT_DIR;
    let myTestPath: string;
    let mockProc: MockChildProcess;
    let utilsWriteTestIdsFileStub: sinon.SinonStub;
    let utilsStartRunResultNamedPipe: sinon.SinonStub;
    let serverDisposeStub: sinon.SinonStub;

    let useEnvExtensionStub: sinon.SinonStub;

    setup(() => {
        const proc = typeMoq.Mock.ofType<MockChildProcess>();
        proc.setup((p) => p.on).returns(() => noop as any);
        proc.setup((p) => p.stdout).returns(() => null);
        proc.setup((p) => p.stderr).returns(() => null);
        mockProc = proc.object;
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);
        // general vars
        myTestPath = path.join('/', 'my', 'test', 'path', '/');
        configService = ({
            getSettings: () => ({
                testing: { pytestArgs: ['.'], unittestArgs: ['-v', '-s', '.', '-p', 'test*'] },
            }),
            isTestExecution: () => false,
        } as unknown) as IConfigurationService;

        // set up execService and execFactory, all mocked
        execServiceStub = typeMoq.Mock.ofType<IPythonExecutionService>();
        execFactoryStub = typeMoq.Mock.ofType<IPythonExecutionFactory>();

        // mocked utility functions that handle pipe related functions
        utilsWriteTestIdsFileStub = sinon.stub(util, 'writeTestIdsFile');
        utilsStartRunResultNamedPipe = sinon.stub(util, 'startRunResultNamedPipe');
        serverDisposeStub = sinon.stub();

        // debug specific mocks
        debugLauncher = typeMoq.Mock.ofType<ITestDebugLauncher>();
        debugLauncher.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
    });
    teardown(() => {
        sinon.restore();
    });
    adapters.forEach((adapter) => {
        test(`Adapter ${adapter}: cancelation token called mid-run resolves correctly`, async () => {
            // mock test run and cancelation token
            const testRunMock = typeMoq.Mock.ofType<TestRun>();
            const cancellationToken = new CancellationTokenSource();
            const { token } = cancellationToken;
            testRunMock.setup((t) => t.token).returns(() => token);

            // run result pipe mocking and the related server close dispose
            let deferredTillServerCloseTester: Deferred<void> | undefined;

            // // mock exec service and exec factory
            execServiceStub
                .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
                .returns(() => {
                    cancellationToken.cancel();
                    return {
                        proc: mockProc as any,
                        out: typeMoq.Mock.ofType<Observable<Output<string>>>().object,
                        dispose: () => {
                            /* no-body */
                        },
                    };
                });
            execFactoryStub
                .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
                .returns(() => Promise.resolve(execServiceStub.object));
            execFactoryStub.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
            execServiceStub.setup((p) => ((p as unknown) as any).then).returns(() => undefined);

            // test ids named pipe mocking
            const deferredStartTestIdsNamedPipe = createDeferred();
            utilsWriteTestIdsFileStub.callsFake(() => {
                deferredStartTestIdsNamedPipe.resolve();
                return Promise.resolve('named-pipe');
            });

            utilsStartRunResultNamedPipe.callsFake((_callback, deferredTillServerClose, token) => {
                deferredTillServerCloseTester = deferredTillServerClose;
                token?.onCancellationRequested(() => {
                    deferredTillServerCloseTester?.resolve();
                });

                return Promise.resolve('named-pipes-socket-name');
            });
            serverDisposeStub.callsFake(() => {
                console.log('server disposed');
                if (deferredTillServerCloseTester) {
                    deferredTillServerCloseTester.resolve();
                } else {
                    console.log('deferredTillServerCloseTester is undefined');
                    throw new Error(
                        'deferredTillServerCloseTester is undefined, should be defined from startRunResultNamedPipe',
                    );
                }
            });

            // define adapter and run tests
            const testAdapter = createAdapter(adapter, configService);
            await testAdapter.runTests(
                Uri.file(myTestPath),
                [],
                TestRunProfileKind.Run,
                testRunMock.object,
                execFactoryStub.object,
                debugLauncher.object,
            );
            // wait for server to start to keep test from failing
            await deferredStartTestIdsNamedPipe.promise;
        });
        test(`Adapter ${adapter}: token called mid-debug resolves correctly`, async () => {
            // mock test run and cancelation token
            const testRunMock = typeMoq.Mock.ofType<TestRun>();
            const cancellationToken = new CancellationTokenSource();
            const { token } = cancellationToken;
            testRunMock.setup((t) => t.token).returns(() => token);

            // run result pipe mocking and the related server close dispose
            let deferredTillServerCloseTester: Deferred<void> | undefined;

            // // mock exec service and exec factory
            execServiceStub
                .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
                .returns(() => {
                    cancellationToken.cancel();
                    return {
                        proc: mockProc as any,
                        out: typeMoq.Mock.ofType<Observable<Output<string>>>().object,
                        dispose: () => {
                            /* no-body */
                        },
                    };
                });
            execFactoryStub
                .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
                .returns(() => Promise.resolve(execServiceStub.object));
            execFactoryStub.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
            execServiceStub.setup((p) => ((p as unknown) as any).then).returns(() => undefined);

            // test ids named pipe mocking
            const deferredStartTestIdsNamedPipe = createDeferred();
            utilsWriteTestIdsFileStub.callsFake(() => {
                deferredStartTestIdsNamedPipe.resolve();
                return Promise.resolve('named-pipe');
            });

            utilsStartRunResultNamedPipe.callsFake((_callback, deferredTillServerClose, _token) => {
                deferredTillServerCloseTester = deferredTillServerClose;
                token?.onCancellationRequested(() => {
                    deferredTillServerCloseTester?.resolve();
                });
                return Promise.resolve('named-pipes-socket-name');
            });
            serverDisposeStub.callsFake(() => {
                console.log('server disposed');
                if (deferredTillServerCloseTester) {
                    deferredTillServerCloseTester.resolve();
                } else {
                    console.log('deferredTillServerCloseTester is undefined');
                    throw new Error(
                        'deferredTillServerCloseTester is undefined, should be defined from startRunResultNamedPipe',
                    );
                }
            });

            // debugLauncher mocked
            debugLauncher
                .setup((dl) => dl.launchDebugger(typeMoq.It.isAny(), typeMoq.It.isAny(), typeMoq.It.isAny()))
                .callback((_options, callback) => {
                    if (callback) {
                        callback();
                    }
                })
                .returns(async () => {
                    cancellationToken.cancel();
                    return Promise.resolve();
                });

            // define adapter and run tests
            const testAdapter = createAdapter(adapter, configService);
            await testAdapter.runTests(
                Uri.file(myTestPath),
                [],
                TestRunProfileKind.Debug,
                testRunMock.object,
                execFactoryStub.object,
                debugLauncher.object,
            );
            // wait for server to start to keep test from failing
            await deferredStartTestIdsNamedPipe.promise;
        });
    });
});

// Helper function to create an adapter based on the specified type
function createAdapter(
    adapterType: string,
    configService: IConfigurationService,
): PytestTestExecutionAdapter | UnittestTestExecutionAdapter {
    if (adapterType === 'pytest') return new PytestTestExecutionAdapter(configService);
    if (adapterType === 'unittest') return new UnittestTestExecutionAdapter(configService);
    throw Error('un-compatible adapter type');
}
