// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationError,
    CancellationToken,
    commands,
    l10n,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
    workspace,
} from 'vscode';
import { PythonExtension, ResolvedEnvironment } from '../api/types';
import { IServiceContainer } from '../ioc/types';
import { ICodeExecutionService } from '../terminals/types';
import { TerminalCodeExecutionProvider } from '../terminals/codeExecution/terminalCodeExecution';
import {
    doesWorkspaceHaveVenvOrCondaEnv,
    getDisplayVersion,
    getEnvDetailsForResponse,
    IResourceReference,
    isCancellationError,
    raceCancellationError,
} from './utils';
import { ITerminalHelper } from '../common/terminal/types';
import { raceTimeout, sleep } from '../common/utils/async';
import { IInterpreterPathService } from '../common/types';
import { DisposableStore } from '../common/utils/resourceLifecycle';
import { IRecommendedEnvironmentService } from '../interpreter/configuration/types';
import { EnvironmentType } from '../pythonEnvironments/info';
import { IDiscoveryAPI } from '../pythonEnvironments/base/locator';
import { convertEnvInfoToPythonEnvironment } from '../pythonEnvironments/legacyIOC';
import { sortInterpreters } from '../interpreter/helpers';
import { isStableVersion } from '../pythonEnvironments/info/pythonVersion';
import { createVirtualEnvironment } from '../pythonEnvironments/creation/createEnvApi';
import { traceError, traceVerbose, traceWarn } from '../logging';
import { StopWatch } from '../common/utils/stopWatch';
import { useEnvExtension } from '../envExt/api.internal';
import { PythonEnvironment } from '../envExt/types';
import { hideEnvCreation } from '../pythonEnvironments/creation/provider/hideEnvCreation';
import { BaseTool } from './baseTool';

interface ICreateVirtualEnvToolParams extends IResourceReference {
    packageList?: string[]; // Added only becausewe have ability to create a virtual env with list of packages same tool within the in Python Env extension.
}

