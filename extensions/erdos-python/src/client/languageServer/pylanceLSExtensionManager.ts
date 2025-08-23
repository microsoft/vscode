// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { promptForPylanceInstall } from '../activation/common/languageServerChangeHandler';
import { NodeLanguageServerAnalysisOptions } from '../activation/node/analysisOptions';
import { NodeLanguageClientFactory } from '../activation/node/languageClientFactory';
import { NodeLanguageServerProxy } from '../activation/node/languageServerProxy';
import { NodeLanguageServerManager } from '../activation/node/manager';
import { ILanguageServerOutputChannel } from '../activation/types';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../common/application/types';
import { PYLANCE_EXTENSION_ID } from '../common/constants';
import { IFileSystem } from '../common/platform/types';
import {
    IConfigurationService,
    IDisposable,
    IExperimentService,
    IExtensions,
    IInterpreterPathService,
    Resource,
} from '../common/types';
import { Pylance } from '../common/utils/localize';
import { IEnvironmentVariablesProvider } from '../common/variables/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceLog } from '../logging';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { ILanguageServerExtensionManager } from './types';

export class PylanceLSExtensionManager implements IDisposable, ILanguageServerExtensionManager {
    private serverProxy: NodeLanguageServerProxy;

    serverManager: NodeLanguageServerManager;

    clientFactory: NodeLanguageClientFactory;

    analysisOptions: NodeLanguageServerAnalysisOptions;

    constructor(
        serviceContainer: IServiceContainer,
        outputChannel: ILanguageServerOutputChannel,
        experimentService: IExperimentService,
        readonly workspaceService: IWorkspaceService,
        readonly configurationService: IConfigurationService,
        interpreterPathService: IInterpreterPathService,
        _interpreterService: IInterpreterService,
        environmentService: IEnvironmentVariablesProvider,
        readonly commandManager: ICommandManager,
        fileSystem: IFileSystem,
        private readonly extensions: IExtensions,
        readonly applicationShell: IApplicationShell,
    ) {
        this.analysisOptions = new NodeLanguageServerAnalysisOptions(outputChannel, workspaceService);
        this.clientFactory = new NodeLanguageClientFactory(fileSystem, extensions);
        this.serverProxy = new NodeLanguageServerProxy(
            this.clientFactory,
            experimentService,
            interpreterPathService,
            environmentService,
            workspaceService,
            extensions,
        );
        this.serverManager = new NodeLanguageServerManager(
            serviceContainer,
            this.analysisOptions,
            this.serverProxy,
            commandManager,
            extensions,
        );
    }

    dispose(): void {
        this.serverManager.disconnect();
        this.serverManager.dispose();
        this.serverProxy.dispose();
        this.analysisOptions.dispose();
    }

    async startLanguageServer(resource: Resource, interpreter?: PythonEnvironment): Promise<void> {
        await this.serverManager.start(resource, interpreter);
        this.serverManager.connect();
    }

    async stopLanguageServer(): Promise<void> {
        this.serverManager.disconnect();
        await this.serverProxy.stop();
    }

    canStartLanguageServer(): boolean {
        const extension = this.extensions.getExtension(PYLANCE_EXTENSION_ID);
        return !!extension;
    }

    async languageServerNotAvailable(): Promise<void> {
        await promptForPylanceInstall(
            this.applicationShell,
            this.commandManager,
            this.workspaceService,
            this.configurationService,
        );

        traceLog(Pylance.pylanceNotInstalledMessage);
    }
}
