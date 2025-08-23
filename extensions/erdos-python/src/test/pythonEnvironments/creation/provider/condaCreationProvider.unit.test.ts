// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { assert, use as chaiUse } from 'chai';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { CancellationToken, ProgressOptions, Uri } from 'vscode';
import { CreateEnvironmentProgress } from '../../../../client/pythonEnvironments/creation/types';
import { condaCreationProvider } from '../../../../client/pythonEnvironments/creation/provider/condaCreationProvider';
import * as wsSelect from '../../../../client/pythonEnvironments/creation/common/workspaceSelection';
import * as windowApis from '../../../../client/common/vscodeApis/windowApis';
import * as condaUtils from '../../../../client/pythonEnvironments/creation/provider/condaUtils';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../../constants';
import * as rawProcessApis from '../../../../client/common/process/rawProcessApis';
import { Output } from '../../../../client/common/process/types';
import { createDeferred } from '../../../../client/common/utils/async';
import * as commonUtils from '../../../../client/pythonEnvironments/creation/common/commonUtils';
import { CONDA_ENV_CREATED_MARKER } from '../../../../client/pythonEnvironments/creation/provider/condaProgressAndTelemetry';
import { CreateEnv } from '../../../../client/common/utils/localize';
import {
    CreateEnvironmentProvider,
    CreateEnvironmentResult,
} from '../../../../client/pythonEnvironments/creation/proposed.createEnvApis';

chaiUse(chaiAsPromised.default);

suite('Conda Creation provider tests', () => {
    let condaProvider: CreateEnvironmentProvider;
    let progressMock: typemoq.IMock<CreateEnvironmentProgress>;
    let getCondaBaseEnvStub: sinon.SinonStub;
    let pickPythonVersionStub: sinon.SinonStub;
    let pickWorkspaceFolderStub: sinon.SinonStub;
    let execObservableStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    let showErrorMessageWithLogsStub: sinon.SinonStub;
    let pickExistingCondaActionStub: sinon.SinonStub;
    let getPrefixCondaEnvPathStub: sinon.SinonStub;

    setup(() => {
        pickWorkspaceFolderStub = sinon.stub(wsSelect, 'pickWorkspaceFolder');
        getCondaBaseEnvStub = sinon.stub(condaUtils, 'getCondaBaseEnv');
        pickPythonVersionStub = sinon.stub(condaUtils, 'pickPythonVersion');
        execObservableStub = sinon.stub(rawProcessApis, 'execObservable');
        withProgressStub = sinon.stub(windowApis, 'withProgress');

        showErrorMessageWithLogsStub = sinon.stub(commonUtils, 'showErrorMessageWithLogs');
        showErrorMessageWithLogsStub.resolves();

        pickExistingCondaActionStub = sinon.stub(condaUtils, 'pickExistingCondaAction');
        pickExistingCondaActionStub.resolves(condaUtils.ExistingCondaAction.Create);

        getPrefixCondaEnvPathStub = sinon.stub(commonUtils, 'getPrefixCondaEnvPath');

        progressMock = typemoq.Mock.ofType<CreateEnvironmentProgress>();
        condaProvider = condaCreationProvider();
    });

    teardown(() => {
        sinon.restore();
    });

    test('No conda installed', async () => {
        getCondaBaseEnvStub.resolves(undefined);

        assert.isUndefined(await condaProvider.createEnvironment());
    });

    test('No workspace selected', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        pickWorkspaceFolderStub.resolves(undefined);

        await assert.isRejected(condaProvider.createEnvironment());
    });

    test('No python version picked selected', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        pickWorkspaceFolderStub.resolves({
            uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
            name: 'workspace1',
            index: 0,
        });
        pickPythonVersionStub.resolves(undefined);

        await assert.isRejected(condaProvider.createEnvironment());
        assert.isTrue(pickExistingCondaActionStub.calledOnce);
    });

    test('Create conda environment', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        const workspace1 = {
            uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
            name: 'workspace1',
            index: 0,
        };
        pickWorkspaceFolderStub.resolves(workspace1);
        pickPythonVersionStub.resolves('3.10');

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

        const promise = condaProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${CONDA_ENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();
        assert.deepStrictEqual(await promise, {
            path: 'new_environment',
            workspaceFolder: workspace1,
        });
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(pickExistingCondaActionStub.calledOnce);
    });

    test('Create conda environment failed', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        pickWorkspaceFolderStub.resolves({
            uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
            name: 'workspace1',
            index: 0,
        });
        pickPythonVersionStub.resolves('3.10');

        const deferred = createDeferred();
        let _error: undefined | ((error: unknown) => void);
        let _complete: undefined | (() => void);
        execObservableStub.callsFake(() => {
            deferred.resolve();
            return {
                proc: undefined,
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

        const promise = condaProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_error);
        _error!('bad arguments');
        _complete!();
        const result = await promise;
        assert.ok(result?.error);
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
        assert.isTrue(pickExistingCondaActionStub.calledOnce);
    });

    test('Create conda environment failed (non-zero exit code)', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        const workspace1 = {
            uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
            name: 'workspace1',
            index: 0,
        };
        pickWorkspaceFolderStub.resolves(workspace1);
        pickPythonVersionStub.resolves('3.10');

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

        const promise = condaProvider.createEnvironment();
        await deferred.promise;
        assert.isDefined(_next);
        assert.isDefined(_complete);

        _next!({ out: `${CONDA_ENV_CREATED_MARKER}new_environment`, source: 'stdout' });
        _complete!();
        const result = await promise;
        assert.ok(result?.error);
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
        assert.isTrue(pickExistingCondaActionStub.calledOnce);
    });

    test('Use existing conda environment', async () => {
        getCondaBaseEnvStub.resolves('/usr/bin/conda');
        const workspace1 = {
            uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
            name: 'workspace1',
            index: 0,
        };
        pickWorkspaceFolderStub.resolves(workspace1);
        pickExistingCondaActionStub.resolves(condaUtils.ExistingCondaAction.UseExisting);
        getPrefixCondaEnvPathStub.returns('existing_environment');

        const result = await condaProvider.createEnvironment();
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
        assert.isTrue(pickPythonVersionStub.notCalled);
        assert.isTrue(execObservableStub.notCalled);
        assert.isTrue(withProgressStub.notCalled);

        assert.deepStrictEqual(result, { path: 'existing_environment', workspaceFolder: workspace1 });
    });
});
