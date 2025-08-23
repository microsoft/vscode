// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    l10n,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
} from 'vscode';
import { PythonExtension } from '../api/types';
import { IServiceContainer } from '../ioc/types';
import { ICodeExecutionService } from '../terminals/types';
import { TerminalCodeExecutionProvider } from '../terminals/codeExecution/terminalCodeExecution';
import {
    getEnvDisplayName,
    getEnvironmentDetails,
    getToolResponseIfNotebook,
    IResourceReference,
    raceCancellationError,
} from './utils';
import { ITerminalHelper } from '../common/terminal/types';
import { IDiscoveryAPI } from '../pythonEnvironments/base/locator';
import { BaseTool } from './baseTool';

export class GetExecutableTool extends BaseTool<IResourceReference> implements LanguageModelTool<IResourceReference> {
    private readonly terminalExecutionService: TerminalCodeExecutionProvider;
    private readonly terminalHelper: ITerminalHelper;
    public static readonly toolName = 'get_python_executable_details';
    constructor(
        private readonly api: PythonExtension['environments'],
        private readonly serviceContainer: IServiceContainer,
        private readonly discovery: IDiscoveryAPI,
    ) {
        super(GetExecutableTool.toolName);
        this.terminalExecutionService = this.serviceContainer.get<TerminalCodeExecutionProvider>(
            ICodeExecutionService,
            'standard',
        );
        this.terminalHelper = this.serviceContainer.get<ITerminalHelper>(ITerminalHelper);
    }
    async invokeImpl(
        _options: LanguageModelToolInvocationOptions<IResourceReference>,
        resourcePath: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        const notebookResponse = getToolResponseIfNotebook(resourcePath);
        if (notebookResponse) {
            return notebookResponse;
        }

        const message = await getEnvironmentDetails(
            resourcePath,
            this.api,
            this.terminalExecutionService,
            this.terminalHelper,
            undefined,
            token,
        );
        return new LanguageModelToolResult([new LanguageModelTextPart(message)]);
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<IResourceReference>,
        resourcePath: Uri | undefined,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        if (getToolResponseIfNotebook(resourcePath)) {
            return {};
        }

        const envName = await raceCancellationError(getEnvDisplayName(this.discovery, resourcePath, this.api), token);
        return {
            invocationMessage: envName
                ? l10n.t('Fetching Python executable information for {0}', envName)
                : l10n.t('Fetching Python executable information'),
        };
    }
}
