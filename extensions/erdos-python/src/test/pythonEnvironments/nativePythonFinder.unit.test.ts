// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { WorkspaceConfiguration } from 'vscode';
import {
    getNativePythonFinder,
    isNativeEnvInfo,
    NativeEnvInfo,
    NativePythonFinder,
} from '../../client/pythonEnvironments/base/locators/common/nativePythonFinder';
import * as windowsApis from '../../client/common/vscodeApis/windowApis';
import { MockOutputChannel } from '../mockClasses';
import * as workspaceApis from '../../client/common/vscodeApis/workspaceApis';

suite('Native Python Finder', () => {
    let finder: NativePythonFinder;
    let createLogOutputChannelStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;
    let configMock: typemoq.IMock<WorkspaceConfiguration>;
    let getWorkspaceFolderPathsStub: sinon.SinonStub;

    setup(() => {
        createLogOutputChannelStub = sinon.stub(windowsApis, 'createLogOutputChannel');
        createLogOutputChannelStub.returns(new MockOutputChannel('locator'));

        getWorkspaceFolderPathsStub = sinon.stub(workspaceApis, 'getWorkspaceFolderPaths');
        getWorkspaceFolderPathsStub.returns([]);

        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
        configMock = typemoq.Mock.ofType<WorkspaceConfiguration>();
        configMock.setup((c) => c.get<string>('venvPath')).returns(() => undefined);
        configMock.setup((c) => c.get<string[]>('venvFolders')).returns(() => []);
        configMock.setup((c) => c.get<string>('condaPath')).returns(() => '');
        configMock.setup((c) => c.get<string>('poetryPath')).returns(() => '');
        getConfigurationStub.returns(configMock.object);

        finder = getNativePythonFinder();
    });

    teardown(() => {
        sinon.restore();
    });

    suiteTeardown(() => {
        finder.dispose();
    });

    test('Refresh should return python environments', async () => {
        const envs = [];
        for await (const env of finder.refresh()) {
            envs.push(env);
        }

        // typically all test envs should have at least one environment
        assert.isNotEmpty(envs);
    });

    test('Resolve should return python environments with version', async () => {
        const envs = [];
        for await (const env of finder.refresh()) {
            envs.push(env);
        }

        // typically all test envs should have at least one environment
        assert.isNotEmpty(envs);

        // pick and env without version
        const env: NativeEnvInfo | undefined = envs
            .filter((e) => isNativeEnvInfo(e))
            .find((e) => e.version && e.version.length > 0 && (e.executable || (e as NativeEnvInfo).prefix));

        if (env) {
            env.version = undefined;
        } else {
            assert.fail('Expected at least one env with valid version');
        }

        const envPath = env.executable ?? env.prefix;
        if (envPath) {
            const resolved = await finder.resolve(envPath);
            assert.isString(resolved.version, 'Version must be a string');
            assert.isTrue((resolved?.version?.length ?? 0) > 0, 'Version must not be empty');
        } else {
            assert.fail('Expected either executable or prefix to be defined');
        }
    });
});
