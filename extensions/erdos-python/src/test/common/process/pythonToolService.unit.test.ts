// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { Uri } from 'vscode';
import { ProcessService } from '../../../client/common/process/proc';
import { ProcessServiceFactory } from '../../../client/common/process/processFactory';
import { PythonExecutionFactory } from '../../../client/common/process/pythonExecutionFactory';
import { PythonToolExecutionService } from '../../../client/common/process/pythonToolService';
import {
    ExecutionResult,
    IProcessService,
    IProcessServiceFactory,
    IPythonExecutionFactory,
    IPythonExecutionService,
    ObservableExecutionResult,
} from '../../../client/common/process/types';
import { ExecutionInfo } from '../../../client/common/types';
import { ServiceContainer } from '../../../client/ioc/container';
import { noop } from '../../core';

use(chaiAsPromised.default);

suite('Process - Python tool execution service', () => {
    const resource = Uri.parse('one');
    const observable: ObservableExecutionResult<string> = {
        proc: undefined,

        out: {} as any,
        dispose: () => {
            noop();
        },
    };
    const executionResult: ExecutionResult<string> = {
        stdout: 'output',
    };

    let pythonService: IPythonExecutionService;
    let executionFactory: IPythonExecutionFactory;
    let processService: IProcessService;
    let processFactory: IProcessServiceFactory;

    let executionService: PythonToolExecutionService;

    setup(() => {
        pythonService = mock<IPythonExecutionService>();
        when(pythonService.execModuleObservable(anything(), anything(), anything())).thenReturn(observable);
        when(pythonService.execModule(anything(), anything(), anything())).thenResolve(executionResult);
        const pythonServiceInstance = instance(pythonService);

        (pythonServiceInstance as any).then = undefined;

        executionFactory = mock(PythonExecutionFactory);
        when(executionFactory.create(anything())).thenResolve(pythonServiceInstance);

        processService = mock(ProcessService);
        when(processService.execObservable(anything(), anything(), anything())).thenReturn(observable);
        when(processService.exec(anything(), anything(), anything())).thenResolve(executionResult);

        processFactory = mock(ProcessServiceFactory);
        when(processFactory.create(anything())).thenResolve(instance(processService));

        const serviceContainer = mock(ServiceContainer);
        when(serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory)).thenReturn(
            instance(executionFactory),
        );
        when(serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory)).thenReturn(instance(processFactory));

        executionService = new PythonToolExecutionService(instance(serviceContainer));
    });

    test('When calling execObservable, throw an error if environment variables are passed to the options parameter', () => {
        const options = { env: { envOne: 'envOne' } };
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: 'moduleOne',
            args: ['-a', 'b', '-c'],
        };

        const promise = executionService.execObservable(executionInfo, options, resource);

        expect(promise).to.eventually.be.rejectedWith('Environment variables are not supported');
    });

    test('When calling execObservable, use a python execution service if a module name is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: 'moduleOne',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.execObservable(executionInfo, options, resource);

        assert.deepEqual(result, observable);
        verify(pythonService.execModuleObservable(executionInfo.moduleName!, executionInfo.args, options)).once();
    });

    test('When calling execObservable, use a process service if an empty module name string is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: '',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.execObservable(executionInfo, options, resource);

        assert.deepEqual(result, observable);
        verify(processService.execObservable(executionInfo.execPath!, executionInfo.args, anything())).once();
    });

    test('When calling execObservable, use a process service if no module name is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.execObservable(executionInfo, options, resource);

        assert.deepEqual(result, observable);
        verify(processService.execObservable(executionInfo.execPath!, executionInfo.args, anything())).once();
    });

    test('When calling exec, throw an error if environment variables are passed to the options parameter', () => {
        const options = { env: { envOne: 'envOne' } };
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: 'moduleOne',
            args: ['-a', 'b', '-c'],
        };

        const promise = executionService.exec(executionInfo, options, resource);

        expect(promise).to.eventually.be.rejectedWith('Environment variables are not supported');
    });

    test('When calling exec, use a python execution service if a module name is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: 'moduleOne',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.exec(executionInfo, options, resource);

        assert.deepEqual(result, executionResult);
        verify(pythonService.execModule(executionInfo.moduleName!, executionInfo.args, options)).once();
    });

    test('When calling exec, use a process service if an empty module name string is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            moduleName: '',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.exec(executionInfo, options, resource);

        assert.deepEqual(result, executionResult);
        verify(processService.exec(executionInfo.execPath!, executionInfo.args, anything())).once();
    });

    test('When calling exec, use a process service if no module name is passed to the execution info', async () => {
        const options = {};
        const executionInfo: ExecutionInfo = {
            execPath: 'foo',
            args: ['-a', 'b', '-c'],
        };

        const result = await executionService.exec(executionInfo, options, resource);

        assert.deepEqual(result, executionResult);
        verify(processService.exec(executionInfo.execPath!, executionInfo.args, anything())).once();
    });
});
