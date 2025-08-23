// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import * as sinon from 'sinon';
import { CancellationToken, ProgressOptions, Uri } from 'vscode';
import { CreateEnvironmentProgress } from '../../../../client/pythonEnvironments/creation/types';
import { VenvCreationProvider } from '../../../../client/pythonEnvironments/creation/provider/venvCreationProvider';
import { IInterpreterQuickPick } from '../../../../client/interpreter/configuration/types';
import * as wsSelect from '../../../../client/pythonEnvironments/creation/common/workspaceSelection';
import * as windowApis from '../../../../client/common/vscodeApis/windowApis';
import * as rawProcessApis from '../../../../client/common/process/rawProcessApis';
import * as commonUtils from '../../../../client/pythonEnvironments/creation/common/commonUtils';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../../constants';
import { createDeferred } from '../../../../client/common/utils/async';
import { Output, SpawnOptions } from '../../../../client/common/process/types';
import { VENV_CREATED_MARKER } from '../../../../client/pythonEnvironments/creation/provider/venvProgressAndTelemetry';
import { CreateEnv } from '../../../../client/common/utils/localize';
import * as venvUtils from '../../../../client/pythonEnvironments/creation/provider/venvUtils';
import {
    CreateEnvironmentProvider,
    CreateEnvironmentResult,
} from '../../../../client/pythonEnvironments/creation/proposed.createEnvApis';

chaiUse(chaiAsPromised.default);

