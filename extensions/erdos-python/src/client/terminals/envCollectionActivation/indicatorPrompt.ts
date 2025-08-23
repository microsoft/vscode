// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import * as path from 'path';
import { IActiveResourceService, IApplicationShell, ITerminalManager } from '../../common/application/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IExperimentService,
    IPersistentStateFactory,
    Resource,
} from '../../common/types';
import { Common, Interpreters } from '../../common/utils/localize';
import { IExtensionSingleActivationService } from '../../activation/types';
import { inTerminalEnvVarExperiment } from '../../common/experiments/helpers';
import { IInterpreterService } from '../../interpreter/contracts';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { ITerminalEnvVarCollectionService } from '../types';
import { sleep } from '../../common/utils/async';
import { isTestExecution } from '../../common/constants';
import { PythonEnvType } from '../../pythonEnvironments/base/info';
import { useEnvExtension } from '../../envExt/api.internal';

export const terminalEnvCollectionPromptKey = 'TERMINAL_ENV_COLLECTION_PROMPT_KEY';

@injectable()
export class TerminalIndicatorPrompt implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };

    constructor(
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory,
        @inject(ITerminalManager) private readonly terminalManager: ITerminalManager,
        @inject(IDisposableRegistry) private readonly disposableRegistry: IDisposableRegistry,
        @inject(IActiveResourceService) private readonly activeResourceService: IActiveResourceService,
        @inject(ITerminalEnvVarCollectionService)
        private readonly terminalEnvVarCollectionService: ITerminalEnvVarCollectionService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IExperimentService) private readonly experimentService: IExperimentService,
    ) {}

    public async activate(): Promise<void> {
        if (!inTerminalEnvVarExperiment(this.experimentService) || useEnvExtension()) {
            return;
        }
        if (!isTestExecution()) {
            // Avoid showing prompt until startup completes.
            await sleep(6000);
        }
        this.disposableRegistry.push(
            this.terminalManager.onDidOpenTerminal(async (terminal) => {
                const hideFromUser =
                    'hideFromUser' in terminal.creationOptions && terminal.creationOptions.hideFromUser;
                const strictEnv = 'strictEnv' in terminal.creationOptions && terminal.creationOptions.strictEnv;
                if (hideFromUser || strictEnv || terminal.creationOptions.name) {
                    // Only show this notification for basic terminals created using the '+' button.
                    return;
                }
                const cwd =
                    'cwd' in terminal.creationOptions && terminal.creationOptions.cwd
                        ? terminal.creationOptions.cwd
                        : this.activeResourceService.getActiveResource();
                const resource = typeof cwd === 'string' ? Uri.file(cwd) : cwd;
                const settings = this.configurationService.getSettings(resource);
                if (!settings.terminal.activateEnvironment) {
                    return;
                }
                if (this.terminalEnvVarCollectionService.isTerminalPromptSetCorrectly(resource)) {
                    // No need to show notification if terminal prompt already indicates when env is activated.
                    return;
                }
                await this.notifyUsers(resource);
            }),
        );
    }

    private async notifyUsers(resource: Resource): Promise<void> {
        const notificationPromptEnabled = this.persistentStateFactory.createGlobalPersistentState(
            terminalEnvCollectionPromptKey,
            true,
        );
        if (!notificationPromptEnabled.value) {
            return;
        }
        const prompts = [Common.doNotShowAgain];
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        if (!interpreter || !interpreter.type) {
            return;
        }
        const terminalPromptName = getPromptName(interpreter);
        const environmentType = interpreter.type === PythonEnvType.Conda ? 'Selected conda' : 'Python virtual';
        const selection = await this.appShell.showInformationMessage(
            Interpreters.terminalEnvVarCollectionPrompt.format(environmentType, terminalPromptName),
            ...prompts,
        );
        if (!selection) {
            return;
        }
        if (selection === prompts[0]) {
            await notificationPromptEnabled.updateValue(false);
        }
    }
}

function getPromptName(interpreter: PythonEnvironment) {
    if (interpreter.envName) {
        return `"(${interpreter.envName})"`;
    }
    if (interpreter.envPath) {
        return `"(${path.basename(interpreter.envPath)})"`;
    }
    return 'environment indicator';
}
