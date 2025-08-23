// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as sinon from 'sinon';
import { assert, expect } from 'chai';
import { mock, instance, when, anything, verify, reset } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import {
    EnvironmentVariableCollection,
    EnvironmentVariableMutatorOptions,
    GlobalEnvironmentVariableCollection,
    ProgressLocation,
    Uri,
    WorkspaceConfiguration,
    WorkspaceFolder,
} from 'vscode';
import {
    IApplicationShell,
    IApplicationEnvironment,
    IWorkspaceService,
} from '../../../client/common/application/types';
import { TerminalEnvVarActivation } from '../../../client/common/experiments/groups';
import { IPlatformService } from '../../../client/common/platform/types';
import {
    IExtensionContext,
    IExperimentService,
    Resource,
    IConfigurationService,
    IPythonSettings,
} from '../../../client/common/types';
import { Interpreters } from '../../../client/common/utils/localize';
import { OSType, getOSType } from '../../../client/common/utils/platform';
import { defaultShells } from '../../../client/interpreter/activation/service';
import { TerminalEnvVarCollectionService } from '../../../client/terminals/envCollectionActivation/service';
import { IEnvironmentActivationService } from '../../../client/interpreter/activation/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { PathUtils } from '../../../client/common/platform/pathUtils';
import { PythonEnvType } from '../../../client/pythonEnvironments/base/info';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { IShellIntegrationDetectionService, ITerminalDeactivateService } from '../../../client/terminals/types';
import { IEnvironmentVariablesProvider } from '../../../client/common/variables/types';
import * as extapi from '../../../client/envExt/api.internal';

