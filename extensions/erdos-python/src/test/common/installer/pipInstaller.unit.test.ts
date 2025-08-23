// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { PipInstaller } from '../../../client/common/installer/pipInstaller';
import { IPythonExecutionFactory, IPythonExecutionService } from '../../../client/common/process/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import { EnvironmentType, PythonEnvironment } from '../../../client/pythonEnvironments/info';

suite('xPip installer', async () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let pythonExecutionFactory: TypeMoq.IMock<IPythonExecutionFactory>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let pipInstaller: PipInstaller;
    const interpreter = {
        path: 'pythonPath',
        envType: EnvironmentType.System,
    };
    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        pythonExecutionFactory = TypeMoq.Mock.ofType<IPythonExecutionFactory>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterService)))
            .returns(() => interpreterService.object);
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve((interpreter as unknown) as PythonEnvironment));
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IPythonExecutionFactory)))
            .returns(() => pythonExecutionFactory.object);
        pipInstaller = new PipInstaller(serviceContainer.object);
    });

    test('Installer name is Pip', () => {
        expect(pipInstaller.name).to.equal('Pip');
    });

    test('Installer priority is 0', () => {
        expect(pipInstaller.priority).to.equal(0);
    });

    test('If InterpreterUri is Python interpreter, Python execution factory is called with the correct arguments', async () => {
        const pythonExecutionService = TypeMoq.Mock.ofType<IPythonExecutionService>();
        pythonExecutionFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .callback((options) => {
                assert.deepEqual(options, { resource: undefined, pythonPath: interpreter.path });
            })
            .returns(() => Promise.resolve(pythonExecutionService.object))
            .verifiable(TypeMoq.Times.once());
        pythonExecutionService.setup((p) => (p as any).then).returns(() => undefined);

        await pipInstaller.isSupported(interpreter as any);

        pythonExecutionFactory.verifyAll();
    });

    test('If InterpreterUri is Resource, Python execution factory is called with the correct arguments', async () => {
        const pythonExecutionService = TypeMoq.Mock.ofType<IPythonExecutionService>();
        const resource = Uri.parse('a');
        pythonExecutionFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .callback((options) => {
                assert.deepEqual(options, { resource, pythonPath: undefined });
            })
            .returns(() => Promise.resolve(pythonExecutionService.object))
            .verifiable(TypeMoq.Times.once());
        pythonExecutionService.setup((p) => (p as any).then).returns(() => undefined);

        await pipInstaller.isSupported(resource);

        pythonExecutionFactory.verifyAll();
    });

    test('If InterpreterUri is Resource and active environment is conda without python, pip installer is not supported', async () => {
        const resource = Uri.parse('a');
        const condaInterpreter = {
            path: 'path/to/python',
            envType: EnvironmentType.Conda,
            envPath: 'path/to/enviornment',
        };
        interpreterService.reset();
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve((condaInterpreter as unknown) as PythonEnvironment));
        const result = await pipInstaller.isSupported(resource);
        expect(result).to.equal(false);
    });

    test('Method isSupported() returns true if pip module is installed', async () => {
        const pythonExecutionService = TypeMoq.Mock.ofType<IPythonExecutionService>();
        const resource = Uri.parse('a');
        pythonExecutionFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(pythonExecutionService.object));
        pythonExecutionService.setup((p) => (p as any).then).returns(() => undefined);
        pythonExecutionService.setup((p) => p.isModuleInstalled('pip')).returns(() => Promise.resolve(true));

        const expected = await pipInstaller.isSupported(resource);

        expect(expected).to.equal(true, 'Should be true');
    });

    test('Method isSupported() returns false if pip module is not installed', async () => {
        const pythonExecutionService = TypeMoq.Mock.ofType<IPythonExecutionService>();
        const resource = Uri.parse('a');
        pythonExecutionFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(pythonExecutionService.object));
        pythonExecutionService.setup((p) => (p as any).then).returns(() => undefined);
        pythonExecutionService.setup((p) => p.isModuleInstalled('pip')).returns(() => Promise.resolve(false));

        const expected = await pipInstaller.isSupported(resource);

        expect(expected).to.equal(false, 'Should be false');
    });

    test('Method isSupported() returns false if checking if pip module is installed fails with error', async () => {
        const pythonExecutionService = TypeMoq.Mock.ofType<IPythonExecutionService>();
        const resource = Uri.parse('a');
        pythonExecutionFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(pythonExecutionService.object));
        pythonExecutionService.setup((p) => (p as any).then).returns(() => undefined);
        pythonExecutionService
            .setup((p) => p.isModuleInstalled('pip'))
            .returns(() => Promise.reject('Unable to check if module is installed'));

        const expected = await pipInstaller.isSupported(resource);

        expect(expected).to.equal(false, 'Should be false');
    });
});
