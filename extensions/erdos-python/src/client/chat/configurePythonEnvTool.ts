// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
    workspace,
    lm,
} from 'vscode';
import { PythonExtension } from '../api/types';
import { IServiceContainer } from '../ioc/types';
import { ICodeExecutionService } from '../terminals/types';
import { TerminalCodeExecutionProvider } from '../terminals/codeExecution/terminalCodeExecution';
import {
    getEnvDetailsForResponse,
    getToolResponseIfNotebook,
    IResourceReference,
    isCancellationError,
    raceCancellationError,
} from './utils';
import { ITerminalHelper } from '../common/terminal/types';
import { IRecommendedEnvironmentService } from '../interpreter/configuration/types';
import { CreateVirtualEnvTool } from './createVirtualEnvTool';
import { ISelectPythonEnvToolArguments, SelectPythonEnvTool } from './selectEnvTool';
import { BaseTool } from './baseTool';

export class ConfigurePythonEnvTool extends BaseTool<IResourceReference>
    implements LanguageModelTool<IResourceReference> {
    private readonly terminalExecutionService: TerminalCodeExecutionProvider;
    private readonly terminalHelper: ITerminalHelper;
    private readonly recommendedEnvService: IRecommendedEnvironmentService;
    public static readonly toolName = 'configure_python_environment';
    constructor(
        private readonly api: PythonExtension['environments'],
        private readonly serviceContainer: IServiceContainer,
        private readonly createEnvTool: CreateVirtualEnvTool,
    ) {
        super(ConfigurePythonEnvTool.toolName);
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
        options: LanguageModelToolInvocationOptions<IResourceReference>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        const notebookResponse = getToolResponseIfNotebook(resource);
        if (notebookResponse) {
            return notebookResponse;
        }

        const workspaceSpecificEnv = await raceCancellationError(
            this.hasAlreadyGotAWorkspaceSpecificEnvironment(resource),
            token,
        );

        if (workspaceSpecificEnv) {
            return getEnvDetailsForResponse(
                workspaceSpecificEnv,
                this.api,
                this.terminalExecutionService,
                this.terminalHelper,
                resource,
                token,
            );
        }

        if (await this.createEnvTool.shouldCreateNewVirtualEnv(resource, token)) {
            try {
                return await lm.invokeTool(CreateVirtualEnvTool.toolName, options, token);
            } catch (ex) {
                if (isCancellationError(ex)) {
                    const input: ISelectPythonEnvToolArguments = {
                        ...options.input,
                        reason: 'cancelled',
                    };
                    // If the user cancelled the tool, then we should invoke the select env tool.
                    return lm.invokeTool(SelectPythonEnvTool.toolName, { ...options, input }, token);
                }
                throw ex;
            }
        } else {
            const input: ISelectPythonEnvToolArguments = {
                ...options.input,
            };
            return lm.invokeTool(SelectPythonEnvTool.toolName, { ...options, input }, token);
        }
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<IResourceReference>,
        _resource: Uri | undefined,
        _token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        return {
            invocationMessage: 'Configuring a Python Environment',
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
}
