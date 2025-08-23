// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as typemoq from 'typemoq';
import * as sinon from 'sinon';
import { assert, expect } from 'chai';
import { Uri, EventEmitter, ConfigurationTarget, WorkspaceFolder } from 'vscode';
import { cloneDeep } from 'lodash';
import {
    IConfigurationService,
    IDisposableRegistry,
    IExtensions,
    IInterpreterPathService,
    IPythonSettings,
    Resource,
} from '../client/common/types';
import { IServiceContainer } from '../client/ioc/types';
import {
    buildEnvironmentApi,
    convertCompleteEnvInfo,
    convertEnvInfo,
    EnvironmentReference,
    reportActiveInterpreterChanged,
} from '../client/environmentApi';
import { IDiscoveryAPI, ProgressNotificationEvent } from '../client/pythonEnvironments/base/locator';
import { buildEnvInfo } from '../client/pythonEnvironments/base/info/env';
import { sleep } from './core';
import { PythonEnvKind, PythonEnvSource } from '../client/pythonEnvironments/base/info';
import { Architecture } from '../client/common/utils/platform';
import { PythonEnvCollectionChangedEvent } from '../client/pythonEnvironments/base/watcher';
import { normCasePath } from '../client/common/platform/fs-paths';
import { IWorkspaceService } from '../client/common/application/types';
import { IEnvironmentVariablesProvider } from '../client/common/variables/types';
import * as workspaceApis from '../client/common/vscodeApis/workspaceApis';
import {
    ActiveEnvironmentPathChangeEvent,
    EnvironmentVariablesChangeEvent,
    EnvironmentsChangeEvent,
    PythonExtension,
} from '../client/api/types';
import { JupyterPythonEnvironmentApi } from '../client/jupyter/jupyterIntegration';

