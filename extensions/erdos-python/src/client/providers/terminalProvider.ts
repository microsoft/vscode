// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable, Terminal } from 'vscode';
import { IActiveResourceService, ICommandManager } from '../common/application/types';
import { Commands } from '../common/constants';
import { inTerminalEnvVarExperiment } from '../common/experiments/helpers';
import { ITerminalActivator, ITerminalServiceFactory } from '../common/terminal/types';
import { IConfigurationService, IExperimentService } from '../common/types';
import { swallowExceptions } from '../common/utils/decorators';
import { IServiceContainer } from '../ioc/types';
import { captureTelemetry, sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';
import { useEnvExtension } from '../envExt/api.internal';

export class TerminalProvider implements Disposable {
    private disposables: Disposable[] = [];

    private activeResourceService: IActiveResourceService;

    constructor(private serviceContainer: IServiceContainer) {
        this.registerCommands();
        this.activeResourceService = this.serviceContainer.get<IActiveResourceService>(IActiveResourceService);
    }

    @swallowExceptions('Failed to initialize terminal provider')
    public async initialize(currentTerminal: Terminal | undefined): Promise<void> {
        const configuration = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const experimentService = this.serviceContainer.get<IExperimentService>(IExperimentService);
        const pythonSettings = configuration.getSettings(this.activeResourceService.getActiveResource());

        if (
            currentTerminal &&
            pythonSettings.terminal.activateEnvInCurrentTerminal &&
            !inTerminalEnvVarExperiment(experimentService) &&
            !useEnvExtension()
        ) {
            const hideFromUser =
                'hideFromUser' in currentTerminal.creationOptions && currentTerminal.creationOptions.hideFromUser;
            if (!hideFromUser) {
                const terminalActivator = this.serviceContainer.get<ITerminalActivator>(ITerminalActivator);
                await terminalActivator.activateEnvironmentInTerminal(currentTerminal, { preserveFocus: true });
            }
            sendTelemetryEvent(EventName.ACTIVATE_ENV_IN_CURRENT_TERMINAL, undefined, {
                isTerminalVisible: !hideFromUser,
            });
        }
    }

    public dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    private registerCommands() {
        const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        const disposable = commandManager.registerCommand(Commands.Create_Terminal, this.onCreateTerminal, this);

        this.disposables.push(disposable);
    }

    @captureTelemetry(EventName.TERMINAL_CREATE, { triggeredBy: 'commandpalette' })
    private async onCreateTerminal() {
        const activeResource = this.activeResourceService.getActiveResource();
        if (useEnvExtension()) {
            const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
            await commandManager.executeCommand('python-envs.createTerminal', activeResource);
        }

        const terminalService = this.serviceContainer.get<ITerminalServiceFactory>(ITerminalServiceFactory);
        await terminalService.createTerminalService(activeResource, 'Python').show(false);
    }
}
