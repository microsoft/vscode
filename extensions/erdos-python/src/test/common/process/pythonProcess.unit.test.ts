// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as TypeMoq from 'typemoq';
import { IFileSystem } from '../../../client/common/platform/types';
import { createPythonEnv } from '../../../client/common/process/pythonEnvironment';
import { createPythonProcessService } from '../../../client/common/process/pythonProcess';
import { IProcessService, StdErrError } from '../../../client/common/process/types';
import { noop } from '../../core';

use(chaiAsPromised.default);

suite('PythonProcessService', () => {
    let processService: TypeMoq.IMock<IProcessService>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    const pythonPath = 'path/to/python';

    setup(() => {
        processService = TypeMoq.Mock.ofType<IProcessService>(undefined, TypeMoq.MockBehavior.Strict);
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>(undefined, TypeMoq.MockBehavior.Strict);
    });

    test('execObservable should call processService.execObservable', () => {
        const args = ['-a', 'b', '-c'];
        const options = {};
        const observable = {
            proc: undefined,

            out: {} as any,
            dispose: () => {
                noop();
            },
        };
        processService.setup((p) => p.execObservable(pythonPath, args, options)).returns(() => observable);
        const env = createPythonEnv(pythonPath, processService.object, fileSystem.object);
        const procs = createPythonProcessService(processService.object, env);

        const result = procs.execObservable(args, options);

        processService.verify((p) => p.execObservable(pythonPath, args, options), TypeMoq.Times.once());
        expect(result).to.be.equal(observable, 'execObservable should return an observable');
    });

    test('execModuleObservable should call processService.execObservable with the -m argument', () => {
        const args = ['-a', 'b', '-c'];
        const moduleName = 'foo';
        const expectedArgs = ['-m', moduleName, ...args];
        const options = {};
        const observable = {
            proc: undefined,

            out: {} as any,
            dispose: () => {
                noop();
            },
        };
        processService.setup((p) => p.execObservable(pythonPath, expectedArgs, options)).returns(() => observable);
        const env = createPythonEnv(pythonPath, processService.object, fileSystem.object);
        const procs = createPythonProcessService(processService.object, env);

        const result = procs.execModuleObservable(moduleName, args, options);

        processService.verify((p) => p.execObservable(pythonPath, expectedArgs, options), TypeMoq.Times.once());
        expect(result).to.be.equal(observable, 'execModuleObservable should return an observable');
    });

    test('exec should call processService.exec', async () => {
        const args = ['-a', 'b', '-c'];
        const options = {};
        const stdout = 'foo';
        processService.setup((p) => p.exec(pythonPath, args, options)).returns(() => Promise.resolve({ stdout }));
        const env = createPythonEnv(pythonPath, processService.object, fileSystem.object);
        const procs = createPythonProcessService(processService.object, env);

        const result = await procs.exec(args, options);

        processService.verify((p) => p.exec(pythonPath, args, options), TypeMoq.Times.once());
        expect(result.stdout).to.be.equal(stdout, 'exec should return the content of stdout');
    });

    test('execModule should call processService.exec with the -m argument', async () => {
        const args = ['-a', 'b', '-c'];
        const moduleName = 'foo';
        const expectedArgs = ['-m', moduleName, ...args];
        const options = {};
        const stdout = 'bar';
        processService
            .setup((p) => p.exec(pythonPath, expectedArgs, options))
            .returns(() => Promise.resolve({ stdout }));
        const env = createPythonEnv(pythonPath, processService.object, fileSystem.object);
        const procs = createPythonProcessService(processService.object, env);

        const result = await procs.execModule(moduleName, args, options);

        processService.verify((p) => p.exec(pythonPath, expectedArgs, options), TypeMoq.Times.once());
        expect(result.stdout).to.be.equal(stdout, 'exec should return the content of stdout');
    });

    test('execModule should throw an error if the module is not installed', async () => {
        const args = ['-a', 'b', '-c'];
        const moduleName = 'foo';
        const expectedArgs = ['-m', moduleName, ...args];
        const options = {};
        processService
            .setup((p) => p.exec(pythonPath, expectedArgs, options))
            .returns(() => Promise.resolve({ stdout: 'bar', stderr: `Error: No module named ${moduleName}` }));
        processService
            .setup((p) => p.exec(pythonPath, ['-c', `import ${moduleName}`], { throwOnStdErr: true }))
            .returns(() => Promise.reject(new StdErrError('not installed')));
        const env = createPythonEnv(pythonPath, processService.object, fileSystem.object);
        const procs = createPythonProcessService(processService.object, env);

        const result = procs.execModule(moduleName, args, options);

        expect(result).to.eventually.be.rejectedWith(`Module '${moduleName}' not installed`);
    });
});