suite('Terminal Environment Variable Collection Service', () => {
    let platform: IPlatformService;
    let interpreterService: IInterpreterService;
    let context: IExtensionContext;
    let shell: IApplicationShell;
    let experimentService: IExperimentService;
    let collection: EnvironmentVariableCollection;
    let globalCollection: GlobalEnvironmentVariableCollection;
    let applicationEnvironment: IApplicationEnvironment;
    let environmentActivationService: IEnvironmentActivationService;
    let workspaceService: IWorkspaceService;
    let terminalEnvVarCollectionService: TerminalEnvVarCollectionService;
    let terminalDeactivateService: ITerminalDeactivateService;
    let useEnvExtensionStub: sinon.SinonStub;
    let pythonConfig: TypeMoq.IMock<WorkspaceConfiguration>;
    const progressOptions = {
        location: ProgressLocation.Window,
        title: Interpreters.activatingTerminals,
    };
    let configService: IConfigurationService;
    let shellIntegrationService: IShellIntegrationDetectionService;
    const displayPath = 'display/path';
    const customShell = 'powershell';
    const defaultShell = defaultShells[getOSType()];

    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        workspaceService = mock<IWorkspaceService>();
        terminalDeactivateService = mock<ITerminalDeactivateService>();
        when(terminalDeactivateService.getScriptLocation(anything(), anything())).thenResolve(undefined);
        when(terminalDeactivateService.initializeScriptParams(anything())).thenResolve();
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(undefined);
        when(workspaceService.workspaceFolders).thenReturn(undefined);
        platform = mock<IPlatformService>();
        when(platform.osType).thenReturn(getOSType());
        interpreterService = mock<IInterpreterService>();
        context = mock<IExtensionContext>();
        shell = mock<IApplicationShell>();
        const envVarProvider = mock<IEnvironmentVariablesProvider>();
        shellIntegrationService = mock<IShellIntegrationDetectionService>();
        when(shellIntegrationService.isWorking()).thenResolve(true);
        globalCollection = mock<GlobalEnvironmentVariableCollection>();
        collection = mock<EnvironmentVariableCollection>();
        when(context.environmentVariableCollection).thenReturn(instance(globalCollection));
        when(globalCollection.getScoped(anything())).thenReturn(instance(collection));
        experimentService = mock<IExperimentService>();
        when(experimentService.inExperimentSync(TerminalEnvVarActivation.experiment)).thenReturn(true);
        applicationEnvironment = mock<IApplicationEnvironment>();
        when(applicationEnvironment.shell).thenReturn(customShell);
        when(shell.withProgress(anything(), anything()))
            .thenCall((options, _) => {
                expect(options).to.deep.equal(progressOptions);
            })
            .thenResolve();
        environmentActivationService = mock<IEnvironmentActivationService>();
        when(environmentActivationService.getProcessEnvironmentVariables(anything(), anything())).thenResolve(
            process.env,
        );
        configService = mock<IConfigurationService>();
        when(configService.getSettings(anything())).thenReturn(({
            terminal: { activateEnvironment: true },
            pythonPath: displayPath,
        } as unknown) as IPythonSettings);
        when(collection.clear()).thenResolve();
        terminalEnvVarCollectionService = new TerminalEnvVarCollectionService(
            instance(platform),
            instance(interpreterService),
            instance(context),
            instance(shell),
            instance(experimentService),
            instance(applicationEnvironment),
            [],
            instance(environmentActivationService),
            instance(workspaceService),
            instance(configService),
            instance(terminalDeactivateService),
            new PathUtils(getOSType() === OSType.Windows),
            instance(shellIntegrationService),
            instance(envVarProvider),
        );
        pythonConfig = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => false);
    });

    teardown(() => {
        sinon.restore();
    });

    test('Apply activated variables to the collection on activation', async () => {
        const applyCollectionStub = sinon.stub(terminalEnvVarCollectionService, '_applyCollection');
        applyCollectionStub.resolves();
        when(interpreterService.onDidChangeInterpreter(anything(), anything(), anything())).thenReturn();
        when(applicationEnvironment.onDidChangeShell(anything(), anything(), anything())).thenReturn();
        await terminalEnvVarCollectionService.activate(undefined);
        assert(applyCollectionStub.calledOnce, 'Collection not applied on activation');
    });

    test('When not in experiment, do not apply activated variables to the collection and clear it instead', async () => {
        reset(experimentService);
        when(experimentService.inExperimentSync(TerminalEnvVarActivation.experiment)).thenReturn(false);
        const applyCollectionStub = sinon.stub(terminalEnvVarCollectionService, '_applyCollection');
        applyCollectionStub.resolves();
        when(interpreterService.onDidChangeInterpreter(anything(), anything(), anything())).thenReturn();
        when(applicationEnvironment.onDidChangeShell(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService.activate(undefined);

        verify(interpreterService.onDidChangeInterpreter(anything(), anything(), anything())).once();
        verify(applicationEnvironment.onDidChangeShell(anything(), anything(), anything())).never();
        assert(applyCollectionStub.notCalled, 'Collection should not be applied on activation');

        verify(globalCollection.clear()).atLeast(1);
    });

    test('When interpreter changes, apply new activated variables to the collection', async () => {
        const applyCollectionStub = sinon.stub(terminalEnvVarCollectionService, '_applyCollection');
        applyCollectionStub.resolves();
        const resource = Uri.file('x');
        let callback: (resource: Resource) => Promise<void>;
        when(interpreterService.onDidChangeInterpreter(anything(), anything(), anything())).thenCall((cb) => {
            callback = cb;
        });
        when(applicationEnvironment.onDidChangeShell(anything(), anything(), anything())).thenReturn();
        await terminalEnvVarCollectionService.activate(undefined);

        await callback!(resource);
        assert(applyCollectionStub.calledWithExactly(resource));
    });

    test('When selected shell changes, apply new activated variables to the collection', async () => {
        const applyCollectionStub = sinon.stub(terminalEnvVarCollectionService, '_applyCollection');
        applyCollectionStub.resolves();
        let callback: (shell: string) => Promise<void>;
        when(applicationEnvironment.onDidChangeShell(anything(), anything(), anything())).thenCall((cb) => {
            callback = cb;
        });
        when(interpreterService.onDidChangeInterpreter(anything(), anything(), anything())).thenReturn();
        await terminalEnvVarCollectionService.activate(undefined);

        await callback!(customShell);
        assert(applyCollectionStub.calledWithExactly(undefined, customShell));
    });

    test('If activated variables are returned for custom shell, apply it correctly to the collection', async () => {
        const envVars: NodeJS.ProcessEnv = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).once();
    });

    // eslint-disable-next-line consistent-return
    test('If activated variables contain PS1, prefix it using shell integration', async function () {
        if (getOSType() === OSType.Windows) {
            return this.skip();
        }
        const envVars: NodeJS.ProcessEnv = {
            CONDA_PREFIX: 'prefix/to/conda',
            ...process.env,
            PS1: '(envName) extra prompt', // Should not use this
        };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(anything(), undefined, undefined, 'bash'),
        ).thenResolve(envVars);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve(({
            envName: 'envName',
        } as unknown) as PythonEnvironment);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PS1', '(envName) ', anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).once();
        assert.deepEqual(opts, { applyAtProcessCreation: false, applyAtShellIntegration: true });
    });

    test('Respect VIRTUAL_ENV_DISABLE_PROMPT when setting PS1 for venv', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = {
            VIRTUAL_BIN: 'prefix/to/conda',
            ...process.env,
            VIRTUAL_ENV_DISABLE_PROMPT: '1',
        };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(anything(), undefined, undefined, 'bash'),
        ).thenResolve(envVars);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(({
            type: PythonEnvType.Virtual,
            envName: 'envName',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        when(collection.prepend('PS1', anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(undefined, 'bash');

        verify(collection.prepend('PS1', anything(), anything())).never();
    });

    test('Otherwise set PS1 for venv even if PS1 is not returned', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = {
            VIRTUAL_BIN: 'prefix/to/conda',
            ...process.env,
        };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(anything(), undefined, undefined, 'bash'),
        ).thenResolve(envVars);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(({
            type: PythonEnvType.Virtual,
            envName: 'envName',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        when(collection.prepend('PS1', '(envName) ', anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(undefined, 'bash');

        verify(collection.prepend('PS1', '(envName) ', anything())).once();
    });

    test('Respect CONDA_PROMPT_MODIFIER when setting PS1 for conda', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = {
            CONDA_PREFIX: 'prefix/to/conda',
            ...process.env,
            CONDA_PROMPT_MODIFIER: '(envName)',
        };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(anything(), undefined, undefined, 'bash'),
        ).thenResolve(envVars);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(({
            type: PythonEnvType.Conda,
            envName: 'envName',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PS1', '(envName) ', anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, 'bash');

        verify(collection.clear()).once();
        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).once();
        assert.deepEqual(opts, { applyAtProcessCreation: false, applyAtShellIntegration: true });
    });

    test('Prepend only "prepend portion of PATH" where applicable', async () => {
        const processEnv = { PATH: 'hello/1/2/3' };
        reset(environmentActivationService);
        when(environmentActivationService.getProcessEnvironmentVariables(anything(), anything())).thenResolve(
            processEnv,
        );
        const prependedPart = 'path/to/activate/dir:';
        const envVars: NodeJS.ProcessEnv = { PATH: `${prependedPart}${processEnv.PATH}` };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PATH', anything(), anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.prepend('PATH', prependedPart, anything())).once();
        verify(collection.replace('PATH', anything(), anything())).never();
        assert.deepEqual(opts, { applyAtProcessCreation: true, applyAtShellIntegration: true });
    });

    test('Also prepend deactivate script location if available', async () => {
        reset(terminalDeactivateService);
        when(terminalDeactivateService.initializeScriptParams(anything())).thenReject(); // Verify we swallow errors from here
        when(terminalDeactivateService.getScriptLocation(anything(), anything())).thenResolve('scriptLocation');
        const processEnv = { PATH: 'hello/1/2/3' };
        reset(environmentActivationService);
        when(environmentActivationService.getProcessEnvironmentVariables(anything(), anything())).thenResolve(
            processEnv,
        );
        const prependedPart = 'path/to/activate/dir:';
        const envVars: NodeJS.ProcessEnv = { PATH: `${prependedPart}${processEnv.PATH}` };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PATH', anything(), anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        const separator = getOSType() === OSType.Windows ? ';' : ':';
        verify(collection.prepend('PATH', `scriptLocation${separator}${prependedPart}`, anything())).once();
        verify(collection.replace('PATH', anything(), anything())).never();
        assert.deepEqual(opts, { applyAtProcessCreation: true, applyAtShellIntegration: true });
    });

    test('Prepend full PATH with separator otherwise', async () => {
        const processEnv = { PATH: 'hello/1/2/3' };
        reset(environmentActivationService);
        when(environmentActivationService.getProcessEnvironmentVariables(anything(), anything())).thenResolve(
            processEnv,
        );
        const separator = getOSType() === OSType.Windows ? ';' : ':';
        const finalPath = 'hello/3/2/1';
        const envVars: NodeJS.ProcessEnv = { PATH: finalPath };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PATH', anything(), anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.prepend('PATH', `${finalPath}${separator}`, anything())).once();
        verify(collection.replace('PATH', anything(), anything())).never();
        assert.deepEqual(opts, { applyAtProcessCreation: true, applyAtShellIntegration: true });
    });

    test('Prepend full PATH with separator otherwise', async () => {
        reset(terminalDeactivateService);
        when(terminalDeactivateService.initializeScriptParams(anything())).thenResolve();
        when(terminalDeactivateService.getScriptLocation(anything(), anything())).thenResolve('scriptLocation');
        const processEnv = { PATH: 'hello/1/2/3' };
        reset(environmentActivationService);
        when(environmentActivationService.getProcessEnvironmentVariables(anything(), anything())).thenResolve(
            processEnv,
        );
        const separator = getOSType() === OSType.Windows ? ';' : ':';
        const finalPath = 'hello/3/2/1';
        const envVars: NodeJS.ProcessEnv = { PATH: finalPath };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        let opts: EnvironmentVariableMutatorOptions | undefined;
        when(collection.prepend('PATH', anything(), anything())).thenCall((_, _v, o) => {
            opts = o;
        });

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.prepend('PATH', `scriptLocation${separator}${finalPath}${separator}`, anything())).once();
        verify(collection.replace('PATH', anything(), anything())).never();
        assert.deepEqual(opts, { applyAtProcessCreation: true, applyAtShellIntegration: true });
    });

    test('Verify envs are not applied if env activation is disabled', async () => {
        const envVars: NodeJS.ProcessEnv = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();
        reset(configService);
        when(configService.getSettings(anything())).thenReturn(({
            terminal: { activateEnvironment: false },
            pythonPath: displayPath,
        } as unknown) as IPythonSettings);

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.clear()).once();
        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).never();
    });

    test('Verify correct options are used when applying envs and setting description', async () => {
        const envVars: NodeJS.ProcessEnv = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, customShell),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenCall(
            (_e, _v, options: EnvironmentVariableMutatorOptions) => {
                assert.deepEqual(options, { applyAtShellIntegration: true, applyAtProcessCreation: true });
                return Promise.resolve();
            },
        );

        await terminalEnvVarCollectionService._applyCollection(resource, customShell);

        verify(collection.clear()).once();
        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).once();
    });

    test('Correct track that prompt was set for non-Windows bash where PS1 is set', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = { VIRTUAL_ENV: 'prefix/to/venv', PS1: '(.venv)', ...process.env };
        const ps1Shell = 'bash';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Virtual,
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(true);
    });

    test('Correct track that prompt was set for PS1 if shell integration is disabled', async () => {
        reset(shellIntegrationService);
        when(shellIntegrationService.isWorking()).thenResolve(false);
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = { VIRTUAL_ENV: 'prefix/to/venv', PS1: '(.venv)', ...process.env };
        const ps1Shell = 'bash';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Virtual,
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(false);
    });

    test('Correct track that prompt was set for non-Windows where PS1 is not set but should be set', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        const ps1Shell = 'zsh';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Conda,
            envName: 'envName',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(true);
    });

    test('Correct track that prompt was not set for non-Windows where PS1 is not set but env name is base', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = {
            CONDA_PREFIX: 'prefix/to/conda',
            ...process.env,
            CONDA_PROMPT_MODIFIER: '(base)',
        };
        const ps1Shell = 'zsh';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Conda,
            envName: 'base',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(false);
    });

    test('Correct track that prompt was not set for non-Windows fish where PS1 is not set', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        const ps1Shell = 'fish';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Conda,
            envName: 'envName',
            envPath: 'prefix/to/conda',
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(false);
    });

    test('Correct track that prompt was set correctly for global interpreters', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const ps1Shell = 'zsh';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: undefined,
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, ps1Shell),
        ).thenResolve(undefined);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, ps1Shell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(true);
    });

    test('Correct track that prompt was set for Windows when not using powershell', async () => {
        when(platform.osType).thenReturn(OSType.Windows);
        const envVars: NodeJS.ProcessEnv = { VIRTUAL_ENV: 'prefix/to/venv', ...process.env };
        const windowsShell = 'cmd';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Virtual,
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, windowsShell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, windowsShell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(true);
    });

    test('Correct track that prompt was not set for Windows when using powershell', async () => {
        when(platform.osType).thenReturn(OSType.Linux);
        const envVars: NodeJS.ProcessEnv = { VIRTUAL_ENV: 'prefix/to/venv', ...process.env };
        const windowsShell = 'powershell';
        const resource = Uri.file('a');
        const workspaceFolder: WorkspaceFolder = {
            uri: Uri.file('workspacePath'),
            name: 'workspace1',
            index: 0,
        };
        when(interpreterService.getActiveInterpreter(resource)).thenResolve(({
            type: PythonEnvType.Virtual,
        } as unknown) as PythonEnvironment);
        when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);
        when(
            environmentActivationService.getActivatedEnvironmentVariables(resource, undefined, undefined, windowsShell),
        ).thenResolve(envVars);
        when(collection.replace(anything(), anything(), anything())).thenReturn();

        await terminalEnvVarCollectionService._applyCollection(resource, windowsShell);

        const result = terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource);

        expect(result).to.equal(false);
    });

    test('If no activated variables are returned for custom shell, fallback to using default shell', async () => {
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                customShell,
            ),
        ).thenResolve(undefined);
        const envVars = { CONDA_PREFIX: 'prefix/to/conda', ...process.env };
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                defaultShell?.shell,
            ),
        ).thenResolve(envVars);

        when(collection.replace(anything(), anything(), anything())).thenResolve();

        await terminalEnvVarCollectionService._applyCollection(undefined, customShell);

        verify(collection.replace('CONDA_PREFIX', 'prefix/to/conda', anything())).once();
        verify(collection.clear()).once();
    });

    test('If no activated variables are returned for default shell, clear collection', async () => {
        when(
            environmentActivationService.getActivatedEnvironmentVariables(
                anything(),
                undefined,
                undefined,
                defaultShell?.shell,
            ),
        ).thenResolve(undefined);

        when(collection.replace(anything(), anything(), anything())).thenResolve();
        when(collection.delete(anything())).thenResolve();

        await terminalEnvVarCollectionService._applyCollection(undefined, defaultShell?.shell);

        verify(collection.clear()).once();
    });
});