suite('venv Creation provider tests', () => {
    let venvProvider: CreateEnvironmentProvider;
    let pickWorkspaceFolderStub: sinon.SinonStub;
    let interpreterQuickPick: typemoq.IMock<IInterpreterQuickPick>;
    let progressMock: typemoq.IMock<CreateEnvironmentProgress>;
    let execObservableStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    let showErrorMessageWithLogsStub: sinon.SinonStub;
    let pickPackagesToInstallStub: sinon.SinonStub;
    let pickExistingVenvActionStub: sinon.SinonStub;
    let deleteEnvironmentStub: sinon.SinonStub;

    const workspace1 = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        pickExistingVenvActionStub = sinon.stub(venvUtils, 'pickExistingVenvAction');
        deleteEnvironmentStub = sinon.stub(venvUtils, 'deleteEnvironment');
        pickWorkspaceFolderStub = sinon.stub(wsSelect, 'pickWorkspaceFolder');
        execObservableStub = sinon.stub(rawProcessApis, 'execObservable');
        interpreterQuickPick = typemoq.Mock.ofType<IInterpreterQuickPick>();
        withProgressStub = sinon.stub(windowApis, 'withProgress');
        pickPackagesToInstallStub = sinon.stub(venvUtils, 'pickPackagesToInstall');

        showErrorMessageWithLogsStub = sinon.stub(commonUtils, 'showErrorMessageWithLogs');
        showErrorMessageWithLogsStub.resolves();

        progressMock = typemoq.Mock.ofType<CreateEnvironmentProgress>();
        venvProvider = new VenvCreationProvider(interpreterQuickPick.object);

        pickExistingVenvActionStub.resolves(venvUtils.ExistingVenvAction.Create);
        deleteEnvironmentStub.resolves(true);
    });

    teardown(() => {
        sinon.restore();
    });

    test('No workspace selected', async () => {
        pickWorkspaceFolderStub.resolves(undefined);
        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny()))
            .verifiable(typemoq.Times.never());

        await assert.isRejected(venvProvider.createEnvironment());
        assert.isTrue(pickWorkspaceFolderStub.calledOnce);
        interpreterQuickPick.verifyAll();
        assert.isTrue(pickPackagesToInstallStub.notCalled);
        assert.isTrue(pickExistingVenvActionStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('No Python selected', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve(undefined))
            .verifiable(typemoq.Times.once());

        await assert.isRejected(venvProvider.createEnvironment());

        assert.isTrue(pickWorkspaceFolderStub.calledOnce);
        interpreterQuickPick.verifyAll();
        assert.isTrue(pickPackagesToInstallStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('User pressed Esc while selecting dependencies', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves(undefined);

        await assert.isRejected(venvProvider.createEnvironment());
        assert.isTrue(pickPackagesToInstallStub.calledOnce);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('Create venv with python selected by user no packages selected', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves([]);

        const deferred = createDeferred();
        let _next: undefined | ((value: Output<string>) => void);
        let _complete: undefined | (() => void);
        execObservableStub.callsFake(() => {
            deferred.resolve();
            return {
                proc: {
                    exitCode: 0,
                },
                out: {
                    subscribe: (
                        next?: (value: Output<string>) => void,
                        _error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _next = next;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${VENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();

        const actual = await promise;
        assert.deepStrictEqual(actual, {
            path: 'new_environment',
            workspaceFolder: workspace1,
        });
        interpreterQuickPick.verifyAll();
        progressMock.verifyAll();
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('Create venv failed', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves([]);

        const deferred = createDeferred();
        let _error: undefined | ((error: unknown) => void);
        let _complete: undefined | (() => void);
        execObservableStub.callsFake(() => {
            deferred.resolve();
            return {
                proc: {
                    exitCode: 0,
                },
                out: {
                    subscribe: (
                        _next?: (value: Output<string>) => void,
                        // eslint-disable-next-line no-shadow
                        error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _error = error;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_error);
        _error!('bad arguments');
        _complete!();
        const result = await promise;
        assert.ok(result?.error);
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('Create venv failed (non-zero exit code)', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves([]);

        const deferred = createDeferred();
        let _next: undefined | ((value: Output<string>) => void);
        let _complete: undefined | (() => void);
        execObservableStub.callsFake(() => {
            deferred.resolve();
            return {
                proc: {
                    exitCode: 1,
                },
                out: {
                    subscribe: (
                        next?: (value: Output<string>) => void,
                        _error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _next = next;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${VENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();
        const result = await promise;
        assert.ok(result?.error);
        interpreterQuickPick.verifyAll();
        progressMock.verifyAll();
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('Create venv with pre-existing .venv, user selects re-create', async () => {
        pickExistingVenvActionStub.resolves(venvUtils.ExistingVenvAction.Recreate);
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves([]);

        const deferred = createDeferred();
        let _next: undefined | ((value: Output<string>) => void);
        let _complete: undefined | (() => void);
        execObservableStub.callsFake(() => {
            deferred.resolve();
            return {
                proc: {
                    exitCode: 0,
                },
                out: {
                    subscribe: (
                        next?: (value: Output<string>) => void,
                        _error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _next = next;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${VENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();

        const actual = await promise;
        assert.deepStrictEqual(actual, {
            path: 'new_environment',
            workspaceFolder: workspace1,
        });
        interpreterQuickPick.verifyAll();
        progressMock.verifyAll();
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.calledOnce);
    });

    test('Create venv with pre-existing .venv, user selects re-create, delete env failed', async () => {
        pickExistingVenvActionStub.resolves(venvUtils.ExistingVenvAction.Recreate);
        pickWorkspaceFolderStub.resolves(workspace1);
        deleteEnvironmentStub.resolves(false);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        pickPackagesToInstallStub.resolves([]);

        await assert.isRejected(venvProvider.createEnvironment());

        interpreterQuickPick.verifyAll();
        assert.isTrue(withProgressStub.notCalled);
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.calledOnce);
    });

    test('Create venv with pre-existing .venv, user selects use existing', async () => {
        pickExistingVenvActionStub.resolves(venvUtils.ExistingVenvAction.UseExisting);
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.never());

        pickPackagesToInstallStub.resolves([]);

        interpreterQuickPick.verifyAll();
        assert.isTrue(withProgressStub.notCalled);
        assert.isTrue(pickPackagesToInstallStub.notCalled);
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
    });

    test('Create venv with 1000 requirement files', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        const requirements = Array.from({ length: 1000 }, (_, i) => ({
            installType: 'requirements',
            installItem: `requirements${i}.txt`,
        }));
        pickPackagesToInstallStub.resolves(requirements);
        const expected = JSON.stringify({ requirements: requirements.map((r) => r.installItem) });

        const deferred = createDeferred();
        let _next: undefined | ((value: Output<string>) => void);
        let _complete: undefined | (() => void);
        let stdin: undefined | string;
        let hasStdinArg = false;
        execObservableStub.callsFake((_c, argv: string[], options) => {
            stdin = options?.stdinStr;
            hasStdinArg = argv.includes('--stdin');
            deferred.resolve();
            return {
                proc: {
                    exitCode: 0,
                },
                out: {
                    subscribe: (
                        next?: (value: Output<string>) => void,
                        _error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _next = next;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${VENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();

        const actual = await promise;
        assert.deepStrictEqual(actual, {
            path: 'new_environment',
            workspaceFolder: workspace1,
        });
        interpreterQuickPick.verifyAll();
        progressMock.verifyAll();
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
        assert.strictEqual(stdin, expected);
        assert.isTrue(hasStdinArg);
    });

    test('Create venv with 5 requirement files', async () => {
        pickWorkspaceFolderStub.resolves(workspace1);

        interpreterQuickPick
            .setup((i) => i.getInterpreterViaQuickPick(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .returns(() => Promise.resolve('/usr/bin/python'))
            .verifiable(typemoq.Times.once());

        const requirements = Array.from({ length: 5 }, (_, i) => ({
            installType: 'requirements',
            installItem: `requirements${i}.txt`,
        }));
        pickPackagesToInstallStub.resolves(requirements);
        const expectedRequirements = requirements.map((r) => r.installItem).sort();

        const deferred = createDeferred();
        let _next: undefined | ((value: Output<string>) => void);
        let _complete: undefined | (() => void);
        let stdin: undefined | string;
        let hasStdinArg = false;
        let actualRequirements: string[] = [];
        execObservableStub.callsFake((_c, argv: string[], options: SpawnOptions) => {
            stdin = options?.stdinStr;
            actualRequirements = argv.filter((arg) => arg.startsWith('requirements')).sort();
            hasStdinArg = argv.includes('--stdin');
            deferred.resolve();
            return {
                proc: {
                    exitCode: 0,
                },
                out: {
                    subscribe: (
                        next?: (value: Output<string>) => void,
                        _error?: (error: unknown) => void,
                        complete?: () => void,
                    ) => {
                        _next = next;
                        _complete = complete;
                    },
                },
                dispose: () => undefined,
            };
        });

        progressMock.setup((p) => p.report({ message: CreateEnv.statusStarting })).verifiable(typemoq.Times.once());

        withProgressStub.callsFake(
            (
                _options: ProgressOptions,
                task: (
                    progress: CreateEnvironmentProgress,
                    token?: CancellationToken,
                ) => Thenable<CreateEnvironmentResult>,
            ) => task(progressMock.object),
        );

        const promise = venvProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${VENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();

        const actual = await promise;
        assert.deepStrictEqual(actual, {
            path: 'new_environment',
            workspaceFolder: workspace1,
        });
        interpreterQuickPick.verifyAll();
        progressMock.verifyAll();
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(deleteEnvironmentStub.notCalled);
        assert.isUndefined(stdin);
        assert.deepStrictEqual(actualRequirements, expectedRequirements);
        assert.isFalse(hasStdinArg);
    });
});
