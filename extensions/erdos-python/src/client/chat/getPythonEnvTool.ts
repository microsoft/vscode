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
import { IProcessServiceFactory, IPythonExecutionFactory } from '../common/process/types';
import { getEnvironmentDetails, getToolResponseIfNotebook, IResourceReference, raceCancellationError } from './utils';
import { getPythonPackagesResponse } from './listPackagesTool';
import { ITerminalHelper } from '../common/terminal/types';
import { getEnvExtApi, useEnvExtension } from '../envExt/api.internal';
import { ErrorWithTelemetrySafeReason } from '../common/errors/errorUtils';
import { BaseTool } from './baseTool';

export class GetEnvironmentInfoTool extends BaseTool<IResourceReference>
    implements LanguageModelTool<IResourceReference> {
    private readonly terminalExecutionService: TerminalCodeExecutionProvider;
    private readonly pythonExecFactory: IPythonExecutionFactory;
    private readonly processServiceFactory: IProcessServiceFactory;
    private readonly terminalHelper: ITerminalHelper;
    public static readonly toolName = 'get_python_environment_details';
    constructor(
        private readonly api: PythonExtension['environments'],
        private readonly serviceContainer: IServiceContainer,
    ) {
        super(GetEnvironmentInfoTool.toolName);
        this.terminalExecutionService = this.serviceContainer.get<TerminalCodeExecutionProvider>(
            ICodeExecutionService,
            'standard',
        );
        this.pythonExecFactory = this.serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);
        this.processServiceFactory = this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);
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

        // environment
        const envPath = this.api.getActiveEnvironmentPath(resourcePath);
        const environment = await raceCancellationError(this.api.resolveEnvironment(envPath), token);
        if (!environment || !environment.version) {
            throw new ErrorWithTelemetrySafeReason(
                'No environment found for the provided resource path: ' + resourcePath?.fsPath,
                'noEnvFound',
            );
        }

        let packages = '';
        if (useEnvExtension()) {
            const api = await getEnvExtApi();
            const env = await api.getEnvironment(resourcePath);
            const pkgs = env ? await api.getPackages(env) : [];
            if (pkgs && pkgs.length > 0) {
                // Installed Python packages, each in the format <name> or <name> (<version>). The version may be omitted if unknown. Returns an empty array if no packages are installed.
                const response = [
                    'Below is a list of the Python packages, each in the format <name> or <name> (<version>). The version may be omitted if unknown: ',
                ];
                pkgs.forEach((pkg) => {
                    const version = pkg.version;
                    response.push(version ? `- ${pkg.name} (${version})` : `- ${pkg.name}`);
                });
                packages = response.join('\n');
            }
        }
        if (!packages) {
            packages = await getPythonPackagesResponse(
                environment,
                this.pythonExecFactory,
                this.processServiceFactory,
                resourcePath,
                token,
            );
        }
        const message = await getEnvironmentDetails(
            resourcePath,
            this.api,
            this.terminalExecutionService,
            this.terminalHelper,
            packages,
            token,
        );

        return new LanguageModelToolResult([new LanguageModelTextPart(message)]);
    }

    async prepareInvocationImpl(
        _options: LanguageModelToolInvocationPrepareOptions<IResourceReference>,
        resourcePath: Uri | undefined,
        _token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        if (getToolResponseIfNotebook(resourcePath)) {
            return {};
        }

        return {
            invocationMessage: l10n.t('Fetching Python environment information'),
        };
    }
}
