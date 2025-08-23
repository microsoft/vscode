// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import { ConfigurationTarget, Uri, WorkspaceFolder } from 'vscode';
import { IApplicationShell, IWorkspaceService } from '../../../client/common/application/types';
import { ExecutionResult, IProcessService, IProcessServiceFactory } from '../../../client/common/process/types';
import { Common } from '../../../client/common/utils/localize';
import { IPythonPathUpdaterServiceManager } from '../../../client/interpreter/configuration/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { ActivatedEnvironmentLaunch } from '../../../client/interpreter/virtualEnvs/activatedEnvLaunch';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { Conda } from '../../../client/pythonEnvironments/common/environmentManagers/conda';

suite('Activated Env Launch', async () => {
    const uri = Uri.file('a');
    const condaPrefix = 'path/to/conda/env';
    const virtualEnvPrefix = 'path/to/virtual/env';
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let appShell: TypeMoq.IMock<IApplicationShell>;
    let pythonPathUpdaterService: TypeMoq.IMock<IPythonPathUpdaterServiceManager>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let processServiceFactory: TypeMoq.IMock<IProcessServiceFactory>;
    let processService: TypeMoq.IMock<IProcessService>;
    let activatedEnvLaunch: ActivatedEnvironmentLaunch;
    let _promptIfApplicable: sinon.SinonStub;

    suite('Method selectIfLaunchedViaActivatedEnv()', () => {
        const oldVSCodeCLI = process.env.VSCODE_CLI;
        const oldCondaPrefix = process.env.CONDA_PREFIX;
        const oldCondaShlvl = process.env.CONDA_SHLVL;
        const oldVirtualEnv = process.env.VIRTUAL_ENV;
        setup(() => {
            workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
            pythonPathUpdaterService = TypeMoq.Mock.ofType<IPythonPathUpdaterServiceManager>();
            appShell = TypeMoq.Mock.ofType<IApplicationShell>();
            interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
            processServiceFactory = TypeMoq.Mock.ofType<IProcessServiceFactory>();
            _promptIfApplicable = sinon.stub(ActivatedEnvironmentLaunch.prototype, '_promptIfApplicable');
            _promptIfApplicable.returns(Promise.resolve());
            process.env.VSCODE_CLI = '1';
        });

        teardown(() => {
            if (oldCondaPrefix) {
                process.env.CONDA_PREFIX = oldCondaPrefix;
            } else {
                delete process.env.CONDA_PREFIX;
            }
            if (oldCondaShlvl) {
                process.env.CONDA_SHLVL = oldCondaShlvl;
            } else {
                delete process.env.CONDA_SHLVL;
            }
            if (oldVirtualEnv) {
                process.env.VIRTUAL_ENV = oldVirtualEnv;
            } else {
                delete process.env.VIRTUAL_ENV;
            }
            if (oldVSCodeCLI) {
                process.env.VSCODE_CLI = oldVSCodeCLI;
            } else {
                delete process.env.VSCODE_CLI;
            }
            sinon.restore();
        });

        test('Updates interpreter path with the non-base conda prefix if activated', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'env' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(condaPrefix, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
        });

        test('Does not update interpreter path if VSCode is not launched via CLI', async () => {
            delete process.env.VSCODE_CLI;
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'env' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(undefined, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
        });

        test('Updates interpreter path with the base conda prefix if activated and environment var is configured to not auto activate it', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            process.env.CONDA_AUTO_ACTIVATE_BASE = 'false';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(condaPrefix, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
        });

        test('Updates interpreter path with the base conda prefix if activated and environment var is configured to auto activate it', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            process.env.CONDA_AUTO_ACTIVATE_BASE = 'true';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(undefined, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
            expect(_promptIfApplicable.calledOnce).to.equal(true, 'Prompt not displayed');
        });

        test('Updates interpreter path with virtual env prefix if activated', async () => {
            process.env.VIRTUAL_ENV = virtualEnvPrefix;
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(virtualEnvPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(virtualEnvPrefix, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
        });

        test('Updates interpreter path in global scope if no workspace is opened', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'env' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            workspaceService.setup((w) => w.workspaceFolders).returns(() => []);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.Global),
                        TypeMoq.It.isValue('load'),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(condaPrefix, 'Incorrect value');
            pythonPathUpdaterService.verifyAll();
            expect(_promptIfApplicable.notCalled).to.equal(true, 'Prompt should not be displayed');
        });

        test('Returns `undefined` if env was already selected', async () => {
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
                true,
            );
            const result = await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            expect(result).to.be.equal(undefined, 'Incorrect value');
        });
    });

    suite('Method _promptIfApplicable()', () => {
        const oldCondaPrefix = process.env.CONDA_PREFIX;
        const oldCondaShlvl = process.env.CONDA_SHLVL;
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo];
        setup(() => {
            workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
            pythonPathUpdaterService = TypeMoq.Mock.ofType<IPythonPathUpdaterServiceManager>();
            appShell = TypeMoq.Mock.ofType<IApplicationShell>();
            interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
            processServiceFactory = TypeMoq.Mock.ofType<IProcessServiceFactory>();
            processService = TypeMoq.Mock.ofType<IProcessService>();
            processServiceFactory
                .setup((p) => p.create(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(processService.object));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            processService.setup((p) => (p as any).then).returns(() => undefined);
            sinon.stub(Conda, 'getConda').resolves(new Conda('conda'));
        });

        teardown(() => {
            if (oldCondaPrefix) {
                process.env.CONDA_PREFIX = oldCondaPrefix;
            } else {
                delete process.env.CONDA_PREFIX;
            }
            if (oldCondaShlvl) {
                process.env.CONDA_SHLVL = oldCondaShlvl;
            } else {
                delete process.env.CONDA_SHLVL;
            }
            sinon.restore();
        });

        test('Shows prompt if base conda environment is activated and auto activate configuration is disabled', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelYes))
                .verifiable(TypeMoq.Times.once());
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base False' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            appShell.verifyAll();
        });

        test('If user chooses yes, update interpreter path', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelYes));
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base False' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            pythonPathUpdaterService.verifyAll();
        });

        test('If user chooses no, do not update interpreter path', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            pythonPathUpdaterService
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(condaPrefix),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('load'),
                        TypeMoq.It.isValue(uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelNo));
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base False' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            pythonPathUpdaterService.verifyAll();
        });

        test('Do not show prompt if base conda environment is activated but auto activate configuration is enabled', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelYes))
                .verifiable(TypeMoq.Times.never());
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base True' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            appShell.verifyAll();
        });

        test('Do not show prompt if non-base conda environment is activated', async () => {
            process.env.CONDA_PREFIX = condaPrefix;
            process.env.CONDA_SHLVL = '1';
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'nonbase' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelYes))
                .verifiable(TypeMoq.Times.never());
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base False' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            appShell.verifyAll();
        });

        test('Do not show prompt if conda environment is not activated', async () => {
            interpreterService
                .setup((i) => i.getInterpreterDetails(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(({ envName: 'base' } as unknown) as PythonEnvironment));
            workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
            const workspaceFolder: WorkspaceFolder = { name: 'one', uri, index: 0 };
            workspaceService.setup((w) => w.workspaceFolders).returns(() => [workspaceFolder]);
            appShell
                .setup((a) => a.showInformationMessage(TypeMoq.It.isAny(), ...prompts))
                .returns(() => Promise.resolve(Common.bannerLabelYes))
                .verifiable(TypeMoq.Times.never());
            processService
                .setup((p) => p.shellExec('conda config --get auto_activate_base'))
                .returns(() =>
                    Promise.resolve(({ stdout: '--set auto_activate_base False' } as unknown) as ExecutionResult<
                        string
                    >),
                );
            activatedEnvLaunch = new ActivatedEnvironmentLaunch(
                workspaceService.object,
                appShell.object,
                pythonPathUpdaterService.object,
                interpreterService.object,
                processServiceFactory.object,
            );
            await activatedEnvLaunch._promptIfApplicable();
            appShell.verifyAll();
        });
    });
});
