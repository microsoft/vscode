// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from '../../../../client/common/platform/fs-paths';
import * as path from 'path';
import * as sinon from 'sinon';
import rewiremock from 'rewiremock';
import { SemVer } from 'semver';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { DebugAdapterExecutable, DebugAdapterServer, DebugConfiguration, DebugSession, WorkspaceFolder } from 'vscode';
import { ConfigurationService } from '../../../../client/common/configuration/service';
import { IPersistentStateFactory, IPythonSettings } from '../../../../client/common/types';
import { Architecture } from '../../../../client/common/utils/platform';
import { EXTENSION_ROOT_DIR } from '../../../../client/constants';
import { DebugAdapterDescriptorFactory, debugStateKeys } from '../../../../client/debugger/extension/adapter/factory';
import { IDebugAdapterDescriptorFactory } from '../../../../client/debugger/extension/types';
import { IInterpreterService } from '../../../../client/interpreter/contracts';
import { InterpreterService } from '../../../../client/interpreter/interpreterService';
import { EnvironmentType } from '../../../../client/pythonEnvironments/info';
import { clearTelemetryReporter } from '../../../../client/telemetry';
import * as windowApis from '../../../../client/common/vscodeApis/windowApis';
import { PersistentState, PersistentStateFactory } from '../../../../client/common/persistentState';
import { ICommandManager } from '../../../../client/common/application/types';
import { CommandManager } from '../../../../client/common/application/commandManager';
import * as pythonDebugger from '../../../../client/debugger/pythonDebugger';

use(chaiAsPromised.default);

