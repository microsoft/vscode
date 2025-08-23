/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as assert from 'assert';
import { Uri, CancellationTokenSource } from 'vscode';
import * as typeMoq from 'typemoq';
import * as path from 'path';
import { Observable } from 'rxjs/Observable';
import * as fs from 'fs';
import * as sinon from 'sinon';
import { IConfigurationService } from '../../../../client/common/types';
import { PytestTestDiscoveryAdapter } from '../../../../client/testing/testController/pytest/pytestDiscoveryAdapter';
import {
    IPythonExecutionFactory,
    IPythonExecutionService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    SpawnOptions,
    Output,
} from '../../../../client/common/process/types';
import { EXTENSION_ROOT_DIR } from '../../../../client/constants';
import { MockChildProcess } from '../../../mocks/mockChildProcess';
import { Deferred, createDeferred } from '../../../../client/common/utils/async';
import * as util from '../../../../client/testing/testController/common/utils';
import * as extapi from '../../../../client/envExt/api.internal';

suite('pytest test discovery adapter', () => {
    let configService: IConfigurationService;
    let execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
    let adapter: PytestTestDiscoveryAdapter;
    let execService: typeMoq.IMock<IPythonExecutionService>;
    let deferred: Deferred<void>;
    let expectedPath: string;
    let uri: Uri;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let expectedExtraVariables: Record<string, string>;
    let mockProc: MockChildProcess;
    let deferred2: Deferred<void>;
    let utilsStartDiscoveryNamedPipeStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;
    let cancellationTokenSource: CancellationTokenSource;

    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        const mockExtensionRootDir = typeMoq.Mock.ofType<string>();
        mockExtensionRootDir.setup((m) => m.toString()).returns(() => '/mocked/extension/root/dir');

        utilsStartDiscoveryNamedPipeStub = sinon.stub(util, 'startDiscoveryNamedPipe');
        utilsStartDiscoveryNamedPipeStub.callsFake(() => Promise.resolve('discoveryResultPipe-mockName'));

        // constants
        expectedPath = path.join('/', 'my', 'test', 'path');
        uri = Uri.file(expectedPath);
        const relativePathToPytest = 'python_files';
        const fullPluginPath = path.join(EXTENSION_ROOT_DIR, relativePathToPytest);
        expectedExtraVariables = {
            PYTHONPATH: fullPluginPath,
            TEST_RUN_PIPE: 'discoveryResultPipe-mockName',
        };

        // set up config service
        configService = ({
            getSettings: () => ({
                testing: { pytestArgs: ['.'] },
            }),
        } as unknown) as IConfigurationService;

        // set up exec service with child process
        mockProc = new MockChildProcess('', ['']);
        execService = typeMoq.Mock.ofType<IPythonExecutionService>();
        execService.setup((p) => ((p as unknown) as any).then).returns(() => undefined);
        execService.setup((x) => x.getExecutablePath()).returns(() => Promise.resolve('/mock/path/to/python'));

        const output = new Observable<Output<string>>(() => {
            /* no op */
        });
        deferred2 = createDeferred();
        execService
            .setup((x) => x.execObservable(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => {
                deferred2.resolve();
                return {
                    proc: mockProc as any,
                    out: output,
                    dispose: () => {
                        /* no-body */
                    },
                };
            });

        cancellationTokenSource = new CancellationTokenSource();
    });
    teardown(() => {
        sinon.restore();
        cancellationTokenSource.dispose();
    });
    test('Discovery should call exec with correct basic args', async () => {
        // set up exec mock
        deferred = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve(execService.object);
            });

        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => false,
                } as fs.Stats),
        );
        sinon.stub(fs.promises, 'realpath').callsFake(async (pathEntered) => pathEntered.toString());

        adapter = new PytestTestDiscoveryAdapter(configService);
        adapter.discoverTests(uri, execFactory.object);
        // add in await and trigger
        await deferred.promise;
        await deferred2.promise;
        mockProc.trigger('close');

        // verification
        execService.verify(
            (x) =>
                x.execObservable(
                    typeMoq.It.isAny(),
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
    test('Test discovery correctly pulls pytest args from config service settings', async () => {
        // set up a config service with different pytest args
        const expectedPathNew = path.join('other', 'path');
        const configServiceNew: IConfigurationService = ({
            getSettings: () => ({
                testing: {
                    pytestArgs: ['.', 'abc', 'xyz'],
                    cwd: expectedPathNew,
                },
            }),
        } as unknown) as IConfigurationService;

        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => false,
                } as fs.Stats),
        );
        sinon.stub(fs.promises, 'realpath').callsFake(async (pathEntered) => pathEntered.toString());

        // set up exec mock
        deferred = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve(execService.object);
            });

        adapter = new PytestTestDiscoveryAdapter(configServiceNew);
        adapter.discoverTests(uri, execFactory.object);
        // add in await and trigger
        await deferred.promise;
        await deferred2.promise;
        mockProc.trigger('close');

        // verification

        const expectedArgs = [
            '-m',
            'pytest',
            '-p',
            'vscode_pytest',
            '--collect-only',
            '.',
            'abc',
            'xyz',
            `--rootdir=${expectedPathNew}`,
        ];
        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.deepEqual(options.env, expectedExtraVariables);
                        assert.equal(options.cwd, expectedPathNew);
                        assert.equal(options.throwOnStdErr, true);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('Test discovery adds cwd to pytest args when path is symlink', async () => {
        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => true,
                } as fs.Stats),
        );
        sinon.stub(fs.promises, 'realpath').callsFake(async (pathEntered) => pathEntered.toString());

        // set up a config service with different pytest args
        const configServiceNew: IConfigurationService = ({
            getSettings: () => ({
                testing: {
                    pytestArgs: ['.', 'abc', 'xyz'],
                    cwd: expectedPath,
                },
            }),
        } as unknown) as IConfigurationService;

        // set up exec mock
        deferred = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve(execService.object);
            });

        adapter = new PytestTestDiscoveryAdapter(configServiceNew);
        adapter.discoverTests(uri, execFactory.object);
        // add in await and trigger
        await deferred.promise;
        await deferred2.promise;
        mockProc.trigger('close');

        // verification
        const expectedArgs = [
            '-m',
            'pytest',
            '-p',
            'vscode_pytest',
            '--collect-only',
            '.',
            'abc',
            'xyz',
            `--rootdir=${expectedPath}`,
        ];
        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.deepEqual(options.env, expectedExtraVariables);
                        assert.equal(options.cwd, expectedPath);
                        assert.equal(options.throwOnStdErr, true);
                        return true;
                    }),
                ),
            typeMoq.Times.once(),
        );
    });
    test('Test discovery adds cwd to pytest args when path parent is symlink', async () => {
        let counter = 0;
        sinon.stub(fs.promises, 'lstat').callsFake(
            async () =>
                ({
                    isFile: () => true,
                    isSymbolicLink: () => {
                        counter = counter + 1;
                        return counter > 2;
                    },
                } as fs.Stats),
        );

        sinon.stub(fs.promises, 'realpath').callsFake(async () => 'diff value');

        // set up a config service with different pytest args
        const configServiceNew: IConfigurationService = ({
            getSettings: () => ({
                testing: {
                    pytestArgs: ['.', 'abc', 'xyz'],
                    cwd: expectedPath,
                },
            }),
        } as unknown) as IConfigurationService;

        // set up exec mock
        deferred = createDeferred();
        execFactory = typeMoq.Mock.ofType<IPythonExecutionFactory>();
        execFactory
            .setup((x) => x.createActivatedEnvironment(typeMoq.It.isAny()))
            .returns(() => {
                deferred.resolve();
                return Promise.resolve(execService.object);
            });

        adapter = new PytestTestDiscoveryAdapter(configServiceNew);
        adapter.discoverTests(uri, execFactory.object);
        // add in await and trigger
        await deferred.promise;
        await deferred2.promise;
        mockProc.trigger('close');

        // verification
        const expectedArgs = [
            '-m',
            'pytest',
            '-p',
            'vscode_pytest',
            '--collect-only',
            '.',
            'abc',
            'xyz',
            `--rootdir=${expectedPath}`,
        ];
        execService.verify(
            (x) =>
                x.execObservable(
                    expectedArgs,
                    typeMoq.It.is<SpawnOptions>((options) => {
                        assert.deepEqual(options.env, expectedExtraVariables);
                        assert.equal(options.cwd, expectedPath);
                        assert.equal(options.throwOnStdErr, true);
                        return true;
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

        adapter = new PytestTestDiscoveryAdapter(configService);
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

        adapter = new PytestTestDiscoveryAdapter(configService);
        const discoveryPromise = adapter.discoverTests(uri, execFactory.object, cancellationTokenSource.token);

        // add in await and trigger
        await discoveryPromise;
        assert.ok(true, 'Test resolves correctly when triggering a cancellation token in exec observable.');
    });
});
