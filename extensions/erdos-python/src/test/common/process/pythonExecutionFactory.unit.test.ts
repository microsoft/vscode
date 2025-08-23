// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { expect } from 'chai';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import { anyString, anything, instance, mock, reset, verify, when } from 'ts-mockito';
import * as typemoq from 'typemoq';
import { Uri } from 'vscode';

import { PythonSettings } from '../../../client/common/configSettings';
import { ConfigurationService } from '../../../client/common/configuration/service';
import { ProcessLogger } from '../../../client/common/process/logger';
import { ProcessServiceFactory } from '../../../client/common/process/processFactory';
import { PythonExecutionFactory } from '../../../client/common/process/pythonExecutionFactory';
import {
    IProcessLogger,
    IProcessService,
    IProcessServiceFactory,
    IPythonExecutionService,
} from '../../../client/common/process/types';
import { IConfigurationService, IDisposableRegistry, IInterpreterPathService } from '../../../client/common/types';
import { Architecture } from '../../../client/common/utils/platform';
import { EnvironmentActivationService } from '../../../client/interpreter/activation/service';
import { IEnvironmentActivationService } from '../../../client/interpreter/activation/types';
import {
    IActivatedEnvironmentLaunch,
    IComponentAdapter,
    IInterpreterService,
} from '../../../client/interpreter/contracts';
import { InterpreterService } from '../../../client/interpreter/interpreterService';
import { ServiceContainer } from '../../../client/ioc/container';
import { EnvironmentType, PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { IInterpreterAutoSelectionService } from '../../../client/interpreter/autoSelection/types';
import { Conda, CONDA_RUN_VERSION } from '../../../client/pythonEnvironments/common/environmentManagers/conda';
import * as pixi from '../../../client/pythonEnvironments/common/environmentManagers/pixi';

const pythonInterpreter: PythonEnvironment = {
    path: '/foo/bar/python.exe',
    version: new SemVer('3.6.6-final'),
    sysVersion: '1.0.0.0',
    sysPrefix: 'Python',
    envType: EnvironmentType.Unknown,
    architecture: Architecture.x64,
};

function title(resource?: Uri, interpreter?: PythonEnvironment) {
    return `${resource ? 'With a resource' : 'Without a resource'}${interpreter ? ' and an interpreter' : ''}`;
}

async function verifyCreateActivated(
    factory: PythonExecutionFactory,
    activationHelper: IEnvironmentActivationService,
    resource?: Uri,
    interpreter?: PythonEnvironment,
): Promise<IPythonExecutionService> {
    when(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).thenResolve();

    const service = await factory.createActivatedEnvironment({ resource, interpreter });

    verify(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).once();

    return service;
}

suite('Process - PythonExecutionFactory', () => {
    [
        { resource: undefined, interpreter: undefined },
        { resource: undefined, interpreter: pythonInterpreter },
        { resource: Uri.parse('x'), interpreter: undefined },
        { resource: Uri.parse('x'), interpreter: pythonInterpreter },
    ].forEach((item) => {
        const { resource } = item;
        const { interpreter } = item;
        suite(title(resource, interpreter), () => {
            let factory: PythonExecutionFactory;
            let activationHelper: IEnvironmentActivationService;
            let activatedEnvironmentLaunch: IActivatedEnvironmentLaunch;
            let processFactory: IProcessServiceFactory;
            let configService: IConfigurationService;
            let processLogger: IProcessLogger;
            let processService: typemoq.IMock<IProcessService>;
            let interpreterService: IInterpreterService;
            let pyenvs: IComponentAdapter;
            let executionService: typemoq.IMock<IPythonExecutionService>;
            let autoSelection: IInterpreterAutoSelectionService;
            let interpreterPathExpHelper: IInterpreterPathService;
            let getPixiEnvironmentFromInterpreterStub: sinon.SinonStub;
            let getPixiStub: sinon.SinonStub;
            const pythonPath = 'path/to/python';
            setup(() => {
                sinon.stub(Conda, 'getConda').resolves(new Conda('conda'));
                sinon.stub(Conda.prototype, 'getInterpreterPathForEnvironment').resolves(pythonPath);

                getPixiEnvironmentFromInterpreterStub = sinon.stub(pixi, 'getPixiEnvironmentFromInterpreter');
                getPixiEnvironmentFromInterpreterStub.resolves(undefined);

                getPixiStub = sinon.stub(pixi, 'getPixi');
                getPixiStub.resolves(undefined);

                activationHelper = mock(EnvironmentActivationService);
                processFactory = mock(ProcessServiceFactory);
                configService = mock(ConfigurationService);
                processLogger = mock(ProcessLogger);
                autoSelection = mock<IInterpreterAutoSelectionService>();
                interpreterPathExpHelper = mock<IInterpreterPathService>();
                when(interpreterPathExpHelper.get(anything())).thenReturn('selected interpreter path');

                pyenvs = mock<IComponentAdapter>();
                when(pyenvs.isMicrosoftStoreInterpreter(anyString())).thenResolve(true);

                executionService = typemoq.Mock.ofType<IPythonExecutionService>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                executionService.setup((p: any) => p.then).returns(() => undefined);
                when(processLogger.logProcess('', [], {})).thenReturn();
                processService = typemoq.Mock.ofType<IProcessService>();
                processService
                    .setup((p) =>
                        p.on('exec', () => {
                            /** No body */
                        }),
                    )
                    .returns(() => processService.object);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                processService.setup((p: any) => p.then).returns(() => undefined);
                interpreterService = mock(InterpreterService);
                when(interpreterService.getInterpreterDetails(anything())).thenResolve({
                    version: { major: 3 },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);
                const serviceContainer = mock(ServiceContainer);
                when(serviceContainer.get<IDisposableRegistry>(IDisposableRegistry)).thenReturn([]);
                when(serviceContainer.get<IProcessLogger>(IProcessLogger)).thenReturn(processLogger);
                when(serviceContainer.get<IInterpreterService>(IInterpreterService)).thenReturn(
                    instance(interpreterService),
                );
                activatedEnvironmentLaunch = mock<IActivatedEnvironmentLaunch>();
                when(activatedEnvironmentLaunch.selectIfLaunchedViaActivatedEnv()).thenResolve();
                when(serviceContainer.get<IActivatedEnvironmentLaunch>(IActivatedEnvironmentLaunch)).thenReturn(
                    instance(activatedEnvironmentLaunch),
                );
                when(serviceContainer.get<IComponentAdapter>(IComponentAdapter)).thenReturn(instance(pyenvs));
                when(serviceContainer.tryGet<IInterpreterService>(IInterpreterService)).thenReturn(
                    instance(interpreterService),
                );
                when(serviceContainer.get<IConfigurationService>(IConfigurationService)).thenReturn(
                    instance(configService),
                );
                factory = new PythonExecutionFactory(
                    instance(serviceContainer),
                    instance(activationHelper),
                    instance(processFactory),
                    instance(configService),
                    instance(pyenvs),
                    instance(autoSelection),
                    instance(interpreterPathExpHelper),
                );
            });

            teardown(() => sinon.restore());

            test('Ensure PythonExecutionService is created', async () => {
                const pythonSettings = mock(PythonSettings);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(activationHelper.getActivatedEnvironmentVariables(resource)).thenResolve({ x: '1' });
                when(pythonSettings.pythonPath).thenReturn('HELLO');
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                const service = await factory.create({ resource });

                expect(service).to.not.equal(undefined);
                verify(processFactory.create(resource)).once();
                verify(pythonSettings.pythonPath).once();
            });

            test('If interpreter is explicitly set to `python`, ensure we use it', async () => {
                const pythonSettings = mock(PythonSettings);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(activationHelper.getActivatedEnvironmentVariables(resource)).thenResolve({ x: '1' });
                reset(interpreterPathExpHelper);
                when(interpreterPathExpHelper.get(anything())).thenReturn('python');
                when(autoSelection.autoSelectInterpreter(anything())).thenResolve();
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                const service = await factory.create({ resource, pythonPath: 'python' });

                expect(service).to.not.equal(undefined);
                verify(autoSelection.autoSelectInterpreter(anything())).once();
            });

            test('Otherwise if interpreter is explicitly set, ensure we use it', async () => {
                const pythonSettings = mock(PythonSettings);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(activationHelper.getActivatedEnvironmentVariables(resource)).thenResolve({ x: '1' });
                reset(interpreterPathExpHelper);
                when(interpreterPathExpHelper.get(anything())).thenReturn('python');
                when(autoSelection.autoSelectInterpreter(anything())).thenResolve();
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                const service = await factory.create({ resource, pythonPath: 'HELLO' });

                expect(service).to.not.equal(undefined);
                verify(pyenvs.isMicrosoftStoreInterpreter('HELLO')).once();
                verify(pythonSettings.pythonPath).never();
            });

            test('If no interpreter is explicitly set, ensure we autoselect before PythonExecutionService is created', async () => {
                const pythonSettings = mock(PythonSettings);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(activationHelper.getActivatedEnvironmentVariables(resource)).thenResolve({ x: '1' });
                when(pythonSettings.pythonPath).thenReturn('HELLO');
                reset(interpreterPathExpHelper);
                when(interpreterPathExpHelper.get(anything())).thenReturn('python');
                when(autoSelection.autoSelectInterpreter(anything())).thenResolve();
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                const service = await factory.create({ resource });

                expect(service).to.not.equal(undefined);
                verify(autoSelection.autoSelectInterpreter(anything())).once();
                verify(processFactory.create(resource)).once();
                verify(pythonSettings.pythonPath).once();
            });

            test('Ensure we use an existing `create` method if there are no environment variables for the activated env', async () => {
                const pythonSettings = mock(PythonSettings);

                when(processFactory.create(resource)).thenResolve(processService.object);
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                let createInvoked = false;
                const mockExecService = 'something';
                factory.create = async () => {
                    createInvoked = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return Promise.resolve((mockExecService as any) as IPythonExecutionService);
                };

                const service = await verifyCreateActivated(factory, activationHelper, resource, interpreter);
                assert.deepEqual(service, mockExecService);
                assert.strictEqual(createInvoked, true);
            });
            test('Ensure we use an existing `create` method if there are no environment variables (0 length) for the activated env', async () => {
                const pythonSettings = mock(PythonSettings);

                when(processFactory.create(resource)).thenResolve(processService.object);
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));

                let createInvoked = false;
                const mockExecService = 'something';
                factory.create = async () => {
                    createInvoked = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return Promise.resolve((mockExecService as any) as IPythonExecutionService);
                };

                const service = await verifyCreateActivated(factory, activationHelper, resource, interpreter);
                assert.deepEqual(service, mockExecService);
                assert.strictEqual(createInvoked, true);
            });
            test('PythonExecutionService is created', async () => {
                let createInvoked = false;
                const mockExecService = 'something';
                factory.create = async () => {
                    createInvoked = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return Promise.resolve((mockExecService as any) as IPythonExecutionService);
                };

                const pythonSettings = mock(PythonSettings);
                when(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).thenResolve({
                    x: '1',
                });
                when(pythonSettings.pythonPath).thenReturn('HELLO');
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));
                const service = await factory.createActivatedEnvironment({ resource, interpreter });

                expect(service).to.not.equal(undefined);
                verify(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).once();
                if (!interpreter) {
                    verify(pythonSettings.pythonPath).once();
                }
                assert.strictEqual(createInvoked, false);
            });

            test('Ensure `create` returns a CondaExecutionService instance if createCondaExecutionService() returns a valid object', async () => {
                const pythonSettings = mock(PythonSettings);

                when(interpreterService.hasInterpreters()).thenResolve(true);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
                when(pyenvs.getCondaEnvironment(pythonPath)).thenResolve({
                    name: 'foo',
                    path: 'path/to/foo/env',
                });

                const service = await factory.create({ resource });

                expect(service).to.not.equal(undefined);
                verify(processFactory.create(resource)).once();
                verify(pythonSettings.pythonPath).once();
                verify(pyenvs.getCondaEnvironment(pythonPath)).once();
            });

            test('Ensure `create` returns a PythonExecutionService instance if createCondaExecutionService() returns undefined', async () => {
                const pythonSettings = mock(PythonSettings);
                when(processFactory.create(resource)).thenResolve(processService.object);
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer('1.0.0'));
                when(interpreterService.hasInterpreters()).thenResolve(true);

                const service = await factory.create({ resource });

                expect(service).to.not.equal(undefined);
                verify(processFactory.create(resource)).once();
                verify(pythonSettings.pythonPath).once();
                verify(pyenvs.getCondaEnvironment(pythonPath)).once();
            });

            test('Ensure `createActivatedEnvironment` returns a CondaExecutionService instance if createCondaExecutionService() returns a valid object', async () => {
                const pythonSettings = mock(PythonSettings);

                when(processFactory.create(resource)).thenResolve(processService.object);
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).thenResolve({
                    x: '1',
                });
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
                when(pyenvs.getCondaEnvironment(anyString())).thenResolve({
                    name: 'foo',
                    path: 'path/to/foo/env',
                });

                const service = await factory.createActivatedEnvironment({ resource, interpreter });

                expect(service).to.not.equal(undefined);
                if (!interpreter) {
                    verify(pythonSettings.pythonPath).once();
                    verify(pyenvs.getCondaEnvironment(pythonPath)).once();
                } else {
                    verify(pyenvs.getCondaEnvironment(interpreter!.path)).once();
                }
                expect(getPixiEnvironmentFromInterpreterStub.notCalled).to.be.equal(true);
            });

            test('Ensure `createActivatedEnvironment` returns a PythonExecutionService instance if createCondaExecutionService() returns undefined', async () => {
                let createInvoked = false;

                const mockExecService = 'mockService';
                factory.create = async () => {
                    createInvoked = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return Promise.resolve((mockExecService as any) as IPythonExecutionService);
                };

                const pythonSettings = mock(PythonSettings);
                when(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).thenResolve({
                    x: '1',
                });
                when(pythonSettings.pythonPath).thenReturn(pythonPath);
                when(configService.getSettings(resource)).thenReturn(instance(pythonSettings));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer('1.0.0'));

                const service = await factory.createActivatedEnvironment({ resource, interpreter });

                expect(service).to.not.equal(undefined);
                verify(activationHelper.getActivatedEnvironmentVariables(resource, anything(), anything())).once();
                if (!interpreter) {
                    verify(pythonSettings.pythonPath).once();
                }

                assert.strictEqual(createInvoked, false);
            });

            test('Ensure `createCondaExecutionService` creates a CondaExecutionService instance if there is a conda environment', async () => {
                when(pyenvs.getCondaEnvironment(pythonPath)).thenResolve({
                    name: 'foo',
                    path: 'path/to/foo/env',
                });
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));

                const result = await factory.createCondaExecutionService(pythonPath, processService.object);

                expect(result).to.not.equal(undefined);
                verify(pyenvs.getCondaEnvironment(pythonPath)).once();
            });

            test('Ensure `createCondaExecutionService` returns undefined if there is no conda environment', async () => {
                when(pyenvs.getCondaEnvironment(pythonPath)).thenResolve(undefined);
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));

                const result = await factory.createCondaExecutionService(pythonPath, processService.object);

                expect(result).to.be.equal(
                    undefined,
                    'createCondaExecutionService should return undefined if not in a conda environment',
                );
                verify(pyenvs.getCondaEnvironment(pythonPath)).once();
            });

            test('Ensure `createCondaExecutionService` returns undefined if the conda version does not support conda run', async () => {
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer('1.0.0'));

                const result = await factory.createCondaExecutionService(pythonPath, processService.object);

                expect(result).to.be.equal(
                    undefined,
                    'createCondaExecutionService should return undefined if not in a conda environment',
                );
                verify(pyenvs.getCondaEnvironment(pythonPath)).once();
            });
        });
    });
});
