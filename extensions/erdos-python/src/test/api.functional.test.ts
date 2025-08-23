// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { instance, mock, when } from 'ts-mockito';
import { buildApi } from '../client/api';
import { ConfigurationService } from '../client/common/configuration/service';
import { EXTENSION_ROOT_DIR } from '../client/common/constants';
import { IConfigurationService, IDisposableRegistry } from '../client/common/types';
import { IEnvironmentVariablesProvider } from '../client/common/variables/types';
import { IInterpreterService } from '../client/interpreter/contracts';
import { InterpreterService } from '../client/interpreter/interpreterService';
import { ServiceContainer } from '../client/ioc/container';
import { ServiceManager } from '../client/ioc/serviceManager';
import { IServiceContainer, IServiceManager } from '../client/ioc/types';
import { IDiscoveryAPI } from '../client/pythonEnvironments/base/locator';
import * as pythonDebugger from '../client/debugger/pythonDebugger';
import {
    JupyterExtensionIntegration,
    JupyterExtensionPythonEnvironments,
    JupyterPythonEnvironmentApi,
} from '../client/jupyter/jupyterIntegration';
import { EventEmitter, Uri } from 'vscode';

suite('Extension API', () => {
    const debuggerPath = path.join(EXTENSION_ROOT_DIR, 'python_files', 'lib', 'python', 'debugpy');
    const debuggerHost = 'somehost';
    const debuggerPort = 12345;

    let serviceContainer: IServiceContainer;
    let serviceManager: IServiceManager;
    let configurationService: IConfigurationService;
    let interpreterService: IInterpreterService;
    let discoverAPI: IDiscoveryAPI;
    let environmentVariablesProvider: IEnvironmentVariablesProvider;
    let getDebugpyPathStub: sinon.SinonStub;

    setup(() => {
        serviceContainer = mock(ServiceContainer);
        serviceManager = mock(ServiceManager);
        configurationService = mock(ConfigurationService);
        interpreterService = mock(InterpreterService);
        environmentVariablesProvider = mock<IEnvironmentVariablesProvider>();
        discoverAPI = mock<IDiscoveryAPI>();
        when(discoverAPI.getEnvs()).thenReturn([]);

        when(serviceContainer.get<IConfigurationService>(IConfigurationService)).thenReturn(
            instance(configurationService),
        );
        when(serviceContainer.get<IEnvironmentVariablesProvider>(IEnvironmentVariablesProvider)).thenReturn(
            instance(environmentVariablesProvider),
        );
        when(serviceContainer.get<JupyterExtensionIntegration>(JupyterExtensionIntegration)).thenReturn(
            instance(mock<JupyterExtensionIntegration>()),
        );
        when(serviceContainer.get<IInterpreterService>(IInterpreterService)).thenReturn(instance(interpreterService));
        const onDidChangePythonEnvironment = new EventEmitter<Uri>();
        const jupyterApi: JupyterPythonEnvironmentApi = {
            onDidChangePythonEnvironment: onDidChangePythonEnvironment.event,
            getPythonEnvironment: (_uri: Uri) => undefined,
        };
        when(serviceContainer.get<JupyterPythonEnvironmentApi>(JupyterExtensionPythonEnvironments)).thenReturn(
            jupyterApi,
        );
        when(serviceContainer.get<IDisposableRegistry>(IDisposableRegistry)).thenReturn([]);
        getDebugpyPathStub = sinon.stub(pythonDebugger, 'getDebugpyPath');
        getDebugpyPathStub.resolves(debuggerPath);
    });

    teardown(() => {
        sinon.restore();
    });

    test('Test debug launcher args (no-wait)', async () => {
        const waitForAttach = false;

        const args = await buildApi(
            Promise.resolve(),
            instance(serviceManager),
            instance(serviceContainer),
            instance(discoverAPI),
        ).debug.getRemoteLauncherCommand(debuggerHost, debuggerPort, waitForAttach);
        const expectedArgs = [
            debuggerPath.fileToCommandArgumentForPythonExt(),
            '--listen',
            `${debuggerHost}:${debuggerPort}`,
        ];

        expect(args).to.be.deep.equal(expectedArgs);
    });

    test('Test debug launcher args (wait)', async () => {
        const waitForAttach = true;

        const args = await buildApi(
            Promise.resolve(),
            instance(serviceManager),
            instance(serviceContainer),
            instance(discoverAPI),
        ).debug.getRemoteLauncherCommand(debuggerHost, debuggerPort, waitForAttach);
        const expectedArgs = [
            debuggerPath.fileToCommandArgumentForPythonExt(),
            '--listen',
            `${debuggerHost}:${debuggerPort}`,
            '--wait-for-client',
        ];

        expect(args).to.be.deep.equal(expectedArgs);
    });

    test('Test debugger package path', async () => {
        const pkgPath = await buildApi(
            Promise.resolve(),
            instance(serviceManager),
            instance(serviceContainer),
            instance(discoverAPI),
        ).debug.getDebuggerPackagePath();

        assert.strictEqual(pkgPath, debuggerPath);
    });
});