suite('Debugging - Adapter Factory', () => {
    let factory: IDebugAdapterDescriptorFactory;
    let interpreterService: IInterpreterService;
    let stateFactory: IPersistentStateFactory;
    let state: PersistentState<boolean | undefined>;
    let showErrorMessageStub: sinon.SinonStub;
    let readJSONSyncStub: sinon.SinonStub;
    let commandManager: ICommandManager;
    let getDebugpyPathStub: sinon.SinonStub;

    const nodeExecutable = undefined;
    const debugpyPath = path.join(EXTENSION_ROOT_DIR, 'python_files', 'lib', 'python', 'debugpy');
    const debugAdapterPath = path.join(debugpyPath, 'adapter');
    const pythonPath = path.join('path', 'to', 'python', 'interpreter');
    const interpreter = {
        architecture: Architecture.Unknown,
        path: pythonPath,
        sysPrefix: '',
        sysVersion: '',
        envType: EnvironmentType.Unknown,
        version: new SemVer('3.7.4-test'),
    };
    const oldValueOfVSC_PYTHON_UNIT_TEST = process.env.VSC_PYTHON_UNIT_TEST;
    const oldValueOfVSC_PYTHON_CI_TEST = process.env.VSC_PYTHON_CI_TEST;

    class Reporter {
        public static eventNames: string[] = [];
        public static properties: Record<string, string>[] = [];
        public static measures: {}[] = [];
        public sendTelemetryEvent(eventName: string, properties?: {}, measures?: {}) {
            Reporter.eventNames.push(eventName);
            Reporter.properties.push(properties!);
            Reporter.measures.push(measures!);
        }
    }

    setup(() => {
        process.env.VSC_PYTHON_UNIT_TEST = undefined;
        process.env.VSC_PYTHON_CI_TEST = undefined;
        readJSONSyncStub = sinon.stub(fs, 'readJSONSync');
        readJSONSyncStub.returns({ enableTelemetry: true });
        rewiremock.enable();
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });
        stateFactory = mock(PersistentStateFactory);
        state = mock(PersistentState) as PersistentState<boolean | undefined>;
        commandManager = mock(CommandManager);
        getDebugpyPathStub = sinon.stub(pythonDebugger, 'getDebugpyPath');
        getDebugpyPathStub.resolves(debugpyPath);
        showErrorMessageStub = sinon.stub(windowApis, 'showErrorMessage');

        when(
            stateFactory.createGlobalPersistentState<boolean | undefined>(debugStateKeys.doNotShowAgain, false),
        ).thenReturn(instance(state));

        const configurationService = mock(ConfigurationService);
        when(configurationService.getSettings(undefined)).thenReturn(({
            experiments: { enabled: true },
        } as any) as IPythonSettings);

        interpreterService = mock(InterpreterService);

        when(interpreterService.getInterpreterDetails(pythonPath)).thenResolve(interpreter);
        when(interpreterService.getInterpreters(anything())).thenReturn([interpreter]);

        factory = new DebugAdapterDescriptorFactory(
            instance(commandManager),
            instance(interpreterService),
            instance(stateFactory),
        );
    });

    teardown(() => {
        process.env.VSC_PYTHON_UNIT_TEST = oldValueOfVSC_PYTHON_UNIT_TEST;
        process.env.VSC_PYTHON_CI_TEST = oldValueOfVSC_PYTHON_CI_TEST;
        Reporter.properties = [];
        Reporter.eventNames = [];
        Reporter.measures = [];
        rewiremock.disable();
        clearTelemetryReporter();
        sinon.restore();
    });

    function createSession(config: Partial<DebugConfiguration>, workspaceFolder?: WorkspaceFolder): DebugSession {
        return {
            configuration: { name: '', request: 'launch', type: 'python', ...config },
            id: '',
            name: 'python',
            type: 'python',
            workspaceFolder,
            customRequest: () => Promise.resolve(),
            getDebugProtocolBreakpoint: () => Promise.resolve(undefined),
        };
    }

    test('Return the value of configuration.pythonPath as the current python path if it exists', async () => {
        const session = createSession({ pythonPath });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Return the path of the active interpreter as the current python path, it exists and configuration.pythonPath is not defined', async () => {
        const session = createSession({});
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve(interpreter);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Return the path of the first available interpreter as the current python path, configuration.pythonPath is not defined and there is no active interpreter', async () => {
        const session = createSession({});
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Display a message if no python interpreter is set', async () => {
        when(interpreterService.getInterpreters(anything())).thenReturn([]);
        const session = createSession({});

        const promise = factory.createDebugAdapterDescriptor(session, nodeExecutable);

        await expect(promise).to.eventually.be.rejectedWith('Debug Adapter Executable not provided');
        sinon.assert.calledOnce(showErrorMessageStub);
    });

    test('Display a message if python version is less than 3.7', async () => {
        when(interpreterService.getInterpreters(anything())).thenReturn([]);
        const session = createSession({});
        const deprecatedInterpreter = {
            architecture: Architecture.Unknown,
            path: pythonPath,
            sysPrefix: '',
            sysVersion: '',
            envType: EnvironmentType.Unknown,
            version: new SemVer('3.6.12-test'),
        };
        when(state.value).thenReturn(false);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(deprecatedInterpreter);

        await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        sinon.assert.calledOnce(showErrorMessageStub);
    });

    test('Return Debug Adapter server if request is "attach", and port is specified directly', async () => {
        const session = createSession({ request: 'attach', port: 5678, host: 'localhost' });
        const debugServer = new DebugAdapterServer(session.configuration.port, session.configuration.host);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        // Interpreter not needed for host/port
        verify(interpreterService.getInterpreters(anything())).never();
        assert.deepStrictEqual(descriptor, debugServer);
    });

    test('Return Debug Adapter server if request is "attach", and connect is specified', async () => {
        const session = createSession({ request: 'attach', connect: { port: 5678, host: 'localhost' } });
        const debugServer = new DebugAdapterServer(
            session.configuration.connect.port,
            session.configuration.connect.host,
        );

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        // Interpreter not needed for connect
        verify(interpreterService.getInterpreters(anything())).never();
        assert.deepStrictEqual(descriptor, debugServer);
    });

    test('Return Debug Adapter executable if request is "attach", and listen is specified', async () => {
        const session = createSession({ request: 'attach', listen: { port: 5678, host: 'localhost' } });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve(interpreter);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);
        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Throw error if request is "attach", and neither port, processId, listen, nor connect is specified', async () => {
        const session = createSession({
            request: 'attach',
            port: undefined,
            processId: undefined,
            listen: undefined,
            connect: undefined,
        });

        const promise = factory.createDebugAdapterDescriptor(session, nodeExecutable);

        await expect(promise).to.eventually.be.rejectedWith(
            '"request":"attach" requires either "connect", "listen", or "processId"',
        );
    });

    test('Pass the --log-dir argument to debug adapter if configuration.logToFile is set', async () => {
        const session = createSession({ logToFile: true });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [
            debugAdapterPath,
            '--log-dir',
            EXTENSION_ROOT_DIR,
        ]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test("Don't pass the --log-dir argument to debug adapter if configuration.logToFile is not set", async () => {
        const session = createSession({});
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test("Don't pass the --log-dir argument to debugger if configuration.logToFile is set to false", async () => {
        const session = createSession({ logToFile: false });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Send attach to local process telemetry if attaching to a local process', async () => {
        const session = createSession({ request: 'attach', processId: 1234 });
        await factory.createDebugAdapterDescriptor(session, nodeExecutable);
    });

    test("Don't send any telemetry if not attaching to a local process", async () => {
        const session = createSession({});

        await factory.createDebugAdapterDescriptor(session, nodeExecutable);
    });

    test('Use "debugAdapterPath" when specified', async () => {
        const customAdapterPath = 'custom/debug/adapter/path';
        const session = createSession({ debugAdapterPath: customAdapterPath });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [customAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Use "debugAdapterPython" when specified', async () => {
        const session = createSession({ debugAdapterPython: '/bin/custompy' });
        const debugExecutable = new DebugAdapterExecutable('/bin/custompy', [debugAdapterPath]);
        const customInterpreter = {
            architecture: Architecture.Unknown,
            path: '/bin/custompy',
            sysPrefix: '',
            sysVersion: '',
            envType: EnvironmentType.Unknown,
            version: new SemVer('3.7.4-test'),
        };
        when(interpreterService.getInterpreterDetails('/bin/custompy')).thenResolve(customInterpreter);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });

    test('Do not use "python" to spawn the debug adapter', async () => {
        const session = createSession({ python: '/bin/custompy' });
        const debugExecutable = new DebugAdapterExecutable(pythonPath, [debugAdapterPath]);

        const descriptor = await factory.createDebugAdapterDescriptor(session, nodeExecutable);

        assert.deepStrictEqual(descriptor, debugExecutable);
    });
});
