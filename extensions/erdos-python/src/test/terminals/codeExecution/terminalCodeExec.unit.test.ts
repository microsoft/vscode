// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import { SemVer } from 'semver';
import * as TypeMoq from 'typemoq';
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
import {
    ITerminalService,
    ITerminalServiceFactory,
    TerminalCreationOptions,
} from '../../../client/common/terminal/types';
import { IConfigurationService, IPythonSettings, ITerminalSettings } from '../../../client/common/types';
import { noop } from '../../../client/common/utils/misc';
import { Conda, CONDA_RUN_VERSION } from '../../../client/pythonEnvironments/common/environmentManagers/conda';
import { DjangoShellCodeExecutionProvider } from '../../../client/terminals/codeExecution/djangoShellCodeExecution';
import { ReplProvider } from '../../../client/terminals/codeExecution/repl';
import { TerminalCodeExecutionProvider } from '../../../client/terminals/codeExecution/terminalCodeExecution';
import { ICodeExecutionService } from '../../../client/terminals/types';
import { PYTHON_PATH } from '../../common';
import * as sinon from 'sinon';
import { assert } from 'chai';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { IInterpreterService } from '../../../client/interpreter/contracts';

suite('Terminal - Code Execution', () => {
    ['Terminal Execution', 'Repl Execution', 'Django Execution'].forEach((testSuiteName) => {
        let terminalSettings: TypeMoq.IMock<ITerminalSettings>;
        let terminalService: TypeMoq.IMock<ITerminalService>;
        let workspace: TypeMoq.IMock<IWorkspaceService>;
        let platform: TypeMoq.IMock<IPlatformService>;
        let workspaceFolder: TypeMoq.IMock<WorkspaceFolder>;
        let settings: TypeMoq.IMock<IPythonSettings>;
        let disposables: Disposable[] = [];
        let executor: ICodeExecutionService;
        let expectedTerminalTitle: string | undefined;
        let terminalFactory: TypeMoq.IMock<ITerminalServiceFactory>;
        let documentManager: TypeMoq.IMock<IDocumentManager>;
        let commandManager: TypeMoq.IMock<ICommandManager>;
        let fileSystem: TypeMoq.IMock<IFileSystem>;
        let pythonExecutionFactory: TypeMoq.IMock<IPythonExecutionFactory>;
        let interpreterService: TypeMoq.IMock<IInterpreterService>;
        let isDjangoRepl: boolean;
        let applicationShell: TypeMoq.IMock<IApplicationShell>;

        teardown(() => {
            disposables.forEach((disposable) => {
                if (disposable) {
                    disposable.dispose();
                }
            });
            sinon.restore();
            disposables = [];
        });

        setup(() => {
            terminalFactory = TypeMoq.Mock.ofType<ITerminalServiceFactory>();
            terminalSettings = TypeMoq.Mock.ofType<ITerminalSettings>();
            terminalService = TypeMoq.Mock.ofType<ITerminalService>();
            const configService = TypeMoq.Mock.ofType<IConfigurationService>();
            workspace = TypeMoq.Mock.ofType<IWorkspaceService>();
            platform = TypeMoq.Mock.ofType<IPlatformService>();
            workspaceFolder = TypeMoq.Mock.ofType<WorkspaceFolder>();
            documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
            commandManager = TypeMoq.Mock.ofType<ICommandManager>();
            fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
            pythonExecutionFactory = TypeMoq.Mock.ofType<IPythonExecutionFactory>();
            interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
            applicationShell = TypeMoq.Mock.ofType<IApplicationShell>();
            settings = TypeMoq.Mock.ofType<IPythonSettings>();
            settings.setup((s) => s.terminal).returns(() => terminalSettings.object);
            configService.setup((c) => c.getSettings(TypeMoq.It.isAny())).returns(() => settings.object);

            switch (testSuiteName) {
                case 'Terminal Execution': {
                    executor = new TerminalCodeExecutionProvider(
                        terminalFactory.object,
                        configService.object,
                        workspace.object,
                        disposables,
                        platform.object,
                        interpreterService.object,
                        commandManager.object,
                        applicationShell.object,
                    );
                    break;
                }
                case 'Repl Execution': {
                    executor = new ReplProvider(
                        terminalFactory.object,
                        configService.object,
                        workspace.object,
                        disposables,
                        platform.object,
                        interpreterService.object,
                        commandManager.object,
                        applicationShell.object,
                    );
                    expectedTerminalTitle = 'REPL';
                    break;
                }
                case 'Django Execution': {
                    isDjangoRepl = true;
                    workspace
                        .setup((w) =>
                            w.onDidChangeWorkspaceFolders(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                        )
                        .returns(() => {
                            return { dispose: noop };
                        });
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
                    expectedTerminalTitle = 'Django Shell';
                    break;
                }
                default: {
                    break;
                }
            }
        });

        suite(`${testSuiteName} (validation of title)`, () => {
            setup(() => {
                terminalFactory
                    .setup((f) =>
                        f.getTerminalService(
                            TypeMoq.It.is<TerminalCreationOptions>((a) => a.title === expectedTerminalTitle),
                        ),
                    )
                    .returns(() => terminalService.object);
            });

            async function ensureTerminalIsCreatedUponInvokingInitializeRepl(
                isWindows: boolean,
                isOsx: boolean,
                isLinux: boolean,
            ): Promise<void> {
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                platform.setup((p) => p.isMac).returns(() => isOsx);
                platform.setup((p) => p.isLinux).returns(() => isLinux);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.initializeRepl();
            }

            test('Ensure terminal is created upon invoking initializeRepl (windows)', async () => {
                await ensureTerminalIsCreatedUponInvokingInitializeRepl(true, false, false);
            });

            test('Ensure terminal is created upon invoking initializeRepl (osx)', async () => {
                await ensureTerminalIsCreatedUponInvokingInitializeRepl(false, true, false);
            });

            test('Ensure terminal is created upon invoking initializeRepl (linux)', async () => {
                await ensureTerminalIsCreatedUponInvokingInitializeRepl(false, false, true);
            });
        });

        suite(testSuiteName, async function () {
            this.timeout(5000); // Activation of terminals take some time (there's a delay in the code to account for VSC Terminal issues).
            setup(() => {
                terminalFactory
                    .setup((f) => f.getTerminalService(TypeMoq.It.isAny()))
                    .returns(() => terminalService.object);
            });

            async function ensureWeSetCurrentDriveBeforeChangingDirectory(_isWindows: boolean): Promise<void> {
                const file = Uri.file(path.join('d:', 'path', 'to', 'file', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.rootPath).returns(() => path.join('c:', 'path', 'to'));
                workspaceFolder.setup((w) => w.uri).returns(() => Uri.file(path.join('c:', 'path', 'to')));
                platform.setup((p) => p.isWindows).returns(() => true);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);
                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isValue('d:')), TypeMoq.Times.once());
            }
            test('Ensure we set current drive before changing directory on windows', async () => {
                await ensureWeSetCurrentDriveBeforeChangingDirectory(true);
            });

            test('Ensure once set current drive before, we always send command to change the drive letter for subsequent executions', async () => {
                await ensureWeSetCurrentDriveBeforeChangingDirectory(true);
                const file = Uri.file(path.join('c:', 'path', 'to', 'file', 'one.py'));
                await executor.executeFile(file);
                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isValue('c:')), TypeMoq.Times.once());
            });

            async function ensureWeDoNotChangeDriveIfDriveLetterSameAsFileDriveLetter(
                _isWindows: boolean,
            ): Promise<void> {
                const file = Uri.file(path.join('c:', 'path', 'to', 'file', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.rootPath).returns(() => path.join('c:', 'path', 'to'));
                workspaceFolder.setup((w) => w.uri).returns(() => Uri.file(path.join('c:', 'path', 'to')));
                platform.setup((p) => p.isWindows).returns(() => true);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);
                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isValue('c:')), TypeMoq.Times.never());
            }
            test('Ensure we do not change drive if current drive letter is same as the file drive letter on windows', async () => {
                await ensureWeDoNotChangeDriveIfDriveLetterSameAsFileDriveLetter(true);
            });

            async function ensureWeSetCurrentDirectoryBeforeExecutingAFile(_isWindows: boolean): Promise<void> {
                const file = Uri.file(path.join('c', 'path', 'to', 'file', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => workspaceFolder.object);
                workspaceFolder.setup((w) => w.uri).returns(() => Uri.file(path.join('c', 'path', 'to')));
                platform.setup((p) => p.isWindows).returns(() => false);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);

                terminalService.verify(
                    async (t) =>
                        t.sendText(
                            TypeMoq.It.isValue(`cd ${path.dirname(file.fsPath).fileToCommandArgumentForPythonExt()}`),
                        ),
                    TypeMoq.Times.once(),
                );
            }
            test('Ensure we set current directory before executing file (non windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingAFile(false);
            });
            test('Ensure we set current directory before executing file (windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingAFile(true);
            });

            async function ensureWeWetCurrentDirectoryAndQuoteBeforeExecutingFile(isWindows: boolean): Promise<void> {
                const file = Uri.file(path.join('c', 'path', 'to', 'file with spaces in path', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => workspaceFolder.object);
                workspaceFolder.setup((w) => w.uri).returns(() => Uri.file(path.join('c', 'path', 'to')));
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);
                const dir = path.dirname(file.fsPath).fileToCommandArgumentForPythonExt();
                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isValue(`cd ${dir}`)), TypeMoq.Times.once());
            }

            test('Ensure we set current directory (and quote it when containing spaces) before executing file (non windows)', async () => {
                await ensureWeWetCurrentDirectoryAndQuoteBeforeExecutingFile(false);
            });

            test('Ensure we set current directory (and quote it when containing spaces) before executing file (windows)', async () => {
                await ensureWeWetCurrentDirectoryAndQuoteBeforeExecutingFile(true);
            });

            async function ensureWeSetCurrentDirectoryBeforeExecutingFileInWorkspaceDirectory(
                isWindows: boolean,
            ): Promise<void> {
                const file = Uri.file(path.join('c', 'path', 'to', 'file with spaces in path', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => workspaceFolder.object);
                workspaceFolder
                    .setup((w) => w.uri)
                    .returns(() => Uri.file(path.join('c', 'path', 'to', 'file with spaces in path')));
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);

                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isAny()), TypeMoq.Times.once());
            }
            test('Ensure we set current directory before executing file if in the same directory as the current workspace (non windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingFileInWorkspaceDirectory(false);
            });
            test('Ensure we set current directory before executing file if in the same directory as the current workspace (windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingFileInWorkspaceDirectory(true);
            });

            async function ensureWeSetCurrentDirectoryBeforeExecutingFileNotInSameDirectory(
                isWindows: boolean,
            ): Promise<void> {
                const file = Uri.file(path.join('c', 'path', 'to', 'file with spaces in path', 'one.py'));
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => true);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => undefined);
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: PYTHON_PATH } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => []);

                await executor.executeFile(file);

                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isAny()), TypeMoq.Times.once());
            }
            test('Ensure we set current directory before executing file if file is not in a workspace (non windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingFileNotInSameDirectory(false);
            });
            test('Ensure we set current directory before executing file if file is not in a workspace (windows)', async () => {
                await ensureWeSetCurrentDirectoryBeforeExecutingFileNotInSameDirectory(true);
            });

            async function testFileExecution(
                isWindows: boolean,
                pythonPath: string,
                terminalArgs: string[],
                file: Uri,
            ): Promise<void> {
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => false);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => undefined);
                pythonExecutionFactory
                    .setup((p) => p.createCondaExecutionService(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(undefined));

                await executor.executeFile(file);
                const expectedPythonPath = isWindows ? pythonPath.replace(/\\/g, '/') : pythonPath;
                const expectedArgs = terminalArgs.concat(file.fsPath.fileToCommandArgumentForPythonExt());
                terminalService.verify(
                    async (t) =>
                        t.sendCommand(TypeMoq.It.isValue(expectedPythonPath), TypeMoq.It.isValue(expectedArgs)),
                    TypeMoq.Times.once(),
                );
            }

            test('Ensure python file execution script is sent to terminal on windows', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file with spaces in path', 'one.py'));
                await testFileExecution(true, PYTHON_PATH, [], file);
            });

            test('Ensure python file execution script is sent to terminal on windows with fully qualified python path', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file with spaces in path', 'one.py'));
                await testFileExecution(true, 'c:\\program files\\python', [], file);
            });

            test('Ensure python file execution script is not quoted when no spaces in file path', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file', 'one.py'));
                await testFileExecution(true, PYTHON_PATH, [], file);
            });

            test('Ensure python file execution script supports custom python arguments', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file', 'one.py'));
                await testFileExecution(false, PYTHON_PATH, ['-a', '-b', '-c'], file);
            });

            async function testCondaFileExecution(
                pythonPath: string,
                terminalArgs: string[],
                file: Uri,
                condaEnv: { name: string; path: string },
            ): Promise<void> {
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);
                terminalSettings.setup((t) => t.executeInFileDir).returns(() => false);
                workspace.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny())).returns(() => undefined);

                const condaFile = 'conda';
                const procService = TypeMoq.Mock.ofType<IProcessService>();
                sinon.stub(Conda, 'getConda').resolves(new Conda(condaFile));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
                sinon.stub(Conda.prototype, 'getInterpreterPathForEnvironment').resolves(pythonPath);
                const env = await createCondaEnv(condaEnv, procService.object, fileSystem.object);
                if (!env) {
                    assert(false, 'Should not be undefined for conda version 4.9.0');
                    return;
                }
                const procs = createPythonProcessService(procService.object, env);
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
                pythonExecutionFactory
                    .setup((p) => p.createCondaExecutionService(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(condaExecutionService));

                await executor.executeFile(file);

                const expectedArgs = [...terminalArgs, file.fsPath.fileToCommandArgumentForPythonExt()];

                terminalService.verify(
                    async (t) => t.sendCommand(TypeMoq.It.isValue(pythonPath), TypeMoq.It.isValue(expectedArgs)),
                    TypeMoq.Times.once(),
                );
            }

            test('Ensure conda args with conda env name are sent to terminal if there is a conda environment with a name', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file', 'one.py'));
                await testCondaFileExecution(PYTHON_PATH, ['-a', '-b', '-c'], file, {
                    name: 'foo-env',
                    path: 'path/to/foo-env',
                });
            });

            test('Ensure conda args with conda env path are sent to terminal if there is a conda environment without a name', async () => {
                const file = Uri.file(path.join('c', 'path', 'to', 'file', 'one.py'));
                await testCondaFileExecution(PYTHON_PATH, ['-a', '-b', '-c'], file, {
                    name: '',
                    path: 'path/to/foo-env',
                });
            });

            async function testReplCommandArguments(
                isWindows: boolean,
                pythonPath: string,
                expectedPythonPath: string,
                terminalArgs: string[],
            ) {
                pythonExecutionFactory
                    .setup((p) => p.createCondaExecutionService(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(undefined));
                platform.setup((p) => p.isWindows).returns(() => isWindows);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);
                const expectedTerminalArgs = isDjangoRepl ? terminalArgs.concat(['manage.py', 'shell']) : terminalArgs;

                const replCommandArgs = await (executor as TerminalCodeExecutionProvider).getExecutableInfo();
                expect(replCommandArgs).not.to.be.an('undefined', 'Command args is undefined');
                expect(replCommandArgs.command).to.be.equal(expectedPythonPath, 'Incorrect python path');
                expect(replCommandArgs.args).to.be.deep.equal(expectedTerminalArgs, 'Incorrect arguments');
            }

            test('Ensure fully qualified python path is escaped when building repl args on Windows', async () => {
                const pythonPath = 'c:\\program files\\python\\python.exe';
                const terminalArgs = ['-a', 'b', 'c'];

                await testReplCommandArguments(true, pythonPath, 'c:/program files/python/python.exe', terminalArgs);
            });

            test('Ensure fully qualified python path is returned as is, when building repl args on Windows', async () => {
                const pythonPath = 'c:/program files/python/python.exe';
                const terminalArgs = ['-a', 'b', 'c'];

                await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs);
            });

            test('Ensure python path is returned as is, when building repl args on Windows', async () => {
                const pythonPath = PYTHON_PATH;
                const terminalArgs = ['-a', 'b', 'c'];

                await testReplCommandArguments(true, pythonPath, pythonPath, terminalArgs);
            });

            test('Ensure fully qualified python path is returned as is, on non Windows', async () => {
                const pythonPath = 'usr/bin/python';
                const terminalArgs = ['-a', 'b', 'c'];

                await testReplCommandArguments(false, pythonPath, pythonPath, terminalArgs);
            });

            test('Ensure python path is returned as is, on non Windows', async () => {
                const pythonPath = PYTHON_PATH;
                const terminalArgs = ['-a', 'b', 'c'];

                await testReplCommandArguments(false, pythonPath, pythonPath, terminalArgs);
            });

            async function testReplCondaCommandArguments(
                pythonPath: string,
                terminalArgs: string[],
                condaEnv: { name: string; path: string },
            ) {
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

                const condaFile = 'conda';
                const procService = TypeMoq.Mock.ofType<IProcessService>();
                sinon.stub(Conda, 'getConda').resolves(new Conda(condaFile));
                sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
                sinon.stub(Conda.prototype, 'getInterpreterPathForEnvironment').resolves(pythonPath);
                const env = await createCondaEnv(condaEnv, procService.object, fileSystem.object);
                if (!env) {
                    assert(false, 'Should not be undefined for conda version 4.9.0');
                    return;
                }
                const procs = createPythonProcessService(procService.object, env);
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
                pythonExecutionFactory
                    .setup((p) => p.createCondaExecutionService(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(condaExecutionService));

                const djangoArgs = isDjangoRepl ? ['manage.py', 'shell'] : [];
                const expectedTerminalArgs = [...terminalArgs, ...djangoArgs];

                const replCommandArgs = await (executor as TerminalCodeExecutionProvider).getExecutableInfo();

                expect(replCommandArgs).not.to.be.an('undefined', 'Conda command args are undefined');
                expect(replCommandArgs.command).to.be.equal(pythonPath, 'Repl needs to use python, not conda');
                expect(replCommandArgs.args).to.be.deep.equal(expectedTerminalArgs, 'Incorrect terminal arguments');
            }

            test('Ensure conda args with env name are returned when building repl args with a conda env with a name', async () => {
                await testReplCondaCommandArguments(PYTHON_PATH, ['-a', 'b', 'c'], {
                    name: 'foo-env',
                    path: 'path/to/foo-env',
                });
            });

            test('Ensure conda args with env path are returned when building repl args with a conda env without a name', async () => {
                await testReplCondaCommandArguments(PYTHON_PATH, ['-a', 'b', 'c'], {
                    name: '',
                    path: 'path/to/foo-env',
                });
            });

            test('Ensure nothing happens when blank text is sent to the terminal', async () => {
                await executor.execute('');
                await executor.execute('   ');

                await executor.execute((undefined as any) as string);

                terminalService.verify(
                    async (t) => t.sendCommand(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                    TypeMoq.Times.never(),
                );
                terminalService.verify(async (t) => t.sendText(TypeMoq.It.isAny()), TypeMoq.Times.never());
            });

            test('Ensure repl is initialized once before sending text to the repl', async () => {
                const pythonPath = 'usr/bin/python1234';
                const terminalArgs = ['-a', 'b', 'c'];

                platform.setup((p) => p.isWindows).returns(() => false);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

                await executor.execute('cmd1');
                await executor.execute('cmd2');
                await executor.execute('cmd3');

                const expectedTerminalArgs = isDjangoRepl ? terminalArgs.concat(['manage.py', 'shell']) : terminalArgs;
                terminalService.verify(
                    async (t) =>
                        t.sendCommand(TypeMoq.It.isValue(pythonPath), TypeMoq.It.isValue(expectedTerminalArgs)),
                    TypeMoq.Times.once(),
                );
            });

            test('Ensure REPL launches after reducing risk of command being ignored or duplicated', async () => {
                const pythonPath = 'usr/bin/python1234';
                const terminalArgs = ['-a', 'b', 'c'];
                platform.setup((p) => p.isWindows).returns(() => false);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

                await executor.execute('cmd1');
                await executor.execute('cmd2');
                await executor.execute('cmd3');

                // Now check if sendCommand from the initializeRepl is called atLeastOnce.
                // This is due to newly added Promise race and fallback to lower risk of swollen first command.
                applicationShell.verify(
                    async (t) => t.onDidWriteTerminalData(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                    TypeMoq.Times.atLeastOnce(),
                );

                await executor.execute('cmd4');
                applicationShell.verify(
                    async (t) => t.onDidWriteTerminalData(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                    TypeMoq.Times.atLeastOnce(),
                );

                await executor.execute('cmd5');
                applicationShell.verify(
                    async (t) => t.onDidWriteTerminalData(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                    TypeMoq.Times.atLeastOnce(),
                );
            });

            test('Ensure code is sent to terminal', async () => {
                const pythonPath = 'usr/bin/python1234';
                const terminalArgs = ['-a', 'b', 'c'];
                platform.setup((p) => p.isWindows).returns(() => false);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

                await executor.execute('cmd1');
                terminalService.verify(async (t) => t.executeCommand('cmd1', true), TypeMoq.Times.once());

                await executor.execute('cmd2');
                terminalService.verify(async (t) => t.executeCommand('cmd2', true), TypeMoq.Times.once());
            });

            test('Ensure code is sent to the same terminal for a particular resource', async () => {
                const resource = Uri.file('a');
                terminalFactory.reset();
                terminalFactory
                    .setup((f) => f.getTerminalService(TypeMoq.It.isAny()))
                    .callback((options: TerminalCreationOptions) => {
                        assert.deepEqual(options.resource, resource);
                    })
                    .returns(() => terminalService.object);

                const pythonPath = 'usr/bin/python1234';
                const terminalArgs = ['-a', 'b', 'c'];
                platform.setup((p) => p.isWindows).returns(() => false);
                interpreterService
                    .setup((s) => s.getActiveInterpreter(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
                terminalSettings.setup((t) => t.launchArgs).returns(() => terminalArgs);

                await executor.execute('cmd1', resource);
                terminalService.verify(async (t) => t.executeCommand('cmd1', true), TypeMoq.Times.once());

                await executor.execute('cmd2', resource);
                terminalService.verify(async (t) => t.executeCommand('cmd2', true), TypeMoq.Times.once());
            });
        });
    });
});
