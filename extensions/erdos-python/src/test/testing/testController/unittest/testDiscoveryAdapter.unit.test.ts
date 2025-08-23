// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from 'assert';
import * as path from 'path';
import * as typeMoq from 'typemoq';
import * as fs from 'fs';
import { CancellationTokenSource, Uri } from 'vscode';
import { Observable } from 'rxjs';
import * as sinon from 'sinon';
import { IConfigurationService } from '../../../../client/common/types';
import { EXTENSION_ROOT_DIR } from '../../../../client/constants';
import { UnittestTestDiscoveryAdapter } from '../../../../client/testing/testController/unittest/testDiscoveryAdapter';
import { Deferred, createDeferred } from '../../../../client/common/utils/async';
import { MockChildProcess } from '../../../mocks/mockChildProcess';
import * as util from '../../../../client/testing/testController/common/utils';
import {
    IPythonExecutionFactory,
    IPythonExecutionService,
    Output,
    SpawnOptions,
} from '../../../../client/common/process/types';
import * as extapi from '../../../../client/envExt/api.internal';

suite('Unittest test discovery adapter', () => {
    let configService: IConfigurationService;
    let mockProc: MockChildProcess;
    let execService: typeMoq.IMock<IPythonExecutionService>;
    let execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
    let deferred: Deferred<void>;
    let expectedExtraVariables: Record<string, string>;
    let expectedPath: string;
    let uri: Uri;
    let utilsStartDiscoveryNamedPipeStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;
    let cancellationTokenSource: CancellationTokenSource;

    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        expectedPath = path.join('/', 'new', 'cwd');
        configService = ({
            getSettings: () => ({
                testing: { unittestArgs: ['-v', '-s', '.', '-p', 'test*'] },
            }),
        } as unknown) as IConfigurationService;

        // set up exec service with child process
        mockProc = new MockChildProcess('', ['']);
        const output = new Observable<Output<string>>(() => {
            /* no op */
        });
        execService = typeMoq.Mock.ofType<IPythonExecutionService>();
        execService
            .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                console.log('execObservable is returning');
                return {
                    proc: mockProc as any,
                    out: output,
                    dispose: () => {
                        /* no-body */
                    },
                };
            });
        execService.setup((x) => x.getExecutablePath()).returns(() => Promise.resolve('/mock/path/to/python'));
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        deferred = createDeferred();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => Promise.resolve(execService.object));
        execFactory.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        execService.setup((p) => ((p as unknown) as any).then).returns(() => undefined);

        // constants
        expectedPath = path.join('/', 'my', 'test', 'path');
        uri = Uri.file(expectedPath);
        expectedExtraVariables = {
            TEST_RUN_PIPE: 'discoveryResultPipe-mockName',
        };

        utilsStartDiscoveryNamedPipeStub = sinon.stub(util, 'startDiscoveryNamedPipe');
        utilsStartDiscoveryNamedPipeStub.callsFake(() => Promise.resolve('discoveryResultPipe-mockName'));
        cancellationTokenSource = new CancellationTokenSource();
    });
    teardown(() => {
        sinon.restore();
        cancellationTokenSource.dispose();
    });

    test('DiscoverTests should send the discovery command to the test server with the correct args', async () => {
        const adapter = new UnittestTestDiscoveryAdapter(configService);
        adapter.discoverTests(uri, execFactory.object);
        const script = path.join(EXTENSION_ROOT_DIR, 'python_files', 'unittestadapter', 'discovery.py');
        const argsExpected = [script, '--udiscovery', '-v', '-s', '.', '-p', 'test*'];

        // must await until the execObservable is called in order to verify it
        await deferred.promise;

        execService.verify(
            (x) =>
                x.execObservable(
                    typeMoq.It.is<Array<string>>((argsActual) => {
                        try {
                            assert.equal(argsActual.length, argsExpected.length);
                            assert.deepEqual(argsActual, argsExpected);
                            return true;
                        } catch (e) {
                            console.error(e);
                            throw e;
                        }
                    }),
                    typeMoq.It.is<SpawnOptions>((options) => {
                        try {
                            assert.deepEqual(options.env, expectedExtraVariables);
                            assert.equal(options.cwd, expectedPath);
                            assert.equal(options.throwOnStdErr, true);
                            return true;
                        } catch (e) {
                            console.error(e);
                            throw e;
                        }
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('DiscoverTests should respect settings.testings.cwd when present', async () => {
        const expectedNewPath = path.join('/', 'new', 'cwd');
        configService = ({
            getSettings: () => ({
                testing: { unittestArgs: ['-v', '-s', '.', '-p', 'test*'], cwd: expectedNewPath.toString() },
            }),
        } as unknown) as IConfigurationService;
        const adapter = new UnittestTestDiscoveryAdapter(configService);
        adapter.discoverTests(uri, execFactory.object);
        const script = path.join(EXTENSION_ROOT_DIR, 'python_files', 'unittestadapter', 'discovery.py');
        const argsExpected = [script, '--udiscovery', '-v', '-s', '.', '-p', 'test*'];

        // must await until the execObservable is called in order to verify it
        await deferred.promise;

        execService.verify(
            (x) =>
                x.execObservable(
                    typeMoq.It.is<Array<string>>((argsActual) => {
                        try {
                            assert.equal(argsActual.length, argsExpected.length);
                            assert.deepEqual(argsActual, argsExpected);
                            return true;
                        } catch (e) {
                            console.error(e);
                            throw e;
                        }
                    }),
                    typeMoq.It.is<SpawnOptions>((options) => {
                        try {
                            assert.deepEqual(options.env, expectedExtraVariables);
                            assert.equal(options.cwd, expectedNewPath);
                            assert.equal(options.throwOnStdErr, true);
                            return true;
                        } catch (e) {
                            console.error(e);
                            throw e;
                        }
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('Test discovery canceled before exec observable call finishes', async () => {
        // set up exec mock
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => Promise.resolve(execService.object));

        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => false,
                } as fs.Stats),
        );
        sinon.stub(fs.promises, 'realpath').callsFake(async (pathEntered) => pathEntered.toString());

        const adapter = new UnittestTestDiscoveryAdapter(configService);
        const discoveryPromise = adapter.discoverTests(uri, execFactory.object, cancellationTokenSource.token);

        // Trigger cancellation before exec observable call finishes
        cancellationTokenSource.cancel();

        await discoveryPromise;

        assert.ok(
            true,
            'Test resolves correctly when triggering a cancellation token immediately after starting discovery.',
        );
    });

    test('Test discovery cancelled while exec observable is running and proc is closed', async () => {
        //
        const execService2 = typeMoq.Mock.ofType<IPythonExecutionService>();
        execService2.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        execService2
            .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => {
                // Trigger cancellation while exec observable is running
                cancellationTokenSource.cancel();
                return {
                    proc: mockProc as any,
                    out: new Observable<Output<string>>(),
                    dispose: () => {
                        /* no-body */
                    },
                };
            });
        // set up exec mock
        deferred = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve(execService2.object);
            });

        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => false,
                } as fs.Stats),
        );
        sinon.stub(fs.promises, 'realpath').callsFake(async (pathEntered) => pathEntered.toString());

        const adapter = new UnittestTestDiscoveryAdapter(configService);
        const discoveryPromise = adapter.discoverTests(uri, execFactory.object, cancellationTokenSource.token);

        // add in await and trigger
        await discoveryPromise;
        assert.ok(true, 'Test resolves correctly when triggering a cancellation token in exec observable.');
    });
});