suite('Python Environment API', () => {
    const workspacePath = 'path/to/workspace';
    const workspaceFolder = {
        name: 'workspace',
        uri: Uri.file(workspacePath),
        index: 0,
    };
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let discoverAPI: typemoq.IMock<IDiscoveryAPI>;
    let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
    let configService: typemoq.IMock<IConfigurationService>;
    let extensions: typemoq.IMock<IExtensions>;
    let workspaceService: typemoq.IMock<IWorkspaceService>;
    let envVarsProvider: typemoq.IMock<IEnvironmentVariablesProvider>;
    let onDidChangeRefreshState: EventEmitter<ProgressNotificationEvent>;
    let onDidChangeEnvironments: EventEmitter<PythonEnvCollectionChangedEvent>;
    let onDidChangeEnvironmentVariables: EventEmitter<Uri | undefined>;

    let environmentApi: PythonExtension['environments'];

    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        sinon.stub(workspaceApis, 'getWorkspaceFolders').returns([workspaceFolder]);
        sinon.stub(workspaceApis, 'getWorkspaceFolder').callsFake((resource: Resource) => {
            if (resource?.fsPath === workspaceFolder.uri.fsPath) {
                return workspaceFolder;
            }
            return undefined;
        });
        discoverAPI = typemoq.Mock.ofType<IDiscoveryAPI>();
        extensions = typemoq.Mock.ofType<IExtensions>();
        workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
        envVarsProvider = typemoq.Mock.ofType<IEnvironmentVariablesProvider>();
        extensions
            .setup((e) => e.determineExtensionFromCallStack())
            .returns(() => Promise.resolve({ extensionId: 'id', displayName: 'displayName', apiName: 'apiName' }));
        interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>();
        configService = typemoq.Mock.ofType<IConfigurationService>();
        onDidChangeRefreshState = new EventEmitter();
        onDidChangeEnvironments = new EventEmitter();
        onDidChangeEnvironmentVariables = new EventEmitter();
        serviceContainer.setup((s) => s.get(IExtensions)).returns(() => extensions.object);
        serviceContainer.setup((s) => s.get(IInterpreterPathService)).returns(() => interpreterPathService.object);
        serviceContainer.setup((s) => s.get(IConfigurationService)).returns(() => configService.object);
        serviceContainer.setup((s) => s.get(IWorkspaceService)).returns(() => workspaceService.object);
        serviceContainer.setup((s) => s.get(IEnvironmentVariablesProvider)).returns(() => envVarsProvider.object);
        envVarsProvider
            .setup((e) => e.onDidEnvironmentVariablesChange)
            .returns(() => onDidChangeEnvironmentVariables.event);
        serviceContainer.setup((s) => s.get(IDisposableRegistry)).returns(() => []);

        discoverAPI.setup((d) => d.onProgress).returns(() => onDidChangeRefreshState.event);
        discoverAPI.setup((d) => d.onChanged).returns(() => onDidChangeEnvironments.event);
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        const onDidChangePythonEnvironment = new EventEmitter<Uri>();
        const jupyterApi: JupyterPythonEnvironmentApi = {
            onDidChangePythonEnvironment: onDidChangePythonEnvironment.event,
            getPythonEnvironment: (_uri: Uri) => undefined,
        };

        environmentApi = buildEnvironmentApi(discoverAPI.object, serviceContainer.object, jupyterApi);
    });

    teardown(() => {
        sinon.restore();
    });

    test('Provide an event to track when environment variables change', async () => {
        const resource = workspaceFolder.uri;
        const envVars = { PATH: 'path' };
        envVarsProvider.setup((e) => e.getEnvironmentVariablesSync(resource)).returns(() => envVars);
        const events: EnvironmentVariablesChangeEvent[] = [];
        environmentApi.onDidEnvironmentVariablesChange((e) => {
            events.push(e);
        });
        onDidChangeEnvironmentVariables.fire(resource);
        await sleep(1);
        assert.deepEqual(events, [{ env: envVars, resource: workspaceFolder }]);
    });

    test('getEnvironmentVariables: No resource', async () => {
        const resource = undefined;
        const envVars = { PATH: 'path' };
        envVarsProvider.setup((e) => e.getEnvironmentVariablesSync(resource)).returns(() => envVars);
        const vars = environmentApi.getEnvironmentVariables(resource);
        assert.deepEqual(vars, envVars);
    });

    test('getEnvironmentVariables: With Uri resource', async () => {
        const resource = Uri.file('x');
        const envVars = { PATH: 'path' };
        envVarsProvider.setup((e) => e.getEnvironmentVariablesSync(resource)).returns(() => envVars);
        const vars = environmentApi.getEnvironmentVariables(resource);
        assert.deepEqual(vars, envVars);
    });

    test('getEnvironmentVariables: With WorkspaceFolder resource', async () => {
        const resource = Uri.file('x');
        const folder = ({ uri: resource } as unknown) as WorkspaceFolder;
        const envVars = { PATH: 'path' };
        envVarsProvider.setup((e) => e.getEnvironmentVariablesSync(resource)).returns(() => envVars);
        const vars = environmentApi.getEnvironmentVariables(folder);
        assert.deepEqual(vars, envVars);
    });

    test('Provide an event to track when active environment details change', async () => {
        const events: ActiveEnvironmentPathChangeEvent[] = [];
        environmentApi.onDidChangeActiveEnvironmentPath((e) => {
            events.push(e);
        });
        reportActiveInterpreterChanged({ path: 'path/to/environment', resource: undefined });
        await sleep(1);
        assert.deepEqual(events, [
            { id: normCasePath('path/to/environment'), path: 'path/to/environment', resource: undefined },
        ]);
    });

    test('getActiveEnvironmentPath: No resource', () => {
        const pythonPath = 'this/is/a/test/path';
        configService
            .setup((c) => c.getSettings(undefined))
            .returns(() => (({ pythonPath } as unknown) as IPythonSettings));
        const actual = environmentApi.getActiveEnvironmentPath();
        assert.deepEqual(actual, {
            id: normCasePath(pythonPath),
            path: pythonPath,
        });
    });

    test('getActiveEnvironmentPath: default python', () => {
        const pythonPath = 'python';
        configService
            .setup((c) => c.getSettings(undefined))
            .returns(() => (({ pythonPath } as unknown) as IPythonSettings));
        const actual = environmentApi.getActiveEnvironmentPath();
        assert.deepEqual(actual, {
            id: 'DEFAULT_PYTHON',
            path: pythonPath,
        });
    });

    test('getActiveEnvironmentPath: With resource', () => {
        const pythonPath = 'this/is/a/test/path';
        const resource = Uri.file(__filename);
        configService
            .setup((c) => c.getSettings(resource))
            .returns(() => (({ pythonPath } as unknown) as IPythonSettings));
        const actual = environmentApi.getActiveEnvironmentPath(resource);
        assert.deepEqual(actual, {
            id: normCasePath(pythonPath),
            path: pythonPath,
        });
    });

    test('resolveEnvironment: invalid environment (when passed as string)', async () => {
        const pythonPath = 'this/is/a/test/path';
        discoverAPI.setup((p) => p.resolveEnv(pythonPath)).returns(() => Promise.resolve(undefined));

        const actual = await environmentApi.resolveEnvironment(pythonPath);
        expect(actual).to.be.equal(undefined);
    });

    test('resolveEnvironment: valid environment (when passed as string)', async () => {
        const pythonPath = 'this/is/a/test/path';
        const env = buildEnvInfo({
            executable: pythonPath,
            version: {
                major: 3,
                minor: 9,
                micro: 0,
            },
            kind: PythonEnvKind.System,
            arch: Architecture.x64,
            sysPrefix: 'prefix/path',
            searchLocation: Uri.file(workspacePath),
        });
        discoverAPI.setup((p) => p.resolveEnv(pythonPath)).returns(() => Promise.resolve(env));

        const actual = await environmentApi.resolveEnvironment(pythonPath);
        assert.deepEqual((actual as EnvironmentReference).internal, convertCompleteEnvInfo(env));
    });

    test('resolveEnvironment: valid environment (when passed as environment)', async () => {
        const pythonPath = 'this/is/a/test/path';
        const env = buildEnvInfo({
            executable: pythonPath,
            version: {
                major: 3,
                minor: 9,
                micro: 0,
            },
            kind: PythonEnvKind.System,
            arch: Architecture.x64,
            sysPrefix: 'prefix/path',
            searchLocation: Uri.file(workspacePath),
        });
        const partialEnv = buildEnvInfo({
            executable: pythonPath,
            kind: PythonEnvKind.System,
            sysPrefix: 'prefix/path',
            searchLocation: Uri.file(workspacePath),
        });
        discoverAPI.setup((p) => p.resolveEnv(pythonPath)).returns(() => Promise.resolve(env));

        const actual = await environmentApi.resolveEnvironment(convertCompleteEnvInfo(partialEnv));
        assert.deepEqual((actual as EnvironmentReference).internal, convertCompleteEnvInfo(env));
    });

    test('environments: no pythons found', () => {
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        const actual = environmentApi.known;
        expect(actual).to.be.deep.equal([]);
    });

    test('environments: python found', async () => {
        const expectedEnvs = [
            {
                id: normCasePath('this/is/a/test/python/path1'),
                executable: {
                    filename: 'this/is/a/test/python/path1',
                    ctime: 1,
                    mtime: 2,
                    sysPrefix: 'prefix/path',
                },
                version: {
                    major: 3,
                    minor: 9,
                    micro: 0,
                },
                kind: PythonEnvKind.System,
                arch: Architecture.x64,
                name: '',
                location: '',
                source: [PythonEnvSource.PathEnvVar],
                distro: {
                    org: '',
                },
            },
            {
                id: normCasePath('this/is/a/test/python/path2'),
                executable: {
                    filename: 'this/is/a/test/python/path2',
                    ctime: 1,
                    mtime: 2,
                    sysPrefix: 'prefix/path',
                },
                version: {
                    major: 3,
                    minor: -1,
                    micro: -1,
                },
                kind: PythonEnvKind.Venv,
                arch: Architecture.x64,
                name: '',
                location: '',
                source: [PythonEnvSource.PathEnvVar],
                distro: {
                    org: '',
                },
            },
        ];
        const envs = [
            ...expectedEnvs,
            {
                id: normCasePath('this/is/a/test/python/path3'),
                executable: {
                    filename: 'this/is/a/test/python/path3',
                    ctime: 1,
                    mtime: 2,
                    sysPrefix: 'prefix/path',
                },
                version: {
                    major: 3,
                    minor: -1,
                    micro: -1,
                },
                kind: PythonEnvKind.Venv,
                arch: Architecture.x64,
                name: '',
                location: '',
                source: [PythonEnvSource.PathEnvVar],
                distro: {
                    org: '',
                },
                searchLocation: Uri.file('path/outside/workspace'),
            },
        ];
        discoverAPI.setup((d) => d.getEnvs()).returns(() => envs);
        const onDidChangePythonEnvironment = new EventEmitter<Uri>();
        const jupyterApi: JupyterPythonEnvironmentApi = {
            onDidChangePythonEnvironment: onDidChangePythonEnvironment.event,
            getPythonEnvironment: (_uri: Uri) => undefined,
        };
        environmentApi = buildEnvironmentApi(discoverAPI.object, serviceContainer.object, jupyterApi);
        const actual = environmentApi.known;
        const actualEnvs = actual?.map((a) => (a as EnvironmentReference).internal);
        assert.deepEqual(
            actualEnvs?.sort((a, b) => a.id.localeCompare(b.id)),
            expectedEnvs.map((e) => convertEnvInfo(e)).sort((a, b) => a.id.localeCompare(b.id)),
        );
    });

    test('Provide an event to track when list of environments change', async () => {
        let events: EnvironmentsChangeEvent[] = [];
        let eventValues: EnvironmentsChangeEvent[] = [];
        let expectedEvents: EnvironmentsChangeEvent[] = [];
        environmentApi.onDidChangeEnvironments((e) => {
            events.push(e);
        });
        const envs = [
            buildEnvInfo({
                executable: 'pythonPath',
                kind: PythonEnvKind.System,
                sysPrefix: 'prefix/path',
                searchLocation: Uri.file(workspacePath),
            }),
            {
                id: normCasePath('this/is/a/test/python/path1'),
                executable: {
                    filename: 'this/is/a/test/python/path1',
                    ctime: 1,
                    mtime: 2,
                    sysPrefix: 'prefix/path',
                },
                version: {
                    major: 3,
                    minor: 9,
                    micro: 0,
                },
                kind: PythonEnvKind.System,
                arch: Architecture.x64,
                name: '',
                location: '',
                source: [PythonEnvSource.PathEnvVar],
                distro: {
                    org: '',
                },
            },
            {
                id: normCasePath('this/is/a/test/python/path2'),
                executable: {
                    filename: 'this/is/a/test/python/path2',
                    ctime: 1,
                    mtime: 2,
                    sysPrefix: 'prefix/path',
                },
                version: {
                    major: 3,
                    minor: 10,
                    micro: 0,
                },
                kind: PythonEnvKind.Venv,
                arch: Architecture.x64,
                name: '',
                location: '',
                source: [PythonEnvSource.PathEnvVar],
                distro: {
                    org: '',
                },
            },
        ];

        // Now fire and verify events. Note the event value holds the reference to an environment, so may itself
        // change when the environment is altered. So it's important to verify them as soon as they're received.

        // Add events
        onDidChangeEnvironments.fire({ old: undefined, new: envs[0] });
        expectedEvents.push({ env: convertEnvInfo(envs[0]), type: 'add' });
        onDidChangeEnvironments.fire({ old: undefined, new: envs[1] });
        expectedEvents.push({ env: convertEnvInfo(envs[1]), type: 'add' });
        onDidChangeEnvironments.fire({ old: undefined, new: envs[2] });
        expectedEvents.push({ env: convertEnvInfo(envs[2]), type: 'add' });
        eventValues = events.map((e) => ({ env: (e.env as EnvironmentReference).internal, type: e.type }));
        assert.deepEqual(eventValues, expectedEvents);

        // Update events
        events = [];
        expectedEvents = [];
        const updatedEnv0 = cloneDeep(envs[0]);
        updatedEnv0.arch = Architecture.x86;
        onDidChangeEnvironments.fire({ old: envs[0], new: updatedEnv0 });
        expectedEvents.push({ env: convertEnvInfo(updatedEnv0), type: 'update' });
        eventValues = events.map((e) => ({ env: (e.env as EnvironmentReference).internal, type: e.type }));
        assert.deepEqual(eventValues, expectedEvents);

        // Remove events
        events = [];
        expectedEvents = [];
        onDidChangeEnvironments.fire({ old: envs[2], new: undefined });
        expectedEvents.push({ env: convertEnvInfo(envs[2]), type: 'remove' });
        eventValues = events.map((e) => ({ env: (e.env as EnvironmentReference).internal, type: e.type }));
        assert.deepEqual(eventValues, expectedEvents);

        const expectedEnvs = [convertEnvInfo(updatedEnv0), convertEnvInfo(envs[1])].sort();
        const knownEnvs = environmentApi.known.map((e) => (e as EnvironmentReference).internal).sort();

        assert.deepEqual(expectedEnvs, knownEnvs);
    });

    test('updateActiveEnvironmentPath: no resource', async () => {
        interpreterPathService
            .setup((i) => i.update(undefined, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await environmentApi.updateActiveEnvironmentPath('this/is/a/test/python/path');

        interpreterPathService.verifyAll();
    });

    test('updateActiveEnvironmentPath: passed as Environment', async () => {
        interpreterPathService
            .setup((i) => i.update(undefined, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await environmentApi.updateActiveEnvironmentPath({
            id: normCasePath('this/is/a/test/python/path'),
            path: 'this/is/a/test/python/path',
        });

        interpreterPathService.verifyAll();
    });

    test('updateActiveEnvironmentPath: with uri', async () => {
        const uri = Uri.parse('a');
        interpreterPathService
            .setup((i) => i.update(uri, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await environmentApi.updateActiveEnvironmentPath('this/is/a/test/python/path', uri);

        interpreterPathService.verifyAll();
    });

    test('updateActiveEnvironmentPath: with workspace folder', async () => {
        const uri = Uri.parse('a');
        interpreterPathService
            .setup((i) => i.update(uri, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());
        const workspace: WorkspaceFolder = {
            uri,
            name: '',
            index: 0,
        };

        await environmentApi.updateActiveEnvironmentPath('this/is/a/test/python/path', workspace);

        interpreterPathService.verifyAll();
    });

    test('refreshInterpreters: default', async () => {
        discoverAPI
            .setup((d) => d.triggerRefresh(undefined, typemoq.It.isValue({ ifNotTriggerredAlready: true })))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await environmentApi.refreshEnvironments();

        discoverAPI.verifyAll();
    });

    test('refreshInterpreters: when forcing a refresh', async () => {
        discoverAPI
            .setup((d) => d.triggerRefresh(undefined, typemoq.It.isValue({ ifNotTriggerredAlready: false })))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await environmentApi.refreshEnvironments({ forceRefresh: true });

        discoverAPI.verifyAll();
    });
});
