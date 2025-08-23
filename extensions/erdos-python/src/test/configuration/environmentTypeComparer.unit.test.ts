// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { Architecture } from '../../client/common/utils/platform';
import {
    EnvironmentTypeComparer,
    EnvLocationHeuristic,
    getEnvLocationHeuristic,
} from '../../client/interpreter/configuration/environmentTypeComparer';
import { IInterpreterHelper } from '../../client/interpreter/contracts';
import { PythonEnvType } from '../../client/pythonEnvironments/base/info';
import * as pyenv from '../../client/pythonEnvironments/common/environmentManagers/pyenv';
import { EnvironmentType, PythonEnvironment } from '../../client/pythonEnvironments/info';

suite('Environment sorting', () => {
    const workspacePath = path.join('path', 'to', 'workspace');
    let interpreterHelper: IInterpreterHelper;
    let getActiveWorkspaceUriStub: sinon.SinonStub;
    let getInterpreterTypeDisplayNameStub: sinon.SinonStub;
    const preferredPyenv = path.join('path', 'to', 'preferred', 'pyenv');

    setup(() => {
        getActiveWorkspaceUriStub = sinon.stub().returns({ folderUri: { fsPath: workspacePath } });
        getInterpreterTypeDisplayNameStub = sinon.stub();

        interpreterHelper = ({
            getActiveWorkspaceUri: getActiveWorkspaceUriStub,
            getInterpreterTypeDisplayName: getInterpreterTypeDisplayNameStub,
        } as unknown) as IInterpreterHelper;
        const getActivePyenvForDirectory = sinon.stub(pyenv, 'getActivePyenvForDirectory');
        getActivePyenvForDirectory.resolves(preferredPyenv);
    });

    teardown(() => {
        sinon.restore();
    });

    type ComparisonTestCaseType = {
        title: string;
        envA: PythonEnvironment;
        envB: PythonEnvironment;
        expected: number;
    };

    const testcases: ComparisonTestCaseType[] = [
        {
            title: 'Local virtual environment should come first',
            envA: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join(workspacePath, '.venv'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.System,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: -1,
        },
        {
            title: "Non-local virtual environment should not come first when there's a local env",
            envA: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join('path', 'to', 'other', 'workspace', '.venv'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join(workspacePath, '.venv'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: "Conda environment should not come first when there's a local env",
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join(workspacePath, '.venv'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Conda base environment should come after any other conda env',
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'base',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'random-name',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Pipenv environment should come before any other conda env',
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'conda-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pipenv,
                envName: 'pipenv-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,

            expected: 1,
        },
        {
            title: 'System environment should not come first when there are global envs',
            envA: {
                envType: EnvironmentType.System,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Poetry,
                type: PythonEnvType.Virtual,
                envName: 'poetry-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Pyenv interpreter should not come first when there are global envs',
            envA: {
                envType: EnvironmentType.Pyenv,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pipenv,
                type: PythonEnvType.Virtual,
                envName: 'pipenv-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Preferred Pyenv interpreter should come before any global interpreter',
            envA: {
                envType: EnvironmentType.Pyenv,
                version: { major: 3, minor: 12, patch: 2 },
                path: preferredPyenv,
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pyenv,
                version: { major: 3, minor: 10, patch: 2 },
                path: path.join('path', 'to', 'normal', 'pyenv'),
            } as PythonEnvironment,
            expected: -1,
        },
        {
            title: 'Pyenv interpreters should come first when there are global interpreters',
            envA: {
                envType: EnvironmentType.Global,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pyenv,
                version: { major: 3, minor: 7, patch: 2 },
                path: path.join('path', 'to', 'normal', 'pyenv'),
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Global environment should not come first when there are global envs',
            envA: {
                envType: EnvironmentType.Global,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Poetry,
                type: PythonEnvType.Virtual,
                envName: 'poetry-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Microsoft Store environment should not come first when there are global envs',
            envA: {
                envType: EnvironmentType.MicrosoftStore,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.VirtualEnv,
                type: PythonEnvType.Virtual,
                envName: 'virtualenv-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title:
                'Microsoft Store interpreter should not come first when there are global interpreters with higher version',
            envA: {
                envType: EnvironmentType.MicrosoftStore,
                version: { major: 3, minor: 10, patch: 2, raw: '3.10.2' },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Global,
                version: { major: 3, minor: 11, patch: 2, raw: '3.11.2' },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Unknown environment should not come first when there are global envs',
            envA: {
                envType: EnvironmentType.Unknown,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pipenv,
                type: PythonEnvType.Virtual,
                envName: 'pipenv-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'If 2 environments are of the same type, the most recent Python version comes first',
            envA: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join(workspacePath, '.old-venv'),
                version: { major: 3, minor: 7, patch: 5, raw: '3.7.5' },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Venv,
                type: PythonEnvType.Virtual,
                envPath: path.join(workspacePath, '.venv'),
                version: { major: 3, minor: 10, patch: 2, raw: '3.10.2' },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title:
                "If 2 global environments have the same Python version and there's a Conda one, the Conda env should not come first",
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'conda-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Pipenv,
                type: PythonEnvType.Virtual,
                envName: 'pipenv-env',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title:
                'If 2 global environments are of the same type and have the same Python version, they should be sorted by name',
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'conda-foo',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envName: 'conda-bar',
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'If 2 global interpreters have the same Python version, they should be sorted by architecture',
            envA: {
                envType: EnvironmentType.Global,
                architecture: Architecture.x86,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.Global,
                architecture: Architecture.x64,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
        {
            title: 'Problematic environments should come last',
            envA: {
                envType: EnvironmentType.Conda,
                type: PythonEnvType.Conda,
                envPath: path.join(workspacePath, '.venv'),
                path: 'python',
            } as PythonEnvironment,
            envB: {
                envType: EnvironmentType.System,
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment,
            expected: 1,
        },
    ];

    testcases.forEach(({ title, envA, envB, expected }) => {
        test(title, async () => {
            const envTypeComparer = new EnvironmentTypeComparer(interpreterHelper);
            await envTypeComparer.initialize(undefined);
            const result = envTypeComparer.compare(envA, envB);

            assert.strictEqual(result, expected);
        });
    });
});

suite('getEnvTypeHeuristic tests', () => {
    const workspacePath = path.join('path', 'to', 'workspace');

    const localGlobalEnvTypes = [
        EnvironmentType.Venv,
        EnvironmentType.Conda,
        EnvironmentType.VirtualEnv,
        EnvironmentType.VirtualEnvWrapper,
        EnvironmentType.Pipenv,
        EnvironmentType.Poetry,
    ];

    localGlobalEnvTypes.forEach((envType) => {
        test('If the path to an environment starts with the workspace path it should be marked as local', () => {
            const environment = {
                envType,
                envPath: path.join(workspacePath, 'my-environment'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment;

            const envTypeHeuristic = getEnvLocationHeuristic(environment, workspacePath);

            assert.strictEqual(envTypeHeuristic, EnvLocationHeuristic.Local);
        });

        test('If the path to an environment does not start with the workspace path it should be marked as global', () => {
            const environment = {
                envType,
                envPath: path.join('path', 'to', 'my-environment'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment;

            const envTypeHeuristic = getEnvLocationHeuristic(environment, workspacePath);

            assert.strictEqual(envTypeHeuristic, EnvLocationHeuristic.Global);
        });

        test('If envPath is not set, fallback to path', () => {
            const environment = {
                envType,
                path: path.join(workspacePath, 'my-environment'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment;

            const envTypeHeuristic = getEnvLocationHeuristic(environment, workspacePath);

            assert.strictEqual(envTypeHeuristic, EnvLocationHeuristic.Local);
        });
    });

    const globalInterpretersEnvTypes = [
        EnvironmentType.System,
        EnvironmentType.MicrosoftStore,
        EnvironmentType.Global,
        EnvironmentType.Unknown,
        EnvironmentType.Pyenv,
    ];

    globalInterpretersEnvTypes.forEach((envType) => {
        test(`If the environment type is ${envType} and the environment path does not start with the workspace path it should be marked as a global interpreter`, () => {
            const environment = {
                envType,
                envPath: path.join('path', 'to', 'a', 'global', 'interpreter'),
                version: { major: 3, minor: 10, patch: 2 },
            } as PythonEnvironment;

            const envTypeHeuristic = getEnvLocationHeuristic(environment, workspacePath);

            assert.strictEqual(envTypeHeuristic, EnvLocationHeuristic.Global);
        });
    });
});
