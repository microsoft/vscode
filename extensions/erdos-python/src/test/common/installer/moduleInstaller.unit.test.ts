/* eslint-disable class-methods-use-this */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import * as path from 'path';
import rewiremock from 'rewiremock';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import { anything, instance, mock, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { CancellationTokenSource, Disposable, ProgressLocation, Uri, WorkspaceConfiguration } from 'vscode';
import { IApplicationShell, IWorkspaceService } from '../../../client/common/application/types';
import { CondaInstaller } from '../../../client/common/installer/condaInstaller';
import { ModuleInstaller } from '../../../client/common/installer/moduleInstaller';
import { PipEnvInstaller, pipenvName } from '../../../client/common/installer/pipEnvInstaller';
import { PipInstaller } from '../../../client/common/installer/pipInstaller';
import { ProductInstaller } from '../../../client/common/installer/productInstaller';
import {
    IInstallationChannelManager,
    IModuleInstaller,
    ModuleInstallFlags,
} from '../../../client/common/installer/types';
import { IFileSystem } from '../../../client/common/platform/types';
import { _SCRIPTS_DIR } from '../../../client/common/process/internal/scripts/constants';
import { ITerminalService, ITerminalServiceFactory } from '../../../client/common/terminal/types';
import {
    ExecutionInfo,
    IConfigurationService,
    IDisposableRegistry,
    IInstaller,
    ILogOutputChannel,
    IPythonSettings,
    Product,
} from '../../../client/common/types';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { noop } from '../../../client/common/utils/misc';
import { Architecture } from '../../../client/common/utils/platform';
import { IComponentAdapter, ICondaService, IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import * as logging from '../../../client/logging';
import { EnvironmentType, ModuleInstallerType, PythonEnvironment } from '../../../client/pythonEnvironments/info';

const pythonPath = path.join(__dirname, 'python');

/* Complex test to ensure we cover all combinations:
We could have written separate tests for each installer, but we'd be replicate code.
Both approaches have their benefits.

Combinations of:
1. With and without a workspace.
2. Http Proxy configuration.
3. All products.
4. Different versions of Python.
5. With and without conda.
6. Conda environments with names and without names.
7. All installers.
*/
suite('Module Installer', () => {
    class TestModuleInstaller extends ModuleInstaller {
        public get priority(): number {
            return 0;
        }

        public get name(): string {
            return '';
        }

        public get displayName(): string {
            return '';
        }

        public get type(): ModuleInstallerType {
            return ModuleInstallerType.Unknown;
        }

        public isSupported(): Promise<boolean> {
            return Promise.resolve(false);
        }

        public getExecutionInfo(): Promise<ExecutionInfo> {
            return Promise.resolve({ moduleName: 'executionInfo', args: [] });
        }

        public elevatedInstall(execPath: string, args: string[]) {
            return super.elevatedInstall(execPath, args);
        }
    }
    let outputChannel: TypeMoq.IMock<ILogOutputChannel>;

    let appShell: TypeMoq.IMock<IApplicationShell>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;

    suite('Method _elevatedInstall()', async () => {
        let traceLogStub: sinon.SinonStub;
        let installer: TestModuleInstaller;
        const execPath = 'execPath';
        const args = ['1', '2'];
        const command = `"${execPath.replace(/\\/g, '/')}" ${args.join(' ')}`;
        setup(() => {
            traceLogStub = sinon.stub(logging, 'traceLog');

            serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
            outputChannel = TypeMoq.Mock.ofType<ILogOutputChannel>();
            serviceContainer
                .setup((c) => c.get(TypeMoq.It.isValue(ILogOutputChannel)))
                .returns(() => outputChannel.object);
            appShell = TypeMoq.Mock.ofType<IApplicationShell>();
            serviceContainer.setup((c) => c.get(TypeMoq.It.isValue(IApplicationShell))).returns(() => appShell.object);
            installer = new TestModuleInstaller(serviceContainer.object);
        });
        teardown(() => {
            rewiremock.disable();
            sinon.restore();
        });

        test('Show error message if sudo exec fails with error', async () => {
            const error = 'Error message';
            const sudoPromptMock = {
                // eslint-disable-next-line @typescript-eslint/ban-types
                exec: (_command: unknown, _options: unknown, callBackFn: Function) =>
                    callBackFn(error, 'stdout', 'stderr'),
            };
            rewiremock.enable();
            rewiremock('sudo-prompt').with(sudoPromptMock);
            appShell
                .setup((a) => a.showErrorMessage(error))
                .returns(() => Promise.resolve(undefined))
                .verifiable(TypeMoq.Times.once());
            installer.elevatedInstall(execPath, args);
            appShell.verifyAll();
            traceLogStub.calledOnceWithExactly(`[Elevated] ${command}`);
        });

        test('Show stdout if sudo exec succeeds', async () => {
            const stdout = 'stdout';
            const sudoPromptMock = {
                // eslint-disable-next-line @typescript-eslint/ban-types
                exec: (_command: unknown, _options: unknown, callBackFn: Function) =>
                    callBackFn(undefined, stdout, undefined),
            };
            rewiremock.enable();
            rewiremock('sudo-prompt').with(sudoPromptMock);
            outputChannel
                .setup((o) => o.show())
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.once());
            installer.elevatedInstall(execPath, args);
            outputChannel.verifyAll();
            traceLogStub.calledOnceWithExactly(`[Elevated] ${command}`);
        });

        test('Show stderr if sudo exec gives a warning with stderr', async () => {
            const stderr = 'stderr';
            const sudoPromptMock = {
                // eslint-disable-next-line @typescript-eslint/ban-types
                exec: (_command: unknown, _options: unknown, callBackFn: Function) =>
                    callBackFn(undefined, undefined, stderr),
            };
            rewiremock.enable();
            rewiremock('sudo-prompt').with(sudoPromptMock);
            outputChannel
                .setup((o) => o.show())
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.once());
            installer.elevatedInstall(execPath, args);
            traceLogStub.calledOnceWithExactly(`[Elevated] ${command}`);
            traceLogStub.calledOnceWithExactly(`Warning: ${stderr}`);
        });
    });

    [CondaInstaller, PipInstaller, PipEnvInstaller, TestModuleInstaller].forEach((InstallerClass) => {
        // Proxy info is relevant only for PipInstaller.
        const proxyServers = InstallerClass === PipInstaller ? ['', 'proxy:1234'] : [''];
        proxyServers.forEach((proxyServer) => {
            [undefined, Uri.file('/users/dev/xyz')].forEach((resource) => {
                // Conda info is relevant only for CondaInstaller.
                const condaEnvs =
                    InstallerClass === CondaInstaller
                        ? [
                              { name: 'My-Env01', path: '' },
                              { name: '', path: path.join('conda', 'path') },
                              { name: 'My-Env01 With Spaces', path: '' },
                              { name: '', path: path.join('conda with spaces', 'path') },
                          ]
                        : [];
                [undefined, ...condaEnvs].forEach((condaEnvInfo) => {
                    const testProxySuffix = proxyServer.length === 0 ? 'without proxy info' : 'with proxy info';
                    // eslint-disable-next-line no-nested-ternary
                    const testCondaEnv = condaEnvInfo
                        ? condaEnvInfo.name
                            ? 'without conda name'
                            : 'with conda path'
                        : 'without conda';
                    const testSuite = [testProxySuffix, testCondaEnv].filter((item) => item.length > 0).join(', ');
                    suite(`${InstallerClass.name} (${testSuite})`, () => {
                        let disposables: Disposable[] = [];
                        let installationChannel: TypeMoq.IMock<IInstallationChannelManager>;
                        let terminalService: TypeMoq.IMock<ITerminalService>;
                        let configService: TypeMoq.IMock<IConfigurationService>;
                        let fs: TypeMoq.IMock<IFileSystem>;
                        let pythonSettings: TypeMoq.IMock<IPythonSettings>;
                        let interpreterService: TypeMoq.IMock<IInterpreterService>;
                        let installer: IModuleInstaller;
                        const condaExecutable = 'my.exe';
                        setup(() => {
                            serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();

                            appShell = TypeMoq.Mock.ofType<IApplicationShell>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IApplicationShell)))
                                .returns(() => appShell.object);

                            fs = TypeMoq.Mock.ofType<IFileSystem>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IFileSystem)))
                                .returns(() => fs.object);

                            disposables = [];
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IDisposableRegistry), TypeMoq.It.isAny()))
                                .returns(() => disposables);

                            installationChannel = TypeMoq.Mock.ofType<IInstallationChannelManager>();
                            serviceContainer
                                .setup((c) =>
                                    c.get(TypeMoq.It.isValue(IInstallationChannelManager), TypeMoq.It.isAny()),
                                )
                                .returns(() => installationChannel.object);

                            const condaService = TypeMoq.Mock.ofType<ICondaService>();
                            condaService.setup((c) => c.getCondaFile()).returns(() => Promise.resolve(condaExecutable));
                            condaService
                                .setup((c) => c.getCondaFile(true))
                                .returns(() => Promise.resolve(condaExecutable));

                            const condaLocatorService = TypeMoq.Mock.ofType<IComponentAdapter>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IComponentAdapter)))
                                .returns(() => condaLocatorService.object);
                            condaLocatorService
                                .setup((c) => c.getCondaEnvironment(TypeMoq.It.isAny()))
                                .returns(() => Promise.resolve(condaEnvInfo));

                            configService = TypeMoq.Mock.ofType<IConfigurationService>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IConfigurationService), TypeMoq.It.isAny()))
                                .returns(() => configService.object);
                            pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
                            pythonSettings.setup((p) => p.pythonPath).returns(() => pythonPath);
                            configService
                                .setup((c) => c.getSettings(TypeMoq.It.isAny()))
                                .returns(() => pythonSettings.object);

                            terminalService = TypeMoq.Mock.ofType<ITerminalService>();
                            const terminalServiceFactory = TypeMoq.Mock.ofType<ITerminalServiceFactory>();
                            terminalServiceFactory
                                .setup((f) => f.getTerminalService(TypeMoq.It.isAny()))
                                .returns(() => terminalService.object);
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(ITerminalServiceFactory), TypeMoq.It.isAny()))
                                .returns(() => terminalServiceFactory.object);

                            interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterService), TypeMoq.It.isAny()))
                                .returns(() => interpreterService.object);
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(ICondaService), TypeMoq.It.isAny()))
                                .returns(() => condaService.object);

                            const workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
                            serviceContainer
                                .setup((c) => c.get(TypeMoq.It.isValue(IWorkspaceService), TypeMoq.It.isAny()))
                                .returns(() => workspaceService.object);
                            const http = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
                            http.setup((h) => h.get(TypeMoq.It.isValue('proxy'), TypeMoq.It.isAny())).returns(
                                () => proxyServer,
                            );
                            workspaceService
                                .setup((w) => w.getConfiguration(TypeMoq.It.isValue('http')))
                                .returns(() => http.object);
                            installer = new InstallerClass(serviceContainer.object);
                        });
                        teardown(() => {
                            disposables.forEach((disposable) => {
                                if (disposable) {
                                    disposable.dispose();
                                }
                            });
                            sinon.restore();
                        });
                        function setActiveInterpreter(activeInterpreter?: PythonEnvironment) {
                            interpreterService
                                .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
                                .returns(() => Promise.resolve(activeInterpreter))
                                .verifiable(TypeMoq.Times.atLeastOnce());
                        }
                        getModuleNamesForTesting()
                            .filter((item) => item.value !== Product.ensurepip)
                            .forEach((product) => {
                                const { moduleName } = product;
                                async function installModuleAndVerifyCommand(
                                    command: string,
                                    expectedArgs: string[],
                                    flags?: ModuleInstallFlags,
                                ) {
                                    terminalService
                                        .setup((t) =>
                                            t.sendCommand(
                                                TypeMoq.It.isValue(command),
                                                TypeMoq.It.isValue(expectedArgs),
                                                TypeMoq.It.isValue(undefined),
                                            ),
                                        )
                                        .returns(() => Promise.resolve())
                                        .verifiable(TypeMoq.Times.once());

                                    await installer.installModule(product.value, resource, undefined, flags);
                                    terminalService.verifyAll();
                                }

                                if (InstallerClass === TestModuleInstaller) {
                                    suite(`If interpreter type is Unknown (${product.name})`, async () => {
                                        test(`If 'python.globalModuleInstallation' is set to true and pythonPath directory is read only, do an elevated install`, async () => {
                                            const info = TypeMoq.Mock.ofType<PythonEnvironment>();
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            info.setup((t: any) => t.then).returns(() => undefined);
                                            info.setup((t) => t.envType).returns(() => EnvironmentType.Unknown);
                                            info.setup((t) => t.version).returns(() => new SemVer('3.5.0-final'));
                                            info.setup((t) => t.path).returns(() => pythonPath);
                                            setActiveInterpreter(info.object);
                                            pythonSettings.setup((p) => p.globalModuleInstallation).returns(() => true);
                                            const elevatedInstall = sinon.stub(
                                                TestModuleInstaller.prototype,
                                                'elevatedInstall',
                                            );
                                            elevatedInstall.returns();
                                            fs.setup((f) => f.isDirReadonly(path.dirname(pythonPath))).returns(() =>
                                                Promise.resolve(true),
                                            );
                                            try {
                                                await installer.installModule(product.value, resource);
                                            } catch (ex) {
                                                noop();
                                            }
                                            const args = ['-m', 'executionInfo'];
                                            assert.ok(elevatedInstall.calledOnceWith(pythonPath, args));
                                            interpreterService.verifyAll();
                                        });
                                        test(`If 'python.globalModuleInstallation' is set to true and pythonPath directory is not read only, send command to terminal`, async () => {
                                            const info = TypeMoq.Mock.ofType<PythonEnvironment>();
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            info.setup((t: any) => t.then).returns(() => undefined);
                                            info.setup((t) => t.envType).returns(() => EnvironmentType.Unknown);
                                            info.setup((t) => t.version).returns(() => new SemVer('3.5.0-final'));
                                            info.setup((t) => t.path).returns(() => pythonPath);
                                            setActiveInterpreter(info.object);
                                            pythonSettings.setup((p) => p.globalModuleInstallation).returns(() => true);
                                            fs.setup((f) => f.isDirReadonly(path.dirname(pythonPath))).returns(() =>
                                                Promise.resolve(false),
                                            );
                                            const args = ['-m', 'executionInfo'];
                                            terminalService
                                                .setup((t) => t.sendCommand(pythonPath, args, undefined))
                                                .returns(() => Promise.resolve())
                                                .verifiable(TypeMoq.Times.once());
                                            try {
                                                await installer.installModule(product.value, resource);
                                            } catch (ex) {
                                                noop();
                                            }
                                            interpreterService.verifyAll();
                                            terminalService.verifyAll();
                                        });
                                        test(`If 'python.globalModuleInstallation' is not set to true, concatenate arguments with '--user' flag and send command to terminal`, async () => {
                                            const info = TypeMoq.Mock.ofType<PythonEnvironment>();
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            info.setup((t: any) => t.then).returns(() => undefined);
                                            info.setup((t) => t.envType).returns(() => EnvironmentType.Unknown);
                                            info.setup((t) => t.version).returns(() => new SemVer('3.5.0-final'));
                                            info.setup((t) => t.path).returns(() => pythonPath);
                                            setActiveInterpreter(info.object);
                                            pythonSettings
                                                .setup((p) => p.globalModuleInstallation)
                                                .returns(() => false);
                                            const args =
                                                product.value === Product.pip
                                                    ? ['-m', 'executionInfo'] // Pipe is always installed into the environment.
                                                    : ['-m', 'executionInfo', '--user'];
                                            terminalService
                                                .setup((t) => t.sendCommand(pythonPath, args, undefined))
                                                .returns(() => Promise.resolve())
                                                .verifiable(TypeMoq.Times.once());
                                            try {
                                                await installer.installModule(product.value, resource);
                                            } catch (ex) {
                                                noop();
                                            }
                                            interpreterService.verifyAll();
                                            terminalService.verifyAll();
                                        });
                                        test(`ignores failures in IFileSystem.isDirReadonly()`, async () => {
                                            const info = TypeMoq.Mock.ofType<PythonEnvironment>();
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            info.setup((t: any) => t.then).returns(() => undefined);
                                            info.setup((t) => t.envType).returns(() => EnvironmentType.Unknown);
                                            info.setup((t) => t.version).returns(() => new SemVer('3.5.0-final'));
                                            info.setup((t) => t.path).returns(() => pythonPath);
                                            setActiveInterpreter(info.object);
                                            pythonSettings.setup((p) => p.globalModuleInstallation).returns(() => true);
                                            const elevatedInstall = sinon.stub(
                                                TestModuleInstaller.prototype,
                                                'elevatedInstall',
                                            );
                                            elevatedInstall.returns();
                                            const err = new Error('oops!');
                                            fs.setup((f) => f.isDirReadonly(path.dirname(pythonPath))).returns(() =>
                                                Promise.reject(err),
                                            );

                                            try {
                                                await installer.installModule(product.value, resource);
                                            } catch (ex) {
                                                noop();
                                            }
                                            const args = ['-m', 'executionInfo'];
                                            assert.ok(elevatedInstall.calledOnceWith(pythonPath, args));
                                            interpreterService.verifyAll();
                                        });
                                        test('If cancellation token is provided, install while showing progress', async () => {
                                            const options = {
                                                location: ProgressLocation.Notification,
                                                cancellable: true,
                                                title: `Installing ${product.name}`,
                                            };
                                            appShell
                                                .setup((a) => a.withProgress(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                                                .callback((expected) => assert.deepEqual(expected, options))
                                                .returns(() => Promise.resolve())
                                                .verifiable(TypeMoq.Times.once());
                                            try {
                                                await installer.installModule(
                                                    product.value,
                                                    resource,
                                                    new CancellationTokenSource().token,
                                                );
                                            } catch (ex) {
                                                noop();
                                            }
                                            interpreterService.verifyAll();
                                            appShell.verifyAll();
                                        });
                                    });
                                }

                                if (InstallerClass === PipInstaller) {
                                    test(`Ensure getActiveInterpreter is used in PipInstaller (${product.name})`, async () => {
                                        if (product.value === Product.pip) {
                                            const mockInstaller = mock<IInstaller>();
                                            serviceContainer
                                                .setup((svc) => svc.get<IInstaller>(TypeMoq.It.isValue(IInstaller)))
                                                .returns(() => instance(mockInstaller));
                                            when(mockInstaller.isInstalled(Product.ensurepip, anything())).thenResolve(
                                                true,
                                            );
                                        }
                                        setActiveInterpreter();
                                        try {
                                            await installer.installModule(product.value, resource);
                                        } catch {
                                            noop();
                                        }
                                        interpreterService.verifyAll();
                                    });
                                    test(`Test Args (${product.name})`, async () => {
                                        if (product.value === Product.pip) {
                                            const mockInstaller = mock<IInstaller>();
                                            serviceContainer
                                                .setup((svc) => svc.get<IInstaller>(TypeMoq.It.isValue(IInstaller)))
                                                .returns(() => instance(mockInstaller));
                                            when(mockInstaller.isInstalled(Product.pip, anything())).thenResolve(true);
                                            when(mockInstaller.isInstalled(Product.ensurepip, anything())).thenResolve(
                                                true,
                                            );
                                        }
                                        setActiveInterpreter();
                                        const proxyArgs = proxyServer.length === 0 ? [] : ['--proxy', proxyServer];
                                        const expectedArgs =
                                            product.value === Product.pip
                                                ? ['-m', 'ensurepip']
                                                : ['-m', 'pip', ...proxyArgs, 'install', '-U', moduleName];
                                        console.log(`Expected: ${expectedArgs.join(' ')}`);
                                        await installModuleAndVerifyCommand(pythonPath, expectedArgs);
                                        interpreterService.verifyAll();
                                    });
                                    if (product.value === Product.pip) {
                                        test(`Test Args (${product.name}) if ensurepip is not available`, async () => {
                                            if (product.value === Product.pip) {
                                                const mockInstaller = mock<IInstaller>();
                                                serviceContainer
                                                    .setup((svc) => svc.get<IInstaller>(TypeMoq.It.isValue(IInstaller)))
                                                    .returns(() => instance(mockInstaller));
                                                when(mockInstaller.isInstalled(Product.pip, anything())).thenResolve(
                                                    false,
                                                );
                                                when(
                                                    mockInstaller.isInstalled(Product.ensurepip, anything()),
                                                ).thenResolve(false);
                                            }
                                            const interpreterInfo = {
                                                architecture: Architecture.Unknown,
                                                envType: EnvironmentType.Unknown,
                                                path: pythonPath,
                                                sysPrefix: '',
                                            };
                                            setActiveInterpreter(interpreterInfo);
                                            interpreterService
                                                .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
                                                .returns(() => Promise.resolve(interpreterInfo));
                                            const expectedArgs = [path.join(_SCRIPTS_DIR, 'get-pip.py')];

                                            await installModuleAndVerifyCommand(pythonPath, expectedArgs);
                                            interpreterService.verifyAll();
                                        });
                                    }
                                }
                                if (InstallerClass === PipEnvInstaller) {
                                    [false, true].forEach((isUpgrade) => {
                                        test(`Test args (${product.name})`, async () => {
                                            setActiveInterpreter();
                                            const expectedArgs = [
                                                isUpgrade ? 'update' : 'install',
                                                moduleName,
                                                '--dev',
                                            ];
                                            await installModuleAndVerifyCommand(
                                                pipenvName,
                                                expectedArgs,
                                                isUpgrade ? ModuleInstallFlags.upgrade : undefined,
                                            );
                                        });
                                    });
                                }
                                if (InstallerClass === CondaInstaller) {
                                    [false, true].forEach((isUpgrade) => {
                                        test(`Test args (${product.name})`, async () => {
                                            setActiveInterpreter();
                                            const expectedArgs = [isUpgrade ? 'update' : 'install'];
                                            if (
                                                [
                                                    'pandas',
                                                    'tensorboard',
                                                    'ipykernel',
                                                    'jupyter',
                                                    'notebook',
                                                    'nbconvert',
                                                ].includes(product.name)
                                            ) {
                                                expectedArgs.push('-c', 'conda-forge');
                                            }
                                            if (condaEnvInfo && condaEnvInfo.name) {
                                                expectedArgs.push('--name');
                                                expectedArgs.push(condaEnvInfo.name.toCommandArgumentForPythonExt());
                                            } else if (condaEnvInfo && condaEnvInfo.path) {
                                                expectedArgs.push('--prefix');
                                                expectedArgs.push(
                                                    condaEnvInfo.path.fileToCommandArgumentForPythonExt(),
                                                );
                                            }
                                            expectedArgs.push(moduleName);
                                            expectedArgs.push('-y');
                                            await installModuleAndVerifyCommand(
                                                condaExecutable,
                                                expectedArgs,
                                                isUpgrade ? ModuleInstallFlags.upgrade : undefined,
                                            );
                                        });
                                    });
                                }
                            });
                    });
                });
            });
        });
    });
});

function getModuleNamesForTesting(): { name: string; value: Product; moduleName: string }[] {
    return getNamesAndValues<Product>(Product)
        .map((product) => {
            let moduleName = '';
            const mockSvc = TypeMoq.Mock.ofType<IServiceContainer>().object;
            try {
                const prodInstaller = new ProductInstaller(mockSvc);
                moduleName = prodInstaller.translateProductToModuleName(product.value);
                return { name: product.name, value: product.value, moduleName };
            } catch {
                return undefined;
            }
        })
        .filter((item) => item !== undefined) as { name: string; value: Product; moduleName: string }[];
}
