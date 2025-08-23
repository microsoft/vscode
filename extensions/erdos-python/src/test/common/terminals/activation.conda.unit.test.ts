// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import { anything, instance, mock, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Disposable } from 'vscode';
import { TerminalManager } from '../../../client/common/application/terminalManager';
import '../../../client/common/extensions';
import { IFileSystem, IPlatformService } from '../../../client/common/platform/types';
import { IProcessService, IProcessServiceFactory } from '../../../client/common/process/types';
import { Bash } from '../../../client/common/terminal/environmentActivationProviders/bash';
import { CommandPromptAndPowerShell } from '../../../client/common/terminal/environmentActivationProviders/commandPrompt';
import { Nushell } from '../../../client/common/terminal/environmentActivationProviders/nushell';
import {
    CondaActivationCommandProvider,
    _getPowershellCommands,
} from '../../../client/common/terminal/environmentActivationProviders/condaActivationProvider';
import { PipEnvActivationCommandProvider } from '../../../client/common/terminal/environmentActivationProviders/pipEnvActivationProvider';
import { PyEnvActivationCommandProvider } from '../../../client/common/terminal/environmentActivationProviders/pyenvActivationProvider';
import { TerminalHelper } from '../../../client/common/terminal/helper';
import { ITerminalActivationCommandProvider, TerminalShellType } from '../../../client/common/terminal/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IPythonSettings,
    ITerminalSettings,
} from '../../../client/common/types';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { IComponentAdapter, ICondaService } from '../../../client/interpreter/contracts';
import { InterpreterService } from '../../../client/interpreter/interpreterService';
import { IServiceContainer } from '../../../client/ioc/types';
import { PixiActivationCommandProvider } from '../../../client/common/terminal/environmentActivationProviders/pixiActivationProvider';

