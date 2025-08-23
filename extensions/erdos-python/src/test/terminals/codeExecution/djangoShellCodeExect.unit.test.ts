// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { Disposable, Uri, WorkspaceFolder } from 'vscode';
import {
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    IWorkspaceService,
} from '../../../client/common/application/types';
import { IFileSystem, IPlatformService } from '../../../client/common/platform/types';
import { createCondaEnv } from '../../../client/common/process/pythonEnvironment';
import { createPythonProcessService } from '../../../client/common/process/pythonProcess';
import { IProcessService, IPythonExecutionFactory } from '../../../client/common/process/types';
import { ITerminalService, ITerminalServiceFactory } from '../../../client/common/terminal/types';
import { IConfigurationService, IPythonSettings, ITerminalSettings } from '../../../client/common/types';
import { DjangoShellCodeExecutionProvider } from '../../../client/terminals/codeExecution/djangoShellCodeExecution';
import { ICodeExecutionService } from '../../../client/terminals/types';
import { PYTHON_PATH } from '../../common';
import { Conda, CONDA_RUN_VERSION } from '../../../client/pythonEnvironments/common/environmentManagers/conda';
import { SemVer } from 'semver';
import assert from 'assert';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';

suite('Terminal - Django Shell Code Execution', () => {
    let executor: ICodeExecutionService;
    let terminalSettings: TypeMoq.IMock<ITerminalSettings>;
    let terminalService: TypeMoq.IMock<ITerminalService>;
    let workspace: TypeMoq.IMock<IWorkspaceService>;
    let platform: TypeMoq.IMock<IPlatformService>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    let settings: TypeMoq.IMock<IPythonSettings>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let pythonExecutionFactory: TypeMoq.IMock<IPythonExecutionFactory>;
    let applicationShell: TypeMoq.IMock<IApplicationShell>;
    let disposables: Disposable[] = [];
    setup(() => {
        const terminalFactory = TypeMoq.Mock.ofType<ITerminalServiceFactory>();
        terminalSettings = TypeMoq.Mock.ofType<ITerminalSettings>();
        terminalService = TypeMoq.Mock.ofType<ITerminalService>();
        const configService = TypeMoq.Mock.ofType<IConfigurationService>();
        applicationShell = TypeMoq.Mock.ofType<IApplicationShell>();
        workspace = TypeMoq.Mock.ofType<IWorkspaceService>();
        workspace
            .setup((c) => c.onDidChangeWorkspaceFolders(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => {
                return {
                    dispose: () => void 0,
                };
            });
        platform = TypeMoq.Mock.ofType<IPlatformService>();
        const documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        const commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
        pythonExecutionFactory = TypeMoq.Mock.ofType<IPythonExecutionFactory>();
        executor = new DjangoShellCodeExecutionProvider(
            terminalFactory.object,
            configService.object,
            workspace.object,
            documentManager.object,
            platform.object,
            commandManager.object,
            fileSystem.object,
            disposables,
            interpreterService.object,
            applicationShell.object,
        );

        terminalFactory.setup((f) => f.getTerminalService(TypeMoq.It.isAny())).returns(() => terminalService.object);

        settings = TypeMoq.Mock.ofType<IPythonSettings>();
        settings.setup((s) => s.terminal).returns(() => terminalSettings.object);
        configService.setup((c) => c.getSettings(TypeMoq.It.isAny())).returns(() => settings.object);
    });
    teardown(() => {
        disposables.forEach((disposable) => {
            if (disposable) {
                disposable.dispose();
            }
        });

        disposables = [];
        sinon.restore();
    });

    async function testReplCommandArguments(
        isWindows: boolean,
        pythonPath: string,
        expectedPythonPath: string,
        terminalArgs: string[],
        expectedTerminalArgs: string[],
        resource?: Uri,
    ) {
        platform.setup((p) => p.isWindows).returns(() => isWindows);
        interpreterService
            .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

        const replCommandArgs = await (executor as DjangoShellCodeExecutionProvider).getExecutableInfo(resource);
        expect(replCommandArgs).not.to.be.an('undefined', 'Command args is undefined');
        expect(replCommandArgs.command).to.be.equal(expectedPythonPath, 'Incorrect python path');
        expect(replCommandArgs.args).to.be.deep.equal(expectedTerminalArgs, 'Incorrect arguments');
    }

    test('Ensure fully qualified python path is escaped when building repl args on Windows', async () => {
        const pythonPath = 'c:\\program files\\python\\python.exe';
        const terminalArgs = ['-a', 'b', 'c'];
        const expectedTerminalArgs = terminalArgs.concat('manage.py', 'shell');

        await testReplCommandArguments(
            true,
            pythonPath,
            'c:/program files/python/python.exe',
            terminalArgs,
            expectedTerminalArgs,
        );
    });

    test('Ensure fully qualified python path is returned as is, when building repl args on Windows', async () => {
        const pythonPath = 'c:/program files/python/python.exe';
        const terminalArgs = ['-a', 'b', 'c'];
        const expectedTerminalArgs = terminalArgs.concat('manage.py', 'shell');

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs);
    });

    test('Ensure python path is returned as is, when building repl args on Windows', async () => {
        const pythonPath = PYTHON_PATH;
        const terminalArgs = ['-a', 'b', 'c'];
        const expectedTerminalArgs = terminalArgs.concat('manage.py', 'shell');

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs);
    });

    test('Ensure fully qualified python path is returned as is, on non Windows', async () => {
        const pythonPath = 'usr/bin/python';
        const terminalArgs = ['-a', 'b', 'c'];
        const expectedTerminalArgs = terminalArgs.concat('manage.py', 'shell');

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs);
    });

    test('Ensure python path is returned as is, on non Windows', async () => {
        const pythonPath = PYTHON_PATH;
        const terminalArgs = ['-a', 'b', 'c'];
        const expectedTerminalArgs = terminalArgs.concat('manage.py', 'shell');

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs);
    });

    test('Ensure current workspace folder (containing spaces) is used to prefix manage.py', async () => {
        const pythonPath = 'python1234';
        const terminalArgs = ['-a', 'b', 'c'];
        const workspaceUri = Uri.file(path.join('c', 'usr', 'program files'));
        const workspaceFolder: WorkspaceFolder = { index: 0, name: 'blah', uri: workspaceUri };
        workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => workspaceFolder);
        const expectedTerminalArgs = terminalArgs.concat(
            `${path.join(workspaceUri.fsPath, 'manage.py').fileToCommandArgumentForPythonExt()}`,
            'shell',
        );

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs, Uri.file('x'));
    });

    test('Ensure current workspace folder (without spaces) is used to prefix manage.py', async () => {
        const pythonPath = 'python1234';
        const terminalArgs = ['-a', 'b', 'c'];
        const workspaceUri = Uri.file(path.join('c', 'usr', 'programfiles'));
        const workspaceFolder: WorkspaceFolder = { index: 0, name: 'blah', uri: workspaceUri };
        workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => workspaceFolder);
        const expectedTerminalArgs = terminalArgs.concat(
            path.join(workspaceUri.fsPath, 'manage.py').fileToCommandArgumentForPythonExt(),
            'shell',
        );

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs, Uri.file('x'));
    });

    test('Ensure default workspace folder (containing spaces) is used to prefix manage.py', async () => {
        const pythonPath = 'python1234';
        const terminalArgs = ['-a', 'b', 'c'];
        const workspaceUri = Uri.file(path.join('c', 'usr', 'program files'));
        const workspaceFolder: WorkspaceFolder = { index: 0, name: 'blah', uri: workspaceUri };
        workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => undefined);
        workspace.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
        const expectedTerminalArgs = terminalArgs.concat(
            `${path.join(workspaceUri.fsPath, 'manage.py').fileToCommandArgumentForPythonExt()}`,
            'shell',
        );

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs, Uri.file('x'));
    });

    test('Ensure default workspace folder (without spaces) is used to prefix manage.py', async () => {
        const pythonPath = 'python1234';
        const terminalArgs = ['-a', 'b', 'c'];
        const workspaceUri = Uri.file(path.join('c', 'usr', 'programfiles'));
        const workspaceFolder: WorkspaceFolder = { index: 0, name: 'blah', uri: workspaceUri };
        workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => undefined);
        workspace.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
        const expectedTerminalArgs = terminalArgs.concat(
            path.join(workspaceUri.fsPath, 'manage.py').fileToCommandArgumentForPythonExt(),
            'shell',
        );

        await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs, expectedTerminalArgs, Uri.file('x'));
    });

    async function testReplCondaCommandArguments(
        pythonPath: string,
        terminalArgs: string[],
        condaEnv: { name: string; path: string },
        resource?: Uri,
    ) {
        interpreterService
            .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

        const condaFile = 'conda';
        const processService = TypeMoq.Mock.ofType<IProcessService>();
        sinon.stub(Conda, 'getConda').resolves(new Conda(condaFile));
        sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
        sinon.stub(Conda.prototype, 'getInterpreterPathForEnvironment').resolves(pythonPath);
        const env = await createCondaEnv(condaEnv, processService.object, fileSystem.object);
        if (!env) {
            assert(false, 'Should not be undefined for conda version 4.9.0');
        }
        const procs = createPythonProcessService(processService.object, env);
        const condaExecutionService = {
            getInterpreterInformation: env.getInterpreterInformation,
            getExecutablePath: env.getExecutablePath,
            isModuleInstalled: env.isModuleInstalled,
            getModuleVersion: env.getModuleVersion,
            getExecutionInfo: env.getExecutionInfo,
            execObservable: procs.execObservable,
            execModuleObservable: procs.execModuleObservable,
            exec: procs.exec,
            execModule: procs.execModule,
            execForLinter: procs.execForLinter,
        };
        const expectedTerminalArgs = [...terminalArgs, 'manage.py', 'shell'];
        pythonExecutionFactory
            .setup((p) => p.createCondaExecutionService(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(condaExecutionService));

        const replCommandArgs = await (executor as DjangoShellCodeExecutionProvider).getExecutableInfo(resource);

        expect(replCommandArgs).not.to.be.an('undefined', 'Conda command args are undefined');
        expect(replCommandArgs.command).to.be.equal(pythonPath, 'Repl should use python not conda');
        expect(replCommandArgs.args).to.be.deep.equal(expectedTerminalArgs, 'Incorrect terminal arguments');
    }

    test('Ensure conda args including env name are passed when using a conda environment with a name', async () => {
        const pythonPath = 'c:/program files/python/python.exe';
        const condaPath = { name: 'foo-env', path: 'path/to/foo-env' };
        const terminalArgs = ['-a', 'b', '-c'];

        await testReplCondaCommandArguments(pythonPath, terminalArgs, condaPath);
    });

    test('Ensure conda args including env path are passed when using a conda environment with an empty name', async () => {
        const pythonPath = 'c:/program files/python/python.exe';
        const condaPath = { name: '', path: 'path/to/foo-env' };
        const terminalArgs = ['-a', 'b', '-c'];

        await testReplCondaCommandArguments(pythonPath, terminalArgs, condaPath);
    });
});