export class CreateVirtualEnvTool extends BaseTool<ICreateVirtualEnvToolParams>
    implements LanguageModelTool<ICreateVirtualEnvToolParams> {
    private readonly terminalExecutionService: TerminalCodeExecutionProvider;
    private readonly terminalHelper: ITerminalHelper;
    private readonly recommendedEnvService: IRecommendedEnvironmentService;

    public static readonly toolName = 'create_virtual_environment';
    constructor(
        private readonly discoveryApi: IDiscoveryAPI,
        private readonly api: PythonExtension['environments'],
        private readonly serviceContainer: IServiceContainer,
    ) {
        super(CreateVirtualEnvTool.toolName);
        this.terminalExecutionService = this.serviceContainer.get<TerminalCodeExecutionProvider>(
            ICodeExecutionService,
            'standard',
        );
        this.terminalHelper = this.serviceContainer.get<ITerminalHelper>(ITerminalHelper);
        this.recommendedEnvService = this.serviceContainer.get<IRecommendedEnvironmentService>(
            IRecommendedEnvironmentService,
        );
    }

    async invokeImpl(
        options: LanguageModelToolInvocationOptions<ICreateVirtualEnvToolParams>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        let info = await this.getPreferredEnvForCreation(resource);
        if (!info) {
            traceWarn(`Called ${CreateVirtualEnvTool.toolName} tool not invoked, no preferred environment found.`);
            throw new CancellationError();
        }
        const { workspaceFolder, preferredGlobalPythonEnv } = info;
        const interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        const disposables = new DisposableStore();
        try {
            disposables.add(hideEnvCreation());
            const interpreterChanged = new Promise<void>((resolve) => {
                disposables.add(interpreterPathService.onDidChange(() => resolve()));
            });

            let createdEnvPath: string | undefined = undefined;
            if (useEnvExtension()) {
                const result: PythonEnvironment | undefined = await commands.executeCommand('python-envs.createAny', {
                    quickCreate: true,
                    additionalPackages: options.input.packageList || [],
                    uri: workspaceFolder.uri,
                    selectEnvironment: true,
                });
                createdEnvPath = result?.environmentPath.fsPath;
            } else {
                const created = await raceCancellationError(
                    createVirtualEnvironment({
                        interpreter: preferredGlobalPythonEnv.id,
                        workspaceFolder,
                    }),
                    token,
                );
                createdEnvPath = created?.path;
            }
            if (!createdEnvPath) {
                traceWarn(`${CreateVirtualEnvTool.toolName} tool not invoked, virtual env not created.`);
                throw new CancellationError();
            }

            // Wait a few secs to ensure the env is selected as the active environment..
            // If this doesn't work, then something went wrong.
            await raceTimeout(5_000, interpreterChanged);

            const stopWatch = new StopWatch();
            let env: ResolvedEnvironment | undefined;
            while (stopWatch.elapsedTime < 5_000 || !env) {
                env = await this.api.resolveEnvironment(createdEnvPath);
                if (env) {
                    break;
                } else {
                    traceVerbose(
                        `${CreateVirtualEnvTool.toolName} tool invoked, env created but not yet resolved, waiting...`,
                    );
                    await sleep(200);
                }
            }
            if (!env) {
                traceError(`${CreateVirtualEnvTool.toolName} tool invoked, env created but unable to resolve details.`);
                throw new CancellationError();
            }
            return await getEnvDetailsForResponse(
                env,
                this.api,
                this.terminalExecutionService,
                this.terminalHelper,
                resource,
                token,
            );
        } catch (ex) {
            if (!isCancellationError(ex)) {
                traceError(
                    `${
                        CreateVirtualEnvTool.toolName
                    } tool failed to create virtual environment for resource ${resource?.toString()}`,
                    ex,
                );
            }
            throw ex;
        } finally {
            disposables.dispose();
        }
    }

    public async shouldCreateNewVirtualEnv(resource: Uri | undefined, token: CancellationToken): Promise<boolean> {
        if (doesWorkspaceHaveVenvOrCondaEnv(resource, this.api)) {
            // If we already have a .venv or .conda in this workspace, then do not prompt to create a virtual environment.
            return false;
        }

        const info = await raceCancellationError(this.getPreferredEnvForCreation(resource), token);
        return info ? true : false;
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<ICreateVirtualEnvToolParams>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        const info = await raceCancellationError(this.getPreferredEnvForCreation(resource), token);
        if (!info) {
            return {};
        }
        const { preferredGlobalPythonEnv } = info;
        const version = getDisplayVersion(preferredGlobalPythonEnv.version);
        return {
            confirmationMessages: {
                title: l10n.t('Create a Virtual Environment{0}?', version ? ` (${version})` : ''),
                message: l10n.t(`Virtual Environments provide the benefit of package isolation and more.`),
            },
            invocationMessage: l10n.t('Creating a Virtual Environment'),
        };
    }
    async hasAlreadyGotAWorkspaceSpecificEnvironment(resource: Uri | undefined) {
        const recommededEnv = await this.recommendedEnvService.getRecommededEnvironment(resource);
        // Already selected workspace env, hence nothing to do.
        if (recommededEnv?.reason === 'workspaceUserSelected' && workspace.workspaceFolders?.length) {
            return recommededEnv.environment;
        }
        // No workspace folders, and the user selected a global environment.
        if (recommededEnv?.reason === 'globalUserSelected' && !workspace.workspaceFolders?.length) {
            return recommededEnv.environment;
        }
    }

    private async getPreferredEnvForCreation(resource: Uri | undefined) {
        if (await this.hasAlreadyGotAWorkspaceSpecificEnvironment(resource)) {
            return undefined;
        }

        // If we have a resource or have only one workspace folder && there is no .venv and no workspace specific environment.
        // Then lets recommend creating a virtual environment.
        const workspaceFolder =
            resource && workspace.workspaceFolders?.length
                ? workspace.getWorkspaceFolder(resource)
                : workspace.workspaceFolders?.length === 1
                ? workspace.workspaceFolders[0]
                : undefined;
        if (!workspaceFolder) {
            // No workspace folder, hence no need to create a virtual environment.
            return undefined;
        }

        // Find the latest stable version of Python from the list of know envs.
        let globalPythonEnvs = this.discoveryApi
            .getEnvs()
            .map((env) => convertEnvInfoToPythonEnvironment(env))
            .filter((env) =>
                [
                    EnvironmentType.System,
                    EnvironmentType.MicrosoftStore,
                    EnvironmentType.Global,
                    EnvironmentType.Pyenv,
                ].includes(env.envType),
            )
            .filter((env) => env.version && isStableVersion(env.version));

        globalPythonEnvs = sortInterpreters(globalPythonEnvs);
        const preferredGlobalPythonEnv = globalPythonEnvs.length
            ? this.api.known.find((e) => e.id === globalPythonEnvs[globalPythonEnvs.length - 1].id)
            : undefined;

        return workspaceFolder && preferredGlobalPythonEnv
            ? {
                  workspaceFolder,
                  preferredGlobalPythonEnv,
              }
            : undefined;
    }
}