suite('Terminal Environment Activation conda', () => {
    let terminalHelper: TerminalHelper;
    let disposables: Disposable[] = [];
    let terminalSettings: TypeMoq.IMock<ITerminalSettings>;
    let platformService: TypeMoq.IMock<IPlatformService>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    let pythonSettings: TypeMoq.IMock<IPythonSettings>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let processService: TypeMoq.IMock<IProcessService>;
    let procServiceFactory: TypeMoq.IMock<IProcessServiceFactory>;
    let condaService: TypeMoq.IMock<ICondaService>;
    let componentAdapter: TypeMoq.IMock<IComponentAdapter>;
    let configService: TypeMoq.IMock<IConfigurationService>;
    let conda: string;
    let bash: ITerminalActivationCommandProvider;

    setup(() => {
        conda = 'conda';
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        disposables = [];
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IDisposableRegistry), TypeMoq.It.isAny()))
            .returns(() => disposables);

        componentAdapter = TypeMoq.Mock.ofType<IComponentAdapter>();
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
        platformService = TypeMoq.Mock.ofType<IPlatformService>();
        processService = TypeMoq.Mock.ofType<IProcessService>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IComponentAdapter)))
            .returns(() => componentAdapter.object);
        condaService = TypeMoq.Mock.ofType<ICondaService>();
        condaService.setup((c) => c.getCondaFile()).returns(() => Promise.resolve(conda));
        bash = mock(Bash);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        processService.setup((x: any) => x.then).returns(() => undefined);
        procServiceFactory = TypeMoq.Mock.ofType<IProcessServiceFactory>();
        procServiceFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(processService.object));

        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IPlatformService), TypeMoq.It.isAny()))
            .returns(() => platformService.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IFileSystem), TypeMoq.It.isAny()))
            .returns(() => fileSystem.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IProcessServiceFactory), TypeMoq.It.isAny()))
            .returns(() => procServiceFactory.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(ICondaService), TypeMoq.It.isAny()))
            .returns(() => condaService.object);

        configService = TypeMoq.Mock.ofType<IConfigurationService>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IConfigurationService)))
            .returns(() => configService.object);
        pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
        configService.setup((c) => c.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);

        terminalSettings = TypeMoq.Mock.ofType<ITerminalSettings>();
        pythonSettings.setup((s) => s.terminal).returns(() => terminalSettings.object);

        terminalHelper = new TerminalHelper(
            platformService.object,
            instance(mock(TerminalManager)),
            serviceContainer.object,
            instance(mock(InterpreterService)),
            configService.object,
            new CondaActivationCommandProvider(
                condaService.object,
                platformService.object,
                configService.object,
                componentAdapter.object,
            ),
            instance(bash),
            mock(CommandPromptAndPowerShell),
            mock(Nushell),
            mock(PyEnvActivationCommandProvider),
            mock(PipEnvActivationCommandProvider),
            mock(PixiActivationCommandProvider),
            [],
        );
    });
    teardown(() => {
        disposables.forEach((disposable) => {
            if (disposable) {
                disposable.dispose();
            }
        });
    });

    test('Conda activation for fish escapes spaces in conda filename', async () => {
        conda = 'path to conda';
        const envName = 'EnvA';
        const pythonPath = 'python3';
        platformService.setup((p) => p.isWindows).returns(() => false);
        componentAdapter
            .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve({ name: envName, path: path.dirname(pythonPath) }));
        const expected = ['"path to conda" activate EnvA'];

        const provider = new CondaActivationCommandProvider(
            condaService.object,
            platformService.object,
            configService.object,
            componentAdapter.object,
        );
        const activationCommands = await provider.getActivationCommands(undefined, TerminalShellType.fish);

        expect(activationCommands).to.deep.equal(expected, 'Incorrect Activation command');
    });

    test('Conda activation on bash uses "conda" after 4.4.0', async () => {
        const envName = 'EnvA';
        const pythonPath = 'python3';
        const condaPath = path.join('a', 'b', 'c', 'conda');
        platformService.setup((p) => p.isWindows).returns(() => false);
        condaService.reset();
        componentAdapter
            .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
            .returns(() =>
                Promise.resolve({
                    name: envName,
                    path: path.dirname(pythonPath),
                }),
            );
        condaService.setup((c) => c.getCondaFile()).returns(() => Promise.resolve(condaPath));
        const expected = [
            `source ${path.join(path.dirname(condaPath), 'activate').fileToCommandArgumentForPythonExt()} EnvA`,
        ];

        const provider = new CondaActivationCommandProvider(
            condaService.object,
            platformService.object,
            configService.object,
            componentAdapter.object,
        );
        const activationCommands = await provider.getActivationCommands(undefined, TerminalShellType.bash);

        expect(activationCommands).to.deep.equal(expected, 'Incorrect Activation command');
    });

    const interpreterPath = path.join('path', 'to', 'interpreter');
    const environmentName = 'Env';
    const environmentNameHasSpaces = 'Env with spaces';
    const testsForActivationUsingInterpreterPath: {
        testName: string;
        envName: string;
        condaScope?: 'global' | 'local';
        condaInfo?: {
            // eslint-disable-next-line camelcase
            conda_shlvl?: number;
        };
        expectedResult: string[];
        isWindows: boolean;
    }[] = [
        {
            testName:
                'Activation provides correct activation commands (windows) after 4.4.0 given interpreter path is provided, with no spaces in env name',
            envName: environmentName,
            expectedResult: ['path/to/activate', 'conda activate Env'],
            isWindows: true,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, with no spaces in env name',
            envName: environmentName,
            expectedResult: ['source path/to/activate Env'],
            isWindows: false,
        },
        {
            testName:
                'Activation provides correct activation commands (windows) after 4.4.0 given interpreter path is provided, with spaces in env name',
            envName: environmentNameHasSpaces,
            expectedResult: ['path/to/activate', 'conda activate "Env with spaces"'],
            isWindows: true,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, with spaces in env name',
            envName: environmentNameHasSpaces,
            expectedResult: ['source path/to/activate "Env with spaces"'],
            isWindows: false,
        },
        {
            testName:
                'Activation provides correct activation commands (windows) after 4.4.0 given interpreter path is provided, and no env name',
            envName: '',
            expectedResult: ['path/to/activate', `conda activate .`],
            isWindows: true,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, and no env name',
            envName: '',
            expectedResult: ['source path/to/activate .'],
            isWindows: false,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, global conda, conda not sourced and with no spaces in env name',
            envName: environmentName,
            expectedResult: ['source path/to/activate Env'],
            condaScope: 'global',
            isWindows: false,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, global conda, conda sourced and with no spaces in env name',
            envName: environmentName,
            expectedResult: ['conda activate Env'],
            condaInfo: {
                conda_shlvl: 1,
            },
            condaScope: 'global',
            isWindows: false,
        },
        {
            testName:
                'Activation provides correct activation commands (non-windows) after 4.4.0 given interpreter path is provided, local conda, conda sourced and with no spaces in env name',
            envName: environmentName,
            expectedResult: ['source path/to/activate Env'],
            condaInfo: {
                conda_shlvl: 1,
            },
            condaScope: 'local',
            isWindows: false,
        },
    ];

    testsForActivationUsingInterpreterPath.forEach((testParams) => {
        test(testParams.testName, async () => {
            const pythonPath = 'python3';
            platformService.setup((p) => p.isWindows).returns(() => testParams.isWindows);
            condaService.reset();
            componentAdapter
                .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
                .returns(() =>
                    Promise.resolve({
                        name: testParams.envName,
                        path: path.dirname(pythonPath),
                    }),
                );
            condaService
                .setup((c) => c.getCondaFileFromInterpreter(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(interpreterPath));
            condaService
                .setup((c) => c.getActivationScriptFromInterpreter(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() =>
                    Promise.resolve({
                        path: path.join(path.dirname(interpreterPath), 'activate').fileToCommandArgumentForPythonExt(),
                        type: testParams.condaScope ?? 'local',
                    }),
                );

            condaService.setup((c) => c.getCondaInfo()).returns(() => Promise.resolve(testParams.condaInfo));

            // getActivationScriptFromInterpreter

            const provider = new CondaActivationCommandProvider(
                condaService.object,
                platformService.object,
                configService.object,
                componentAdapter.object,
            );

            const activationCommands = await provider.getActivationCommands(
                undefined,
                testParams.isWindows ? TerminalShellType.commandPrompt : TerminalShellType.bash,
            );

            expect(activationCommands).to.deep.equal(testParams.expectedResult, 'Incorrect Activation command');
        });
    });

    async function testCondaActivationCommands(
        isWindows: boolean,
        isOsx: boolean,
        isLinux: boolean,
        pythonPath: string,
        shellType: TerminalShellType,
        envName: string,
    ) {
        platformService.setup((p) => p.isLinux).returns(() => isLinux);
        platformService.setup((p) => p.isWindows).returns(() => isWindows);
        platformService.setup((p) => p.isMac).returns(() => isOsx);
        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));
        pythonSettings.setup((s) => s.pythonPath).returns(() => pythonPath);
        componentAdapter
            .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve({ name: envName, path: path.dirname(pythonPath) }));

        const activationCommands = await new CondaActivationCommandProvider(
            condaService.object,
            platformService.object,
            configService.object,
            componentAdapter.object,
        ).getActivationCommands(undefined, shellType);
        let expectedActivationCommand: string[] | undefined;
        const expectEnvActivatePath = path.dirname(pythonPath);
        switch (shellType) {
            case TerminalShellType.powershell:
            case TerminalShellType.powershellCore:
            case TerminalShellType.fish: {
                if (envName !== '') {
                    expectedActivationCommand = [`conda activate ${envName.toCommandArgumentForPythonExt()}`];
                } else {
                    expectedActivationCommand = [`conda activate ${expectEnvActivatePath}`];
                }
                break;
            }
            default: {
                if (envName !== '') {
                    expectedActivationCommand = isWindows
                        ? [`activate ${envName.toCommandArgumentForPythonExt()}`]
                        : [`source activate ${envName.toCommandArgumentForPythonExt()}`];
                } else {
                    expectedActivationCommand = isWindows
                        ? [`activate ${expectEnvActivatePath}`]
                        : [`source activate ${expectEnvActivatePath}`];
                }
                break;
            }
        }
        if (expectedActivationCommand) {
            expect(activationCommands).to.deep.equal(expectedActivationCommand, 'Incorrect Activation command');
        } else {
            expect(activationCommands).to.equal(undefined, 'Incorrect Activation command');
        }
    }
    getNamesAndValues<TerminalShellType>(TerminalShellType).forEach((shellType) => {
        test(`Conda activation command for shell ${shellType.name} on (windows)`, async () => {
            const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');
            await testCondaActivationCommands(true, false, false, pythonPath, shellType.value, 'Env');
        });

        test(`Conda activation command for shell ${shellType.name} on (linux)`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, false, true, pythonPath, shellType.value, 'Env');
        });

        test(`Conda activation command for shell ${shellType.name} on (mac)`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, true, false, pythonPath, shellType.value, 'Env');
        });
    });
    getNamesAndValues<TerminalShellType>(TerminalShellType).forEach((shellType) => {
        test(`Conda activation command for shell ${shellType.name} on (windows), containing spaces in environment name`, async () => {
            const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');
            await testCondaActivationCommands(true, false, false, pythonPath, shellType.value, 'Env A');
        });

        test(`Conda activation command for shell ${shellType.name} on (linux), containing spaces in environment name`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, false, true, pythonPath, shellType.value, 'Env A');
        });

        test(`Conda activation command for shell ${shellType.name} on (mac), containing spaces in environment name`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, true, false, pythonPath, shellType.value, 'Env A');
        });
    });
    getNamesAndValues<TerminalShellType>(TerminalShellType).forEach((shellType) => {
        test(`Conda activation command for shell ${shellType.name} on (windows), containing no environment name`, async () => {
            const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');
            await testCondaActivationCommands(true, false, false, pythonPath, shellType.value, '');
        });

        test(`Conda activation command for shell ${shellType.name} on (linux), containing no environment name`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, false, true, pythonPath, shellType.value, '');
        });

        test(`Conda activation command for shell ${shellType.name} on (mac), containing no environment name`, async () => {
            const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
            await testCondaActivationCommands(false, true, false, pythonPath, shellType.value, '');
        });
    });
    async function expectCondaActivationCommand(
        isWindows: boolean,
        isOsx: boolean,
        isLinux: boolean,
        pythonPath: string,
    ) {
        platformService.setup((p) => p.isLinux).returns(() => isLinux);
        platformService.setup((p) => p.isWindows).returns(() => isWindows);
        platformService.setup((p) => p.isMac).returns(() => isOsx);
        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));
        pythonSettings.setup((s) => s.pythonPath).returns(() => pythonPath);
        componentAdapter
            .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve({ name: 'EnvA', path: path.dirname(pythonPath) }));

        const expectedActivationCommand = isWindows ? ['activate EnvA'] : ['source activate EnvA'];
        const activationCommands = await terminalHelper.getEnvironmentActivationCommands(
            TerminalShellType.bash,
            undefined,
        );
        expect(activationCommands).to.deep.equal(expectedActivationCommand, 'Incorrect Activation command');
    }

    test('If environment is a conda environment, ensure conda activation command is sent (windows)', async () => {
        const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');
        fileSystem
            .setup((f) => f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), 'conda-meta'))))
            .returns(() => Promise.resolve(true));
        await expectCondaActivationCommand(true, false, false, pythonPath);
    });

    test('If environment is a conda environment, ensure conda activation command is sent (linux)', async () => {
        const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
        fileSystem
            .setup((f) =>
                f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), '..', 'conda-meta'))),
            )
            .returns(() => Promise.resolve(true));
        await expectCondaActivationCommand(false, false, true, pythonPath);
    });

    test('If environment is a conda environment, ensure conda activation command is sent (osx)', async () => {
        const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
        fileSystem
            .setup((f) =>
                f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), '..', 'conda-meta'))),
            )
            .returns(() => Promise.resolve(true));
        await expectCondaActivationCommand(false, true, false, pythonPath);
    });

    test('Get activation script command if environment is not a conda environment', async () => {
        const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'bin', 'python');
        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(false));
        pythonSettings.setup((s) => s.pythonPath).returns(() => pythonPath);

        const mockProvider = TypeMoq.Mock.ofType<ITerminalActivationCommandProvider>();
        serviceContainer
            .setup((c) => c.getAll(TypeMoq.It.isValue(ITerminalActivationCommandProvider), TypeMoq.It.isAny()))
            .returns(() => [mockProvider.object]);
        mockProvider.setup((p) => p.isShellSupported(TypeMoq.It.isAny())).returns(() => true);
        mockProvider
            .setup((p) => p.getActivationCommands(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(['mock command']));

        const expectedActivationCommand = ['mock command'];
        when(bash.isShellSupported(anything())).thenReturn(true);
        when(bash.getActivationCommands(anything(), TerminalShellType.bash)).thenResolve(expectedActivationCommand);

        const activationCommands = await terminalHelper.getEnvironmentActivationCommands(
            TerminalShellType.bash,
            undefined,
        );

        expect(activationCommands).to.deep.equal(expectedActivationCommand, 'Incorrect Activation command');
    });
    async function expectActivationCommandIfCondaDetectionFails(
        isWindows: boolean,
        isOsx: boolean,
        isLinux: boolean,
        pythonPath: string,
    ) {
        platformService.setup((p) => p.isLinux).returns(() => isLinux);
        platformService.setup((p) => p.isWindows).returns(() => isWindows);
        platformService.setup((p) => p.isMac).returns(() => isOsx);
        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));
        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(false));
        pythonSettings.setup((s) => s.pythonPath).returns(() => pythonPath);

        when(bash.isShellSupported(anything())).thenReturn(true);
        when(bash.getActivationCommands(anything(), TerminalShellType.bash)).thenResolve(['mock command']);

        const expectedActivationCommand = ['mock command'];
        const activationCommands = await terminalHelper.getEnvironmentActivationCommands(
            TerminalShellType.bash,
            undefined,
        );
        expect(activationCommands).to.deep.equal(expectedActivationCommand, 'Incorrect Activation command');
    }

    test('If environment is a conda environment and environment detection fails, ensure activatino of script is sent (windows)', async () => {
        const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');
        fileSystem
            .setup((f) => f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), 'conda-meta'))))
            .returns(() => Promise.resolve(true));
        await expectActivationCommandIfCondaDetectionFails(true, false, false, pythonPath);
    });

    test('If environment is a conda environment and environment detection fails, ensure activatino of script is sent (osx)', async () => {
        const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'python');
        fileSystem
            .setup((f) =>
                f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), '..', 'conda-meta'))),
            )
            .returns(() => Promise.resolve(true));
        await expectActivationCommandIfCondaDetectionFails(false, true, false, pythonPath);
    });

    test('If environment is a conda environment and environment detection fails, ensure activatino of script is sent (linux)', async () => {
        const pythonPath = path.join('users', 'xyz', '.conda', 'envs', 'enva', 'python');
        fileSystem
            .setup((f) =>
                f.directoryExists(TypeMoq.It.isValue(path.join(path.dirname(pythonPath), '..', 'conda-meta'))),
            )
            .returns(() => Promise.resolve(true));
        await expectActivationCommandIfCondaDetectionFails(false, false, true, pythonPath);
    });

    test('Return undefined if unable to get activation command', async () => {
        const pythonPath = path.join('c', 'users', 'xyz', '.conda', 'envs', 'enva', 'python.exe');

        componentAdapter.setup((c) => c.isCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(false));

        pythonSettings.setup((s) => s.pythonPath).returns(() => pythonPath);

        const mockProvider = TypeMoq.Mock.ofType<ITerminalActivationCommandProvider>();
        serviceContainer
            .setup((c) => c.getAll(TypeMoq.It.isValue(ITerminalActivationCommandProvider), TypeMoq.It.isAny()))
            .returns(() => [mockProvider.object]);
        mockProvider.setup((p) => p.isShellSupported(TypeMoq.It.isAny())).returns(() => true);
        mockProvider
            .setup((p) => p.getActivationCommands(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(undefined));

        const activationCommands = await terminalHelper.getEnvironmentActivationCommands(
            TerminalShellType.bash,
            undefined,
        );
        expect(activationCommands).to.equal(undefined, 'Incorrect Activation command');
    });

    const windowsTestPath = 'C:\\path\\to';
    const windowsTestPathSpaces = 'C:\\the path\\to the command';

    type WindowsActivationTestParams = {
        testName: string;
        basePath: string;
        envName: string;
        expectedResult: string[] | undefined;
        expectedRawCmd: string;
        terminalKind: TerminalShellType;
    };

    const testsForWindowsActivation: WindowsActivationTestParams[] = [
        {
            testName: 'Activation uses full path on windows for powershell',
            basePath: windowsTestPath,
            envName: 'TesterEnv',
            expectedResult: ['conda activate TesterEnv'],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.powershell,
        },
        {
            testName: 'Activation uses full path with spaces on windows for powershell',
            basePath: windowsTestPathSpaces,
            envName: 'TesterEnv',
            expectedResult: ['conda activate TesterEnv'],
            expectedRawCmd: `"${path.join(windowsTestPathSpaces, 'activate')}"`,
            terminalKind: TerminalShellType.powershell,
        },
        {
            testName: 'Activation uses full path on windows under powershell, environment name has spaces',
            basePath: windowsTestPath,
            envName: 'The Tester Environment',
            expectedResult: ['conda activate "The Tester Environment"'],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.powershell,
        },
        {
            testName: 'Activation uses full path on windows for powershell-core',
            basePath: windowsTestPath,
            envName: 'TesterEnv',
            expectedResult: ['conda activate TesterEnv'],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.powershellCore,
        },
        {
            testName: 'Activation uses full path with spaces on windows for powershell-core',
            basePath: windowsTestPathSpaces,
            envName: 'TesterEnv',
            expectedResult: ['conda activate TesterEnv'],
            expectedRawCmd: `"${path.join(windowsTestPathSpaces, 'activate')}"`,
            terminalKind: TerminalShellType.powershellCore,
        },
        {
            testName: 'Activation uses full path on windows for powershell-core, environment name has spaces',
            basePath: windowsTestPath,
            envName: 'The Tester Environment',
            expectedResult: ['conda activate "The Tester Environment"'],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.powershellCore,
        },
        {
            testName: 'Activation uses full path on windows for cmd.exe',
            basePath: windowsTestPath,
            envName: 'TesterEnv',
            expectedResult: [`${path.join(windowsTestPath, 'activate')} TesterEnv`],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.commandPrompt,
        },
        {
            testName: 'Activation uses full path with spaces on windows for cmd.exe',
            basePath: windowsTestPathSpaces,
            envName: 'TesterEnv',
            expectedResult: [`"${path.join(windowsTestPathSpaces, 'activate')}" TesterEnv`],
            expectedRawCmd: `"${path.join(windowsTestPathSpaces, 'activate')}"`,
            terminalKind: TerminalShellType.commandPrompt,
        },
        {
            testName: 'Activation uses full path on windows for cmd.exe, environment name has spaces',
            basePath: windowsTestPath,
            envName: 'The Tester Environment',
            expectedResult: [`${path.join(windowsTestPath, 'activate')} "The Tester Environment"`],
            expectedRawCmd: `${path.join(windowsTestPath, 'activate')}`,
            terminalKind: TerminalShellType.commandPrompt,
        },
    ];

    testsForWindowsActivation.forEach((testParams: WindowsActivationTestParams) => {
        test(testParams.testName, async () => {
            // each test simply tests the base windows activate command,
            // and then the specific result from the terminal selected.
            const condaSrv = TypeMoq.Mock.ofType<ICondaService>();
            condaSrv.setup((c) => c.getCondaFile()).returns(async () => path.join(testParams.basePath, 'conda.exe'));

            const tstCmdProvider = new CondaActivationCommandProvider(
                condaSrv.object,
                platformService.object,
                configService.object,
                componentAdapter.object,
            );

            let result: string[] | undefined;

            if (testParams.terminalKind === TerminalShellType.commandPrompt) {
                result = await tstCmdProvider.getWindowsCommands(testParams.envName);
            } else {
                result = await _getPowershellCommands(testParams.envName);
            }
            expect(result).to.deep.equal(testParams.expectedResult, 'Specific terminal command is incorrect.');
        });
    });
});
